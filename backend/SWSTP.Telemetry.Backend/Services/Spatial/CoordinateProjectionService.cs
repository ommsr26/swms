using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using NetTopologySuite.Geometries;
using ProjNet.CoordinateSystems;
using ProjNet.CoordinateSystems.Transformations;

namespace SWSTP.Telemetry.Backend.Services.Spatial
{
    /// <summary>
    /// ProjNet-based coordinate projection service.
    /// Reads ULB→EPSG mappings from SpatialConfig:UlbProjections in appsettings.json.
    /// There is NO default/fallback EPSG. Unknown ULBs throw UlbCrsNotConfiguredException.
    ///
    /// ULB mapping (must be configured):
    ///   ULB_MH_AMRAVATI → EPSG:32643 (WGS 84 / UTM Zone 43N, 72°E–78°E)
    ///   ULB_MH_NAGPUR   → EPSG:32644 (WGS 84 / UTM Zone 44N, 78°E–84°E)
    /// </summary>
    public class CoordinateProjectionService : ICoordinateProjectionService
    {
        private readonly IConfiguration _config;
        private readonly ILogger<CoordinateProjectionService> _logger;
        private readonly CoordinateSystemFactory _csFactory = new();
        private readonly CoordinateTransformationFactory _ctFactory = new();

        // Cache: epsg -> (toProjected transform, toWgs84 transform)
        private readonly ConcurrentDictionary<int, (ICoordinateTransformation ToProjected, ICoordinateTransformation ToWgs84)> _transformCache = new();

        // ULB id -> EPSG (loaded from config, case-insensitive keys)
        private readonly Dictionary<string, int> _ulbEpsgMap;

        // WGS84 coordinate system (source for all projections)
        private readonly CoordinateSystem _wgs84;

        public CoordinateProjectionService(IConfiguration config, ILogger<CoordinateProjectionService> logger)
        {
            _config = config;
            _logger = logger;

            // Load ULB→EPSG map from configuration
            _ulbEpsgMap = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
            var section = _config.GetSection("SpatialConfig:UlbProjections");
            foreach (var child in section.GetChildren())
            {
                if (int.TryParse(child.Value, out var epsg))
                    _ulbEpsgMap[child.Key] = epsg;
            }

            // WGS84 geographic CRS
            _wgs84 = GeographicCoordinateSystem.WGS84;
        }

        /// <inheritdoc/>
        public int GetEpsgForUlb(string ulbId)
        {
            if (string.IsNullOrWhiteSpace(ulbId) || ulbId.Equals("AUTO", StringComparison.OrdinalIgnoreCase))
            {
                if (_ulbEpsgMap.TryGetValue("ULB_MH_AMRAVATI", out var defEpsg))
                    return defEpsg;
                return 32643;
            }

            if (_ulbEpsgMap.TryGetValue(ulbId, out var epsg))
                return epsg;

            throw new UlbCrsNotConfiguredException(ulbId);
        }

        /// <inheritdoc/>
        public Geometry ToProjected(Geometry wgs84Geom, string ulbId)
        {
            if (wgs84Geom == null) throw new ArgumentNullException(nameof(wgs84Geom));

            var epsg = GetEpsgForUlb(ulbId); // throws if not configured
            var (toProjected, _) = GetOrCreateTransforms(epsg);

            return TransformGeometry(wgs84Geom, toProjected, epsg);
        }

        /// <inheritdoc/>
        public void ValidateConfiguration()
        {
            if (_ulbEpsgMap.Count == 0)
            {
                _logger.LogWarning(
                    "SpatialConfig:UlbProjections is empty. No ULB CRS projections are configured. " +
                    "All metric spatial operations will fail until ULBs are configured.");
                return;
            }

            foreach (var (ulbId, epsg) in _ulbEpsgMap)
            {
                _logger.LogInformation(
                    "Spatial CRS configured: ULB '{UlbId}' -> EPSG:{Epsg}", ulbId, epsg);
            }
        }

        // ── Private helpers ──────────────────────────────────────────────────────

