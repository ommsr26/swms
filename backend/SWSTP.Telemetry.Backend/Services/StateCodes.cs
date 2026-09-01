namespace SWSTP.Telemetry.Backend.Services
{
    /// <summary>
    /// Stable domain language constants for OPERATIONAL_SESSION state code strings.
    /// Do NOT add integer StateDefinitionId constants here.
    /// Integer IDs are resolved via IStateDefinitionResolver at runtime.
    /// </summary>
    public static class SessionStateCodes
    {
        public const string EntityType = "OPERATIONAL_SESSION";

        public const string Scheduled = "SCHEDULED";
        public const string Active    = "ACTIVE";
        public const string Paused    = "PAUSED";
        public const string Completed = "COMPLETED";
        public const string Cancelled = "CANCELLED";
        public const string Aborted   = "ABORTED";

        /// <summary>
        /// Valid state transition matrix operating on code strings only.
        /// Integer StateDefinitionIds are never used in business logic.
        /// </summary>
        public static bool IsValidTransition(string from, string to) => (from, to) switch
        {
            (Scheduled, Active)    => true, // System activation when ScheduledStartAt reached
            (Scheduled, Cancelled) => true, // Officer cancel before activation
            (Active,    Paused)    => true,
            (Active,    Completed) => true, // Officer explicit or auto-coverage 100%
            (Active,    Aborted)   => true,
            (Paused,    Active)    => true,
            (Paused,    Aborted)   => true,
            _ => false
        };

        /// <summary>
        /// Whether this state code reserves the vehicle (blocks new session creation).
        /// ACTIVE and PAUSED both reserve. No others do.
        /// </summary>
        public static bool ReservesVehicle(string stateCode) =>
            stateCode is Active or Paused;
    }

    public static class CollectionEventStateCodes
    {
        public const string EntityType = "COLLECTION_EVENT";
        public const string Detected   = "DETECTED";
        public const string Verified   = "VERIFIED";
        public const string Flagged    = "FLAGGED";
    }

    public static class DeviceStateCodes
    {
        public const string EntityType  = "DEVICE";
        public const string Inventory   = "INVENTORY";
        public const string Provisioned = "PROVISIONED";
        public const string InService   = "IN_SERVICE";
        public const string Maintenance = "MAINTENANCE";
        public const string Disabled    = "DISABLED";
        public const string Retired     = "RETIRED";
    }

    public static class VehicleStateCodes
    {
        public const string EntityType     = "VEHICLE";
        public const string InService      = "IN_SERVICE";
        public const string Maintenance    = "MAINTENANCE";
        public const string Suspended      = "SUSPENDED";
        public const string Decommissioned = "DECOMMISSIONED";
    }
}
