using System;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SWSTP.Telemetry.Backend.Data;

namespace SWSTP.Telemetry.Backend.Controllers
{
    /// <summary>
    /// AdminController — Cross-ULB aggregate data endpoints for the Admin console.
    ///
    /// AUTH NOTE: These endpoints have no authentication in this phase. Each method
    /// has a TODO comment marking where auth/role checks must be added when auth is
    /// introduced. Do not remove these TODOs when adding authentication later.
    ///
    /// FILTERABLE PATTERN: Where an endpoint makes sense for both Admin (all ULBs)
    /// and Officer (one ULB), an optional ?ulbId= query param scopes the result.
    /// When ulbId is omitted the full cross-ULB result is returned — this is the
    /// Admin-only path. Officer view (Phase 4) will always supply ulbId.
    /// </summary>
    [ApiController]
    [Route("api/admin")]
    public class AdminController : ControllerBase
    {
        private readonly TelemetryDbContext _db;

        public AdminController(TelemetryDbContext db)
        {
            _db = db;
        }

        // ─── GET /api/admin/ulbs ──────────────────────────────────────────────────
        // Returns all registered ULBs from UlbRegistry with safe-zone configuration
        // and aggregated vehicle, device, and session statistics.
        // Admin-only — no ulbId filter.
        [HttpGet("ulbs")]
        public async Task<IActionResult> GetUlbs()
        {
            var ulbs = await _db.UlbRegistry
                .AsNoTracking()
                .OrderBy(u => u.UlbName)
                .ToListAsync();

            var today = DateTime.UtcNow.Date;
            var result = new System.Collections.Generic.List<object>();

            foreach (var ulb in ulbs)
            {
                // Vehicle IDs in this ULB
                var vehicleIds = await _db.VehicleRegistry
                    .AsNoTracking()
                    .Where(v => v.UlbId == ulb.UlbId)
                    .Select(v => v.VehicleId)
                    .ToListAsync();

                // Sessions whose assigned vehicle is in this ULB
                var assignmentIds = await _db.DeviceVehicleAssignments
                    .AsNoTracking()
                    .Where(a => vehicleIds.Contains(a.VehicleId))
                    .Select(a => a.AssignmentId)
                    .ToListAsync();

                var totalSessions = await _db.TelemetrySessions
                    .AsNoTracking()
                    .CountAsync(s => s.AssignmentId.HasValue && assignmentIds.Contains(s.AssignmentId.Value));

                var activeSessionsToday = await _db.TelemetrySessions
                    .AsNoTracking()
                    .CountAsync(s =>
                        s.AssignmentId.HasValue &&
                        assignmentIds.Contains(s.AssignmentId.Value) &&
                        s.StartedAt >= today &&
                        s.Status == "ACTIVE");

                // Devices with active assignment to a vehicle in this ULB
                var deviceCount = await _db.DeviceVehicleAssignments
                    .AsNoTracking()
                    .CountAsync(a => vehicleIds.Contains(a.VehicleId) && a.IsActive);

                result.Add(new
                {
                    ulbId                 = ulb.UlbId,
                    ulbName               = ulb.UlbName,
                    safeZoneLatitude      = ulb.SafeZoneLatitude,
                    safeZoneLongitude     = ulb.SafeZoneLongitude,
                    safeZoneRadiusMeters  = ulb.SafeZoneRadiusMeters,
                    createdAt             = ulb.CreatedAt,
                    vehicleCount          = vehicleIds.Count,
                    totalSessions,
                    activeSessionsToday,
                    deviceCount,
                });
            }

            return Ok(result);
        }

