using System;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SWSTP.Telemetry.Backend.Data;

namespace SWSTP.Telemetry.Backend.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class HistoricalController : ControllerBase
    {
        private readonly TelemetryDbContext _db;
        private readonly SWSTP.Telemetry.Backend.Services.ISessionAuthorizationService _auth;

        public HistoricalController(
            TelemetryDbContext db,
            SWSTP.Telemetry.Backend.Services.ISessionAuthorizationService auth)
        {
            _db = db;
            _auth = auth;
        }

        [HttpGet("sessions/{sessionId}/gnss-trajectory")]
        public async Task<IActionResult> GetGnssTrajectory(long sessionId, [FromQuery] int limit = 5000)
        {
            if (!await _auth.AuthorizeSessionSubscriptionAsync(User, sessionId))
            {
                return Forbid();
            }

            var points = await _db.GnssSamples
                .AsNoTracking()
                .Where(g => g.SessionId == sessionId && g.FixValid && (g.DisplayLatitude.HasValue || g.Latitude.HasValue) && (g.DisplayLongitude.HasValue || g.Longitude.HasValue))
                .OrderBy(g => g.Timestamp)
                .Take(limit)
                .Select(g => new
                {
                    lat = g.DisplayLatitude ?? g.Latitude,
                    lon = g.DisplayLongitude ?? g.Longitude,
                    rawLat = g.RawLatitude ?? g.Latitude,
                    rawLon = g.RawLongitude ?? g.Longitude,
                    displayLat = g.DisplayLatitude ?? g.Latitude,
                    displayLon = g.DisplayLongitude ?? g.Longitude,
                    isInsideSafeZone = g.IsInsideSafeZone,
                    isSnapped = g.IsSnapped,
                    alt = g.AltitudeM,
                    speed = g.SpeedKmh,
                    heading = g.CourseDeg,
                    timestamp = g.Timestamp,
                    satellites = g.SatellitesCount,
                    hdop = g.Hdop
                })
                .ToListAsync();

            return Ok(points);
        }

        [HttpGet("vehicles/{vehicleId}/route")]
        public async Task<IActionResult> GetVehicleRoute(
            long vehicleId,
            [FromQuery] DateTime? from = null,
            [FromQuery] DateTime? to = null,
            [FromQuery] int limit = 5000)
        {
            if (!await _auth.AuthorizeVehicleAccessAsync(User, vehicleId))
            {
                return Forbid();
            }

            // Resolve session IDs associated with this vehicle
            var sessionIds = await _db.TelemetrySessions
                .AsNoTracking()
                .Where(s => s.Assignment != null && s.Assignment.VehicleId == vehicleId)
                .Select(s => s.SessionId)
                .ToListAsync();

            if (sessionIds.Count == 0)
            {
                // Fallback: check if vehicle registration matches
                var reg = await _db.VehicleRegistry
                    .AsNoTracking()
                    .Where(v => v.VehicleId == vehicleId)
                    .Select(v => v.VehicleRegistrationNumber)
                    .FirstOrDefaultAsync();

                if (!string.IsNullOrWhiteSpace(reg))
                {
                    sessionIds = await _db.TelemetrySessions
                        .AsNoTracking()
                        .Where(s => s.VehicleRegistrationNumber == reg)
                        .Select(s => s.SessionId)
                        .ToListAsync();
                }
            }

            var query = _db.GnssSamples
                .AsNoTracking()
                .Where(g => sessionIds.Contains(g.SessionId) && g.FixValid && (g.DisplayLatitude.HasValue || g.Latitude.HasValue) && (g.DisplayLongitude.HasValue || g.Longitude.HasValue));

            if (from.HasValue)
                query = query.Where(g => g.Timestamp >= from.Value);

            if (to.HasValue)
                query = query.Where(g => g.Timestamp <= to.Value);

            var points = await query
                .OrderBy(g => g.Timestamp)
                .Take(limit)
                .Select(g => new
                {
                    sessionId = g.SessionId,
                    lat = g.DisplayLatitude ?? g.Latitude,
                    lon = g.DisplayLongitude ?? g.Longitude,
                    rawLat = g.RawLatitude ?? g.Latitude,
                    rawLon = g.RawLongitude ?? g.Longitude,
                    displayLat = g.DisplayLatitude ?? g.Latitude,
                    displayLon = g.DisplayLongitude ?? g.Longitude,
                    isInsideSafeZone = g.IsInsideSafeZone,
                    isSnapped = g.IsSnapped,
                    alt = g.AltitudeM,
                    speed = g.SpeedKmh,
                    heading = g.CourseDeg,
                    timestamp = g.Timestamp,
                    satellites = g.SatellitesCount,
                    hdop = g.Hdop
                })
                .ToListAsync();

            return Ok(points);
        }

        [HttpGet("vehicles/{vehicleId}/sessions")]
        public async Task<IActionResult> GetVehicleSessions(long vehicleId, [FromQuery] int limit = 50)
        {
            if (!await _auth.AuthorizeVehicleAccessAsync(User, vehicleId))
            {
                return Forbid();
            }

            var sessions = await _db.TelemetrySessions
                .AsNoTracking()
                .Where(s => (s.Assignment != null && s.Assignment.VehicleId == vehicleId))
                .OrderByDescending(s => s.StartedAt)
                .Take(limit)
                .Select(s => new
                {
                    s.SessionId,
                    s.SessionCode,
                    s.DeviceCode,
                    s.VehicleRegistrationNumber,
                    s.StartedAt,
                    s.EndedAt,
                    s.Status,
                    gnssSamplesCount = s.TelemetryPackets.Count()
                })
                .ToListAsync();

            return Ok(sessions);
        }

        [HttpGet("sessions/{sessionId}/imu-history")]
        public async Task<IActionResult> GetImuHistory(long sessionId, [FromQuery] int limit = 2000)
        {
            var samples = await _db.ImuSamples
                .AsNoTracking()
                .Where(i => i.SessionId == sessionId)
                .OrderBy(i => i.Timestamp)
                .Take(limit)
                .Select(i => new
                {
                    timestamp = i.Timestamp,
                    accelX = i.AccelX,
                    accelY = i.AccelY,
                    accelZ = i.AccelZ,
                    accelMag = i.AccelMagnitude,
                    gyroX = i.GyroX,
                    gyroY = i.GyroY,
                    gyroZ = i.GyroZ,
                    roll = i.Roll,
                    pitch = i.Pitch,
                    yaw = i.Yaw
                })
                .ToListAsync();

            return Ok(samples);
        }

        [HttpGet("sessions/{sessionId}/satellites")]
        public async Task<IActionResult> GetSatelliteHistory(long sessionId)
        {
            var observations = await _db.GnssSatelliteObservations
                .AsNoTracking()
                .Where(s => s.SessionId == sessionId)
                .ToListAsync();

            var grouped = observations
                .GroupBy(s => $"{s.Constellation}_{s.Prn}")
                .Select(g =>
                {
                    var first = g.OrderBy(s => s.ObservedAt).First();
                    var last = g.OrderByDescending(s => s.ObservedAt).First();
                    var validSnrs = g.Where(s => s.SnrDbHz.HasValue && s.SnrDbHz > 0).Select(s => s.SnrDbHz!.Value).ToList();

                    return new
                    {
                        key = g.Key,
                        prn = first.Prn,
                        constellation = first.Constellation,
                        firstSeenTimestamp = first.ObservedAt.ToString("yyyy-MM-dd HH:mm:ss"),
                        lastSeenTimestamp = last.ObservedAt.ToString("yyyy-MM-dd HH:mm:ss"),
                        trackedDurationMs = (int)(last.ObservedAt - first.ObservedAt).TotalMilliseconds,
                        observationCount = g.Count(),
                        status = last.Status,
                        currentlyVisible = (DateTime.UtcNow - last.ObservedAt).TotalSeconds < 5,
                        currentlyUsedInFix = last.UsedInFix,
                        lastSNR = last.SnrDbHz,
                        peakSNR = validSnrs.Count > 0 ? (double?)validSnrs.Max() : null,
                        minimumSNR = validSnrs.Count > 0 ? (double?)validSnrs.Min() : null,
                        lastElevation = last.ElevationDeg,
                        lastAzimuth = last.AzimuthDeg,
                        firstElevation = first.ElevationDeg,
                        firstAzimuth = first.AzimuthDeg
                    };
                })
                .ToList();

            return Ok(grouped);
        }
    }
}
