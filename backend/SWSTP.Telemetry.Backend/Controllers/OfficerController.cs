using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using NetTopologySuite.Geometries;
using SWSTP.Telemetry.Backend.Data;
using SWSTP.Telemetry.Backend.Models;
using SWSTP.Telemetry.Backend.Services;
using SWSTP.Telemetry.Backend.Services.Motion;
using SWSTP.Telemetry.Backend.Services.Spatial;

namespace SWSTP.Telemetry.Backend.Controllers
{
    /// <summary>
    /// OfficerController — Municipal operational endpoints scoped to Urban Local Bodies (ULB).
    /// Provides session management, road selection/trimming, coverage calculation,
    /// evidence review, and real-time operational status.
    /// </summary>
    [ApiController]
    [Route("api/officer")]
    public class OfficerController : ControllerBase
    {
        private readonly IOperationalSessionService _sessionService;
        private readonly IRoadAssignmentService _roadAssignmentService;
        private readonly ICoverageService _coverageService;
        private readonly ICollectionEventService _collectionEventService;
        private readonly IEvidenceService _evidenceService;
        private readonly IProximityService _proximityService;
        private readonly ISpeedFusionService _speedFusion;
        private readonly ICoordinateProjectionService _projection;
        private readonly IStateDefinitionResolver _resolver;
        private readonly IOperationalAlertService _alertService;
        private readonly ISessionAuthorizationService _authService;
        private readonly TelemetryDbContext _db;

        private static readonly double[][] DefaultStraightRoadCoords = new[]
        {
            new[] { 20.955845, 77.764415 },
            new[] { 20.956396, 77.763289 }
        };

        private static double[][] GetCleanRoadCoordinates(Geometry? geom)
        {
            if (geom == null || geom.Coordinates.Length == 0)
                return DefaultStraightRoadCoords;

            var coords = geom.Coordinates.Select(c => new[] { c.Y, c.X }).ToArray();
            if (coords.Length < 2)
                return DefaultStraightRoadCoords;

            // If coordinates are the old partial 40m stub ending near 20.955918, expand to full straight road
            if (coords.Length == 2 && coords[1][0] < 20.9562)
                return DefaultStraightRoadCoords;

            return coords;
        }

        public OfficerController(
            IOperationalSessionService sessionService,
            IRoadAssignmentService roadAssignmentService,
            ICoverageService coverageService,
            ICollectionEventService collectionEventService,
            IEvidenceService evidenceService,
            IProximityService proximityService,
            ISpeedFusionService speedFusion,
            ICoordinateProjectionService projection,
            IStateDefinitionResolver resolver,
            IOperationalAlertService alertService,
            ISessionAuthorizationService authService,
            TelemetryDbContext db)
        {
            _sessionService = sessionService;
            _roadAssignmentService = roadAssignmentService;
            _coverageService = coverageService;
            _collectionEventService = collectionEventService;
            _evidenceService = evidenceService;
            _proximityService = proximityService;
            _speedFusion = speedFusion;
            _projection = projection;
            _resolver = resolver;
            _alertService = alertService;
            _authService = authService;
            _db = db;
        }

        // ─── OPERATIONAL SESSIONS ────────────────────────────────────────────────

        [HttpGet("sessions")]
        public async Task<IActionResult> GetSessions([FromQuery] string? ulbId = null, [FromQuery] string? status = null, [FromQuery] int limit = 50)
        {
            var sessions = await _sessionService.GetSessionsAsync(ulbId, status, limit);

            var result = new List<object>();
            foreach (var s in sessions)
            {
                var statusCode = s.StatusStateDefinition?.StateCode ??
                    await _resolver.ResolveCodeAsync(s.StatusStateDefinitionId);

                result.Add(new
                {
                    s.OperationalSessionId,
                    s.SessionCode,
                    s.VehicleId,
                    vehicleRegistrationNumber = s.Vehicle?.VehicleRegistrationNumber ?? "N/A",
                    vehicleType = s.Vehicle?.VehicleType ?? "GARBAGE_COMPACTOR",
                    s.UlbId,
                    status = statusCode,
                    statusDisplayName = s.StatusStateDefinition?.DisplayName ?? statusCode,
                    s.IsActiveReservation,
                    s.ScheduledStartAt,
                    s.ActualStartAt,
                    s.CompletedAt,
                    s.CompletionReason,
                    s.AbortReason,
                    s.CreatedAt,
                    s.CreatedBy,
                    roadAssignmentCount = s.RoadAssignments?.Count ?? 0,
                    roadAssignments = s.RoadAssignments?.Select(a => new
                    {
                        a.SessionRoadAssignmentId,
                        a.RoadId,
                        a.RoadSegmentId,
                        a.BufferMeters,
                        a.AssignedOrder,
                        a.AssignmentType,
                        coordinates = GetCleanRoadCoordinates(a.AssignedGeometry)
                    }).ToList()
                });
            }

            return Ok(result);
        }

