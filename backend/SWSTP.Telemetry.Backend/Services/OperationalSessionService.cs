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

namespace SWSTP.Telemetry.Backend.Services
{
    public class OperationalSessionService : IOperationalSessionService
    {
        private readonly IServiceProvider _serviceProvider;
        private readonly IStateDefinitionResolver _resolver;
        private readonly IStateTransitionService _transitionService;
        private readonly IAuditService _auditService;
        private readonly OperationalConstants _constants;
        private readonly ILogger<OperationalSessionService> _logger;
        private static readonly WKTReader _wktReader = new(new GeometryFactory(new PrecisionModel(), 4326));

        public OperationalSessionService(
            IServiceProvider serviceProvider,
            IStateDefinitionResolver resolver,
            IStateTransitionService transitionService,
            IAuditService auditService,
            OperationalConstants constants,
            ILogger<OperationalSessionService> logger)
        {
            _serviceProvider = serviceProvider;
            _resolver = resolver;
            _transitionService = transitionService;
            _auditService = auditService;
            _constants = constants;
            _logger = logger;
        }

        public async Task<CreateSessionResult> CreateSessionAsync(CreateOperationalSessionDto dto, string createdBy)
        {
            if (string.IsNullOrWhiteSpace(dto.UlbId))
                return CreateSessionResult.Failed("INVALID_PAYLOAD", "UlbId is required.");

            if (dto.VehicleId <= 0)
                return CreateSessionResult.Failed("INVALID_PAYLOAD", "A valid VehicleId is required.");

            using var scope = _serviceProvider.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<TelemetryDbContext>();

            // 1. Verify vehicle exists and belongs to specified ULB
            var vehicle = await db.VehicleRegistry
                .AsNoTracking()
                .FirstOrDefaultAsync(v => v.VehicleId == dto.VehicleId);

            if (vehicle == null)
                return CreateSessionResult.Failed("VEHICLE_NOT_FOUND", $"Vehicle with ID {dto.VehicleId} not found.");

            if (!string.Equals(vehicle.UlbId, dto.UlbId, StringComparison.OrdinalIgnoreCase))
                return CreateSessionResult.Failed("ULB_MISMATCH", $"Vehicle '{vehicle.VehicleRegistrationNumber}' belongs to ULB '{vehicle.UlbId}', not '{dto.UlbId}'.");

            // 2. Check for active reservation on this vehicle
            var existingReservation = await db.OperationalSessions
                .AsNoTracking()
                .FirstOrDefaultAsync(s => s.VehicleId == dto.VehicleId && s.IsActiveReservation);

            if (existingReservation != null)
            {
                return CreateSessionResult.Failed("VEHICLE_RESERVED",
                    $"Vehicle '{vehicle.VehicleRegistrationNumber}' is already reserved by active/paused OperationalSession #{existingReservation.OperationalSessionId} ({existingReservation.SessionCode}).");
            }

            // 3. Verify all assigned roads belong to this ULB
            if (dto.RoadAssignments != null && dto.RoadAssignments.Count > 0)
            {
                foreach (var ra in dto.RoadAssignments)
                {
                    var road = await db.Roads.AsNoTracking().FirstOrDefaultAsync(r => r.RoadId == ra.RoadId);
                    if (road == null)
                        return CreateSessionResult.Failed("ROAD_NOT_FOUND", $"Road with ID {ra.RoadId} not found.");

                    if (!string.Equals(road.UlbId, dto.UlbId, StringComparison.OrdinalIgnoreCase))
                        return CreateSessionResult.Failed("ULB_MISMATCH", $"Road '{road.RoadName}' belongs to ULB '{road.UlbId}', not '{dto.UlbId}'.");
                }
            }

            // 4. Resolve SCHEDULED StateDefinitionId
            var scheduledStateId = await _resolver.ResolveAsync(SessionStateCodes.EntityType, SessionStateCodes.Scheduled);

            // 4. Generate unique session code
            var sessionCode = $"OPS-{dto.UlbId}-{DateTime.UtcNow:yyyyMMdd-HHmmss}-{Guid.NewGuid().ToString()[..4].ToUpperInvariant()}";

            var session = new OperationalSession
            {
                SessionCode = sessionCode,
                Name = !string.IsNullOrWhiteSpace(dto.Name) ? dto.Name : $"Inspection Mission ({dto.UlbId})",
                Description = dto.Description,
                VehicleId = dto.VehicleId,
                UlbId = dto.UlbId,
                ScheduledStartAt = dto.ScheduledStartAt,
                StatusStateDefinitionId = scheduledStateId,
                IsActiveReservation = false,
                CreatedBy = createdBy,
                CreatedAt = DateTime.UtcNow
            };

            db.OperationalSessions.Add(session);
            await db.SaveChangesAsync();

            // 5. Append initial transition to ledger
            var initialTransition = new EntityStateTransition
            {
                EntityType = SessionStateCodes.EntityType,
                EntityId = session.OperationalSessionId.ToString(),
                PreviousStateDefinitionId = null,
                NewStateDefinitionId = scheduledStateId,
                ChangedAt = DateTime.UtcNow,
                ChangedBy = createdBy,
                Reason = "INITIAL_CREATION",
                Source = "ULB_OFFICER"
            };
            db.EntityStateTransitions.Add(initialTransition);

            // 6. Add Road Assignments if provided
            if (dto.RoadAssignments != null && dto.RoadAssignments.Count > 0)
            {
                foreach (var ra in dto.RoadAssignments)
                {
                    Geometry? geometry = null;
                    double lengthMeters = 0.0;

                    if (!string.IsNullOrWhiteSpace(ra.CustomGeometryWkt))
                    {
                        try
                        {
                            geometry = _wktReader.Read(ra.CustomGeometryWkt);
                            geometry.SRID = 4326;
                        }
                        catch (Exception ex)
                        {
                            _logger.LogWarning(ex, "Failed to parse CustomGeometryWkt for road assignment on session #{SessionId}", session.OperationalSessionId);
                        }
                    }

                    if (geometry == null && ra.RoadSegmentId.HasValue && ra.RoadSegmentId.Value > 0)
                    {
                        var segment = await db.RoadSegments
                            .AsNoTracking()
                            .FirstOrDefaultAsync(s => s.RoadSegmentId == ra.RoadSegmentId.Value);

                        if (segment != null)
                        {
                            geometry = segment.Geometry;
                            lengthMeters = segment.LengthMeters;
                            if (ra.RoadGeometryVersionId == 0)
                                ra.RoadGeometryVersionId = segment.RoadGeometryVersionId;
                        }
                    }

                    if (geometry == null)
                    {
                        var versionQuery = db.RoadGeometryVersions.AsNoTracking();
                        RoadGeometryVersion? version = null;

                        if (ra.RoadGeometryVersionId > 0)
                        {
                            version = await versionQuery.FirstOrDefaultAsync(v => v.RoadGeometryVersionId == ra.RoadGeometryVersionId);
                        }

                        if (version == null)
                        {
                            version = await versionQuery
                                .Where(v => v.RoadId == ra.RoadId)
                                .OrderByDescending(v => v.EffectiveFrom)
                                .FirstOrDefaultAsync();
                        }

                        if (version != null)
                        {
                            geometry = version.Geometry;
                            ra.RoadGeometryVersionId = version.RoadGeometryVersionId;
                        }
                    }

                    if (geometry != null)
                    {
                        var assignment = new SessionRoadAssignment
                        {
                            OperationalSessionId = session.OperationalSessionId,
                            RoadId = ra.RoadId,
                            RoadGeometryVersionId = ra.RoadGeometryVersionId,
                            RoadSegmentId = ra.RoadSegmentId,
                            AssignedGeometry = geometry,
                            BufferMeters = ra.BufferMeters ?? _constants.DefaultBufferMeters,
                            AssignmentType = ra.AssignmentType ?? "DEFAULT_SEGMENT",
                            AssignedOrder = ra.AssignedOrder,
                            CreatedBy = createdBy,
                            CreatedAt = DateTime.UtcNow
                        };
                        db.SessionRoadAssignments.Add(assignment);
                    }
                }
            }

            await db.SaveChangesAsync();

            // 7. Audit log
            await _auditService.RecordAsync(
                action: "SESSION_CREATED",
                entityType: SessionStateCodes.EntityType,
                entityId: session.OperationalSessionId.ToString(),
                performedBy: createdBy,
                ulbId: dto.UlbId,
                details: new
                {
                    sessionCode,
                    vehicleId = dto.VehicleId,
                    scheduledStartAt = dto.ScheduledStartAt,
                    roadAssignmentCount = dto.RoadAssignments?.Count ?? 0
                });

            _logger.LogInformation("Created OperationalSession #{SessionId} ({SessionCode}) for Vehicle #{VehicleId} in ULB '{UlbId}'",
                session.OperationalSessionId, session.SessionCode, dto.VehicleId, dto.UlbId);

            return CreateSessionResult.Ok(session);
        }