        // ─── GET /api/admin/vehicles?ulbId= ──────────────────────────────────────
        // All vehicles across all ULBs with active device assignment info.
        // Optional ?ulbId= scopes to a single ULB (used by Phase 4 Officer).
        // TODO: Add [Authorize] when auth is introduced. Officer must always supply ulbId.
        [HttpGet("vehicles")]
        public async Task<IActionResult> GetVehicles([FromQuery] string? ulbId = null)
        {
            var query = _db.VehicleRegistry
                .AsNoTracking()
                .Include(v => v.Assignments.Where(a => a.IsActive))
                .ThenInclude(a => a.Device)
                .AsQueryable();

            if (!string.IsNullOrEmpty(ulbId))
                query = query.Where(v => v.UlbId == ulbId);

            var vehicles = await query
                .OrderBy(v => v.UlbId)
                .ThenBy(v => v.VehicleRegistrationNumber)
                .Select(v => new
                {
                    vehicleId              = v.VehicleId,
                    registrationNumber     = v.VehicleRegistrationNumber,
                    vehicleType            = v.VehicleType,
                    capacityTons           = v.CapacityTons,
                    ulbId                  = v.UlbId,
                    ulbName                = v.UlbName,
                    status                 = v.Status,
                    registeredAt           = v.RegisteredAt,
                    lastKnownLatitude      = v.LastKnownLatitude,
                    lastKnownLongitude     = v.LastKnownLongitude,
                    lastKnownSpeedKmh      = v.LastKnownSpeedKmh,
                    lastKnownHeadingDeg    = v.LastKnownHeadingDeg,
                    lastKnownTimestamp     = v.LastKnownTimestamp,
                    safeZoneLatitude       = _db.UlbRegistry.Where(u => u.UlbId == v.UlbId).Select(u => u.SafeZoneLatitude).FirstOrDefault(),
                    safeZoneLongitude      = _db.UlbRegistry.Where(u => u.UlbId == v.UlbId).Select(u => u.SafeZoneLongitude).FirstOrDefault(),
                    safeZoneRadiusMeters   = _db.UlbRegistry.Where(u => u.UlbId == v.UlbId).Select(u => u.SafeZoneRadiusMeters).FirstOrDefault(),
                    assignedDeviceCode     = v.Assignments
                                              .Where(a => a.IsActive)
                                              .Select(a => a.Device != null ? a.Device.DeviceCode : null)
                                              .FirstOrDefault(),
                    assignedDeviceId       = v.Assignments
                                              .Where(a => a.IsActive)
                                              .Select(a => (long?)a.DeviceId)
                                              .FirstOrDefault(),
                    assignmentActive       = v.Assignments.Any(a => a.IsActive),
                })
                .ToListAsync();

            return Ok(vehicles);
        }

        // ─── GET /api/admin/devices ───────────────────────────────────────────────
        // All registered devices with heartbeat/health status and current vehicle
        // assignment. Admin-only — devices span all ULBs.
        // TODO: Add [Authorize(Roles = "Admin")] when auth is introduced.
        [HttpGet("devices")]
        public async Task<IActionResult> GetDevices()
        {
            var devices = await _db.DeviceRegistry
                .AsNoTracking()
                .Include(d => d.Assignments.Where(a => a.IsActive))
                .ThenInclude(a => a.Vehicle)
                .OrderBy(d => d.DeviceCode)
                .Select(d => new
                {
                    deviceId               = d.DeviceId,
                    deviceCode             = d.DeviceCode,
                    hardwareVersion        = d.HardwareVersion,
                    firmwareVersion        = d.FirmwareVersion,
                    registeredAt           = d.RegisteredAt,
                    lastSeenAt             = d.LastSeenAt,
                    isActive               = d.IsActive,
                    // Green if seen within 30 seconds — infrastructure heartbeat check
                    isOnline               = d.LastSeenAt.HasValue &&
                                             (DateTime.UtcNow - d.LastSeenAt.Value).TotalSeconds < 30,
                    secondsSinceLastSeen   = d.LastSeenAt.HasValue
                                             ? (int)(DateTime.UtcNow - d.LastSeenAt.Value).TotalSeconds
                                             : (int?)null,
                    assignedVehicleReg     = d.Assignments
                                              .Where(a => a.IsActive)
                                              .Select(a => a.Vehicle != null ? a.Vehicle.VehicleRegistrationNumber : null)
                                              .FirstOrDefault(),
                    assignedVehicleUlbId   = d.Assignments
                                              .Where(a => a.IsActive)
                                              .Select(a => a.Vehicle != null ? a.Vehicle.UlbId : null)
                                              .FirstOrDefault(),
                    assignedVehicleUlbName = d.Assignments
                                              .Where(a => a.IsActive)
                                              .Select(a => a.Vehicle != null ? a.Vehicle.UlbName : null)
                                              .FirstOrDefault(),
                })
                .ToListAsync();

            return Ok(devices);
        }

