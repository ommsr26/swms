using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using NetTopologySuite.Geometries;
using NetTopologySuite.Operation.Union;
using SWSTP.Telemetry.Backend.Data;
using SWSTP.Telemetry.Backend.Services.Spatial;

namespace SWSTP.Telemetry.Backend.Services
{
    public class CoverageService : ICoverageService
    {
        private readonly IServiceProvider _serviceProvider;
        private readonly ICoordinateProjectionService _projection;
        private readonly IStateTransitionService _transitionService;
        private readonly IStateDefinitionResolver _resolver;
        private readonly OperationalConstants _constants;
        private readonly ILogger<CoverageService> _logger;

        public CoverageService(
            IServiceProvider serviceProvider,
            ICoordinateProjectionService projection,
            IStateTransitionService transitionService,
            IStateDefinitionResolver resolver,
            OperationalConstants constants,
            ILogger<CoverageService> logger)
        {
            _serviceProvider = serviceProvider;
            _projection = projection;
            _transitionService = transitionService;
            _resolver = resolver;
            _constants = constants;
            _logger = logger;
        }

        public async Task<AssignmentCoverageDto> CalculateAssignmentCoverageAsync(long sessionRoadAssignmentId)
        {
            using var scope = _serviceProvider.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<TelemetryDbContext>();

            var assignment = await db.SessionRoadAssignments
                .Include(a => a.Road)
                .Include(a => a.RoadSegment)
                .Include(a => a.OperationalSession)
                .FirstOrDefaultAsync(a => a.SessionRoadAssignmentId == sessionRoadAssignmentId);

            if (assignment == null || assignment.OperationalSession == null)
                throw new InvalidOperationException($"SessionRoadAssignment #{sessionRoadAssignmentId} not found.");

            var ulbId = assignment.OperationalSession.UlbId;

            // Resolve road geometry in WGS84
            var roadGeom = assignment.AssignedGeometry 
                ?? assignment.RoadSegment?.Geometry 
                ?? assignment.Road?.GeometryVersions?.FirstOrDefault()?.Geometry;

            if (roadGeom == null)
            {
                // Fallback from DB
                var roadVersion = await db.RoadGeometryVersions.AsNoTracking().FirstOrDefaultAsync(rv => rv.RoadId == assignment.RoadId);
                roadGeom = roadVersion?.Geometry;
            }

            if (roadGeom == null)
            {
                return new AssignmentCoverageDto(
                    SessionRoadAssignmentId: assignment.SessionRoadAssignmentId,
                    RoadId: assignment.RoadId,
                    RoadName: assignment.Road?.RoadName ?? "Road",
                    RoadSegmentId: assignment.RoadSegmentId,
                    SegmentName: assignment.RoadSegment?.SegmentName,
                    AssignedOrder: assignment.AssignedOrder,
                    AssignedLengthMeters: 125.0,
                    CoveredLengthMeters: 0.0,
                    CoveragePercentage: 0.0,
                    IsCompleted: false);
            }

            // Project road geometry to metric CRS
            var projectedRoad = _projection != null ? _projection.ToProjected(roadGeom, ulbId) : roadGeom;
            double totalLength = projectedRoad.Length;

            if (totalLength <= 0.0)
            {
                totalLength = 125.0;
            }

            // Load collection events for this assignment or session
            var events = await db.CollectionEvents
                .AsNoTracking()
                .Where(e => e.SessionRoadAssignmentId == sessionRoadAssignmentId || e.OperationalSessionId == assignment.OperationalSessionId)
                .ToListAsync();

            double coveredLength = 0.0;

            if (events.Count > 0)
            {
                var bufferList = new List<Geometry>();
                double radius = Math.Max(15.0, _constants.CollectionRadiusMeters);

                foreach (var ev in events)
                {
                    Point? eventPoint = ev.Location;
                    if (eventPoint == null && Math.Abs(ev.Latitude) > 0.001 && Math.Abs(ev.Longitude) > 0.001)
                    {
                        eventPoint = new Point(ev.Longitude, ev.Latitude) { SRID = 4326 };
                    }
                    if (eventPoint == null) continue;

                    var projectedPoint = _projection != null ? _projection.ToProjected(eventPoint, ulbId) : eventPoint;
                    var buffer = projectedPoint.Buffer(radius);
                    bufferList.Add(buffer);
                }

                if (bufferList.Count > 0)
                {
                    Geometry unionBuffer;
                    if (bufferList.Count == 1)
                    {
                        unionBuffer = bufferList[0];
                    }
                    else
                    {
                        unionBuffer = CascadedPolygonUnion.Union(bufferList);
                    }

                    var coveredGeom = projectedRoad.Intersection(unionBuffer);
                    coveredLength = coveredGeom != null ? coveredGeom.Length : 0.0;
                }
            }

            double coveragePercent = totalLength > 0 ? (coveredLength / totalLength) * 100.0 : 0.0;
            coveragePercent = Math.Clamp(coveragePercent, 0.0, 100.0);
            bool isCompleted = coveragePercent >= 95.0;

            return new AssignmentCoverageDto(
                SessionRoadAssignmentId: assignment.SessionRoadAssignmentId,
                RoadId: assignment.RoadId,
                RoadName: assignment.Road?.RoadName ?? "Road",
                RoadSegmentId: assignment.RoadSegmentId,
                SegmentName: assignment.RoadSegment?.SegmentName,
                AssignedOrder: assignment.AssignedOrder,
                AssignedLengthMeters: totalLength,
                CoveredLengthMeters: coveredLength,
                CoveragePercentage: coveragePercent,
                IsCompleted: isCompleted);
        }

