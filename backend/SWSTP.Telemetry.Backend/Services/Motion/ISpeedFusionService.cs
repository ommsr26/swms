using System;

namespace SWSTP.Telemetry.Backend.Services.Motion
{
    /// <summary>
    /// Computes fused vehicle speed from available sensor inputs.
    /// The interface contract is stable across pipeline implementations.
    ///
    /// Prototype (current): uses GNSS speed directly — Source = "GNSS_ONLY".
    /// Future RPi pipeline: injects a complementary filter or Kalman filter implementation.
    /// Swap is a DI registration change only — no service or controller code changes.
    /// </summary>
    public interface ISpeedFusionService
    {
        /// <summary>
        /// Fuses GNSS and IMU inputs into a single speed estimate.
        /// </summary>
        /// <param name="gnssSpeedKmh">Raw GNSS Doppler speed. Null when GNSS fix is invalid.</param>
        /// <param name="gnssFixValid">Whether the GNSS fix is currently valid.</param>
        /// <param name="accelMagnitude">IMU acceleration magnitude (m/s²). Null if unavailable.</param>
        /// <param name="gyroMagnitude">Magnitude of gyroscope vector (rad/s). Null if unavailable.</param>
        /// <param name="gnssTimestamp">Timestamp of the GNSS sample. Used for staleness check.</param>
        /// <param name="imuTimestamp">Timestamp of the IMU sample. Used for staleness check.</param>
        FusedVehicleMotion Fuse(
            double? gnssSpeedKmh,
            bool gnssFixValid,
            double? accelMagnitude,
            double? gyroMagnitude,
            DateTime? gnssTimestamp,
            DateTime? imuTimestamp);
    }
}