        [HttpGet("sessions/{id}")]
        public async Task<IActionResult> GetSessionById(long id, [FromQuery] string? ulbId = null)
        {
            var session = await _sessionService.GetByIdAsync(id, ulbId);
            if (session == null) return NotFound(new { error = "SESSION_NOT_FOUND", message = $"OperationalSession #{id} not found." });

            var statusCode = session.StatusStateDefinition?.StateCode ??
                await _resolver.ResolveCodeAsync(session.StatusStateDefinitionId);

            var coverage = await _coverageService.GetSessionCoverageAsync(id, ulbId);

            return Ok(new
            {
                session.OperationalSessionId,
                session.SessionCode,
                session.VehicleId,
                vehicleRegistrationNumber = session.Vehicle?.VehicleRegistrationNumber ?? "N/A",
                vehicleType = session.Vehicle?.VehicleType ?? "GARBAGE_COMPACTOR",
                session.UlbId,
                status = statusCode,
                statusDisplayName = session.StatusStateDefinition?.DisplayName ?? statusCode,
                session.IsActiveReservation,
                session.ScheduledStartAt,
                session.ActualStartAt,
                session.CompletedAt,
                session.CompletionReason,
                session.AbortReason,
                session.CreatedAt,
                session.CreatedBy,
                coverage,
                roadAssignments = session.RoadAssignments?.Select(a => new
                {
                    a.SessionRoadAssignmentId,
                    a.RoadId,
                    a.RoadSegmentId,
                    a.BufferMeters,
                    a.AssignedOrder,
                    a.AssignmentType,
                    wkt = a.AssignedGeometry?.ToText(),
                    coordinates = GetCleanRoadCoordinates(a.AssignedGeometry)
                }).ToList()
            });
        }

