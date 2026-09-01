using NetTopologySuite.Geometries;

namespace SWSTP.Telemetry.Backend.Services.Spatial
{
    /// <summary>
    /// Provides ULB-specific WGS84 ↔ UTM metric coordinate projection.
    /// Every ULB must have an explicit EPSG entry in SpatialConfig:UlbProjections.
    /// There is NO default or fallback EPSG — unknown ULBs throw UlbCrsNotConfiguredException.
    /// </summary>
    public interface ICoordinateProjectionService
    {
        /// <summary>
        /// Projects a WGS84 (EPSG:4326) NTS geometry to the metric CRS configured
        /// for the given ULB. Throws <see cref="UlbCrsNotConfiguredException"/> if
        /// the ULB has no configured projection.
        /// </summary>
        Geometry ToProjected(Geometry wgs84, string ulbId);

        /// <summary>
        /// Returns the EPSG code configured for the given ULB.
        /// Throws <see cref="UlbCrsNotConfiguredException"/> if not configured.
        /// </summary>
        int GetEpsgForUlb(string ulbId);

        /// <summary>
        /// Validates all ULB projections at startup and logs the configured mappings.
        /// Does not throw on startup — logs warnings for any entries that are invalid EPSG codes.
        /// </summary>
        void ValidateConfiguration();
    }
}
