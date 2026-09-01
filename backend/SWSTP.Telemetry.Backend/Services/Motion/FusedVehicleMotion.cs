namespace SWSTP.Telemetry.Backend.Services.Motion
{
    /// <summary>
    /// Result of the speed fusion computation.
    /// Produced by ISpeedFusionService and consumed by ProximityService.
    /// </summary>
    public record FusedVehicleMotion(
        /// <summary>Fused speed estimate in km/h.</summary>
        double FusedSpeedKmh,

        /// <summary>
        /// Source of the speed estimate.
        /// "GNSS_ONLY" — raw GNSS Doppler speed (prototype).
        /// "IMU_ONLY"  — IMU-derived motion only (GNSS fix unavailable).
        /// "GNSS_IMU_FUSED" — future RPi complementary/Kalman filter output.
        /// "UNAVAILABLE" — neither source is reliable.
        /// </summary>
        string Source,

        /// <summary>Confidence in the fused speed estimate, 0.0–1.0.</summary>
        double Confidence,

        /// <summary>
        /// False when GNSS fix is invalid AND IMU data is stale or absent.
        /// ProximityService treats IsReliable=false as ineligible for arming.
        /// </summary>
        bool IsReliable
    );
}
