using System;
using System.Collections.Concurrent;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SWSTP.Telemetry.Backend.Data;

namespace SWSTP.Telemetry.Backend.Controllers
{
    /// <summary>
    /// CameraController — in-process JPEG frame store for live camera snapshots.
    ///
    /// STORAGE CHOICE: ConcurrentDictionary (in-memory, latest-frame-per-device).
    ///   Rationale: camera frames at 1–2 Hz are ephemeral telemetry, not records.
    ///   Persisting to SQL Server as BLOBs would add ~50–200 KB/write at 1 Hz per
    ///   device with no meaningful query value. This matches the existing
    ///   ConcurrentDictionary pattern used in TelemetryIngestionService. A server
    ///   restart resets the cache — the next frame POST repopulates it immediately.
    ///
    /// FORWARD-COMPAT: The upload endpoint (POST /api/camera/{deviceId}/frame) is
    ///   source-agnostic. The JPEG binary is accepted as raw bytes regardless of
    ///   whether it was captured by:
    ///     (a) a browser getUserMedia capture (current Phase 5 implementation)
    ///     (b) a Raspberry Pi + Arducam posting frames via HTTP (future)
    ///     (c) any other HTTP-capable capture source
    ///   The endpoint carries no browser-specific assumptions.
    ///
    /// ULB ENFORCEMENT on GET:
    ///   Optional ?ulbId= query param triggers server-side ULB scope check via the
    ///   DeviceRegistry → DeviceVehicleAssignment → VehicleRegistry.UlbId chain.
    ///   This is the same resolution path used in AdminController — not a client-side
    ///   filter. An Officer caller MUST supply their ulbId; the server verifies the
    ///   requested device belongs to that ULB before returning the frame.
    ///   Without ?ulbId= (Admin path) the frame is returned unconditionally.
    ///
    /// TODO: Add [Authorize] when auth is introduced. Officer must always supply ulbId.
    /// </summary>
    [ApiController]
    [Route("api/camera")]
    public class CameraController : ControllerBase
    {
        // In-memory latest-frame store: deviceCode -> CameraFrame
        // Singleton lifetime matches TelemetryIngestionService's ConcurrentDictionary usage.
        private static readonly ConcurrentDictionary<string, CameraFrame> _frameStore
            = new(StringComparer.OrdinalIgnoreCase);

        private static readonly ConcurrentDictionary<string, AsyncFrameNotifier> _notifiers
            = new(StringComparer.OrdinalIgnoreCase);

        private static long _globalVersionSequence = 0;

        private static readonly ConcurrentDictionary<string, DateTime> _lastHeartbeatStore
            = new(StringComparer.OrdinalIgnoreCase);

        private static readonly ConcurrentDictionary<string, bool> _activeStreamRequests
            = new(StringComparer.OrdinalIgnoreCase);

        private readonly TelemetryDbContext _db;
        private readonly IServiceScopeFactory _scopeFactory;

        public CameraController(TelemetryDbContext db, IServiceScopeFactory scopeFactory)
        {
            _db = db;
            _scopeFactory = scopeFactory;
        }

