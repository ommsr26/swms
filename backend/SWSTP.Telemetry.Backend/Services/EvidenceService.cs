using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using NetTopologySuite.Geometries;
using SWSTP.Telemetry.Backend.Data;
using SWSTP.Telemetry.Backend.Models;
using SWSTP.Telemetry.Backend.Services.Spatial;

namespace SWSTP.Telemetry.Backend.Services
{
    public class EvidenceService : IEvidenceService
    {
        private readonly IServiceProvider _serviceProvider;
        private readonly OperationalConstants _constants;
        private readonly IAuditService _auditService;
        private readonly IConfiguration _config;
        private readonly ILogger<EvidenceService> _logger;
        private readonly string _storageRoot;

        private readonly ICoordinateProjectionService? _projection;

        public EvidenceService(
            IServiceProvider serviceProvider,
            OperationalConstants constants,
            IAuditService auditService,
            ILogger<EvidenceService> logger)
            : this(serviceProvider, constants, auditService, serviceProvider.GetService<ICoordinateProjectionService>(), null!, logger)
        {
        }

        public EvidenceService(
            IServiceProvider serviceProvider,
            OperationalConstants constants,
            IAuditService auditService,
            ICoordinateProjectionService? projection,
            ILogger<EvidenceService> logger)
            : this(serviceProvider, constants, auditService, projection, null!, logger)
        {
        }

        public EvidenceService(
            IServiceProvider serviceProvider,
            OperationalConstants constants,
            IAuditService auditService,
            ICoordinateProjectionService? projection,
            IConfiguration? config,
            ILogger<EvidenceService> logger)
        {
            _serviceProvider = serviceProvider;
            _constants = constants;
            _auditService = auditService;
            _projection = projection;
            _config = config!;
            _logger = logger;

            var configuredRoot = _config?["EvidenceStorage:RootPath"] ?? "evidence";
            if (Path.IsPathRooted(configuredRoot))
            {
                _storageRoot = configuredRoot;
            }
            else
            {
                // Prefer directory relative to project/current working directory
                var currentDir = Directory.GetCurrentDirectory();
                var currentDirEvidence = Path.Combine(currentDir, configuredRoot);
                if (Directory.Exists(currentDirEvidence) || File.Exists(Path.Combine(currentDir, "SWSTP.Telemetry.Backend.csproj")))
                {
                    _storageRoot = Path.GetFullPath(currentDirEvidence);
                }
                else
                {
                    var dir = new DirectoryInfo(AppContext.BaseDirectory);
                    string? candidate = null;
                    while (dir != null)
                    {
                        var testPath = Path.Combine(dir.FullName, configuredRoot);
                        if (Directory.Exists(testPath) || File.Exists(Path.Combine(dir.FullName, "SWSTP.Telemetry.Backend.csproj")))
                        {
                            candidate = Path.GetFullPath(testPath);
                            break;
                        }
                        dir = dir.Parent;
                    }
                    _storageRoot = candidate ?? Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, configuredRoot));
                }
            }