        // ─── GET /api/admin/fleet/live?ulbId= ────────────────────────────────────
        // Latest known GNSS position per active session, plus last-known locations
        // for offline vehicles.
        // Optional ?ulbId= scopes to a single ULB (used by Phase 4/12 Officer view).
        // Active vehicles have isLive=true. Offline vehicles with last known coords
        // have isLive=false, isLastKnown=true.
        [HttpGet("fleet/live")]
        public async Task<IActionResult> GetFleetLive([FromQuery] string? ulbId = null)
        {
            // 1. Get all currently ACTIVE sessions
            var sessionQuery = _db.TelemetrySessions
                .AsNoTracking()
                .Where(s => s.Status == "ACTIVE" && s.EndedAt == null);

            // 2. If ulbId filter provided, join through assignment → vehicle
            if (!string.IsNullOrEmpty(ulbId))
            {
                var vehicleIds = await _db.VehicleRegistry
                    .AsNoTracking()
                    .Where(v => v.UlbId == ulbId)
                    .Select(v => v.VehicleId)
                    .ToListAsync();

                var assignmentIds = await _db.DeviceVehicleAssignments
                    .AsNoTracking()
                    .Where(a => vehicleIds.Contains(a.VehicleId))
                    .Select(a => a.AssignmentId)
                    .ToListAsync();

                sessionQuery = sessionQuery.Where(s =>
                    s.AssignmentId.HasValue && assignmentIds.Contains(s.AssignmentId.Value));
            }

            var activeSessions = await sessionQuery
                .Select(s => new
                {
                    s.SessionId,
                    s.DeviceCode,
                    s.VehicleRegistrationNumber,
                    s.AssignmentId,
                })
                .ToListAsync();

            var sessionIds = activeSessions.Select(s => s.SessionId).ToList();

            // 3. For each active session, fetch the latest valid GNSS fix
            var latestGnss = sessionIds.Count > 0
                ? await _db.GnssSamples
                    .AsNoTracking()
                    .Where(g => sessionIds.Contains(g.SessionId) && g.FixValid &&
                                g.Latitude.HasValue && g.Longitude.HasValue)
                    .GroupBy(g => g.SessionId)
                    .Select(g => g.OrderByDescending(x => x.Timestamp).FirstOrDefault())
                    .ToListAsync()
                : new System.Collections.Generic.List<Models.GnssSample?>();

            // 4. Build live vehicles list
            var result = new System.Collections.Generic.List<object>();
            var activeRegs = new System.Collections.Generic.HashSet<string>();

            foreach (var sess in activeSessions)
            {
                if (!string.IsNullOrEmpty(sess.VehicleRegistrationNumber))
                {
                    activeRegs.Add(sess.VehicleRegistrationNumber);
                }

                var pos = latestGnss.FirstOrDefault(g => g != null && g.SessionId == sess.SessionId);

                string? ulbName = null;
                string? sessionUlbId = null;
                Models.VehicleRegistry? vRecord = null;
                if (sess.AssignmentId.HasValue)
                {
                    var assignment = await _db.DeviceVehicleAssignments
                        .AsNoTracking()
                        .Include(a => a.Vehicle)
                        .FirstOrDefaultAsync(a => a.AssignmentId == sess.AssignmentId.Value);
                    vRecord      = assignment?.Vehicle;
                    ulbName      = vRecord?.UlbName;
                    sessionUlbId = vRecord?.UlbId;
                }

                // Query DeviceRegistry table directly for the IsActive flag
                var devRecord = await _db.DeviceRegistry
                    .AsNoTracking()
                    .FirstOrDefaultAsync(d => d.DeviceCode == sess.DeviceCode);
                bool isDeviceActiveInDb = devRecord?.IsActive ?? true;

                var effLat = pos?.Latitude ?? vRecord?.LastKnownLatitude;
                var effLon = pos?.Longitude ?? vRecord?.LastKnownLongitude;
                var effSpeed = pos?.SpeedKmh ?? vRecord?.LastKnownSpeedKmh;
                var effHeading = pos?.CourseDeg ?? vRecord?.LastKnownHeadingDeg;
                var effTs = devRecord?.LastSeenAt ?? pos?.Timestamp ?? vRecord?.LastKnownTimestamp;

                bool isTrulyLive = false;
                if (isDeviceActiveInDb && effTs.HasValue)
                {
                    var ageSeconds = (DateTime.UtcNow - effTs.Value).TotalSeconds;
                    // Live if device is Active in DeviceRegistry AND telemetry heartbeat arrived within the last 15s
                    isTrulyLive = ageSeconds <= 15.0;
                }

                result.Add(new
                {
                    sessionId             = (long?)sess.SessionId,
                    deviceId              = devRecord?.DeviceId,
                    deviceCode            = sess.DeviceCode,
                    isActive              = isDeviceActiveInDb,
                    vehicleRegistration   = sess.VehicleRegistrationNumber,
                    ulbId                 = sessionUlbId,
                    ulbName               = ulbName,
                    hasPosition           = effLat.HasValue && effLon.HasValue,
                    isLive                = isTrulyLive,
                    isLastKnown           = !isTrulyLive,
                    lat                   = effLat,
                    lon                   = effLon,
                    rawLat                = pos?.RawLatitude ?? effLat,
                    rawLon                = pos?.RawLongitude ?? effLon,
                    displayLat            = pos?.DisplayLatitude ?? effLat,
                    displayLon            = pos?.DisplayLongitude ?? effLon,
                    isInsideSafeZone      = pos?.IsInsideSafeZone ?? false,
                    isSnapped             = pos?.IsSnapped ?? false,
                    alt                   = pos?.AltitudeM,
                    speed                 = effSpeed,
                    heading               = effHeading,
                    lastPositionAt        = effTs.HasValue ? DateTime.SpecifyKind(effTs.Value, DateTimeKind.Utc).ToString("o") : null,
                });
            }

            // 5. Query offline vehicles with LastKnown location
            var offlineQuery = _db.VehicleRegistry
                .AsNoTracking()
                .Where(v => v.LastKnownLatitude.HasValue && v.LastKnownLongitude.HasValue);

            if (!string.IsNullOrEmpty(ulbId))
            {
                offlineQuery = offlineQuery.Where(v => v.UlbId == ulbId);
            }

            var offlineVehicles = await offlineQuery.ToListAsync();

            foreach (var v in offlineVehicles)
            {
                if (activeRegs.Contains(v.VehicleRegistrationNumber))
                {
                    continue; // Skip if already active in a live session
                }

                var activeAssignment = await _db.DeviceVehicleAssignments
                    .AsNoTracking()
                    .Include(a => a.Device)
                    .FirstOrDefaultAsync(a => a.VehicleId == v.VehicleId && a.IsActive);

                result.Add(new
                {
                    sessionId             = (long?)null,
                    deviceCode            = activeAssignment?.Device?.DeviceCode ?? "UNASSIGNED",
                    vehicleRegistration   = v.VehicleRegistrationNumber,
                    ulbId                 = v.UlbId,
                    ulbName               = v.UlbName,
                    hasPosition           = true,
                    isLive                = false,
                    isLastKnown           = true,
                    lat                   = v.LastKnownLatitude,
                    lon                   = v.LastKnownLongitude,
                    rawLat                = v.LastKnownLatitude,
                    rawLon                = v.LastKnownLongitude,
                    displayLat            = v.LastKnownLatitude,
                    displayLon            = v.LastKnownLongitude,
                    isInsideSafeZone      = false,
                    isSnapped             = false,
                    alt                   = (double?)null,
                    speed                 = v.LastKnownSpeedKmh,
                    heading               = v.LastKnownHeadingDeg,
                    lastPositionAt        = v.LastKnownTimestamp.HasValue ? DateTime.SpecifyKind(v.LastKnownTimestamp.Value, DateTimeKind.Utc).ToString("o") : null,
                });
            }

            return Ok(result);
        }