        public async Task<OperationalSession?> GetByIdAsync(long sessionId, string? ulbId = null)
        {
            using var scope = _serviceProvider.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<TelemetryDbContext>();

            var query = db.OperationalSessions
                .AsNoTracking()
                .Include(s => s.Vehicle)
                .Include(s => s.StatusStateDefinition)
                .Include(s => s.RoadAssignments)
                .Where(s => s.OperationalSessionId == sessionId);

            if (!string.IsNullOrWhiteSpace(ulbId))
            {
                query = query.Where(s => s.UlbId == ulbId);
            }

            return await query.FirstOrDefaultAsync();
        }

        public async Task<List<OperationalSession>> GetSessionsAsync(string? ulbId, string? statusCode = null, int limit = 50)
        {
            using var scope = _serviceProvider.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<TelemetryDbContext>();

            var query = db.OperationalSessions
                .AsNoTracking()
                .Include(s => s.Vehicle)
                .Include(s => s.StatusStateDefinition)
                .Include(s => s.RoadAssignments)
                .AsQueryable();

            if (!string.IsNullOrWhiteSpace(ulbId))
            {
                query = query.Where(s => s.UlbId == ulbId);
            }

            if (!string.IsNullOrWhiteSpace(statusCode))
            {
                try
                {
                    var stateId = await _resolver.ResolveAsync(SessionStateCodes.EntityType, statusCode);
                    query = query.Where(s => s.StatusStateDefinitionId == stateId);
                }
                catch (StateDefinitionNotFoundException)
                {
                    return new List<OperationalSession>();
                }
            }

            return await query
                .OrderByDescending(s => s.CreatedAt)
                .Take(limit)
                .ToListAsync();
        }

