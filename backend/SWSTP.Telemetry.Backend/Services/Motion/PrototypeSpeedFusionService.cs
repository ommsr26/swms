using System;

namespace SWSTP.Telemetry.Backend.Services.Motion
{
    /// <summary>
    /// Prototype speed fusion implementation.
    /// Uses raw GNSS Doppler speed directly when fix is valid and data is fresh.
    /// Falls back to IMU motion detection (presence/absence only) when GNSS is unavailable.
    ///
    /// Future RPi implementation will replace this with a complementary filter or Kalman filter.
    /// The DI registration is changed; no calling code changes.
    /// </summary>
    public class PrototypeSpeedFusionService : ISpeedFusionService
    {
        private readonly OperationalConstants _constants;

        public PrototypeSpeedFusionService(OperationalConstants constants)
        {
            _constants = constants;
        }

        public FusedVehicleMotion Fuse(
            double? gnssSpeedKmh,
            bool gnssFixValid,
            double? accelMagnitude,
            double? gyroMagnitude,
            DateTime? gnssTimestamp,
            DateTime? imuTimestamp)
        {
            var now = DateTime.UtcNow;
            var gnssAge = gnssTimestamp.HasValue
                ? (now - gnssTimestamp.Value).TotalSeconds
                : double.MaxValue;

            bool gnssIsFresh = gnssFixValid &&
                               gnssSpeedKmh.HasValue &&
                               gnssAge <= _constants.GnssDataStalenessSeconds;

            if (gnssIsFresh)
            {
                return new FusedVehicleMotion(
                    FusedSpeedKmh: gnssSpeedKmh!.Value,
                    Source:        "GNSS_ONLY",
                    Confidence:    0.85,
                    IsReliable:    true);
            }

            // GNSS unavailable — check IMU for motion detection only
            var imuAge = imuTimestamp.HasValue
                ? (now - imuTimestamp.Value).TotalSeconds
                : double.MaxValue;

            bool imuIsFresh = accelMagnitude.HasValue &&
                              imuAge <= _constants.GnssDataStalenessSeconds * 3; // IMU tolerance is wider

            if (imuIsFresh && accelMagnitude!.Value > 0.5) // 0.5 m/s² movement threshold
            {
                // IMU shows motion but we cannot estimate speed — report as unreliable
                return new FusedVehicleMotion(
                    FusedSpeedKmh: 0.0,
                    Source:        "IMU_ONLY",
                    Confidence:    0.3,
                    IsReliable:    false); // No arming without reliable speed
            }

            return new FusedVehicleMotion(
                FusedSpeedKmh: 0.0,
                Source:        "UNAVAILABLE",
                Confidence:    0.0,
                IsReliable:    false);
        }
    }
}