        private (ICoordinateTransformation ToProjected, ICoordinateTransformation ToWgs84) GetOrCreateTransforms(int epsg)
        {
            return _transformCache.GetOrAdd(epsg, code =>
            {
                var projectedCs = ProjectedCoordinateSystem.WGS84_UTM(GetUtmZoneNumber(code), true);
                var toProj = _ctFactory.CreateFromCoordinateSystems(_wgs84, projectedCs);
                var toWgs  = _ctFactory.CreateFromCoordinateSystems(projectedCs, _wgs84);
                return (toProj, toWgs);
            });
        }

        private static int GetUtmZoneNumber(int epsg)
        {
            // WGS84 UTM North: EPSG 32601–32660 = zones 1–60
            // WGS84 UTM South: EPSG 32701–32760 = zones 1–60
            if (epsg is >= 32601 and <= 32660) return epsg - 32600;
            if (epsg is >= 32701 and <= 32760) return epsg - 32700;
            throw new NotSupportedException(
                $"EPSG:{epsg} is not a supported WGS84 UTM zone. " +
                $"Only EPSG:326xx (UTM North) and 327xx (UTM South) are supported.");
        }

        private Geometry TransformGeometry(Geometry geom, ICoordinateTransformation transform, int targetSrid)
        {
            var factory = new GeometryFactory(new PrecisionModel(), targetSrid);
            return TransformGeometryInternal(geom, transform, factory);
        }

        private Geometry TransformGeometryInternal(Geometry geom, ICoordinateTransformation transform, GeometryFactory factory)
        {
            return geom switch
            {
                Point pt       => TransformPoint(pt, transform, factory),
                LineString ls  => TransformLineString(ls, transform, factory),
                Polygon pg     => TransformPolygon(pg, transform, factory),
                MultiLineString mls => TransformMultiLineString(mls, transform, factory),
                GeometryCollection gc => TransformGeometryCollection(gc, transform, factory),
                _ => throw new NotSupportedException($"Geometry type {geom.GeometryType} is not supported for projection.")
            };
        }

        private Point TransformPoint(Point pt, ICoordinateTransformation transform, GeometryFactory factory)
        {
            var result = transform.MathTransform.Transform(pt.X, pt.Y);
            return factory.CreatePoint(new Coordinate(result.x, result.y));
        }

        private LineString TransformLineString(LineString ls, ICoordinateTransformation transform, GeometryFactory factory)
        {
            var coords = new Coordinate[ls.Coordinates.Length];
            for (int i = 0; i < ls.Coordinates.Length; i++)
            {
                var r = transform.MathTransform.Transform(ls.Coordinates[i].X, ls.Coordinates[i].Y);
                coords[i] = new Coordinate(r.x, r.y);
            }
            return factory.CreateLineString(coords);
        }

        private Polygon TransformPolygon(Polygon pg, ICoordinateTransformation transform, GeometryFactory factory)
        {
            var shell = TransformLineString((LinearRing)pg.ExteriorRing, transform, factory);
            var shellRing = factory.CreateLinearRing(shell.Coordinates);
            return factory.CreatePolygon(shellRing);
        }

        private LinearRing TransformLinearRing(LinearRing ring, ICoordinateTransformation transform, GeometryFactory factory)
        {
            var coords = new Coordinate[ring.Coordinates.Length];
            for (int i = 0; i < ring.Coordinates.Length; i++)
            {
                var r = transform.MathTransform.Transform(ring.Coordinates[i].X, ring.Coordinates[i].Y);
                coords[i] = new Coordinate(r.x, r.y);
            }
            return factory.CreateLinearRing(coords);
        }

        private MultiLineString TransformMultiLineString(MultiLineString mls, ICoordinateTransformation transform, GeometryFactory factory)
        {
            var lines = new LineString[mls.NumGeometries];
            for (int i = 0; i < mls.NumGeometries; i++)
                lines[i] = TransformLineString((LineString)mls.GetGeometryN(i), transform, factory);
            return factory.CreateMultiLineString(lines);
        }

        private GeometryCollection TransformGeometryCollection(GeometryCollection gc, ICoordinateTransformation transform, GeometryFactory factory)
        {
            var geoms = new Geometry[gc.NumGeometries];
            for (int i = 0; i < gc.NumGeometries; i++)
                geoms[i] = TransformGeometryInternal(gc.GetGeometryN(i), transform, factory);
            return factory.CreateGeometryCollection(geoms);
        }
    }
}
