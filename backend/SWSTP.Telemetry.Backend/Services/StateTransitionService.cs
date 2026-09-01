using System;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using SWSTP.Telemetry.Backend.Data;
using SWSTP.Telemetry.Backend.Models;

namespace SWSTP.Telemetry.Backend.Services
{
    public class StateTransitionService : IStateTransitionService
    {
        private readonly IServiceProvider _serviceProvider;
        private readonly IStateDefinitionResolver _resolver;
        private readonly IAuditService _auditService;
        private readonly ILogger<StateTransitionService> _logger;

        public StateTransitionService(
            IServiceProvider serviceProvider,
            IStateDefinitionResolver resolver,
            IAuditService auditService,
            ILogger<StateTransitionService> logger)
        {
            _serviceProvider = serviceProvider;
            _resolver = resolver;
            _auditService = auditService;
            _logger = logger;
        }

        public async Task<StateTransitionResult> TransitionSessionAsync(
            long sessionId,
            string targetStateCode,
            string changedBy,
            string? reason = null,
            string source = "ULB_OFFICER")
        {
            using var scope = _serviceProvider.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<TelemetryDbContext>();

            var session = await db.OperationalSessions
                .FirstOrDefaultAsync(s => s.OperationalSessionId == sessionId);

            if (session == null)
            {
                return StateTransitionResult.NotFound($"OperationalSession #{sessionId} not found.");
            }

            var previousStateId = session.StatusStateDefinitionId;
            var currentCode = await _resolver.ResolveCodeAsync(previousStateId);

            if (!SessionStateCodes.IsValidTransition(currentCode, targetStateCode))
            {
                _logger.LogWarning("Invalid state transition rejected for OperationalSession #{SessionId}: '{CurrentCode}' -> '{TargetCode}'",
                    sessionId, currentCode, targetStateCode);
                return StateTransitionResult.InvalidTransition(currentCode, targetStateCode);
            }

            var targetStateId = await _resolver.ResolveAsync(SessionStateCodes.EntityType, targetStateCode);

            // Update session entity properties
            session.StatusStateDefinitionId = targetStateId;
            session.IsActiveReservation = SessionStateCodes.ReservesVehicle(targetStateCode);
            session.UpdatedAt = DateTime.UtcNow;
            session.UpdatedBy = changedBy;

            if (targetStateCode == SessionStateCodes.Active && session.ActualStartAt == null)
            {
                session.ActualStartAt = DateTime.UtcNow;
            }
            else if (targetStateCode == SessionStateCodes.Completed)
            {
                session.CompletedAt = DateTime.UtcNow;
                session.CompletionReason = reason ?? "OFFICER_NORMAL";
            }
            else if (targetStateCode == SessionStateCodes.Aborted)
            {
                session.AbortReason = reason;
            }

            // Append to EntityStateTransitions ledger
            var transitionRecord = new EntityStateTransition
            {
                EntityType = SessionStateCodes.EntityType,
                EntityId = session.OperationalSessionId.ToString(),
                PreviousStateDefinitionId = previousStateId,
                NewStateDefinitionId = targetStateId,
                ChangedAt = DateTime.UtcNow,
                ChangedBy = changedBy,
                Reason = reason,
                Source = source
            };
            db.EntityStateTransitions.Add(transitionRecord);

            try
            {
                await db.SaveChangesAsync();
            }
            catch (DbUpdateException ex)
            {
                _logger.LogError(ex, "Failed to save state transition for OperationalSession #{SessionId}", sessionId);
                return StateTransitionResult.Failed("DB_UPDATE_FAILED", "Failed to update database for state transition. A reservation conflict or constraint violation may have occurred.");
            }

            // Record audit log
            await _auditService.RecordAsync(
                action: $"SESSION_STATE_TRANSITION_{targetStateCode}",
                entityType: SessionStateCodes.EntityType,
                entityId: session.OperationalSessionId.ToString(),
                performedBy: changedBy,
                ulbId: session.UlbId,
                details: new
                {
                    previousState = currentCode,
                    newState = targetStateCode,
                    reason,
                    source
                });

            _logger.LogInformation("OperationalSession #{SessionId} transitioned from '{PreviousCode}' to '{TargetCode}' by '{ChangedBy}'",
                sessionId, currentCode, targetStateCode, changedBy);

            return StateTransitionResult.Ok(previousStateId, targetStateId);
        }
    }
}
