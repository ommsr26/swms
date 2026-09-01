using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using SWSTP.Telemetry.Backend.Models;

namespace SWSTP.Telemetry.Backend.Services
{
    public class RecordCollectionEventDto
    {
        public string DeviceCode { get; set; } = string.Empty;
        public DateTime CapturedAt { get; set; } = DateTime.UtcNow;
        public double Latitude { get; set; }
        public double Longitude { get; set; }
        public double FusedSpeedKph { get; set; }
        public double MotionConfidence { get; set; }
        public string? EvidenceReference { get; set; }
    }

    public record CollectionEventResult(
        bool Success,
        string? ErrorCode = null,
        string? Message = null,
        long? CollectionEventId = null,
        long? OperationalSessionId = null,
        long? SessionRoadAssignmentId = null,
        double? DistanceToRoadMeters = null,
        int? ImpactedHousesCount = null,
        string? TieBreakNote = null)
    {
        public static CollectionEventResult Ok(
            long eventId,
            long sessionId,
            long assignmentId,
            double distanceMeters,
            int housesCount,
            string? tieBreakNote = null) =>
            new(true, null, null, eventId, sessionId, assignmentId, distanceMeters, housesCount, tieBreakNote);

        public static CollectionEventResult Failed(string errorCode, string message) =>
            new(false, errorCode, message);
    }

    public interface ICollectionEventService
    {
        Task<CollectionEventResult> RecordCollectionEventAsync(RecordCollectionEventDto dto);
        Task<List<CollectionEvent>> GetSessionCollectionEventsAsync(long sessionId, string? ulbId = null);
        Task<CollectionEvent?> GetCollectionEventByIdAsync(long collectionEventId, string? ulbId = null);
    }
}