        // ─── POST /api/camera/{deviceId}/frame ────────────────────────────────────
        // Accepts a raw JPEG binary upload from any capture source.
        // Replaces the previous frame for this device atomically.
        // Content-Type: application/octet-stream (preferred) or image/jpeg.
        //
        // Source-agnostic: works for browser getUserMedia captures, RPi posts,
        // or any other HTTP-capable image producer.
        // TODO: Add [Authorize] — capture sources may use an API key instead of cookie auth.
        [HttpPost("{deviceId}/frame")]
        [RequestSizeLimit(2 * 1024 * 1024)] // 2 MB limit per frame
        public async Task<IActionResult> PostFrame(string deviceId)
        {
            if (string.IsNullOrWhiteSpace(deviceId))
                return BadRequest(new { error = "deviceId is required" });

            // Read raw body — supports both application/octet-stream and image/jpeg
            using var ms = new System.IO.MemoryStream();
            await Request.Body.CopyToAsync(ms);
            var frameBytes = ms.ToArray();

            if (frameBytes.Length == 0)
                return BadRequest(new { error = "Empty frame payload" });

            // Validate JPEG magic bytes (FF D8 FF) — reject non-JPEG payloads
            if (frameBytes.Length < 3 || frameBytes[0] != 0xFF || frameBytes[1] != 0xD8 || frameBytes[2] != 0xFF)
                return BadRequest(new { error = "Payload is not a valid JPEG (missing JPEG magic bytes)" });

            var version = System.Threading.Interlocked.Increment(ref _globalVersionSequence);

            var newFrame = new CameraFrame
            {
                DeviceId      = deviceId,
                JpegBytes     = frameBytes,
                CapturedAt    = DateTimeOffset.UtcNow,
                ContentLength = frameBytes.Length,
                Version       = version
            };

            _frameStore[deviceId] = newFrame;
            _notifiers.GetOrAdd(deviceId, _ => new AsyncFrameNotifier()).NotifyNewFrame(version);

            // Throttled device & vehicle online heartbeat update (at most once every 5 seconds)
            var now = DateTime.UtcNow;
            if (!_lastHeartbeatStore.TryGetValue(deviceId, out var lastHb) || (now - lastHb).TotalSeconds >= 5.0)
            {
                _lastHeartbeatStore[deviceId] = now;
                _ = Task.Run(async () =>
                {
                    try
                    {
                        using var scope = _scopeFactory.CreateScope();
                        var db = scope.ServiceProvider.GetRequiredService<TelemetryDbContext>();
                        var dev = await db.DeviceRegistry
                            .Include(d => d.Assignments.Where(a => a.IsActive))
                            .ThenInclude(a => a.Vehicle)
                            .FirstOrDefaultAsync(d => d.DeviceCode == deviceId);

                        if (dev != null)
                        {
                            dev.LastSeenAt = DateTime.UtcNow;
                            var activeVeh = dev.Assignments.FirstOrDefault()?.Vehicle;
                            if (activeVeh != null)
                            {
                                activeVeh.LastKnownTimestamp = DateTime.UtcNow;
                            }
                            await db.SaveChangesAsync();
                        }
                    }
                    catch { }
                });
            }

            return Ok(new
            {
                deviceId,
                stored       = true,
                version      = version,
                bytes        = frameBytes.Length,
                capturedAt   = newFrame.CapturedAt,
            });
        }

        // ─── GET /api/camera/{deviceId}/latest ───────────────────────────────────
        // Returns the latest JPEG frame for the given device as image/jpeg.
        // Optional ?ulbId= enforces server-side ULB scope (Officer path).
        //
        // ULB enforcement logic:
        //   1. Resolve DeviceCode → DeviceVehicleAssignment (active) → VehicleRegistry
        //   2. Compare VehicleRegistry.UlbId with provided ulbId
        //   3. 403 Forbidden if mismatch — server-enforced, not client-filtered
        //
        // TODO: Add [Authorize] when auth is introduced.
        [HttpGet("{deviceId}/latest")]
        [HttpHead("{deviceId}/latest")]
        public async Task<IActionResult> GetLatestFrame(
            string deviceId,
            [FromQuery] string? ulbId = null)
        {
            if (string.IsNullOrWhiteSpace(deviceId))
                return BadRequest(new { error = "deviceId is required" });

            // Server-side ULB enforcement — Officer path
            if (!string.IsNullOrEmpty(ulbId))
            {
                var enforcementResult = await EnforceUlbScope(deviceId, ulbId);
                if (enforcementResult != null) return enforcementResult;
            }

            if (!_frameStore.TryGetValue(deviceId, out var frame))
            {
                return NotFound(new
                {
                    deviceId,
                    error = "NO_FRAME",
                    message = $"No camera frame has been received yet for device '{deviceId}'.",
                });
            }

            Response.Headers["X-Camera-Device-Id"]    = frame.DeviceId;
            Response.Headers["X-Camera-Captured-At"]  = frame.CapturedAt.ToString("O");
            Response.Headers["X-Camera-Frame-Bytes"]  = frame.ContentLength.ToString();
            Response.Headers["X-Camera-Frame-Version"]= frame.Version.ToString();

            return File(frame.JpegBytes, "image/jpeg");
        }

