using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace SWSTP.Telemetry.Backend.Services
{
    public record AssignmentCoverageDto(
        long SessionRoadAssignmentId,
        long RoadId,
        string RoadName,
        long? RoadSegmentId,
        string? SegmentName,
        int AssignedOrder,
        double AssignedLengthMeters,
        double CoveredLengthMeters,
        double CoveragePercentage,
        bool IsCompleted);

    public record SessionCoverageResult(
        long OperationalSessionId,
        string SessionCode,
        string UlbId,
        string Status,
        double TotalAssignedLengthMeters,
        double TotalCoveredLengthMeters,
        double OverallCoveragePercentage,
        int TotalAssignments,
        int CompletedAssignments,
        List<AssignmentCoverageDto> Assignments)
    {
        public double RemainingDistanceMeters => Math.Max(0.0, TotalAssignedLengthMeters - TotalCoveredLengthMeters);
    }

    public record DeviationEventDto(
        int EventId,
        DateTime StartTime,
        DateTime EndTime,
        double DurationSeconds,
        int SampleCount,
        double ApproximateDistanceMeters,
        double MaxDeviationDistanceMeters,
        double StartLatitude,
        double StartLongitude,
        double EndLatitude,
        double EndLongitude,
        long? VehicleId,
        string? VehicleRegistrationNumber);

    public record AdherencePointDto(
        double Lat,
        double Lon,
        DateTime Timestamp,
        bool IsInsideSafeZone,
        bool IsSnapped,
        bool IsOffRoute,
        double DistanceToAssignedRoadMeters,
        double? Speed,
        double? Heading);

    public record SessionRouteAdherenceResult(
        long OperationalSessionId,
        string SessionCode,
        string UlbId,
        long? VehicleId,
        string? VehicleRegistrationNumber,
        double TotalTrajectoryDistanceMeters,
        double OnRouteDistanceMeters,
        double OffRouteDistanceMeters,
        double OffRoutePercentage,
        int TotalDeviationEventsCount,
        List<DeviationEventDto> DeviationEvents,
        List<AdherencePointDto> Points);

    public interface ICoverageService
    {
        Task<AssignmentCoverageDto> CalculateAssignmentCoverageAsync(long sessionRoadAssignmentId);
        Task<SessionCoverageResult?> GetSessionCoverageAsync(long sessionId, string? ulbId = null);
        Task<SessionRouteAdherenceResult?> GetSessionRouteAdherenceAsync(long sessionId, string? ulbId = null, long? vehicleId = null);
        Task<bool> CheckAndAutoCompleteSessionAsync(long sessionId);
    }
}
