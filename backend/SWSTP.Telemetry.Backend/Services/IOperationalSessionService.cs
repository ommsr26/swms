using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using SWSTP.Telemetry.Backend.Models;

namespace SWSTP.Telemetry.Backend.Services
{
    public class CreateRoadAssignmentDto
    {
        public long RoadId { get; set; }
        public long RoadGeometryVersionId { get; set; }
        public long? RoadSegmentId { get; set; }
        public double? BufferMeters { get; set; }
        public string AssignmentType { get; set; } = "DEFAULT_SEGMENT"; // "DEFAULT_SEGMENT" or "CUSTOM_SUBSEGMENT"
        public int AssignedOrder { get; set; } = 1;
        public string? CustomGeometryWkt { get; set; } // Optional WKT if custom subsegment
    }

    public class CreateOperationalSessionDto
    {
        public string UlbId { get; set; } = string.Empty;
        public long VehicleId { get; set; }
        public string? Name { get; set; }
        public string? Description { get; set; }
        public DateTime ScheduledStartAt { get; set; }
        public List<CreateRoadAssignmentDto>? RoadAssignments { get; set; }
    }

    public record CreateSessionResult(
        bool Success,
        string? ErrorCode = null,
        string? Message = null,
        OperationalSession? Session = null)
    {
        public static CreateSessionResult Ok(OperationalSession session) =>
            new(true, null, null, session);

        public static CreateSessionResult Failed(string errorCode, string message) =>
            new(false, errorCode, message, null);
    }

    public interface IOperationalSessionService
    {
        Task<CreateSessionResult> CreateSessionAsync(CreateOperationalSessionDto dto, string createdBy);
        Task<OperationalSession?> GetByIdAsync(long sessionId, string? ulbId = null);
        Task<List<OperationalSession>> GetSessionsAsync(string? ulbId, string? statusCode = null, int limit = 50);
        Task<StateTransitionResult> PauseAsync(long sessionId, string ulbId, string by);
        Task<StateTransitionResult> ResumeAsync(long sessionId, string ulbId, string by);
        Task<StateTransitionResult> CompleteAsync(long sessionId, string ulbId, string by, string? reason = null);
        Task<StateTransitionResult> AbortAsync(long sessionId, string ulbId, string by, string reason);
        Task<StateTransitionResult> CancelAsync(long sessionId, string ulbId, string by);
        Task<int> ActivateScheduledSessionsAsync();
    }
}
