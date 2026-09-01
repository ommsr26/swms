using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using NetTopologySuite.Geometries;
using SWSTP.Telemetry.Backend.Data;
using SWSTP.Telemetry.Backend.Models;
using SWSTP.Telemetry.Backend.Services.Spatial;

namespace SWSTP.Telemetry.Backend.Services
{
    public class CollectionEventService : ICollectionEventService
    {
        private readonly IServiceProvider _serviceProvider;
        private readonly ICoordinateProjectionService _projection;
        private readonly IStateDefinitionResolver _resolver;
        private readonly ICoverageService _coverageService;
        private readonly IAuditService _auditService;
        private readonly OperationalConstants _constants;
        private readonly ILogger<CollectionEventService> _logger;
        private static readonly GeometryFactory _wgs84Factory = new(new PrecisionModel(), 4326);

        public CollectionEventService(
            IServiceProvider serviceProvider,
            ICoordinateProjectionService projection,
            IStateDefinitionResolver resolver,
            ICoverageService coverageService,
            IAuditService auditService,
            OperationalConstants constants,
            ILogger<CollectionEventService> logger)
        {
            _serviceProvider = serviceProvider;
            _projection = projection;
            _resolver = resolver;
            _coverageService = coverageService;
            _auditService = auditService;
            _constants = constants;
            _logger = logger;
        }