        // ─── GET /api/admin/sessions?ulbId=&limit= ────────────────────────────────
        // All sessions across all ULBs. Optional ?ulbId= scopes to one ULB.
        // Optional ?limit= (default 100). Used by Admin; Phase 4 Officer always
        // supplies ulbId so it never sees cross-ULB data.
        // TODO: Add [Authorize] when auth is introduced.
        [HttpGet("sessions")]
        public async Task<IActionResult> GetSessions(
            [FromQuery] string? ulbId = null,
            [FromQuery] int limit = 100)
        {
            var query = _db.TelemetrySessions
                .AsNoTracking()
                .Include(s => s.Assignment)
                .ThenInclude(a => a!.Vehicle)
                .AsQueryable();

            if (!string.IsNullOrEmpty(ulbId))
            {
                // Filter via vehicle's UlbId in the assignment chain
                query = query.Where(s =>
                    s.Assignment != null &&
                    s.Assignment.Vehicle != null &&
                    s.Assignment.Vehicle.UlbId == ulbId);
            }

            var rawSessions = await query
                .OrderByDescending(s => s.StartedAt)
                .Take(limit)
                .Select(s => new
                {
                    s.SessionId,
                    s.SessionCode,
                    s.DeviceCode,
                    s.VehicleRegistrationNumber,
                    s.Mode,
                    s.Status,
                    s.StartedAt,
                    s.EndedAt,
                    UlbId = s.Assignment != null && s.Assignment.Vehicle != null ? s.Assignment.Vehicle.UlbId : null,
                    UlbName = s.Assignment != null && s.Assignment.Vehicle != null ? s.Assignment.Vehicle.UlbName : null,
                })
                .ToListAsync();

            var sessions = rawSessions.Select(s => new
            {
                sessionId               = s.SessionId,
                sessionCode             = s.SessionCode,
                deviceCode              = s.DeviceCode,
                vehicleRegistration     = s.VehicleRegistrationNumber,
                mode                    = s.Mode,
                status                  = s.Status,
                startedAt               = s.StartedAt,
                endedAt                 = s.EndedAt,
                durationSeconds         = s.EndedAt.HasValue
                                         ? (int?)(int)Math.Max(0, (s.EndedAt.Value - s.StartedAt).TotalSeconds)
                                         : (int?)null,
                ulbId                   = s.UlbId,
                ulbName                 = s.UlbName,
            }).ToList();

            return Ok(sessions);
        }