        public async Task<SessionCoverageResult?> GetSessionCoverageAsync(long sessionId, string? ulbId = null)
        {
            using var scope = _serviceProvider.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<TelemetryDbContext>();

            var session = await db.OperationalSessions
                .AsNoTracking()
                .Include(s => s.StatusStateDefinition)
                .Include(s => s.RoadAssignments)
                    .ThenInclude(a => a.Road)
                .Include(s => s.RoadAssignments)
                    .ThenInclude(a => a.RoadSegment)
                .FirstOrDefaultAsync(s => s.OperationalSessionId == sessionId);

            if (session == null) return null;

            if (!string.IsNullOrWhiteSpace(ulbId) && !string.Equals(session.UlbId, ulbId, StringComparison.OrdinalIgnoreCase))
                return null;

            var assignmentDtos = new List<AssignmentCoverageDto>();
            double totalAssigned = 0.0;
            double totalCovered = 0.0;
            int completedCount = 0;

            foreach (var a in session.RoadAssignments.OrderBy(r => r.AssignedOrder))
            {
                var dto = await CalculateAssignmentCoverageAsync(a.SessionRoadAssignmentId);
                assignmentDtos.Add(dto);
                totalAssigned += dto.AssignedLengthMeters;
                totalCovered += dto.CoveredLengthMeters;
                if (dto.IsCompleted) completedCount++;
            }

            double overallPercent = totalAssigned > 0 ? (totalCovered / totalAssigned) * 100.0 : 0.0;
            overallPercent = Math.Clamp(overallPercent, 0.0, 100.0);

            var statusCode = session.StatusStateDefinition?.StateCode ??
                await _resolver.ResolveCodeAsync(session.StatusStateDefinitionId);

            return new SessionCoverageResult(
                OperationalSessionId: session.OperationalSessionId,
                SessionCode: session.SessionCode,
                UlbId: session.UlbId,
                Status: statusCode,
                TotalAssignedLengthMeters: totalAssigned,
                TotalCoveredLengthMeters: totalCovered,
                OverallCoveragePercentage: overallPercent,
                TotalAssignments: assignmentDtos.Count,
                CompletedAssignments: completedCount,
                Assignments: assignmentDtos);
        }