        public async Task<StateTransitionResult> PauseAsync(long sessionId, string ulbId, string by)
        {
            var session = await GetByIdAsync(sessionId);
            if (session == null)
                return StateTransitionResult.NotFound($"OperationalSession #{sessionId} not found.");

            if (!string.Equals(session.UlbId, ulbId, StringComparison.OrdinalIgnoreCase))
                return StateTransitionResult.Failed("ULB_SCOPE_VIOLATION", $"Session #{sessionId} does not belong to ULB '{ulbId}'.");

            return await _transitionService.TransitionSessionAsync(sessionId, SessionStateCodes.Paused, by, "OFFICER_PAUSE");
        }

        public async Task<StateTransitionResult> ResumeAsync(long sessionId, string ulbId, string by)
        {
            var session = await GetByIdAsync(sessionId);
            if (session == null)
                return StateTransitionResult.NotFound($"OperationalSession #{sessionId} not found.");

            if (!string.Equals(session.UlbId, ulbId, StringComparison.OrdinalIgnoreCase))
                return StateTransitionResult.Failed("ULB_SCOPE_VIOLATION", $"Session #{sessionId} does not belong to ULB '{ulbId}'.");

            return await _transitionService.TransitionSessionAsync(sessionId, SessionStateCodes.Active, by, "OFFICER_RESUME");
        }