        // ─── GET /api/admin/sessions/{sessionId}/live ─────────────────────────────
        // Cloud-sourced live telemetry snapshot for the Live Debug panel.
        // Returns latest GNSS fix, latest IMU sample, RTC status, system state,
        // and recent trace history so Admin can inspect live telemetry without
        // direct serial connection. Poll interval: 1–2 s.
        // Admin-only — TODO: Add [Authorize(Roles = "Admin")] when auth is introduced.
        [HttpGet("sessions/{sessionId:long}/live")]
        public async Task<IActionResult> GetSessionLive([FromRoute] long sessionId)
        {
            var session = await _db.TelemetrySessions
                .AsNoTracking()
                .Include(s => s.Assignment)
                .ThenInclude(a => a!.Vehicle)
                .FirstOrDefaultAsync(s => s.SessionId == sessionId);

            if (session == null)
            {
                return NotFound(new { error = $"Session #{sessionId} not found" });
            }

            // Latest GNSS sample
            var latestGnss = await _db.GnssSamples
                .AsNoTracking()
                .Where(g => g.SessionId == sessionId)
                .OrderByDescending(g => g.SequenceNumber)
                .FirstOrDefaultAsync();

            // Latest IMU sample
            var latestImu = await _db.ImuSamples
                .AsNoTracking()
                .Where(i => i.SessionId == sessionId)
                .OrderByDescending(i => i.SequenceNumber)
                .FirstOrDefaultAsync();

            // Latest Telemetry Packet for RTC / raw status
            var latestPacket = await _db.TelemetryPackets
                .AsNoTracking()
                .Where(p => p.SessionId == sessionId)
                .OrderByDescending(p => p.SequenceNumber)
                .FirstOrDefaultAsync();

            // Recent GNSS history for speed/alt traces (last 40 samples)
            var recentGnss = await _db.GnssSamples
                .AsNoTracking()
                .Where(g => g.SessionId == sessionId && g.FixValid)
                .OrderByDescending(g => g.SequenceNumber)
                .Take(40)
                .ToListAsync();
            recentGnss.Reverse();

            // Recent IMU history for accel traces (last 40 samples)
            var recentImu = await _db.ImuSamples
                .AsNoTracking()
                .Where(i => i.SessionId == sessionId && i.IsValid)
                .OrderByDescending(i => i.SequenceNumber)
                .Take(40)
                .ToListAsync();
            recentImu.Reverse();

            // Latest Satellite Observations for GNSS Satellites view
            var latestSatObs = await _db.GnssSatelliteObservations
                .AsNoTracking()
                .Where(s => s.SessionId == sessionId)
                .OrderByDescending(s => s.ObservationId)
                .Take(24)
                .ToListAsync();

            var satellitesDetail = latestSatObs.Select(s => new
            {
                prn           = s.Prn,
                constellation = s.Constellation,
                elevation     = s.ElevationDeg,
                azimuth       = s.AzimuthDeg,
                snr           = s.SnrDbHz,
                usedInFix     = s.UsedInFix,
                status        = s.Status,
            }).ToList();

            var now = DateTime.UtcNow;
            var elapsedSec = (int)(now - session.StartedAt).TotalSeconds;

            // Sensor status mapping
            var sensorStatus = new
            {
                gnss   = latestGnss != null && latestGnss.FixValid ? "FIX" : "NO_FIX",
                imu    = latestImu != null && latestImu.IsValid ? "ACTIVE" : "OFFLINE",
                rtc    = latestPacket != null && latestPacket.ParserStatus == "OK" ? "SYNCED" : "DRIFTING",
                camera = "STANDBY",
                serial = session.Status == "ACTIVE" ? "LIVE" : "OFFLINE",
            };

            var liveSnapshot = new
            {
                sessionId             = session.SessionId,
                sessionCode           = session.SessionCode,
                deviceCode            = session.DeviceCode,
                vehicleRegistration   = session.VehicleRegistrationNumber,
                ulbId                 = session.Assignment?.Vehicle?.UlbId,
                ulbName               = session.Assignment?.Vehicle?.UlbName,
                mode                  = session.Mode,
                status                = session.Status,
                startedAt             = session.StartedAt,
                endedAt               = session.EndedAt,
                sessionElapsed        = elapsedSec,
                runCount              = 1,
                sensorStatus,
                latest = new
                {
                    gnss = latestGnss == null ? null : new
                    {
                        valid             = latestGnss.FixValid,
                        fix               = latestGnss.FixStatus,
                        lat               = latestGnss.Latitude,
                        lon               = latestGnss.Longitude,
                        alt               = latestGnss.AltitudeM,
                        speed             = latestGnss.SpeedKmh,
                        heading           = latestGnss.CourseDeg,
                        satellites        = latestGnss.SatellitesCount,
                        satellitesInView  = latestGnss.SatellitesInView,
                        satellitesUsed    = latestGnss.SatellitesUsed,
                        hdop              = latestGnss.Hdop,
                        satellites_detail = satellitesDetail,
                    },
                    imu = latestImu == null ? null : new
                    {
                        valid           = latestImu.IsValid,
                        accel           = new { x = latestImu.AccelX, y = latestImu.AccelY, z = latestImu.AccelZ },
                        accel_magnitude = latestImu.AccelMagnitude,
                        gyro            = new { x = latestImu.GyroX, y = latestImu.GyroY, z = latestImu.GyroZ },
                        orientation     = new { roll = latestImu.Roll, pitch = latestImu.Pitch, yaw = latestImu.Yaw },
                        mag             = new { x = 0.0, y = 0.0, z = 0.0 },
                        temperature_c   = latestImu.TemperatureC,
                    },
                    rtc = new
                    {
                        synced = latestPacket?.ParserStatus == "OK",
                        iso    = latestPacket?.RtcTimestamp?.ToString("o") ?? latestGnss?.Timestamp.ToString("o"),
                        epoch  = latestPacket?.RtcTimestamp.HasValue == true
                                 ? new DateTimeOffset(latestPacket.RtcTimestamp.Value).ToUnixTimeMilliseconds()
                                 : (long?)null,
                    },
                    system = new
                    {
                        uptime      = latestPacket != null ? (double)latestPacket.ArduinoUptimeMs / 1000.0 : (double?)null,
                        temperature = latestImu?.TemperatureC,
                        battery     = 100,
                    },
                },
                trajectory = recentGnss.Select(g => (object)new
                {
                    lat       = g.Latitude,
                    lon       = g.Longitude,
                    speed     = g.SpeedKmh,
                    alt       = g.AltitudeM,
                    heading   = g.CourseDeg,
                    timestamp = g.Timestamp,
                }).ToList(),
                traces = new
                {
                    times    = recentGnss.Select(g => (g.Timestamp - session.StartedAt).TotalSeconds).ToArray(),
                    speeds   = recentGnss.Select(g => g.SpeedKmh ?? 0.0).ToArray(),
                    alts     = recentGnss.Select(g => g.AltitudeM ?? 0.0).ToArray(),
                    accelMag = recentImu.Select(i => i.AccelMagnitude ?? 0.0).ToArray(),
                    accelX   = recentImu.Select(i => i.AccelX ?? 0.0).ToArray(),
                }
            };

            return Ok(liveSnapshot);
        }