        public async Task<SessionRouteAdherenceResult?> GetSessionRouteAdherenceAsync(long sessionId, string? ulbId = null, long? vehicleId = null)
        {
            using var scope = _serviceProvider.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<TelemetryDbContext>();

            var session = await db.OperationalSessions
                .AsNoTracking()
                .Include(s => s.Vehicle)
                .Include(s => s.RoadAssignments)
                    .ThenInclude(a => a.Road)
                .Include(s => s.RoadAssignments)
                    .ThenInclude(a => a.RoadSegment)
                .FirstOrDefaultAsync(s => s.OperationalSessionId == sessionId);

            if (session == null) return null;

            if (!string.IsNullOrWhiteSpace(ulbId) && !string.Equals(session.UlbId, ulbId, StringComparison.OrdinalIgnoreCase))
                return null;

            var effectiveUlb = session.UlbId;
            var offRouteThreshold = _constants?.OffRouteThresholdMeters ?? RouteAdherenceConstants.DefaultOffRouteThresholdMeters;

            // 1. Resolve and project assigned road geometries in local metric CRS
            var projectedRoads = new List<Geometry>();
            foreach (var a in session.RoadAssignments)
            {
                var roadGeom = a.AssignedGeometry
                    ?? a.RoadSegment?.Geometry
                    ?? a.Road?.GeometryVersions?.FirstOrDefault()?.Geometry;

                if (roadGeom == null)
                {
                    var roadVersion = await db.RoadGeometryVersions.AsNoTracking().FirstOrDefaultAsync(rv => rv.RoadId == a.RoadId);
                    roadGeom = roadVersion?.Geometry;
                }

                if (roadGeom != null)
                {
                    var proj = _projection != null ? _projection.ToProjected(roadGeom, effectiveUlb) : roadGeom;
                    if (proj != null) projectedRoads.Add(proj);
                }
            }

            // 2. Query authoritative GNSS samples for this session
            var query = db.GnssSamples
                .AsNoTracking()
                .Where(g => g.SessionId == sessionId && g.FixValid && (g.DisplayLatitude.HasValue || g.Latitude.HasValue) && (g.DisplayLongitude.HasValue || g.Longitude.HasValue));

            var rawSamples = await query
                .OrderBy(g => g.Timestamp)
                .Take(5000)
                .ToListAsync();

            var adherencePoints = new List<AdherencePointDto>();
            var deviationEvents = new List<DeviationEventDto>();

            double totalTrajectoryDist = 0.0;
            double onRouteDist = 0.0;
            double offRouteDist = 0.0;

            Geometry? prevProjectedPoint = null;

            // Deviation tracking state machine
            bool inDeviation = false;
            int deviationEventCounter = 0;
            DateTime devStartTime = DateTime.MinValue;
            DateTime devEndTime = DateTime.MinValue;
            int devSampleCount = 0;
            double devDistance = 0.0;
            double devMaxDistFromRoad = 0.0;
            double devStartLat = 0.0;
            double devStartLon = 0.0;
            double devEndLat = 0.0;
            double devEndLon = 0.0;

            for (int i = 0; i < rawSamples.Count; i++)
            {
                var s = rawSamples[i];
                double lat = s.DisplayLatitude ?? s.Latitude!.Value;
                double lon = s.DisplayLongitude ?? s.Longitude!.Value;

                var wgsPoint = new Point(lon, lat) { SRID = 4326 };
                var projPoint = _projection != null ? _projection.ToProjected(wgsPoint, effectiveUlb) : wgsPoint;

                double stepDist = 0.0;
                if (prevProjectedPoint != null)
                {
                    stepDist = prevProjectedPoint.Distance(projPoint);
                    totalTrajectoryDist += stepDist;
                }
                prevProjectedPoint = projPoint;

                double minDistanceToAssigned = 0.0;
                bool isOffRoute = false;

                if (s.IsInsideSafeZone)
                {
                    // Safe Zone Exception: not off-route
                    isOffRoute = false;
                    minDistanceToAssigned = 0.0;
                    onRouteDist += stepDist;
                }
                else if (projectedRoads.Count > 0)
                {
                    minDistanceToAssigned = projectedRoads.Min(r => projPoint.Distance(r));
                    isOffRoute = minDistanceToAssigned > offRouteThreshold;

                    if (isOffRoute)
                    {
                        offRouteDist += stepDist;
                    }
                    else
                    {
                        onRouteDist += stepDist;
                    }
                }
                else
                {
                    // No assigned roads in session
                    isOffRoute = false;
                    onRouteDist += stepDist;
                }

                adherencePoints.Add(new AdherencePointDto(
                    Lat: lat,
                    Lon: lon,
                    Timestamp: s.Timestamp,
                    IsInsideSafeZone: s.IsInsideSafeZone,
                    IsSnapped: s.IsSnapped,
                    IsOffRoute: isOffRoute,
                    DistanceToAssignedRoadMeters: minDistanceToAssigned,
                    Speed: s.SpeedKmh,
                    Heading: s.CourseDeg));

                // Deviation Event Grouping State Machine
                if (isOffRoute)
                {
                    if (!inDeviation)
                    {
                        inDeviation = true;
                        deviationEventCounter++;
                        devStartTime = s.Timestamp;
                        devEndTime = s.Timestamp;
                        devSampleCount = 1;
                        devDistance = 0.0;
                        devMaxDistFromRoad = minDistanceToAssigned;
                        devStartLat = lat;
                        devStartLon = lon;
                        devEndLat = lat;
                        devEndLon = lon;
                    }
                    else
                    {
                        devEndTime = s.Timestamp;
                        devSampleCount++;
                        devDistance += stepDist;
                        devMaxDistFromRoad = Math.Max(devMaxDistFromRoad, minDistanceToAssigned);
                        devEndLat = lat;
                        devEndLon = lon;
                    }
                }
                else
                {
                    if (inDeviation)
                    {
                        // Close deviation event
                        inDeviation = false;
                        double durationSec = Math.Max(0.0, (devEndTime - devStartTime).TotalSeconds);
                        deviationEvents.Add(new DeviationEventDto(
                            EventId: deviationEventCounter,
                            StartTime: devStartTime,
                            EndTime: devEndTime,
                            DurationSeconds: durationSec,
                            SampleCount: devSampleCount,
                            ApproximateDistanceMeters: devDistance,
                            MaxDeviationDistanceMeters: devMaxDistFromRoad,
                            StartLatitude: devStartLat,
                            StartLongitude: devStartLon,
                            EndLatitude: devEndLat,
                            EndLongitude: devEndLon,
                            VehicleId: session.VehicleId,
                            VehicleRegistrationNumber: session.Vehicle?.VehicleRegistrationNumber));
                    }
                }
            }

            // Close trailing deviation event if ended while off-route
            if (inDeviation)
            {
                double durationSec = Math.Max(0.0, (devEndTime - devStartTime).TotalSeconds);
                deviationEvents.Add(new DeviationEventDto(
                    EventId: deviationEventCounter,
                    StartTime: devStartTime,
                    EndTime: devEndTime,
                    DurationSeconds: durationSec,
                    SampleCount: devSampleCount,
                    ApproximateDistanceMeters: devDistance,
                    MaxDeviationDistanceMeters: devMaxDistFromRoad,
                    StartLatitude: devStartLat,
                    StartLongitude: devStartLon,
                    EndLatitude: devEndLat,
                    EndLongitude: devEndLon,
                    VehicleId: session.VehicleId,
                    VehicleRegistrationNumber: session.Vehicle?.VehicleRegistrationNumber));
            }

            double offRoutePercent = totalTrajectoryDist > 0.0 ? (offRouteDist / totalTrajectoryDist) * 100.0 : 0.0;
            offRoutePercent = Math.Clamp(offRoutePercent, 0.0, 100.0);

            return new SessionRouteAdherenceResult(
                OperationalSessionId: session.OperationalSessionId,
                SessionCode: session.SessionCode,
                UlbId: session.UlbId,
                VehicleId: session.VehicleId,
                VehicleRegistrationNumber: session.Vehicle?.VehicleRegistrationNumber,
                TotalTrajectoryDistanceMeters: totalTrajectoryDist,
                OnRouteDistanceMeters: onRouteDist,
                OffRouteDistanceMeters: offRouteDist,
                OffRoutePercentage: offRoutePercent,
                TotalDeviationEventsCount: deviationEvents.Count,
                DeviationEvents: deviationEvents,
                Points: adherencePoints);
        }

        public async Task<bool> CheckAndAutoCompleteSessionAsync(long sessionId)
        {
            var coverageResult = await GetSessionCoverageAsync(sessionId);
            if (coverageResult == null) return false;

            if (string.Equals(coverageResult.Status, SessionStateCodes.Completed, StringComparison.OrdinalIgnoreCase))
                return true;

            if (coverageResult.Assignments.Count == 0) return false;

            bool allCompleted = coverageResult.Assignments.All(a => a.IsCompleted);

            if (allCompleted)
            {
                _logger.LogInformation("All road assignments for OperationalSession #{SessionId} reached 100% coverage. Auto-completing session.", sessionId);
                var result = await _transitionService.TransitionSessionAsync(
                    sessionId,
                    SessionStateCodes.Completed,
                    "SYSTEM_COVERAGE_ENGINE",
                    "AUTO_COVERAGE_100",
                    "SYSTEM_COVERAGE_ENGINE");

                return result.Success;
            }

            return false;
        }
    }
}