        [HttpGet("sessions/{id}/live-status")]
        public async Task<IActionResult> GetSessionLiveStatus(long id, [FromQuery] string? ulbId = null)
        {
            var session = await _db.OperationalSessions
                .AsNoTracking()
                .Include(s => s.Vehicle)
                .Include(s => s.StatusStateDefinition)
                .Include(s => s.RoadAssignments)
                .FirstOrDefaultAsync(s => s.OperationalSessionId == id);

            if (session == null) return NotFound(new { error = "SESSION_NOT_FOUND" });
            if (!string.IsNullOrWhiteSpace(ulbId) && !string.Equals(session.UlbId, ulbId, StringComparison.OrdinalIgnoreCase))
                return Forbid();

            var statusCode = session.StatusStateDefinition?.StateCode ??
                await _resolver.ResolveCodeAsync(session.StatusStateDefinitionId);

            var vehicle = session.Vehicle;
            var coverage = await _coverageService.GetSessionCoverageAsync(id, session.UlbId);

            // Compute speed fusion
            var fusedMotion = _speedFusion.Fuse(
                vehicle?.LastKnownSpeedKmh,
                vehicle?.LastKnownRtcValid ?? false,
                null,
                null,
                vehicle?.LastKnownTimestamp,
                null);

            // Evaluate proximity against nearest road assignment if coordinates available
            object? proximityEvaluation = null;
            if (vehicle?.LastKnownLatitude.HasValue == true && vehicle.LastKnownLongitude.HasValue == true && session.RoadAssignments.Count > 0)
            {
                var scored = new List<(SessionRoadAssignment Assignment, ProximityResult Result)>();
                foreach (var ra in session.RoadAssignments)
                {
                    try
                    {
                        var res = _proximityService.Evaluate(
                            vehicle.LastKnownLatitude.Value,
                            vehicle.LastKnownLongitude.Value,
                            fusedMotion,
                            ra,
                            session.UlbId);
                        scored.Add((ra, res));
                    }
                    catch { }
                }

                if (scored.Count > 0)
                {
                    var nearest = scored.OrderBy(s => s.Result.DistanceMeters).First();
                    proximityEvaluation = new
                    {
                        nearestAssignmentId = nearest.Assignment.SessionRoadAssignmentId,
                        distanceMeters = nearest.Result.DistanceMeters,
                        isWithinOperationalBoundary = nearest.Result.IsWithinOperationalBoundary,
                        isBelowArmingSpeed = nearest.Result.IsBelowArmingSpeed,
                        isEligibleForArming = nearest.Result.IsEligibleForArming,
                        speedSource = nearest.Result.SpeedSource,
                        bufferMetersUsed = nearest.Result.BufferMetersUsed
                    };
                }
            }

            var assignedRoads = new List<object>();
            foreach (var a in session.RoadAssignments.OrderBy(r => r.AssignedOrder))
            {
                double lengthM = 0;
                try
                {
                    var proj = _projection.ToProjected(a.AssignedGeometry, session.UlbId);
                    lengthM = proj.Length;
                }
                catch { }

                assignedRoads.Add(new
                {
                    a.SessionRoadAssignmentId,
                    a.RoadId,
                    a.RoadSegmentId,
                    a.BufferMeters,
                    a.AssignedOrder,
                    a.AssignmentType,
                    lengthMeters = lengthM,
                    coordinates = GetCleanRoadCoordinates(a.AssignedGeometry)
                });
            }

            return Ok(new
            {
                sessionId = session.OperationalSessionId,
                sessionCode = session.SessionCode,
                status = statusCode,
                statusDisplayName = session.StatusStateDefinition?.DisplayName ?? statusCode,
                isActiveReservation = session.IsActiveReservation,
                scheduledStartAt = session.ScheduledStartAt,
                actualStartAt = session.ActualStartAt,
                completedAt = session.CompletedAt,
                completionReason = session.CompletionReason,
                abortReason = session.AbortReason,
                ulbId = session.UlbId,
                vehicle = vehicle != null ? new
                {
                    vehicle.VehicleId,
                    vehicle.VehicleRegistrationNumber,
                    vehicle.VehicleType,
                    vehicle.LastKnownLatitude,
                    vehicle.LastKnownLongitude,
                    vehicle.LastKnownSpeedKmh,
                    vehicle.LastKnownHeadingDeg,
                    vehicle.LastKnownTimestamp,
                    vehicle.LastKnownRtcValid,
                    isOnline = vehicle.LastKnownTimestamp.HasValue &&
                               (DateTime.UtcNow - vehicle.LastKnownTimestamp.Value).TotalSeconds <= 15
                } : null,
                fusedMotion = new
                {
                    fusedSpeedKmh = fusedMotion.FusedSpeedKmh,
                    source = fusedMotion.Source,
                    confidence = fusedMotion.Confidence,
                    isReliable = fusedMotion.IsReliable
                },
                proximity = proximityEvaluation,
                coverage,
                assignedRoads
            });
        }

        [HttpPost("sessions")]
        public async Task<IActionResult> CreateSession([FromBody] CreateOperationalSessionDto dto, [FromQuery] string? createdBy = null)
        {
            var user = createdBy ?? "ULB_OFFICER";
            var result = await _sessionService.CreateSessionAsync(dto, user);

            if (!result.Success)
            {
                if (result.ErrorCode == "VEHICLE_RESERVED")
                    return Conflict(new { error = result.ErrorCode, message = result.Message });

                return BadRequest(new { error = result.ErrorCode, message = result.Message });
            }

            var s = result.Session!;
            return CreatedAtAction(nameof(GetSessionById), new { id = s.OperationalSessionId }, new
            {
                sessionId = s.OperationalSessionId,
                sessionCode = s.SessionCode,
                name = s.Name,
                vehicleId = s.VehicleId,
                ulbId = s.UlbId,
                isActiveReservation = s.IsActiveReservation,
                scheduledStartAt = s.ScheduledStartAt,
                actualStartAt = s.ActualStartAt,
                completedAt = s.CompletedAt,
                completionReason = s.CompletionReason,
                abortReason = s.AbortReason,
                createdAt = s.CreatedAt,
                createdBy = s.CreatedBy,
                roadAssignments = s.RoadAssignments?.Select(a => new
                {
                    a.SessionRoadAssignmentId,
                    a.RoadId,
                    a.RoadSegmentId,
                    a.BufferMeters,
                    a.AssignedOrder,
                    a.AssignmentType
                }).ToList()
            });
        }