        // ─── GET /api/admin/operational-sessions ──────────────────────────────────
        [HttpGet("operational-sessions")]
        public async Task<IActionResult> GetOperationalSessions([FromQuery] string? ulbId = null, [FromQuery] int limit = 50)
        {
            var query = _db.OperationalSessions
                .AsNoTracking()
                .Include(s => s.Vehicle)
                .Include(s => s.StatusStateDefinition)
                .Include(s => s.RoadAssignments)
                .AsQueryable();

            if (!string.IsNullOrWhiteSpace(ulbId))
            {
                query = query.Where(s => s.UlbId == ulbId);
            }

            var sessions = await query
                .OrderByDescending(s => s.CreatedAt)
                .Take(limit)
                .ToListAsync();

            return Ok(sessions);
        }

        // ─── GET /api/admin/audit ────────────────────────────────────────────────
        [HttpGet("audit")]
        public async Task<IActionResult> GetAuditLogs(
            [FromQuery] string? ulbId = null,
            [FromQuery] string? entityType = null,
            [FromQuery] string? action = null,
            [FromQuery] int limit = 100)
        {
            var query = _db.AuditLogs.AsNoTracking().AsQueryable();

            if (!string.IsNullOrWhiteSpace(ulbId))
                query = query.Where(a => a.UlbId == ulbId);

            if (!string.IsNullOrWhiteSpace(entityType))
                query = query.Where(a => a.EntityType == entityType);

            if (!string.IsNullOrWhiteSpace(action))
                query = query.Where(a => a.Action.Contains(action));

            var logs = await query
                .OrderByDescending(a => a.PerformedAt)
                .Take(limit)
                .ToListAsync();

            return Ok(logs);
        }

