using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using NetTopologySuite.Geometries;
using SWSTP.Telemetry.Backend.Data;
using SWSTP.Telemetry.Backend.Models;
using SWSTP.Telemetry.Backend.Services.Spatial;

namespace SWSTP.Telemetry.Backend.Controllers
{
    [ApiController]
    [Route("api/gis")]
    public class GisController : ControllerBase
    {
        private readonly TelemetryDbContext _db;
        private readonly ICoordinateProjectionService _projection;
        private static readonly GeometryFactory _wgs84Factory = new(new PrecisionModel(), 4326);

        public GisController(TelemetryDbContext db, ICoordinateProjectionService projection)
        {
            _db = db;
            _projection = projection;
        }

        // ─── GET /api/gis/roads ──────────────────────────────────────────────────
        [HttpGet("roads")]
        public async Task<IActionResult> GetRoads([FromQuery] string? ulbId = null)
        {
            var effectiveUlb = string.IsNullOrWhiteSpace(ulbId) ? "ULB_MH_AMRAVATI" : ulbId;

            var roads = await _db.Roads
                .AsNoTracking()
                .Where(r => r.UlbId == effectiveUlb && r.IsActive)
                .Include(r => r.GeometryVersions)
                .ToListAsync();

            var straightCoords = new[]
            {
                new[] { 20.955829, 77.764433 },
                new[] { 20.956396, 77.763289 }
            };

            var result = roads.Select(r =>
            {
                var currentVer = r.GeometryVersions.OrderByDescending(v => v.EffectiveFrom).FirstOrDefault();
                var coords = currentVer?.Geometry is LineString line && line.Coordinates.Length == 2
                    ? line.Coordinates.Select(c => new[] { c.Y, c.X }).ToArray()
                    : straightCoords;

                return new
                {
                    roadId = r.RoadId,
                    roadCode = r.RoadCode,
                    name = r.RoadName,
                    category = r.RoadType,
                    bufferMeters = 8.0,
                    coordinates = coords,
                };
            });

            return Ok(result);
        }

