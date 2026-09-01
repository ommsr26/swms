using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using NetTopologySuite.Geometries;
using NetTopologySuite.IO;
using SWSTP.Telemetry.Backend.Data;
using SWSTP.Telemetry.Backend.Models;
using SWSTP.Telemetry.Backend.Services.Spatial;

namespace SWSTP.Telemetry.Backend.Services
{
    public class RoadAssignmentService : IRoadAssignmentService
    {
        private readonly IServiceProvider _serviceProvider;
        private readonly ICoordinateProjectionService _projection;
        private readonly IAuditService _auditService;
        private readonly OperationalConstants _constants;
        private readonly ILogger<RoadAssignmentService> _logger;
        private static readonly WKTReader _wktReader = new(new GeometryFactory(new PrecisionModel(), 4326));

        public RoadAssignmentService(
            IServiceProvider serviceProvider,
            ICoordinateProjectionService projection,
            IAuditService auditService,
            OperationalConstants constants,
            ILogger<RoadAssignmentService> logger)
        {
            _serviceProvider = serviceProvider;
            _projection = projection;
            _auditService = auditService;
            _constants = constants;
            _logger = logger;
        }

        public async Task<SessionRoadAssignment> CreateAssignmentAsync(
            long sessionId,
            long roadId,
            long roadGeometryVersionId,
            long? roadSegmentId,
            string? customGeometryWkt,
            double? bufferMeters,
            string assignmentType,
            int assignedOrder,
            string createdBy)
        {
            using var scope = _serviceProvider.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<TelemetryDbContext>();

            var session = await db.OperationalSessions
                .FirstOrDefaultAsync(s => s.OperationalSessionId == sessionId);

            if (session == null)
                throw new InvalidOperationException($"OperationalSession #{sessionId} not found.");

            var road = await db.Roads
                .FirstOrDefaultAsync(r => r.RoadId == roadId);

            if (road == null)
                throw new InvalidOperationException($"Road #{roadId} not found.");

            if (!string.Equals(session.UlbId, road.UlbId, StringComparison.OrdinalIgnoreCase))
                throw new InvalidOperationException($"Road #{roadId} belongs to ULB '{road.UlbId}', not session ULB '{session.UlbId}'. Cross-ULB assignment is prohibited.");

            Geometry? geometry = null;

            if (!string.IsNullOrWhiteSpace(customGeometryWkt))
            {
                geometry = _wktReader.Read(customGeometryWkt);
                geometry.SRID = 4326;
            }
            else if (roadSegmentId.HasValue)
            {
                var segment = await db.RoadSegments
                    .AsNoTracking()
                    .FirstOrDefaultAsync(s => s.RoadSegmentId == roadSegmentId.Value);

                if (segment != null)
                {
                    geometry = segment.Geometry;
                }
            }

            if (geometry == null)
            {
                var version = await db.RoadGeometryVersions
                    .AsNoTracking()
                    .FirstOrDefaultAsync(v => v.RoadGeometryVersionId == roadGeometryVersionId);

                if (version != null)
                {
                    geometry = version.Geometry;
                }
            }

            if (geometry == null)
                throw new InvalidOperationException("Could not resolve road assignment geometry from the specified segment or version.");

            // Calculate metric length using projected CRS
            var projectedGeom = _projection.ToProjected(geometry, session.UlbId);
            double metricLength = projectedGeom.Length;

            var assignment = new SessionRoadAssignment
            {
                OperationalSessionId = sessionId,
                RoadId = roadId,
                RoadGeometryVersionId = roadGeometryVersionId,
                RoadSegmentId = roadSegmentId,
                AssignedGeometry = geometry,
                BufferMeters = bufferMeters ?? _constants.DefaultBufferMeters,
                AssignmentType = assignmentType ?? "DEFAULT_SEGMENT",
                AssignedOrder = assignedOrder,
                CreatedBy = createdBy,
                CreatedAt = DateTime.UtcNow
            };

            db.SessionRoadAssignments.Add(assignment);
            await db.SaveChangesAsync();

            await _auditService.RecordAsync(
                action: "ROAD_ASSIGNMENT_CREATED",
                entityType: "ROAD_ASSIGNMENT",
                entityId: assignment.SessionRoadAssignmentId.ToString(),
                performedBy: createdBy,
                ulbId: session.UlbId,
                details: new
                {
                    sessionId,
                    roadId,
                    roadSegmentId,
                    lengthMeters = metricLength,
                    bufferMeters = assignment.BufferMeters,
                    assignmentType
                });

            _logger.LogInformation("Created SessionRoadAssignment #{AssignmentId} for Session #{SessionId} (Length={Length:F1}m)",
                assignment.SessionRoadAssignmentId, sessionId, metricLength);

            return assignment;
        }

        public async Task<List<SessionRoadAssignment>> GetAssignmentsAsync(long sessionId, string? ulbId = null)
        {
            using var scope = _serviceProvider.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<TelemetryDbContext>();

            var query = db.SessionRoadAssignments
                .AsNoTracking()
                .Include(a => a.Road)
                .Include(a => a.RoadSegment)
                .Include(a => a.OperationalSession)
                .Where(a => a.OperationalSessionId == sessionId);

            if (!string.IsNullOrWhiteSpace(ulbId))
            {
                query = query.Where(a => a.OperationalSession!.UlbId == ulbId);
            }

            return await query
                .OrderBy(a => a.AssignedOrder)
                .ToListAsync();
        }

        public async Task<bool> UpdateBufferMetersAsync(long assignmentId, double bufferMeters, string ulbId, string updatedBy)
        {
            using var scope = _serviceProvider.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<TelemetryDbContext>();

            var assignment = await db.SessionRoadAssignments
                .Include(a => a.OperationalSession)
                .FirstOrDefaultAsync(a => a.SessionRoadAssignmentId == assignmentId);

            if (assignment == null) return false;

            if (assignment.OperationalSession != null && !string.Equals(assignment.OperationalSession.UlbId, ulbId, StringComparison.OrdinalIgnoreCase))
                throw new InvalidOperationException($"Assignment #{assignmentId} does not belong to ULB '{ulbId}'.");

            var oldBuffer = assignment.BufferMeters;
            assignment.BufferMeters = bufferMeters;
            assignment.UpdatedAt = DateTime.UtcNow;
            assignment.UpdatedBy = updatedBy;

            await db.SaveChangesAsync();

            await _auditService.RecordAsync(
                action: "ROAD_ASSIGNMENT_BUFFER_UPDATED",
                entityType: "ROAD_ASSIGNMENT",
                entityId: assignmentId.ToString(),
                performedBy: updatedBy,
                ulbId: ulbId,
                details: new { oldBuffer, newBuffer = bufferMeters });

            return true;
        }
    }
}