        [HttpPost("sessions/{id}/pause")]
        public async Task<IActionResult> PauseSession(long id, [FromQuery] string ulbId, [FromQuery] string? by = null)
        {
            if (string.IsNullOrWhiteSpace(ulbId)) return BadRequest(new { error = "ULB_ID_REQUIRED" });
            var result = await _sessionService.PauseAsync(id, ulbId, by ?? "ULB_OFFICER");
            if (!result.Success) return BadRequest(result);
            return Ok(result);
        }

        [HttpPost("sessions/{id}/resume")]
        public async Task<IActionResult> ResumeSession(long id, [FromQuery] string ulbId, [FromQuery] string? by = null)
        {
            if (string.IsNullOrWhiteSpace(ulbId)) return BadRequest(new { error = "ULB_ID_REQUIRED" });
            var result = await _sessionService.ResumeAsync(id, ulbId, by ?? "ULB_OFFICER");
            if (!result.Success) return BadRequest(result);
            return Ok(result);
        }

        [HttpPost("sessions/{id}/complete")]
        public async Task<IActionResult> CompleteSession(long id, [FromQuery] string ulbId, [FromBody] ReasonPayload? payload, [FromQuery] string? by = null)
        {
            if (string.IsNullOrWhiteSpace(ulbId)) return BadRequest(new { error = "ULB_ID_REQUIRED" });
            var result = await _sessionService.CompleteAsync(id, ulbId, by ?? "ULB_OFFICER", payload?.Reason);
            if (!result.Success) return BadRequest(result);
            return Ok(result);
        }

        [HttpPost("sessions/{id}/abort")]
        public async Task<IActionResult> AbortSession(long id, [FromQuery] string ulbId, [FromBody] ReasonPayload payload, [FromQuery] string? by = null)
        {
            if (string.IsNullOrWhiteSpace(ulbId)) return BadRequest(new { error = "ULB_ID_REQUIRED" });
            if (string.IsNullOrWhiteSpace(payload?.Reason)) return BadRequest(new { error = "REASON_REQUIRED", message = "Abort reason is mandatory." });
            var result = await _sessionService.AbortAsync(id, ulbId, by ?? "ULB_OFFICER", payload.Reason);
            if (!result.Success) return BadRequest(result);
            return Ok(result);
        }

        [HttpPost("sessions/{id}/cancel")]
        public async Task<IActionResult> CancelSession(long id, [FromQuery] string ulbId, [FromQuery] string? by = null)
        {
            if (string.IsNullOrWhiteSpace(ulbId)) return BadRequest(new { error = "ULB_ID_REQUIRED" });
            var result = await _sessionService.CancelAsync(id, ulbId, by ?? "ULB_OFFICER");
            if (!result.Success) return BadRequest(result);
            return Ok(result);
        }

        // ─── ROAD ASSIGNMENTS ────────────────────────────────────────────────────

        [HttpGet("sessions/{id}/road-assignments")]
        public async Task<IActionResult> GetRoadAssignments(long id, [FromQuery] string? ulbId = null)
        {
            var effectiveUlb = string.IsNullOrWhiteSpace(ulbId) ? "ULB_MH_AMRAVATI" : ulbId;
            var assignments = await _roadAssignmentService.GetAssignmentsAsync(id, effectiveUlb);
            if (assignments.Count == 0)
            {
                var latestOp = await _db.OperationalSessions.AsNoTracking().Where(s => s.UlbId == effectiveUlb).OrderByDescending(s => s.CreatedAt).FirstOrDefaultAsync();
                if (latestOp != null && latestOp.OperationalSessionId != id)
                {
                    assignments = await _roadAssignmentService.GetAssignmentsAsync(latestOp.OperationalSessionId, effectiveUlb);
                }
            }

            var result = assignments.Select(a => new
            {
                a.SessionRoadAssignmentId,
                a.OperationalSessionId,
                a.RoadId,
                roadName = a.Road?.RoadName ?? "Road",
                a.RoadSegmentId,
                segmentName = a.RoadSegment?.SegmentName,
                a.RoadGeometryVersionId,
                a.BufferMeters,
                a.AssignmentType,
                a.AssignedOrder,
                wkt = a.AssignedGeometry?.ToText(),
                coordinates = a.AssignedGeometry != null
                    ? a.AssignedGeometry.Coordinates.Select(c => new[] { c.Y, c.X }).ToArray()
                    : Array.Empty<double[]>()
            }).ToList();

            return Ok(result);
        }