        // ─── GET /api/gis/houses ─────────────────────────────────────────────────
        [HttpGet("houses")]
        public async Task<IActionResult> GetHouses(
            [FromQuery] string? ulbId = null, 
            [FromQuery] long? sessionId = null,
            [FromQuery] string? date = null)
        {
            var effectiveUlb = string.IsNullOrWhiteSpace(ulbId) ? "ULB_MH_AMRAVATI" : ulbId;

            var houses = await _db.Houses
                .AsNoTracking()
                .Where(h => h.UlbId == effectiveUlb && h.IsActive)
                .ToListAsync();

            if (houses.Count == 0)
            {
                var defaultDefs = new[]
                {
                    ("H-AMR-01", "COSMO AESTHETIC / Vrushangi Modular", 20.95580160, 77.76427580),
                    ("H-AMR-02", "Ambika Provision / Godrej Interio", 20.95588420, 77.76410690),
                    ("H-AMR-03", "सुनील जयसिंगपुरे (Education center)", 20.95598890, 77.76389300),
                    ("H-AMR-04", "Dr. Kishorsingh Chungade Clinic", 20.95606050, 77.76374660),
                    ("H-AMR-05", "Khond's House", 20.95612820, 77.76359800),
                    ("H-AMR-06", "Residential House (Khond Adjacent)", 20.95619430, 77.76346290),
                    ("H-AMR-07", "Shree Ganesh Apartment", 20.95625640, 77.76332550),
                    ("H-AMR-08", "Wellness MEDeal Generic Pharmacy / Dr DEEPAK KEDAR", 20.95597660, 77.76437400),
                    ("H-AMR-09", "Radhika Fashion / Indrashesh Medicals", 20.95605930, 77.76420510),
                    ("H-AMR-10", "Residential Plot 1", 20.95614190, 77.76403620),
                    ("H-AMR-11", "Residential Plot 2", 20.95621900, 77.76387860),
                    ("H-AMR-12", "Residential Plot 3", 20.95629620, 77.76372100),
                    ("H-AMR-13", "Sthapatya Consultants (I) Pvt.Ltd (XQ47+CF8)", 20.95637730, 77.76356550),
                    ("H-AMR-14", "AMF Project Consultant", 20.95644340, 77.76343040)
                };

                foreach (var (hid, addr, lat, lon) in defaultDefs)
                {
                    _db.Houses.Add(new House
                    {
                        HouseId = hid,
                        UlbId = effectiveUlb,
                        Latitude = lat,
                        Longitude = lon,
                        Location = _wgs84Factory.CreatePoint(new Coordinate(lon, lat)),
                        Address = addr,
                        IsActive = true,
                        CreatedAt = DateTime.UtcNow
                    });
                }
                await _db.SaveChangesAsync();

                houses = await _db.Houses
                    .AsNoTracking()
                    .Where(h => h.UlbId == effectiveUlb && h.IsActive)
                    .ToListAsync();
            }

            // Date boundary resolution (Midnight reset: evaluated in IST local time UTC+05:30)
            DateTime dateStart, dateEnd;
            var istOffset = TimeSpan.FromHours(5.5);

            if (!string.IsNullOrWhiteSpace(date) && DateTime.TryParse(date, out var parsedDate))
            {
                var localDay = parsedDate.Date;
                dateStart = DateTime.SpecifyKind(localDay - istOffset, DateTimeKind.Utc);
                dateEnd = DateTime.SpecifyKind(localDay.AddDays(1) - istOffset, DateTimeKind.Utc);
            }
            else
            {
                var nowIst = DateTime.UtcNow.AddHours(5.5);
                var localDay = nowIst.Date;
                dateStart = DateTime.SpecifyKind(localDay - istOffset, DateTimeKind.Utc);
                dateEnd = DateTime.SpecifyKind(localDay.AddDays(1) - istOffset, DateTimeKind.Utc);
            }

            // Fetch collection events filtered by date window
            var dayEvents = await _db.CollectionEvents
                .AsNoTracking()
                .Include(ce => ce.EvidenceImages)
                .Where(ce => ce.CapturedAt >= dateStart && ce.CapturedAt < dateEnd && (ce.Latitude != 0 || ce.Longitude != 0))
                .ToListAsync();

            const double roadTx = -0.8858;
            const double roadTy = 0.4642;

            var primaryAdjacentHousesPerEvent = new HashSet<(long EventId, string HouseId)>();
            var allCorrelatedHouses = new List<(long EventId, string HouseId, double DistanceMeters, CollectionEvent Event)>();

            foreach (var ev in dayEvents)
            {
                var evLat = ev.Latitude;
                var evLon = ev.Longitude;
                if (Math.Abs(evLat) < 0.0001 && Math.Abs(evLon) < 0.0001) continue;

                var sideAHouses = new List<(string HouseId, double DistanceMeters)>();
                var sideBHouses = new List<(string HouseId, double DistanceMeters)>();

                foreach (var hObj in houses)
                {
                    var dLat = (hObj.Latitude - evLat) * 111320.0;
                    var dLon = (hObj.Longitude - evLon) * 111320.0 * Math.Cos(evLat * Math.PI / 180.0);
                    var dist = Math.Sqrt(dLat * dLat + dLon * dLon);

                    if (dist <= 25.0)
                    {
                        var side = (hObj.Longitude - evLon) * roadTy - (hObj.Latitude - evLat) * roadTx;
                        if (side >= 0) sideAHouses.Add((hObj.HouseId, dist));
                        else sideBHouses.Add((hObj.HouseId, dist));

                        allCorrelatedHouses.Add((ev.CollectionEventId, hObj.HouseId, dist, ev));
                    }
                }

                // Primary on Side A (closest within 25m)
                var closestA = sideAHouses.OrderBy(x => x.DistanceMeters).FirstOrDefault();
                if (closestA.HouseId != null)
                {
                    primaryAdjacentHousesPerEvent.Add((ev.CollectionEventId, closestA.HouseId));
                }

                // Primary on Side B (closest within 25m)
                var closestB = sideBHouses.OrderBy(x => x.DistanceMeters).FirstOrDefault();
                if (closestB.HouseId != null)
                {
                    primaryAdjacentHousesPerEvent.Add((ev.CollectionEventId, closestB.HouseId));
                }
            }

            var eventHouseGroup = allCorrelatedHouses.GroupBy(ch => ch.HouseId).ToDictionary(g => g.Key, g => g.ToList());

            var result = houses.Select(h =>
            {
                eventHouseGroup.TryGetValue(h.HouseId, out var linkedEvents);
                linkedEvents ??= new List<(long EventId, string HouseId, double DistanceMeters, CollectionEvent Event)>();

                var count = linkedEvents.Count;
                var minDistance = linkedEvents.Count > 0 ? linkedEvents.Min(e => e.DistanceMeters) : double.MaxValue;
                
                // House is PRIMARY if it is the closest adjacent house on its side of the road for any event on this date
                var isPrimaryAdjacent = linkedEvents.Any(e => primaryAdjacentHousesPerEvent.Contains((e.EventId, h.HouseId)));

                // Status classification:
                // NOT_COLLECTED: 0 events in circle for this date (RED)
                // INTERSECTED: Captured within 15m circle, but is farther away than the direct adjacent house (LIGHT GREEN)
                // COLLECTED: Direct adjacent house on left/right side of the road opposite the vehicle stop (DARK GREEN)
                // OVERLAP PRESERVATION: If marked COLLECTED in ANY event, status stays COLLECTED and never degrades.
                string status = "NOT_COLLECTED";
                if (isPrimaryAdjacent)
                {
                    status = "COLLECTED"; // Solid Dark Green (#2dc653)
                }
                else if (count > 0)
                {
                    status = "INTERSECTED"; // Light Sage Green (#74c69d)
                }

                // Compute rotated building footprint parallel to the straight road vector (8-decimal precision)
                const double tx = -0.8858;
                const double ty = 0.4642;
                const double nx = -ty;
                const double ny = tx;

                const double hw = 3.6; // half width along road (7.2m building width)
                const double hh = 3.2; // half depth off road (6.4m building depth)
                const double latScale = 111320.0;
                double lonScale = 111320.0 * Math.Cos(h.Latitude * Math.PI / 180.0);

                var footprint = new[]
                {
                    new[] { Math.Round(h.Latitude + (hw * ty + hh * ny) / latScale, 8), Math.Round(h.Longitude + (hw * tx + hh * nx) / lonScale, 8) },
                    new[] { Math.Round(h.Latitude + (-hw * ty + hh * ny) / latScale, 8), Math.Round(h.Longitude + (-hw * tx + hh * nx) / lonScale, 8) },
                    new[] { Math.Round(h.Latitude + (-hw * ty - hh * ny) / latScale, 8), Math.Round(h.Longitude + (-hw * tx - hh * nx) / lonScale, 8) },
                    new[] { Math.Round(h.Latitude + (hw * ty - hh * ny) / latScale, 8), Math.Round(h.Longitude + (hw * tx - hh * nx) / lonScale, 8) },
                };

                // Find primary or latest evidence image for this house on this date
                var primaryEvItem = linkedEvents
                    .Where(e => primaryAdjacentHousesPerEvent.Contains((e.EventId, h.HouseId)))
                    .OrderByDescending(e => e.Event.CapturedAt)
                    .FirstOrDefault();

                if (primaryEvItem.Event == null && linkedEvents.Count > 0)
                {
                    primaryEvItem = linkedEvents.OrderByDescending(e => e.Event.CapturedAt).First();
                }

                var latestEv = primaryEvItem.Event;
                var latestImage = latestEv?.EvidenceImages?.OrderByDescending(img => img.CapturedAt).FirstOrDefault();

                return new
                {
                    houseId = h.HouseId,
                    address = h.Address ?? h.HouseId,
                    latitude = Math.Round(h.Latitude, 8),
                    longitude = Math.Round(h.Longitude, 8),
                    polygon = footprint,
                    status = status,
                    collectionEventsCount = count,
                    isPrimary = isPrimaryAdjacent,
                    minDistanceMeters = count > 0 ? Math.Round(minDistance, 2) : (double?)null,
                    latestEvidenceImage = latestImage != null ? new
                    {
                        evidenceImageId = latestImage.EvidenceImageId,
                        url = $"/api/evidence/images/{latestImage.EvidenceImageId}",
                        imageUrl = $"/api/evidence/images/{latestImage.EvidenceImageId}",
                        capturedAt = latestImage.CapturedAt.ToString("yyyy-MM-dd HH:mm:ss"),
                        distanceMeters = count > 0 ? Math.Round(minDistance, 2) : 0,
                    } : null
                };
            });

            return Ok(result);
        }