        // ─── GET /api/admin/system/state-definitions ─────────────────────────────
        [HttpGet("system/state-definitions")]
        public async Task<IActionResult> GetStateDefinitions([FromQuery] string? entityType = null)
        {
            var query = _db.StateDefinitions.AsNoTracking().AsQueryable();

            if (!string.IsNullOrWhiteSpace(entityType))
                query = query.Where(s => s.EntityType == entityType);

            var states = await query
                .OrderBy(s => s.EntityType)
                .ThenBy(s => s.SortOrder)
                .ToListAsync();

            return Ok(states);
        }

        // ─── GET /api/admin/system/transitions ───────────────────────────────────
        [HttpGet("system/transitions")]
        public async Task<IActionResult> GetStateTransitions(
            [FromQuery] string? entityType = null,
            [FromQuery] string? entityId = null,
            [FromQuery] int limit = 100)
        {
            var query = _db.EntityStateTransitions
                .AsNoTracking()
                .Include(t => t.PreviousStateDefinition)
                .Include(t => t.NewStateDefinition)
                .AsQueryable();

            if (!string.IsNullOrWhiteSpace(entityType))
                query = query.Where(t => t.EntityType == entityType);

            if (!string.IsNullOrWhiteSpace(entityId))
                query = query.Where(t => t.EntityId == entityId);

            var transitions = await query
                .OrderByDescending(t => t.ChangedAt)
                .Take(limit)
                .ToListAsync();

            return Ok(transitions);
        }
    }
}