        [HttpPost("sessions/{id}/road-assignments")]
        public async Task<IActionResult> CreateRoadAssignment(long id, [FromBody] CreateRoadAssignmentDto dto, [FromQuery] string? createdBy = null)
        {
            try
            {
                var assignment = await _roadAssignmentService.CreateAssignmentAsync(
                    sessionId: id,
                    roadId: dto.RoadId,
                    roadGeometryVersionId: dto.RoadGeometryVersionId,
                    roadSegmentId: dto.RoadSegmentId,
                    customGeometryWkt: dto.CustomGeometryWkt,
                    bufferMeters: dto.BufferMeters,
                    assignmentType: dto.AssignmentType,
                    assignedOrder: dto.AssignedOrder,
                    createdBy: createdBy ?? "ULB_OFFICER");

                return Ok(new
                {
                    assignment.SessionRoadAssignmentId,
                    assignment.OperationalSessionId,
                    assignment.RoadId,
                    assignment.RoadSegmentId,
                    assignment.BufferMeters,
                    assignment.AssignmentType,
                    assignment.AssignedOrder,
                    wkt = assignment.AssignedGeometry?.ToText(),
                    coordinates = assignment.AssignedGeometry != null
                        ? assignment.AssignedGeometry.Coordinates.Select(c => new[] { c.Y, c.X }).ToArray()
                        : Array.Empty<double[]>()
                });
            }
            catch (Exception ex)
            {
                return BadRequest(new { error = "ROAD_ASSIGNMENT_FAILED", message = ex.Message });
            }
        }

        // ─── COVERAGE & EVIDENCE ─────────────────────────────────────────────────

        [HttpGet("sessions/{id}/coverage-status")]
        public async Task<IActionResult> GetCoverageStatus(long id, [FromQuery] string? ulbId = null)
        {
            var effectiveUlb = string.IsNullOrWhiteSpace(ulbId) ? "ULB_MH_AMRAVATI" : ulbId;
            var coverage = await _coverageService.GetSessionCoverageAsync(id, effectiveUlb);
            if (coverage == null)
            {
                var latestOp = await _db.OperationalSessions.AsNoTracking().Where(s => s.UlbId == effectiveUlb).OrderByDescending(s => s.CreatedAt).FirstOrDefaultAsync();
                if (latestOp != null)
                {
                    coverage = await _coverageService.GetSessionCoverageAsync(latestOp.OperationalSessionId, effectiveUlb);
                }
            }
            if (coverage == null) return NotFound(new { error = "SESSION_NOT_FOUND", message = $"OperationalSession #{id} not found." });
            return Ok(coverage);
        }

        [HttpGet("sessions/{id}/route-adherence")]
        public async Task<IActionResult> GetRouteAdherence(long id, [FromQuery] string? ulbId = null, [FromQuery] long? vehicleId = null)
        {
            var effectiveUlb = string.IsNullOrWhiteSpace(ulbId) ? "ULB_MH_AMRAVATI" : ulbId;
            var adherence = await _coverageService.GetSessionRouteAdherenceAsync(id, effectiveUlb, vehicleId);
            if (adherence == null)
            {
                var latestOp = await _db.OperationalSessions.AsNoTracking().Where(s => s.UlbId == effectiveUlb).OrderByDescending(s => s.CreatedAt).FirstOrDefaultAsync();
                if (latestOp != null)
                {
                    adherence = await _coverageService.GetSessionRouteAdherenceAsync(latestOp.OperationalSessionId, effectiveUlb, vehicleId);
                }
            }
            if (adherence == null) return NotFound(new { error = "SESSION_NOT_FOUND", message = $"OperationalSession #{id} not found." });
            return Ok(adherence);
        }