        // ─── GET /api/gis/collection-events ──────────────────────────────────────
        [HttpGet("collection-events")]
        public async Task<IActionResult> GetCollectionEvents(
            [FromQuery] string? ulbId = null,
            [FromQuery] string? date = null)
        {
            var effectiveUlb = string.IsNullOrWhiteSpace(ulbId) ? "ULB_MH_AMRAVATI" : ulbId;

            DateTime dateStart, dateEnd;
            var istOffset = TimeSpan.FromHours(5.5);

            if (!string.IsNullOrWhiteSpace(date) && DateTime.TryParse(date, out var parsedDate))
            {
                var localDay = parsedDate.Date;
                dateStart = DateTime.SpecifyKind(localDay - istOffset, DateTimeKind.Utc);
                dateEnd = DateTime.SpecifyKind(localDay.AddDays(1) - istOffset, DateTimeKind.Utc);
            }
            else
            {
                var nowIst = DateTime.UtcNow.AddHours(5.5);
                var localDay = nowIst.Date;
                dateStart = DateTime.SpecifyKind(localDay - istOffset, DateTimeKind.Utc);
                dateEnd = DateTime.SpecifyKind(localDay.AddDays(1) - istOffset, DateTimeKind.Utc);
            }

            var events = await _db.CollectionEvents
                .AsNoTracking()
                .Include(ce => ce.EvidenceImages)
                .Where(ce => ce.CapturedAt >= dateStart && ce.CapturedAt < dateEnd)
                .OrderBy(ce => ce.CapturedAt)
                .ToListAsync();

            var result = events.Select(ce => new
            {
                collectionEventId = ce.CollectionEventId,
                operationalSessionId = ce.OperationalSessionId,
                latitude = Math.Round(ce.Latitude, 8),
                longitude = Math.Round(ce.Longitude, 8),
                capturedAt = ce.CapturedAt.ToString("yyyy-MM-dd HH:mm:ss"),
                fusedSpeedKph = ce.FusedSpeedKph,
                radiusMeters = 15.0,
                evidenceImageId = ce.EvidenceImages.OrderByDescending(img => img.CapturedAt).FirstOrDefault()?.EvidenceImageId
            });

            return Ok(result);
        }

