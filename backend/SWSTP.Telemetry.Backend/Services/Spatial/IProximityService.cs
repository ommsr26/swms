using SWSTP.Telemetry.Backend.Models;
using SWSTP.Telemetry.Backend.Services.Motion;

namespace SWSTP.Telemetry.Backend.Services.Spatial
{
    /// <summary>
    /// Full diagnostic result of a vehicle proximity evaluation.
    /// </summary>
    public record ProximityResult(
        /// <summary>Geodesic distance in metres from vehicle position to nearest point
        /// on SessionRoadAssignment.AssignedGeometry. Always non-negative.</summary>
        double DistanceMeters,

        /// <summary>True when DistanceMeters ≤ assignment.BufferMeters.</summary>
        bool IsWithinOperationalBoundary,

        /// <summary>The fused speed used for this evaluation, in km/h.</summary>
        double SpeedKmh,

        /// <summary>True when SpeedKmh ≤ OperationalConstants.MaxSpeedKmhForArming.</summary>
        bool IsBelowArmingSpeed,

        /// <summary>
        /// True ONLY when: IsWithinOperationalBoundary AND IsBelowArmingSpeed
        /// AND fusedMotion.IsReliable. All three conditions must hold.
        /// </summary>
        bool IsEligibleForArming,

        /// <summary>Speed source string from FusedVehicleMotion ("GNSS_ONLY", etc.)</summary>
        string SpeedSource,

        /// <summary>The buffer in metres that was used (from the assignment — never hardcoded).</summary>
        double BufferMetersUsed
    );

    public interface IProximityService
    {
        /// <summary>
        /// Evaluates whether a vehicle at the given position and fused speed
        /// is within the operational boundary and eligible for camera arming.
        ///
        /// BufferMeters is read from the assignment — never hardcoded.
        /// ArmingSpeedThreshold is read from OperationalConstants — never frontend logic.
        /// Distance is computed in projected metric CRS (real metres).
        /// </summary>
        ProximityResult Evaluate(
            double vehicleLat,
            double vehicleLon,
            FusedVehicleMotion fusedMotion,
            SessionRoadAssignment assignment,
            string ulbId);
    }
}
