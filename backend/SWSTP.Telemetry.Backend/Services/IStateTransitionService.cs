using System.Threading.Tasks;

namespace SWSTP.Telemetry.Backend.Services
{
    public record StateTransitionResult(
        bool Success,
        string? ErrorCode = null,
        string? Message = null,
        int? PreviousStateDefinitionId = null,
        int? NewStateDefinitionId = null)
    {
        public static StateTransitionResult Ok(int previousStateId, int newStateId) =>
            new(true, null, null, previousStateId, newStateId);

        public static StateTransitionResult InvalidTransition(string currentCode, string targetCode) =>
            new(false, "INVALID_STATE_TRANSITION", $"Transition from state '{currentCode}' to '{targetCode}' is not permitted.");

        public static StateTransitionResult NotFound(string message) =>
            new(false, "ENTITY_NOT_FOUND", message);

        public static StateTransitionResult Conflict(string errorCode, string message) =>
            new(false, errorCode, message);

        public static StateTransitionResult Failed(string errorCode, string message) =>
            new(false, errorCode, message);
    }

    public interface IStateTransitionService
    {
        Task<StateTransitionResult> TransitionSessionAsync(
            long sessionId,
            string targetStateCode,
            string changedBy,
            string? reason = null,
            string source = "ULB_OFFICER");
    }
}