        // ─── GET /api/gis/safe-zones ─────────────────────────────────────────────
        [HttpGet("safe-zones")]
        public async Task<IActionResult> GetSafeZones([FromQuery] string? ulbId = null)
        {
            var effectiveUlb = string.IsNullOrWhiteSpace(ulbId) ? "ULB_MH_AMRAVATI" : ulbId;
            var safeZones = await _db.SafeZones
                .AsNoTracking()
                .Where(s => s.UlbId == effectiveUlb && s.IsActive)
                .Select(s => new
                {
                    safeZoneId = s.SafeZoneId,
                    ulbId = s.UlbId,
                    name = s.Name,
                    latitude = s.Latitude,
                    longitude = s.Longitude,
                    radiusMeters = s.RadiusMeters,
                    isActive = s.IsActive
                })
                .ToListAsync();

            if (safeZones.Count == 0)
            {
                var ulb = await _db.UlbRegistry.AsNoTracking().FirstOrDefaultAsync(u => u.UlbId == effectiveUlb);
                if (ulb?.SafeZoneLatitude != null && ulb?.SafeZoneLongitude != null)
                {
                    safeZones.Add(new
                    {
                        safeZoneId = 1L,
                        ulbId = effectiveUlb,
                        name = $"{ulb.UlbName} Depot",
                        latitude = ulb.SafeZoneLatitude.Value,
                        longitude = ulb.SafeZoneLongitude.Value,
                        radiusMeters = ulb.SafeZoneRadiusMeters ?? 1000.0,
                        isActive = true
                    });
                }
            }

            return Ok(safeZones);
        }