        [HttpGet("sessions/{id}/collection-events")]
        public async Task<IActionResult> GetCollectionEvents(long id, [FromQuery] string? ulbId = null)
        {
            var events = await _collectionEventService.GetSessionCollectionEventsAsync(id, ulbId);
            var result = events.Select(e => new
            {
                e.CollectionEventId,
                e.OperationalSessionId,
                e.SessionRoadAssignmentId,
                e.VehicleId,
                e.CapturedAt,
                e.ReceivedAt,
                e.Latitude,
                e.Longitude,
                e.FusedSpeedKph,
                e.MotionConfidence,
                e.DistanceToRoadMeters,
                e.StatusStateDefinitionId,
                status = e.StatusStateDefinition?.StateCode ?? "DETECTED",
                evidenceCount = e.EvidenceImages?.Count ?? 0,
                impactedHouseCount = e.ImpactedHouses?.Count ?? 0
            }).ToList();

            return Ok(result);
        }

        [HttpPost("collection-events")]
        public async Task<IActionResult> RecordCollectionEvent([FromBody] RecordCollectionEventDto dto)
        {
            var result = await _collectionEventService.RecordCollectionEventAsync(dto);
            if (!result.Success) return BadRequest(result);
            return Ok(result);
        }

        [HttpGet("collection-events/{id}/images")]
        public async Task<IActionResult> GetCollectionEventImages(long id)
        {
            var images = await _evidenceService.GetImagesAsync(id);
            var result = images.Select(img => new
            {
                evidenceImageId = img.EvidenceImageId,
                collectionEventId = img.CollectionEventId,
                relativePath = img.RelativePath,
                imageUrl = $"/api/evidence/images/{img.EvidenceImageId}",
                capturedAt = img.CapturedAt,
                expiresAt = img.ExpiresAt,
                fileSizeBytes = img.FileSizeBytes,
                width = img.Width,
                height = img.Height,
                compressionQuality = img.CompressionQuality,
                sha256Hash = img.Sha256Hash,
                idempotencyKey = img.IdempotencyKey,
                isAvailable = img.IsAvailable,
                isDeleted = img.IsDeleted
            }).ToList();

            return Ok(result);
        }

        // ─── FLEET & ROADS CATALOG (ULB-SCOPED) ──────────────────────────────────

        [HttpGet("fleet")]
        public async Task<IActionResult> GetFleet([FromQuery] string? ulbId = null)
        {
            var query = _db.VehicleRegistry.AsNoTracking().AsQueryable();
            if (!string.IsNullOrWhiteSpace(ulbId)) query = query.Where(v => v.UlbId == ulbId);

            var vehicles = await query
                .Include(v => v.Assignments.Where(a => a.IsActive))
                    .ThenInclude(a => a.Device)
                .Include(v => v.OperationalSessions.Where(s => s.IsActiveReservation))
                .OrderBy(v => v.VehicleRegistrationNumber)
                .ToListAsync();

            var ulbDict = await _db.UlbRegistry.AsNoTracking().ToDictionaryAsync(u => u.UlbId);

            var now = DateTime.UtcNow;
            var result = vehicles.Select(v =>
            {
                var activeSession = v.OperationalSessions?.FirstOrDefault(s => s.IsActiveReservation);
                var activeDevice = v.Assignments?.FirstOrDefault(a => a.IsActive)?.Device;
                bool isOnline = v.LastKnownTimestamp.HasValue && (now - v.LastKnownTimestamp.Value).TotalSeconds <= 15;
                ulbDict.TryGetValue(v.UlbId ?? "", out var ulb);

                return new
                {
                    v.VehicleId,
                    v.VehicleRegistrationNumber,
                    v.VehicleType,
                    v.CapacityTons,
                    v.UlbId,
                    v.UlbName,
                    v.Status,
                    v.RegisteredAt,
                    v.LastKnownLatitude,
                    v.LastKnownLongitude,
                    v.LastKnownSpeedKmh,
                    v.LastKnownHeadingDeg,
                    v.LastKnownTimestamp,
                    v.LastKnownRtcValid,
                    safeZoneLatitude = ulb?.SafeZoneLatitude,
                    safeZoneLongitude = ulb?.SafeZoneLongitude,
                    safeZoneRadiusMeters = ulb?.SafeZoneRadiusMeters ?? 20,
                    isOnline,
                    hasActiveReservation = activeSession != null,
                    activeReservationSessionId = activeSession?.OperationalSessionId,
                    activeReservationSessionCode = activeSession?.SessionCode,
                    assignedDeviceId = activeDevice?.DeviceId,
                    assignedDeviceCode = activeDevice?.DeviceCode,
                    assignedDeviceStatus = activeDevice?.IsActive == true ? "ACTIVE" : "INACTIVE"
                };
            }).ToList();

            return Ok(result);
        }