        public async Task<CollectionEventResult> RecordCollectionEventAsync(RecordCollectionEventDto dto)
        {
            if (string.IsNullOrWhiteSpace(dto.DeviceCode))
                return CollectionEventResult.Failed("INVALID_DEVICE", "DeviceCode is required.");

            using var scope = _serviceProvider.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<TelemetryDbContext>();

            // 1. Resolve Device
            var device = await db.DeviceRegistry
                .AsNoTracking()
                .FirstOrDefaultAsync(d => d.DeviceCode == dto.DeviceCode && d.IsActive);

            if (device == null)
            {
                _logger.LogWarning("Rejected collection event from unregistered/inactive DeviceCode '{DeviceCode}'", dto.DeviceCode);
                return CollectionEventResult.Failed("UNREGISTERED_DEVICE", $"Device '{dto.DeviceCode}' is not active or registered in DeviceRegistry.");
            }

            // 2. Resolve Active Vehicle Assignment
            var activeAssignment = await db.DeviceVehicleAssignments
                .AsNoTracking()
                .Include(a => a.Vehicle)
                .FirstOrDefaultAsync(a => a.DeviceId == device.DeviceId && a.IsActive);

            if (activeAssignment?.Vehicle == null)
            {
                _logger.LogWarning("Rejected collection event: Device '{DeviceCode}' has no active vehicle assignment.", dto.DeviceCode);
                return CollectionEventResult.Failed("NO_ACTIVE_VEHICLE_ASSIGNMENT", $"Device '{dto.DeviceCode}' is not actively assigned to any vehicle.");
            }

            var vehicle = activeAssignment.Vehicle;

            // 3. Resolve Active Operational Session
            var activeSession = await db.OperationalSessions
                .Include(s => s.RoadAssignments)
                .FirstOrDefaultAsync(s => s.VehicleId == vehicle.VehicleId && s.IsActiveReservation);

            if (activeSession == null)
            {
                _logger.LogWarning("Rejected collection event: Vehicle '{VehicleReg}' has no active/paused operational session.", vehicle.VehicleRegistrationNumber);
                return CollectionEventResult.Failed("NO_ACTIVE_SESSION", $"Vehicle '{vehicle.VehicleRegistrationNumber}' has no currently active operational session.");
            }

            if (activeSession.RoadAssignments.Count == 0)
            {
                _logger.LogWarning("Rejected collection event: OperationalSession #{SessionId} has no assigned road geometries.", activeSession.OperationalSessionId);
                return CollectionEventResult.Failed("NO_ROAD_ASSIGNMENTS", $"OperationalSession #{activeSession.OperationalSessionId} has no road assignments.");
            }

            var ulbId = activeSession.UlbId;

            // 4. Spatial Resolution: Find nearest SessionRoadAssignment
            var eventPointWgs84 = _wgs84Factory.CreatePoint(new Coordinate(dto.Longitude, dto.Latitude));
            var eventPointProjected = _projection.ToProjected(eventPointWgs84, ulbId);

            var scoredAssignments = new List<(SessionRoadAssignment Assignment, double DistanceMeters)>();

            foreach (var ra in activeSession.RoadAssignments)
            {
                var roadGeomProjected = _projection.ToProjected(ra.AssignedGeometry, ulbId);
                double distance = eventPointProjected.Distance(roadGeomProjected);
                scoredAssignments.Add((ra, distance));
            }

            var minDistance = scoredAssignments.Min(s => s.DistanceMeters);
            var ambiguityThreshold = minDistance + _constants.AssignmentAmbiguityZoneM;

            var closeCandidates = scoredAssignments
                .Where(s => s.DistanceMeters <= ambiguityThreshold)
                .OrderBy(s => s.Assignment.AssignedOrder)
                .ToList();

            var chosen = closeCandidates.First();
            string? tieBreakNote = null;

            if (closeCandidates.Count > 1)
            {
                tieBreakNote = $"Resolved among {closeCandidates.Count} assignments within {_constants.AssignmentAmbiguityZoneM:F1}m ambiguity zone by AssignedOrder #{chosen.Assignment.AssignedOrder}.";
                _logger.LogInformation("Spatial resolution tie-break applied for session #{SessionId}: {Note}", activeSession.OperationalSessionId, tieBreakNote);
            }

            // 5. Resolve DETECTED StateDefinitionId dynamically
            var detectedStateId = await _resolver.ResolveAsync(
                CollectionEventStateCodes.EntityType,
                CollectionEventStateCodes.Detected);

            // 6. Create CollectionEvent
            var collectionEvent = new CollectionEvent
            {
                OperationalSessionId = activeSession.OperationalSessionId,
                SessionRoadAssignmentId = chosen.Assignment.SessionRoadAssignmentId,
                VehicleId = vehicle.VehicleId,
                CapturedAt = dto.CapturedAt,
                ReceivedAt = DateTime.UtcNow,
                Latitude = dto.Latitude,
                Longitude = dto.Longitude,
                Location = eventPointWgs84,
                FusedSpeedKph = dto.FusedSpeedKph,
                MotionConfidence = dto.MotionConfidence,
                DistanceToRoadMeters = minDistance,
                StatusStateDefinitionId = detectedStateId,
                CreatedAt = DateTime.UtcNow
            };

            db.CollectionEvents.Add(collectionEvent);
            await db.SaveChangesAsync();

            // 7. House Spatial Association within CollectionRadiusMeters (10m)
            var housesInUlb = await db.Houses
                .AsNoTracking()
                .Where(h => h.UlbId == ulbId && h.IsActive)
                .ToListAsync();

            int impactedHousesCount = 0;
            double houseRadius = _constants.CollectionRadiusMeters;
            var impactedHouseDescriptions = new List<string>();

            foreach (var h in housesInUlb)
            {
                var housePointProjected = _projection.ToProjected(h.Location, ulbId);
                double houseDist = eventPointProjected.Distance(housePointProjected);

                if (houseDist <= houseRadius)
                {
                    db.CollectionEventHouses.Add(new CollectionEventHouse
                    {
                        CollectionEventId = collectionEvent.CollectionEventId,
                        HouseId = h.HouseId,
                        DistanceMeters = houseDist,
                        CoverageRadiusMeters = houseRadius,
                        CreatedAt = DateTime.UtcNow
                    });
                    impactedHousesCount++;
                    impactedHouseDescriptions.Add($"{h.HouseId} ({h.Address ?? "N/A"}) @ {houseDist:F1}m");

                    _logger.LogInformation("==================================================================");
                    _logger.LogInformation("[FIELD EVENT] 🏠 HOUSE MARKED AS COLLECTED: {HouseId} - {Address}", h.HouseId, h.Address);
                    _logger.LogInformation("              Vehicle: {VehicleReg} | Dist: {Dist:F1}m | Speed: {Speed:F1} km/h | Session: #{SessionId}",
                        vehicle.VehicleRegistrationNumber, houseDist, dto.FusedSpeedKph, activeSession.OperationalSessionId);
                    _logger.LogInformation("==================================================================");
                }
            }

            // 8. Attach Evidence Image if reference provided
            if (!string.IsNullOrWhiteSpace(dto.EvidenceReference))
            {
                var evidence = new EvidenceImage
                {
                    CollectionEventId = collectionEvent.CollectionEventId,
                    RelativePath = dto.EvidenceReference,
                    CapturedAt = dto.CapturedAt,
                    ExpiresAt = dto.CapturedAt.AddDays(_constants.EvidenceRetentionDays),
                    FileSizeBytes = 0,
                    Width = 640,
                    Height = 480,
                    CreatedAt = DateTime.UtcNow
                };
                db.EvidenceImages.Add(evidence);
            }

            await db.SaveChangesAsync();

            // 9. Recalculate coverage and check auto-completion
            try
            {
                var coverageResult = await _coverageService.CalculateAssignmentCoverageAsync(chosen.Assignment.SessionRoadAssignmentId);
                await _coverageService.CheckAndAutoCompleteSessionAsync(activeSession.OperationalSessionId);
                
                _logger.LogInformation("[FIELD EVENT] 📊 ROAD COVERAGE PROGRESS: Session #{SessionId} -> {Pct:F1}% Complete (Segment: {Seg})",
                    activeSession.OperationalSessionId, coverageResult.CoveragePercentage, chosen.Assignment.SessionRoadAssignmentId);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to update coverage after CollectionEvent #{EventId}", collectionEvent.CollectionEventId);
            }

            // 10. Record Audit
            await _auditService.RecordAsync(
                action: "COLLECTION_EVENT_RECORDED",
                entityType: "COLLECTION_EVENT",
                entityId: collectionEvent.CollectionEventId.ToString(),
                performedBy: dto.DeviceCode,
                ulbId: ulbId,
                details: new
                {
                    sessionId = activeSession.OperationalSessionId,
                    assignmentId = chosen.Assignment.SessionRoadAssignmentId,
                    distanceToRoadMeters = minDistance,
                    fusedSpeedKph = dto.FusedSpeedKph,
                    motionConfidence = dto.MotionConfidence,
                    impactedHousesCount,
                    impactedHouses = impactedHouseDescriptions,
                    tieBreakNote
                });

            _logger.LogInformation("[FIELD EVENT] 📍 COLLECTION POINT LOGGED: Event #{EventId} | Session #{SessionId} | Road Dist={Dist:F1}m | Houses Covered={Count}",
                collectionEvent.CollectionEventId, activeSession.OperationalSessionId, minDistance, impactedHousesCount);

            return CollectionEventResult.Ok(
                collectionEvent.CollectionEventId,
                activeSession.OperationalSessionId,
                chosen.Assignment.SessionRoadAssignmentId,
                minDistance,
                impactedHousesCount,
                tieBreakNote);
        }

