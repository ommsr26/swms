using NetTopologySuite.Geometries;
using SWSTP.Telemetry.Backend.Models;
using SWSTP.Telemetry.Backend.Services.Motion;

namespace SWSTP.Telemetry.Backend.Services.Spatial
{
    /// <summary>
    /// Computes vehicle proximity to assigned road geometry using projected metric coordinates.
    /// Distance is computed in the ULB's configured UTM CRS (real metres).
    /// </summary>
    public class ProximityService : IProximityService
    {
        private readonly ICoordinateProjectionService _projection;
        private readonly OperationalConstants _constants;
        private static readonly GeometryFactory _wgs84Factory = new(new PrecisionModel(), 4326);

        public ProximityService(ICoordinateProjectionService projection, OperationalConstants constants)
        {
            _projection = projection;
            _constants  = constants;
        }

        public ProximityResult Evaluate(
            double vehicleLat,
            double vehicleLon,
            FusedVehicleMotion fusedMotion,
            SessionRoadAssignment assignment,
            string ulbId)
        {
            // 1. Build WGS84 vehicle point
            var vehiclePointWgs84 = _wgs84Factory.CreatePoint(new Coordinate(vehicleLon, vehicleLat));

            // 2. Project vehicle point to ULB metric CRS
            var vehiclePointProjected = _projection.ToProjected(vehiclePointWgs84, ulbId);

            // 3. Project assignment geometry (already EPSG:4326 from DB) to ULB metric CRS
            var assignedGeomProjected = _projection.ToProjected(assignment.AssignedGeometry, ulbId);

            // 4. Compute distance in REAL metres (projected space)
            var distanceMeters = vehiclePointProjected.Distance(assignedGeomProjected);

            // 5. Evaluate boundary
            var bufferMeters = assignment.BufferMeters;
            var isWithinBoundary = distanceMeters <= bufferMeters;

            // 6. Evaluate speed threshold (domain policy — never frontend logic)
            var isBelowArmingSpeed = fusedMotion.FusedSpeedKmh <= _constants.MaxSpeedKmhForArming;

            // 7. Arming eligibility: all three conditions must hold
            var isEligible = isWithinBoundary && isBelowArmingSpeed && fusedMotion.IsReliable;

            return new ProximityResult(
                DistanceMeters:              distanceMeters,
                IsWithinOperationalBoundary: isWithinBoundary,
                SpeedKmh:                    fusedMotion.FusedSpeedKmh,
                IsBelowArmingSpeed:          isBelowArmingSpeed,
                IsEligibleForArming:         isEligible,
                SpeedSource:                 fusedMotion.Source,
                BufferMetersUsed:            bufferMeters);
        }
    }
}