        public async Task<StateTransitionResult> CompleteAsync(long sessionId, string ulbId, string by, string? reason = null)
        {
            var session = await GetByIdAsync(sessionId);
            if (session == null)
                return StateTransitionResult.NotFound($"OperationalSession #{sessionId} not found.");

            if (!string.Equals(session.UlbId, ulbId, StringComparison.OrdinalIgnoreCase))
                return StateTransitionResult.Failed("ULB_SCOPE_VIOLATION", $"Session #{sessionId} does not belong to ULB '{ulbId}'.");

            return await _transitionService.TransitionSessionAsync(sessionId, SessionStateCodes.Completed, by, reason ?? "OFFICER_NORMAL");
        }

        public async Task<StateTransitionResult> AbortAsync(long sessionId, string ulbId, string by, string reason)
        {
            if (string.IsNullOrWhiteSpace(reason))
                return StateTransitionResult.Failed("REASON_REQUIRED", "Abort reason is mandatory when aborting an operational session.");

            var session = await GetByIdAsync(sessionId);
            if (session == null)
                return StateTransitionResult.NotFound($"OperationalSession #{sessionId} not found.");

            if (!string.Equals(session.UlbId, ulbId, StringComparison.OrdinalIgnoreCase))
                return StateTransitionResult.Failed("ULB_SCOPE_VIOLATION", $"Session #{sessionId} does not belong to ULB '{ulbId}'.");

            return await _transitionService.TransitionSessionAsync(sessionId, SessionStateCodes.Aborted, by, reason);
        }

        public async Task<StateTransitionResult> CancelAsync(long sessionId, string ulbId, string by)
        {
            var session = await GetByIdAsync(sessionId);
            if (session == null)
                return StateTransitionResult.NotFound($"OperationalSession #{sessionId} not found.");

            if (!string.Equals(session.UlbId, ulbId, StringComparison.OrdinalIgnoreCase))
                return StateTransitionResult.Failed("ULB_SCOPE_VIOLATION", $"Session #{sessionId} does not belong to ULB '{ulbId}'.");

            return await _transitionService.TransitionSessionAsync(sessionId, SessionStateCodes.Cancelled, by, "OFFICER_CANCEL");
        }

        public async Task<int> ActivateScheduledSessionsAsync()
        {
            using var scope = _serviceProvider.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<TelemetryDbContext>();

            var scheduledStateId = await _resolver.ResolveAsync(SessionStateCodes.EntityType, SessionStateCodes.Scheduled);
            var now = DateTime.UtcNow;

            var dueSessions = await db.OperationalSessions
                .Where(s => s.StatusStateDefinitionId == scheduledStateId && s.ScheduledStartAt <= now)
                .ToListAsync();

            int activatedCount = 0;

            foreach (var session in dueSessions)
            {
                // Check if vehicle is already actively reserved
                var activeReservation = await db.OperationalSessions
                    .AsNoTracking()
                    .AnyAsync(s => s.VehicleId == session.VehicleId && s.IsActiveReservation && s.OperationalSessionId != session.OperationalSessionId);

                if (activeReservation)
                {
                    _logger.LogWarning("Cannot auto-activate Scheduled OperationalSession #{SessionId}: Vehicle #{VehicleId} already has an active reservation.",
                        session.OperationalSessionId, session.VehicleId);
                    continue;
                }

                var result = await _transitionService.TransitionSessionAsync(
                    session.OperationalSessionId,
                    SessionStateCodes.Active,
                    "SYSTEM_SCHEDULER",
                    "SCHEDULED_START_TIME_REACHED",
                    "SYSTEM_SCHEDULER");

                if (result.Success)
                {
                    activatedCount++;
                }
            }

            return activatedCount;
        }
    }
}