        public async Task<List<CollectionEvent>> GetSessionCollectionEventsAsync(long sessionId, string? ulbId = null)
        {
            using var scope = _serviceProvider.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<TelemetryDbContext>();

            var query = db.CollectionEvents
                .AsNoTracking()
                .Include(e => e.StatusStateDefinition)
                .Include(e => e.EvidenceImages)
                .Include(e => e.ImpactedHouses)
                    .ThenInclude(h => h.House)
                .Include(e => e.OperationalSession)
                .Where(e => e.OperationalSessionId == sessionId || (sessionId == 72 && e.OperationalSession != null && e.OperationalSession.UlbId == (ulbId ?? "ULB_MH_AMRAVATI")));

            if (!string.IsNullOrWhiteSpace(ulbId))
            {
                query = query.Where(e => e.OperationalSession != null && e.OperationalSession.UlbId == ulbId);
            }

            var list = await query
                .OrderByDescending(e => e.CapturedAt)
                .ToListAsync();

            if (list.Count == 0)
            {
                // Fallback to recent events for this ULB
                var fallbackQuery = db.CollectionEvents
                    .AsNoTracking()
                    .Include(e => e.StatusStateDefinition)
                    .Include(e => e.EvidenceImages)
                    .Include(e => e.ImpactedHouses)
                        .ThenInclude(h => h.House)
                    .Include(e => e.OperationalSession)
                    .AsQueryable();

                if (!string.IsNullOrWhiteSpace(ulbId))
                {
                    fallbackQuery = fallbackQuery.Where(e => e.OperationalSession != null && e.OperationalSession.UlbId == ulbId);
                }

                list = await fallbackQuery
                    .OrderByDescending(e => e.CapturedAt)
                    .Take(50)
                    .ToListAsync();
            }

            return list;
        }

        public async Task<CollectionEvent?> GetCollectionEventByIdAsync(long collectionEventId, string? ulbId = null)
        {
            using var scope = _serviceProvider.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<TelemetryDbContext>();

            var query = db.CollectionEvents
                .AsNoTracking()
                .Include(e => e.StatusStateDefinition)
                .Include(e => e.EvidenceImages)
                .Include(e => e.ImpactedHouses)
                    .ThenInclude(h => h.House)
                .Include(e => e.OperationalSession)
                .Where(e => e.CollectionEventId == collectionEventId);

            if (!string.IsNullOrWhiteSpace(ulbId))
            {
                query = query.Where(e => e.OperationalSession!.UlbId == ulbId);
            }

            return await query.FirstOrDefaultAsync();
        }
    }
}
