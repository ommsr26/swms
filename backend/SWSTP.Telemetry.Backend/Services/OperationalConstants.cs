using Microsoft.Extensions.Configuration;

namespace SWSTP.Telemetry.Backend.Services
{
    public static class RouteAdherenceConstants
    {
        public const double DefaultOffRouteThresholdMeters = 25.0;
    }

    /// <summary>
    /// Domain configuration values for operational logic.
    /// All values are read from appsettings.json OperationalConfig section.
    /// There is NO default EPSG — spatial CRS is ULB-specific (see SpatialConfig:UlbProjections).
    /// </summary>
    public class OperationalConstants
    {
        private readonly IConfiguration _config;

        public OperationalConstants(IConfiguration config)
        {
            _config = config;
        }

        /// <summary>Default spatial buffer in metres around AssignedGeometry. Persisted per assignment.</summary>
        public double DefaultBufferMeters =>
            _config.GetValue<double>("OperationalConfig:DefaultBufferMeters", 100.0);

        /// <summary>House association evidence radius in metres.</summary>
        public double CollectionRadiusMeters =>
            _config.GetValue<double>("OperationalConfig:CollectionRadiusMeters", 15.0);

        /// <summary>Route adherence corridor tolerance in metres. Points beyond this from assigned roads are considered off-route.</summary>
        public double OffRouteThresholdMeters =>
            _config.GetValue<double>("OperationalConfig:OffRouteThresholdMeters", 25.0);

        /// <summary>Maximum speed in km/h for motion detection arming eligibility. Domain policy — not frontend logic.</summary>
        public double MaxSpeedKmhForArming =>
            _config.GetValue<double>("OperationalConfig:MaxSpeedKmhForArming", 5.0);

        /// <summary>Distance threshold in metres within which two assignments are considered ambiguous for tie-break resolution.</summary>
        public double AssignmentAmbiguityZoneM =>
            _config.GetValue<double>("OperationalConfig:AssignmentAmbiguityZoneM", 5.0);

        /// <summary>Seconds after which a GNSS reading is considered stale for fusion purposes.</summary>
        public double GnssDataStalenessSeconds =>
            _config.GetValue<double>("OperationalConfig:GnssDataStalenessSeconds", 3.0);

        /// <summary>Evidence image retention period in days.</summary>
        public int EvidenceRetentionDays =>
            _config.GetValue<int>("OperationalConfig:EvidenceRetentionDays", 21);

        /// <summary>IMU raw sample retention period in days (auto-deleted after 3 days).</summary>
        public int ImuSampleRetentionDays =>
            _config.GetValue<int>("OperationalConfig:ImuSampleRetentionDays", 3);

        /// <summary>CollectionEvent metadata retention in months.</summary>
        public int CollectionHistoryMonths =>
            _config.GetValue<int>("OperationalConfig:CollectionHistoryMonths", 6);

        /// <summary>Session activation background service polling interval in milliseconds.</summary>
        public int ActivationLoopIntervalMs =>
            _config.GetValue<int>("OperationalConfig:SessionActivationIntervalMs", 2000);

        /// <summary>Threshold in seconds after which lack of telemetry transitions a vehicle to OFFLINE.</summary>
        public double OfflineThresholdSeconds =>
            _config.GetValue<double>("OperationalConfig:OfflineThresholdSeconds", 60.0);

        /// <summary>Offline alert evaluator background service evaluation interval in milliseconds.</summary>
        public int OfflineEvaluationIntervalMs =>
            _config.GetValue<int>("OperationalConfig:OfflineEvaluationIntervalMs", 15000);
    }
}