            if (!Directory.Exists(_storageRoot))
            {
                Directory.CreateDirectory(_storageRoot);
            }
            _logger.LogInformation("[EVIDENCE STORAGE] Root directory initialized at: {StorageRoot}", _storageRoot);
        }

        public async Task<EvidenceImage> RecordImageAsync(
            long collectionEventId,
            string relativePath,
            DateTime capturedAt,
            long fileSizeBytes,
            int width,
            int height,
            int compressionQuality = 70,
            string? sha256Hash = null,
            string? idempotencyKey = null)
        {
            using var scope = _serviceProvider.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<TelemetryDbContext>();

            var image = new EvidenceImage
            {
                CollectionEventId = collectionEventId,
                RelativePath = relativePath,
                CapturedAt = capturedAt,
                ExpiresAt = capturedAt.AddDays(_constants.EvidenceRetentionDays),
                FileSizeBytes = fileSizeBytes,
                Width = width,
                Height = height,
                CompressionQuality = compressionQuality,
                Sha256Hash = sha256Hash,
                IdempotencyKey = idempotencyKey,
                CreatedAt = DateTime.UtcNow
            };

            db.EvidenceImages.Add(image);
            await db.SaveChangesAsync();

            _logger.LogInformation("Recorded EvidenceImage #{ImageId} for CollectionEvent #{EventId} (SHA256: {Hash})",
                image.EvidenceImageId, collectionEventId, sha256Hash ?? "N/A");

            return image;
        }

        public async Task<(EvidenceImage Image, string PhysicalPath, string RelativePath)> SaveEvidenceImageAsync(
            long collectionEventId,
            byte[] imageBytes,
            DateTime capturedAt,
            int width = 1280,
            int height = 720,
            int compressionQuality = 70,
            string? idempotencyKey = null,
            double? latitude = null,
            double? longitude = null,
            double? speedKph = null,
            double? motionConfidence = null,
            long? sessionId = null,
            string? deviceCode = null,
            string? ulbId = null)
        {
            using var scope = _serviceProvider.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<TelemetryDbContext>();

            // 1. Check idempotency if key is supplied
            if (!string.IsNullOrWhiteSpace(idempotencyKey))
            {
                var existing = await db.EvidenceImages
                    .AsNoTracking()
                    .FirstOrDefaultAsync(img => img.IdempotencyKey == idempotencyKey);

                if (existing != null)
                {
                    var existingPhysical = ResolvePhysicalPath(existing.RelativePath);
                    _logger.LogInformation("Idempotent hit for key '{Key}': Returning existing EvidenceImage #{ImageId}",
                        idempotencyKey, existing.EvidenceImageId);
                    return (existing, existingPhysical, existing.RelativePath);
                }
            }

            // 2. Validate collection event and get operational session / ULB
            var collectionEvent = collectionEventId > 0
                ? await db.CollectionEvents
                    .Include(ce => ce.OperationalSession)
                    .FirstOrDefaultAsync(ce => ce.CollectionEventId == collectionEventId)
                : null;

            if (collectionEvent == null)
            {
                // Find target session: by sessionId, active session, or most recent
                OperationalSession? targetSession = null;
                if (sessionId.HasValue && sessionId.Value > 0)
                {
                    targetSession = await db.OperationalSessions
                        .Include(s => s.Vehicle)
                        .FirstOrDefaultAsync(s => s.OperationalSessionId == sessionId.Value);
                }

                if (targetSession == null)
                {
                    targetSession = await db.OperationalSessions
                        .Include(s => s.Vehicle)
                        .Where(s => s.StatusStateDefinitionId == 2) // ACTIVE
                        .OrderByDescending(s => s.CreatedAt)
                        .FirstOrDefaultAsync();
                }

                if (targetSession == null)
                {
                    targetSession = await db.OperationalSessions
                        .Include(s => s.Vehicle)
                        .OrderByDescending(s => s.CreatedAt)
                        .FirstOrDefaultAsync();
                }

                if (targetSession == null)
                {
                    // Fallback: Create standalone operational session
                    var defaultVehicle = await db.VehicleRegistry.FirstOrDefaultAsync();
                    targetSession = new OperationalSession
                    {
                        SessionCode = $"SESS-AUTO-{DateTime.UtcNow:yyyyMMddHHmmss}",
                        Name = "Automated Standalone Collection Session",
                        UlbId = !string.IsNullOrWhiteSpace(ulbId) ? ulbId : (defaultVehicle?.UlbId ?? "ULB_MH_AMRAVATI"),
                        VehicleId = defaultVehicle?.VehicleId ?? 1,
                        StatusStateDefinitionId = 2,
                        IsActiveReservation = false,
                        ScheduledStartAt = capturedAt,
                        ActualStartAt = capturedAt,
                        CreatedAt = DateTime.UtcNow
                    };
                    db.OperationalSessions.Add(targetSession);
                    await db.SaveChangesAsync();
                }

                var effectiveUlbId = (!string.IsNullOrWhiteSpace(ulbId) && !ulbId.Equals("AUTO", StringComparison.OrdinalIgnoreCase))
                    ? ulbId
                    : (targetSession.UlbId ?? "ULB_MH_AMRAVATI");
                var effectiveVehicleId = targetSession.VehicleId;

                var lat = latitude ?? 0.0;
                var lon = longitude ?? 0.0;
                var speed = speedKph ?? 0.0;
                var conf = motionConfidence ?? 0.95;

                var eventPointWgs84 = (Math.Abs(lat) > 0.0001 && Math.Abs(lon) > 0.0001)
                    ? new Point(lon, lat) { SRID = 4326 }
                    : new Point(0, 0) { SRID = 4326 };

                // Ensure a valid SessionRoadAssignment exists to satisfy foreign key constraint
                var roadAssignment = await db.SessionRoadAssignments
                    .FirstOrDefaultAsync(ra => ra.OperationalSessionId == targetSession.OperationalSessionId);

                if (roadAssignment == null)
                {
                    roadAssignment = await db.SessionRoadAssignments
                        .OrderByDescending(ra => ra.SessionRoadAssignmentId)
                        .FirstOrDefaultAsync();
                }

                if (roadAssignment == null)
                {
                    var road = await db.Roads.FirstOrDefaultAsync();
                    var roadGeomVer = await db.RoadGeometryVersions.FirstOrDefaultAsync();
                    var defaultGeom = roadGeomVer?.Geometry ?? eventPointWgs84;

                    roadAssignment = new SessionRoadAssignment
                    {
                        OperationalSessionId = targetSession.OperationalSessionId,
                        RoadId = road?.RoadId ?? 1,
                        RoadGeometryVersionId = roadGeomVer?.RoadGeometryVersionId ?? 1,
                        AssignedGeometry = defaultGeom,
                        BufferMeters = 100.0,
                        AssignmentType = "DEFAULT_SEGMENT",
                        AssignedOrder = 1,
                        CreatedAt = DateTime.UtcNow
                    };
                    db.SessionRoadAssignments.Add(roadAssignment);
                    await db.SaveChangesAsync();
                }

                // Check if coordinate is in a ULB SafeZone (depot / yard) from SafeZones table
                var safeZones = await db.SafeZones.AsNoTracking().Where(s => s.UlbId == targetSession.UlbId && s.IsActive).ToListAsync();
                bool inSafeZone = false;
                foreach (var sz in safeZones)
                {
                    var dLat = (lat - sz.Latitude) * 111320.0;
                    var dLon = (lon - sz.Longitude) * 111320.0 * Math.Cos(sz.Latitude * Math.PI / 180.0);
                    var distToSafe = Math.Sqrt(dLat * dLat + dLon * dLon);
                    if (distToSafe <= sz.RadiusMeters)
                    {
                        inSafeZone = true;
                        break;
                    }
                }
                if (!inSafeZone)
                {
                    var ulb = await db.UlbRegistry.AsNoTracking().FirstOrDefaultAsync(u => u.UlbId == targetSession.UlbId);
                    if (ulb?.SafeZoneLatitude != null && ulb?.SafeZoneLongitude != null)
                    {
                        var dLat = (lat - ulb.SafeZoneLatitude.Value) * 111320.0;
                        var dLon = (lon - ulb.SafeZoneLongitude.Value) * 111320.0 * Math.Cos(ulb.SafeZoneLatitude.Value * Math.PI / 180.0);
                        if (Math.Sqrt(dLat * dLat + dLon * dLon) <= (ulb.SafeZoneRadiusMeters ?? 1000.0))
                        {
                            inSafeZone = true;
                        }
                    }
                }

                // Project event point onto road centerline to eliminate GPS drift (UNLESS in a safe zone)
                if (!inSafeZone && roadAssignment?.AssignedGeometry is LineString roadLine && roadLine.NumPoints >= 2)
                {
                    double bestDist = double.MaxValue;
                    double bestProjLat = lat;
                    double bestProjLon = lon;

                    var refLat = roadLine.Coordinates[0].Y;
                    var refLon = roadLine.Coordinates[0].X;
                    var latScale = 111320.0;
                    var lonScale = 111320.0 * Math.Cos(refLat * Math.PI / 180.0);

                    var px = (lon - refLon) * lonScale;
                    var py = (lat - refLat) * latScale;

                    for (int i = 0; i < roadLine.Coordinates.Length - 1; i++)
                    {
                        var a = roadLine.Coordinates[i];
                        var b = roadLine.Coordinates[i + 1];

                        var ax = (a.X - refLon) * lonScale;
                        var ay = (a.Y - refLat) * latScale;
                        var bx = (b.X - refLon) * lonScale;
                        var by = (b.Y - refLat) * latScale;

                        var dx = bx - ax;
                        var dy = by - ay;
                        var l2 = dx * dx + dy * dy;
                        var t = l2 < 1e-6 ? 0.0 : Math.Max(0.0, Math.Min(1.0, ((px - ax) * dx + (py - ay) * dy) / l2));

                        var projX = ax + t * dx;
                        var projY = ay + t * dy;
                        var d = Math.Sqrt((px - projX) * (px - projX) + (py - projY) * (py - projY));

                        if (d < bestDist)
                        {
                            bestDist = d;
                            bestProjLat = refLat + projY / latScale;
                            bestProjLon = refLon + projX / lonScale;
                        }
                    }

                    if (bestDist <= 80.0)
                    {
                        lat = bestProjLat;
                        lon = bestProjLon;
                        eventPointWgs84 = new Point(lon, lat) { SRID = 4326 };
                    }
                }

                collectionEvent = new CollectionEvent
                {
                    OperationalSessionId = targetSession.OperationalSessionId,
                    SessionRoadAssignmentId = roadAssignment.SessionRoadAssignmentId,
                    VehicleId = effectiveVehicleId,
                    CapturedAt = capturedAt,
                    ReceivedAt = DateTime.UtcNow,
                    Latitude = lat,
                    Longitude = lon,
                    Location = eventPointWgs84,
                    FusedSpeedKph = speed,
                    MotionConfidence = conf,
                    DistanceToRoadMeters = 0.0,
                    StatusStateDefinitionId = 1,
                    CreatedAt = DateTime.UtcNow
                };
                db.CollectionEvents.Add(collectionEvent);
                
                // Also update live vehicle registry coordinates
                if (effectiveVehicleId > 0 && Math.Abs(lat) > 0.0001 && Math.Abs(lon) > 0.0001)
                {
                    var vehicle = await db.VehicleRegistry.FindAsync(effectiveVehicleId);
                    if (vehicle != null)
                    {
                        vehicle.LastKnownLatitude = lat;
                        vehicle.LastKnownLongitude = lon;
                        vehicle.LastKnownTimestamp = capturedAt;
                        vehicle.LastKnownSpeedKmh = speed;
                    }
                }

                await db.SaveChangesAsync();
                collectionEventId = collectionEvent.CollectionEventId;

                // 2b. House Spatial Association: Closest adjacent house + any houses within collection circle
                if (Math.Abs(lat) > 0.0001 && Math.Abs(lon) > 0.0001)
                {
                    var housesInUlb = await db.Houses
                        .AsNoTracking()
                        .Where(h => h.UlbId == effectiveUlbId && h.IsActive)
                        .ToListAsync();

                    var eventPointProjected = _projection != null ? _projection.ToProjected(eventPointWgs84, effectiveUlbId) : eventPointWgs84;
                    double houseRadius = _constants.CollectionRadiusMeters; // 10.0m

                    var houseDistances = housesInUlb.Select(h =>
                    {
                        const double tx = -0.8858;
                        const double ty = 0.4642;
                        const double nx = -ty;
                        const double ny = tx;
                        const double hw = 3.6; // half width along road (7.2m building width)
                        const double hh = 3.2; // half depth off road (6.4m building depth)
                        const double latScale = 111320.0;
                        double lonScale = 111320.0 * Math.Cos(h.Latitude * Math.PI / 180.0);

                        var ringCoords = new[]
                        {
                            new Coordinate(h.Longitude + (hw * tx + hh * nx) / lonScale, h.Latitude + (hw * ty + hh * ny) / latScale),
                            new Coordinate(h.Longitude + (-hw * tx + hh * nx) / lonScale, h.Latitude + (-hw * ty + hh * ny) / latScale),
                            new Coordinate(h.Longitude + (-hw * tx - hh * nx) / lonScale, h.Latitude + (-hw * ty - hh * ny) / latScale),
                            new Coordinate(h.Longitude + (hw * tx - hh * nx) / lonScale, h.Latitude + (hw * ty - hh * ny) / latScale),
                            new Coordinate(h.Longitude + (hw * tx + hh * nx) / lonScale, h.Latitude + (hw * ty + hh * ny) / latScale),
                        };
                        var gf = NetTopologySuite.NtsGeometryServices.Instance.CreateGeometryFactory(4326);
                        var footprintPolyWgs84 = gf.CreatePolygon(ringCoords);

                        var footprintProjected = _projection != null ? _projection.ToProjected(footprintPolyWgs84, effectiveUlbId) : footprintPolyWgs84;
                        double boundaryDist = _projection != null
                            ? eventPointProjected.Distance(footprintProjected)
                            : (eventPointWgs84.Distance(footprintPolyWgs84) * 111320.0);

                        return (House: h, Distance: boundaryDist);
                    }).OrderBy(x => x.Distance).ToList();

                    var associatedHouses = new List<(House House, double Distance)>();
                    var closest = houseDistances.FirstOrDefault();
                    if (closest.House != null && closest.Distance <= 25.0)
                    {
                        associatedHouses.Add(closest);
                    }

                    foreach (var item in houseDistances)
                    {
                        if (item.Distance <= houseRadius && !associatedHouses.Any(a => a.House.HouseId == item.House.HouseId))
                        {
                            associatedHouses.Add(item);
                        }
                    }

                    foreach (var (h, houseDist) in associatedHouses)
                    {
                        db.CollectionEventHouses.Add(new CollectionEventHouse
                        {
                            CollectionEventId = collectionEvent.CollectionEventId,
                            HouseId = h.HouseId,
                            DistanceMeters = houseDist,
                            CoverageRadiusMeters = houseRadius,
                            CreatedAt = DateTime.UtcNow
                        });

                        _logger.LogInformation("==================================================================");
                        _logger.LogInformation("[FIELD EVENT] 🏠 HOUSE ASSOCIATED: {HouseId} - {Address} (@ {Dist:F1}m)",
                            h.HouseId, h.Address, houseDist);
                        _logger.LogInformation("==================================================================");
                    }
                    await db.SaveChangesAsync();
                }
            }

            var finalUlbId = (!string.IsNullOrWhiteSpace(collectionEvent.OperationalSession?.UlbId))
                ? collectionEvent.OperationalSession.UlbId
                : ((!string.IsNullOrWhiteSpace(ulbId) && !ulbId.Equals("AUTO", StringComparison.OrdinalIgnoreCase))
                    ? ulbId
                    : "ULB_MH_AMRAVATI");
            var finalSessionId = collectionEvent.OperationalSessionId;

            // 3. Compute SHA-256 hash
            string sha256Hash;
            using (var sha = SHA256.Create())
            {
                var hash = sha.ComputeHash(imageBytes);
                sha256Hash = Convert.ToHexString(hash).ToLowerInvariant();
            }

            // 4. Create pending DB record to obtain identity ID
            var image = new EvidenceImage
            {
                CollectionEventId = collectionEventId,
                RelativePath = "PENDING", // Updated immediately below
                CapturedAt = capturedAt,
                ExpiresAt = capturedAt.AddDays(_constants.EvidenceRetentionDays),
                FileSizeBytes = imageBytes.LongLength,
                Width = width,
                Height = height,
                CompressionQuality = compressionQuality,
                Sha256Hash = sha256Hash,
                IdempotencyKey = idempotencyKey,
                CreatedAt = DateTime.UtcNow
            };

            db.EvidenceImages.Add(image);
            await db.SaveChangesAsync();

            // 5. Generate authoritative relative path stored in database:
            // sessionimages/{ulbId}/{yyyy}/{MM}/{OperationalSessionId}/{EvidenceImageId}.jpg
            var yyyy = capturedAt.ToString("yyyy");
            var mm = capturedAt.ToString("MM");
            var relativePath = $"sessionimages/{finalUlbId}/{yyyy}/{mm}/{finalSessionId}/{image.EvidenceImageId}.jpg";

            var physicalPath = ResolvePhysicalPath(relativePath);
            var dir = Path.GetDirectoryName(physicalPath);
            if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
            {
                Directory.CreateDirectory(dir);
            }

            await File.WriteAllBytesAsync(physicalPath, imageBytes);

            // 6. Update relative path in database
            image.RelativePath = relativePath;
            await db.SaveChangesAsync();

            _logger.LogInformation("==================================================================");
            _logger.LogInformation("[FIELD EVENT] 📸 EVIDENCE STORED: Image #{ImageId} ({Bytes} bytes)", image.EvidenceImageId, imageBytes.Length);
            _logger.LogInformation("              ULB: {Ulb} | Session: #{SessionId} | Event: #{EventId}", finalUlbId, finalSessionId, collectionEventId);
            _logger.LogInformation("              Path: {RelPath}", relativePath);
            _logger.LogInformation("              SHA256: {Hash}", sha256Hash);
            _logger.LogInformation("==================================================================");

            return (image, physicalPath, relativePath);
        }

        public async Task<EvidenceImage?> GetImageByIdAsync(long evidenceImageId)
        {
            using var scope = _serviceProvider.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<TelemetryDbContext>();

            return await db.EvidenceImages
                .AsNoTracking()
                .Include(img => img.CollectionEvent)
                .FirstOrDefaultAsync(img => img.EvidenceImageId == evidenceImageId);
        }

        public async Task<List<EvidenceImage>> GetImagesAsync(long collectionEventId)
        {
            using var scope = _serviceProvider.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<TelemetryDbContext>();

            return await db.EvidenceImages
                .AsNoTracking()
                .Where(img => img.CollectionEventId == collectionEventId)
                .OrderBy(img => img.CapturedAt)
                .ToListAsync();
        }

        public async Task<(byte[] Bytes, string ContentType)?> ReadImageBytesAsync(long evidenceImageId)
        {
            var image = await GetImageByIdAsync(evidenceImageId);
            if (image == null || image.IsDeleted)
            {
                return null;
            }

            var physicalPath = ResolvePhysicalPath(image.RelativePath);
            if (!File.Exists(physicalPath))
            {
                _logger.LogWarning("Physical file missing for EvidenceImage #{ImageId} at '{Path}'",
                    evidenceImageId, physicalPath);
                return null;
            }

            var bytes = await File.ReadAllBytesAsync(physicalPath);
            return (bytes, "image/jpeg");
        }

        public async Task<int> CleanupExpiredEvidenceAsync()
        {
            using var scope = _serviceProvider.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<TelemetryDbContext>();

            var now = DateTime.UtcNow;
            var expiredImages = await db.EvidenceImages
                .Where(img => img.DeletedAt == null && img.ExpiresAt <= now)
                .Take(500)
                .ToListAsync();

            if (expiredImages.Count == 0) return 0;

            int deletedCount = 0;

            foreach (var img in expiredImages)
            {
                try
                {
                    if (!string.IsNullOrWhiteSpace(img.RelativePath))
                    {
                        var physicalPath = ResolvePhysicalPath(img.RelativePath);
                        if (File.Exists(physicalPath))
                        {
                            File.Delete(physicalPath);
                        }
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to delete physical file for EvidenceImage #{ImageId} at '{Path}'",
                        img.EvidenceImageId, img.RelativePath);
                }

                img.DeletedAt = DateTime.UtcNow;
                deletedCount++;
            }

            await db.SaveChangesAsync();

            await _auditService.RecordAsync(
                action: "EVIDENCE_RETENTION_CLEANUP",
                entityType: "EVIDENCE_IMAGE",
                entityId: "BATCH",
                performedBy: "SYSTEM_CLEANUP_WORKER",
                details: new { deletedImagesCount = deletedCount });

            _logger.LogInformation("Retention cleanup completed: Marked {Count} expired evidence images as deleted.", deletedCount);
            return deletedCount;
        }

        private string ResolvePhysicalPath(string relativePath)
        {
            // Normalize path separators
            var normalized = relativePath.Replace('/', Path.DirectorySeparatorChar).Replace('\\', Path.DirectorySeparatorChar).TrimStart(Path.DirectorySeparatorChar);

            // If relativePath already starts with the folder name of _storageRoot (e.g. "evidence\"), strip it to avoid duplicate nesting
            var rootFolderName = Path.GetFileName(_storageRoot.TrimEnd(Path.DirectorySeparatorChar));
            if (!string.IsNullOrEmpty(rootFolderName) && normalized.StartsWith(rootFolderName + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
            {
                normalized = normalized.Substring(rootFolderName.Length + 1);
            }

            var combined = Path.Combine(_storageRoot, normalized);
            var fullPath = Path.GetFullPath(combined);

            // Path traversal defense: ensure fullPath resides inside _storageRoot
            if (!fullPath.StartsWith(_storageRoot, StringComparison.OrdinalIgnoreCase))
            {
                throw new UnauthorizedAccessException("Path traversal detected in relative image path.");
            }

            return fullPath;
        }
    }
}