        // ─── GET /api/camera/{deviceId}/stream ───────────────────────────────────
        // Continuous low-latency (10-15 FPS) MJPEG multipart stream.
        // Event-driven async notification — zero busy polling loop.
        // Latest-frame-wins: slow viewers skip obsolete frames automatically.
        [HttpGet("{deviceId}/stream")]
        public async Task GetMjpegStream(
            string deviceId,
            [FromQuery] string? ulbId = null,
            System.Threading.CancellationToken ct = default)
        {
            if (string.IsNullOrWhiteSpace(deviceId))
            {
                Response.StatusCode = 400;
                return;
            }

            if (!string.IsNullOrEmpty(ulbId))
            {
                var enforcementResult = await EnforceUlbScope(deviceId, ulbId);
                if (enforcementResult != null)
                {
                    Response.StatusCode = 403;
                    return;
                }
            }

            Response.ContentType = "multipart/x-mixed-replace; boundary=--frame";
            Response.Headers["Cache-Control"] = "no-cache, no-store, must-revalidate";
            Response.Headers["Pragma"] = "no-cache";
            Response.Headers["Expires"] = "0";

            var notifier = _notifiers.GetOrAdd(deviceId, _ => new AsyncFrameNotifier());
            long lastSentVersion = 0;

            try
            {
                while (!ct.IsCancellationRequested)
                {
                    if (_frameStore.TryGetValue(deviceId, out var frame) && frame.Version > lastSentVersion)
                    {
                        lastSentVersion = frame.Version;
                        var header = $"--frame\r\nContent-Type: image/jpeg\r\nContent-Length: {frame.JpegBytes.Length}\r\nX-Captured-At: {frame.CapturedAt:O}\r\nX-Frame-Version: {frame.Version}\r\n\r\n";
                        var headerBytes = System.Text.Encoding.ASCII.GetBytes(header);
                        var footerBytes = System.Text.Encoding.ASCII.GetBytes("\r\n");

                        await Response.Body.WriteAsync(headerBytes, 0, headerBytes.Length, ct);
                        await Response.Body.WriteAsync(frame.JpegBytes, 0, frame.JpegBytes.Length, ct);
                        await Response.Body.WriteAsync(footerBytes, 0, footerBytes.Length, ct);
                        await Response.Body.FlushAsync(ct);
                    }
                    else
                    {
                        // Await next frame arrival notification or 1000ms heartbeat
                        await notifier.WaitForNewFrameAsync(lastSentVersion, ct);
                    }
                }
            }
            catch (System.OperationCanceledException)
            {
                // Viewer disconnected normally
            }
            catch (System.IO.IOException)
            {
                // Client socket closed
            }
        }

        // ─── GET /api/camera/{deviceId}/meta ─────────────────────────────────────
        // Returns frame metadata (no binary payload) for staleness polling.
        // Clients poll this first, then fetch /latest only when CapturedAt advances.
        // TODO: Add [Authorize] when auth is introduced.
        [HttpGet("{deviceId}/meta")]
        public IActionResult GetFrameMeta(string deviceId)
        {
            if (!_frameStore.TryGetValue(deviceId, out var frame))
                return NotFound(new { deviceId, hasFrame = false });

            return Ok(new
            {
                deviceId      = frame.DeviceId,
                capturedAt    = frame.CapturedAt,
                bytes         = frame.ContentLength,
                hasFrame      = true,
                ageSeconds    = (DateTimeOffset.UtcNow - frame.CapturedAt).TotalSeconds,
            });
        }

