using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SWSTP.Telemetry.Backend.Data;
using SWSTP.Telemetry.Backend.Models;
using SWSTP.Telemetry.Backend.Services;

namespace SWSTP.Telemetry.Backend.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class SessionsController : ControllerBase
    {
        private readonly TelemetryDbContext _db;
        private readonly ITelemetryIngestionService _ingestionService;

        public SessionsController(TelemetryDbContext db, ITelemetryIngestionService ingestionService)
        {
            _db = db;
            _ingestionService = ingestionService;
        }

        [HttpGet]
        public async Task<IActionResult> GetSessions([FromQuery] string? mode = null, [FromQuery] int limit = 50)
        {
            var query = _db.TelemetrySessions.AsNoTracking().AsQueryable();
            if (!string.IsNullOrEmpty(mode))
            {
                query = query.Where(s => s.Mode == mode);
            }

            var sessions = await query
                .Include(s => s.Device)
                .Include(s => s.Assignment)
                .ThenInclude(a => a!.Vehicle)
                .OrderByDescending(s => s.StartedAt)
                .Take(limit)
                .Select(s => new
                {
                    sessionId = s.SessionId,
                    sessionCode = s.SessionCode,
                    deviceCode = s.DeviceCode,
                    vehicleRegistrationNumber = s.VehicleRegistrationNumber,
                    mode = s.Mode,
                    startedAt = s.StartedAt,
                    endedAt = s.EndedAt,
                    serialBaud = s.SerialBaud,
                    status = s.Status
                })
                .ToListAsync();

            return Ok(sessions);
        }

        public class CreateHardwareSessionReq
        {
            public string DeviceCode { get; set; } = "SWSTP-DEV-000001";
            public string Mode { get; set; } = "REAL_HARDWARE";
        }

        [HttpPost("start-hardware-session")]
        public async Task<IActionResult> StartHardwareSession([FromBody] CreateHardwareSessionReq req)
        {
            if (string.IsNullOrEmpty(req.DeviceCode))
            {
                return BadRequest(new { error = "DeviceCode is required" });
            }

            var identity = await _ingestionService.GetOrCreateSessionIdentityForDeviceAsync(req.DeviceCode, req.Mode);
            if (identity == null)
            {
                return BadRequest(new
                {
                    error = "UNREGISTERED_DEVICE",
                    message = $"Hardware device '{req.DeviceCode}' is not registered in DeviceRegistry. Hardware access denied."
                });
            }

            return Ok(identity);
        }


        [HttpPost("{sessionId}/end")]
        public async Task<IActionResult> EndSession(long sessionId, [FromQuery] string status = "COMPLETED")
        {
            await _ingestionService.EndSessionAsync(sessionId, status);
            return Ok(new { sessionId, status });
        }


        [HttpGet("devices")]
        public async Task<IActionResult> GetDevices()
        {
            var devices = await _db.DeviceRegistry
                .AsNoTracking()
                .Include(d => d.Assignments.Where(a => a.IsActive))
                .ThenInclude(a => a.Vehicle)
                .ToListAsync();

            var result = devices.Select(d => new
            {
                deviceId = d.DeviceId,
                deviceCode = d.DeviceCode,
                hardwareVersion = d.HardwareVersion,
                firmwareVersion = d.FirmwareVersion,
                registeredAt = d.RegisteredAt,
                lastSeenAt = d.LastSeenAt,
                isActive = d.IsActive,
                activeVehicleRegistration = d.Assignments.FirstOrDefault(a => a.IsActive)?.Vehicle?.VehicleRegistrationNumber ?? "UNASSIGNED"
            });

            return Ok(result);
        }
    }
}