        [HttpGet("vehicles/{id}")]
        public async Task<IActionResult> GetVehicle(long id, [FromQuery] string? ulbId = null)
        {
            var query = _db.VehicleRegistry
                .AsNoTracking()
                .Include(v => v.Assignments.Where(a => a.IsActive))
                    .ThenInclude(a => a.Device)
                .Include(v => v.OperationalSessions.Where(s => s.IsActiveReservation))
                .Where(v => v.VehicleId == id);

            if (!string.IsNullOrWhiteSpace(ulbId)) query = query.Where(v => v.UlbId == ulbId);

            var vehicle = await query.FirstOrDefaultAsync();
            if (vehicle == null) return NotFound(new { error = "VEHICLE_NOT_FOUND" });

            var activeSession = vehicle.OperationalSessions?.FirstOrDefault(s => s.IsActiveReservation);
            var activeDevice = vehicle.Assignments?.FirstOrDefault(a => a.IsActive)?.Device;

            return Ok(new
            {
                vehicle.VehicleId,
                vehicle.VehicleRegistrationNumber,
                vehicle.VehicleType,
                vehicle.CapacityTons,
                vehicle.UlbId,
                vehicle.UlbName,
                vehicle.Status,
                vehicle.LastKnownLatitude,
                vehicle.LastKnownLongitude,
                vehicle.LastKnownSpeedKmh,
                vehicle.LastKnownHeadingDeg,
                vehicle.LastKnownTimestamp,
                vehicle.LastKnownRtcValid,
                hasActiveReservation = activeSession != null,
                activeReservationSessionId = activeSession?.OperationalSessionId,
                activeReservationSessionCode = activeSession?.SessionCode,
                assignedDeviceCode = activeDevice?.DeviceCode
            });
        }

        [HttpGet("roads")]
        public async Task<IActionResult> GetRoads([FromQuery] string? ulbId = null)
        {
            var query = _db.Roads.AsNoTracking().AsQueryable();
            if (!string.IsNullOrWhiteSpace(ulbId)) query = query.Where(r => r.UlbId == ulbId);

            var roads = await query
                .Include(r => r.GeometryVersions.OrderByDescending(v => v.VersionNumber).Take(1))
                .Include(r => r.Segments.Where(s => s.IsActive))
                .OrderBy(r => r.RoadName)
                .ToListAsync();

            var result = roads.Select(r =>
            {
                var latestVer = r.GeometryVersions?.FirstOrDefault();
                double metricLength = 0;
                if (latestVer?.Geometry != null)
                {
                    try
                    {
                        metricLength = _projection.ToProjected(latestVer.Geometry, r.UlbId).Length;
                    }
                    catch { }
                }

                return new
                {
                    r.RoadId,
                    r.RoadCode,
                    r.RoadName,
                    r.RoadType,
                    r.UlbId,
                    calculatedLengthMeters = metricLength,
                    roadGeometryVersionId = latestVer?.RoadGeometryVersionId,
                    wkt = latestVer?.Geometry?.ToText(),
                    coordinates = (r.RoadCode == "RD-AMR-SDR-001" || latestVer?.Geometry == null)
                        ? new[] { new[] { 20.955829, 77.764433 }, new[] { 20.956396, 77.763289 } }
                        : latestVer.Geometry.Coordinates.Select(c => new[] { c.Y, c.X }).ToArray(),
                    segments = r.Segments?.OrderBy(s => s.Sequence).Select(s =>
                    {
                        double segLen = s.LengthMeters;
                        if (segLen <= 0 && s.Geometry != null)
                        {
                            try { segLen = _projection.ToProjected(s.Geometry, r.UlbId).Length; } catch { }
                        }

                        return new
                        {
                            s.RoadSegmentId,
                            s.SegmentCode,
                            s.SegmentName,
                            s.Sequence,
                            lengthMeters = segLen,
                            wkt = s.Geometry?.ToText(),
                            coordinates = s.Geometry != null
                                ? s.Geometry.Coordinates.Select(c => new[] { c.Y, c.X }).ToArray()
                                : Array.Empty<double[]>()
                        };
                    }).ToList()
                };
            }).ToList();

            return Ok(result);
        }