        // ─── POST /api/gis/snap ──────────────────────────────────────────────────
        // Snaps GPS coordinate to closest road centerline if within 10.0m tolerance
        [HttpPost("snap")]
        public async Task<IActionResult> SnapToRoad([FromBody] GpsCoordDto dto, [FromQuery] string? ulbId = null)
        {
            var effectiveUlb = string.IsNullOrWhiteSpace(ulbId) ? "ULB_MH_AMRAVATI" : ulbId;
            const double maxSnapDistanceMeters = 10.0;

            var pointWgs = _wgs84Factory.CreatePoint(new Coordinate(dto.Longitude, dto.Latitude));
            var pointProj = _projection.ToProjected(pointWgs, effectiveUlb);

            var roads = await _db.RoadGeometryVersions
                .AsNoTracking()
                .Include(v => v.Road)
                .Where(v => v.Road != null && v.Road.UlbId == effectiveUlb && v.Road.IsActive)
                .ToListAsync();

            double closestDist = double.MaxValue;
            Coordinate? snappedCoordWgs = null;

            foreach (var r in roads)
            {
                var roadProj = _projection.ToProjected(r.Geometry, effectiveUlb);
                var dist = pointProj.Distance(roadProj);

                if (dist < closestDist && dist <= maxSnapDistanceMeters)
                {
                    closestDist = dist;
                    var nearestPts = NetTopologySuite.Operation.Distance.DistanceOp.NearestPoints(pointProj, roadProj);
                    if (nearestPts.Length > 1)
                    {
                        // Invert projection back using ratio delta approximation
                        double dX = nearestPts[1].X - pointProj.Coordinate.X;
                        double dY = nearestPts[1].Y - pointProj.Coordinate.Y;

                        // 1m in UTM roughly corresponds to 1 / 111320 deg lat
                        double dLat = dY / 111320.0;
                        double dLon = dX / (111320.0 * Math.Cos(dto.Latitude * Math.PI / 180.0));

                        snappedCoordWgs = new Coordinate(dto.Longitude + dLon, dto.Latitude + dLat);
                    }
                }
            }

            if (snappedCoordWgs != null)
            {
                return Ok(new
                {
                    snapped = true,
                    latitude = snappedCoordWgs.Y,
                    longitude = snappedCoordWgs.X,
                    distanceToRoadMeters = Math.Round(closestDist, 2),
                });
            }

            return Ok(new
            {
                snapped = false,
                latitude = dto.Latitude,
                longitude = dto.Longitude,
                distanceToRoadMeters = closestDist < double.MaxValue ? Math.Round(closestDist, 2) : 0,
            });
        }

        // ─── POST /api/gis/seed ──────────────────────────────────────────────────
        [HttpPost("seed")]
        public async Task<IActionResult> TriggerSeed()
        {
            await DbGisSeeder.SeedAsync(HttpContext.RequestServices);
            return Ok(new { success = true, message = "GIS road and 15 houses seeded successfully." });
        }
    }

    public record GpsCoordDto(double Latitude, double Longitude);
}
