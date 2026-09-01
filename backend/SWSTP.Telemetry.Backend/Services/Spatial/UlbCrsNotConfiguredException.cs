using System;

namespace SWSTP.Telemetry.Backend.Services.Spatial
{
    /// <summary>
    /// Thrown when a metric spatial operation is attempted for a ULB that has
    /// no CRS projection configured in SpatialConfig:UlbProjections (appsettings.json).
    ///
    /// There is NO silent fallback EPSG. An unconfigured ULB must be explicitly
    /// configured before any metric spatial operation (buffer, distance, coverage) can run.
    /// </summary>
    public sealed class UlbCrsNotConfiguredException : InvalidOperationException
    {
        public string UlbId { get; }

        public UlbCrsNotConfiguredException(string ulbId)
            : base($"No CRS projection configured for ULB '{ulbId}'. " +
                   $"Add an EPSG entry under SpatialConfig:UlbProjections in appsettings.json " +
                   $"before performing metric spatial operations for this ULB.")
        {
            UlbId = ulbId;
        }
    }
}