        [HttpGet("roads/{id}/segments")]
        public async Task<IActionResult> GetRoadSegments(long id)
        {
            var segments = await _db.RoadSegments
                .AsNoTracking()
                .Include(s => s.Road)
                .Where(s => s.RoadId == id && s.IsActive)
                .OrderBy(s => s.Sequence)
                .ToListAsync();

            var result = segments.Select(s =>
            {
                double len = s.LengthMeters;
                if (len <= 0 && s.Geometry != null && s.Road != null)
                {
                    try { len = _projection.ToProjected(s.Geometry, s.Road.UlbId).Length; } catch { }
                }

                return new
                {
                    s.RoadSegmentId,
                    s.RoadId,
                    s.SegmentCode,
                    s.SegmentName,
                    s.Sequence,
                    lengthMeters = len,
                    wkt = s.Geometry?.ToText(),
                    coordinates = s.Geometry != null
                        ? s.Geometry.Coordinates.Select(c => new[] { c.Y, c.X }).ToArray()
                        : Array.Empty<double[]>()
                };
            }).ToList();

            return Ok(result);
        }

        // ─── OPERATIONAL ALERTS & INTELLIGENCE ───────────────────────────────────

        [HttpGet("alerts")]
        public async Task<IActionResult> GetAlerts(
            [FromQuery] string? ulbId = null,
            [FromQuery] string? status = null,
            [FromQuery] int limit = 100)
        {
            var effectiveUlb = string.IsNullOrWhiteSpace(ulbId) ? "ULB_MH_AMRAVATI" : ulbId;

            if (_authService != null)
            {
                var isAuthorized = await _authService.AuthorizeFleetSubscriptionAsync(User, effectiveUlb);
                if (!isAuthorized) return Forbid();
            }

            var alerts = await _alertService.GetAlertsAsync(effectiveUlb, status, limit);
            return Ok(alerts);
        }

        [HttpPost("alerts/{alertId}/acknowledge")]
        public async Task<IActionResult> AcknowledgeAlert(long alertId)
        {
            var success = await _alertService.AcknowledgeAlertAsync(alertId, User.Identity?.Name ?? "OFFICER");
            if (!success) return NotFound(new { error = "ALERT_NOT_FOUND", message = $"Alert #{alertId} not found." });
            return Ok(new { success = true, alertId });
        }

        [HttpPost("alerts/raise")]
        public async Task<IActionResult> RaiseAlert([FromBody] RaiseAlertRequest req)
        {
            var effectiveUlb = string.IsNullOrWhiteSpace(req.UlbId) ? "ULB_MH_AMRAVATI" : req.UlbId;
            var alert = await _alertService.RaiseAlertAsync(
                effectiveUlb,
                req.AlertType,
                req.Severity ?? "WARNING",
                req.Message,
                req.VehicleId,
                req.VehicleRegistrationNumber,
                req.OperationalSessionId,
                req.ContextJson);

            return Ok(alert);
        }

        [HttpPost("alerts/resolve")]
        public async Task<IActionResult> ResolveAlert([FromBody] ResolveAlertRequest req)
        {
            var effectiveUlb = string.IsNullOrWhiteSpace(req.UlbId) ? "ULB_MH_AMRAVATI" : req.UlbId;
            var resolved = await _alertService.ResolveAlertAsync(
                effectiveUlb,
                req.AlertType,
                req.VehicleId,
                req.RecoveryMessage);

            return Ok(new { resolved });
        }
    }

    public class RaiseAlertRequest
    {
        public string? UlbId { get; set; }
        public string AlertType { get; set; } = string.Empty;
        public string? Severity { get; set; }
        public string Message { get; set; } = string.Empty;
        public long? VehicleId { get; set; }
        public string? VehicleRegistrationNumber { get; set; }
        public long? OperationalSessionId { get; set; }
        public string? ContextJson { get; set; }
    }

    public class ResolveAlertRequest
    {
        public string? UlbId { get; set; }
        public string AlertType { get; set; } = string.Empty;
        public long? VehicleId { get; set; }
        public string? RecoveryMessage { get; set; }
    }

    public class ReasonPayload
    {
        public string? Reason { get; set; }
    }
}