        // ─── POST /api/camera/{deviceId}/stream/start ────────────────────────────
        // Called by Admin or ULB Officer to remotely request the camera to begin streaming.
        [HttpPost("{deviceId}/stream/start")]
        public IActionResult StartStream(string deviceId)
        {
            _activeStreamRequests[deviceId] = true;
            return Ok(new { deviceId, streaming = true });
        }

        // ─── POST /api/camera/{deviceId}/stream/stop ─────────────────────────────
        // Called by Admin or ULB Officer to remotely request the camera to stop streaming.
        [HttpPost("{deviceId}/stream/stop")]
        public IActionResult StopStream(string deviceId)
        {
            _activeStreamRequests[deviceId] = false;
            return Ok(new { deviceId, streaming = false });
        }

        // ─── GET /api/camera/{deviceId}/stream/status ────────────────────────────
        // Polled by the camera publisher (Web workstation / edge Python / RPi) to check if streaming is requested.
        [HttpGet("{deviceId}/stream/status")]
        public IActionResult GetStreamStatus(string deviceId)
        {
            var isStreaming = _activeStreamRequests.TryGetValue(deviceId, out var s) && s;
            return Ok(new { deviceId, streaming = isStreaming });
        }

        // ─── Private: ULB scope check via vehicle assignment chain ───────────────
        private async Task<IActionResult?> EnforceUlbScope(string deviceCode, string requiredUlbId)
        {
            if (string.IsNullOrWhiteSpace(deviceCode) || string.IsNullOrWhiteSpace(requiredUlbId))
                return null;

            // Find the device by code
            var device = await _db.DeviceRegistry
                .AsNoTracking()
                .FirstOrDefaultAsync(d => d.DeviceCode == deviceCode);

            if (device == null)
            {
                // Unregistered devices allowed in edge development mode
                return null;
            }

            // Find active assignment for this device
            var assignment = await _db.DeviceVehicleAssignments
                .AsNoTracking()
                .Include(a => a.Vehicle)
                .FirstOrDefaultAsync(a => a.DeviceId == device.DeviceId && a.IsActive);

            if (assignment?.Vehicle != null && !string.IsNullOrEmpty(assignment.Vehicle.UlbId) &&
                !string.Equals(assignment.Vehicle.UlbId, requiredUlbId, StringComparison.OrdinalIgnoreCase))
            {
                return StatusCode(403, new
                {
                    error   = "ULB_SCOPE_VIOLATION",
                    message = $"Device '{deviceCode}' belongs to ULB '{assignment.Vehicle.UlbId}', not '{requiredUlbId}'.",
                });
            }

            return null; // Allowed
        }
    }

    /// <summary>
    /// In-memory camera frame record.
    /// </summary>
    public class CameraFrame
    {
        public string DeviceId       { get; set; } = string.Empty;
        public byte[] JpegBytes      { get; set; } = Array.Empty<byte>();
        public DateTimeOffset CapturedAt { get; set; }
        public int ContentLength     { get; set; }
        public long Version          { get; set; }
    }

    /// <summary>
    /// Thread-safe async notifier for real-time frame arrival without busy-polling.
    /// </summary>
    public class AsyncFrameNotifier
    {
        private TaskCompletionSource<long> _tcs = new(TaskCreationOptions.RunContinuationsAsynchronously);

        public void NotifyNewFrame(long version)
        {
            var oldTcs = System.Threading.Interlocked.Exchange(
                ref _tcs,
                new TaskCompletionSource<long>(TaskCreationOptions.RunContinuationsAsynchronously));
            oldTcs.TrySetResult(version);
        }

        public async Task<long> WaitForNewFrameAsync(long lastVersion, System.Threading.CancellationToken ct)
        {
            var curTcs = _tcs;
            using var reg = ct.Register(() => curTcs.TrySetCanceled());

            var delayTask = Task.Delay(1000, ct);
            var completedTask = await Task.WhenAny(curTcs.Task, delayTask);
            if (completedTask == curTcs.Task && curTcs.Task.IsCompletedSuccessfully)
            {
                return curTcs.Task.Result;
            }
            return lastVersion;
        }
    }
}
