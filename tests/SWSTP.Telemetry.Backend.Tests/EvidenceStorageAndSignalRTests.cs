using System;
using System.Collections.Generic;
using System.IO;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using NetTopologySuite.Geometries;
using SWSTP.Telemetry.Backend.Controllers;
using SWSTP.Telemetry.Backend.Data;
using SWSTP.Telemetry.Backend.Hubs;
using SWSTP.Telemetry.Backend.Models;
using SWSTP.Telemetry.Backend.Services;
using SWSTP.Telemetry.Backend.Services.Spatial;
using Xunit;

namespace SWSTP.Telemetry.Backend.Tests
{
    [Collection("DatabaseTests")]
    public class EvidenceStorageAndSignalRTests : IAsyncLifetime
    {
        private const string ConnectionString = "Server=192.168.1.8;Database=Solid_Waste;User ID=om.r;Password=Om@123;TrustServerCertificate=True;Connect Timeout=15;Encrypt=False;";
        private readonly ServiceProvider _serviceProvider;
        private readonly TelemetryDbContext _db;
        private readonly string _tempStorageRoot;

        public EvidenceStorageAndSignalRTests()
        {
            _tempStorageRoot = Path.Combine(Path.GetTempPath(), "swstp_evidence_test_" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(_tempStorageRoot);

            var services = new ServiceCollection();

            services.AddDbContext<TelemetryDbContext>(options =>
                options.UseSqlServer(ConnectionString, x => x.UseNetTopologySuite()));

            var inMemoryConfig = new Dictionary<string, string?>
            {
                ["EvidenceStorage:RootPath"] = _tempStorageRoot,
                ["OperationalConfig:EvidenceRetentionDays"] = "21",
                ["SpatialConfig:UlbProjections:ULB_MH_AMRAVATI"] = "32643",
                ["SpatialConfig:UlbProjections:ULB_MH_NAGPUR"] = "32644"
            };

            var configuration = new ConfigurationBuilder()
                .AddInMemoryCollection(inMemoryConfig)
                .Build();

            services.AddSingleton<IConfiguration>(configuration);
            services.AddSingleton<OperationalConstants>();
            services.AddSingleton<IStateDefinitionResolver, StateDefinitionResolver>();
            services.AddSingleton<ICoordinateProjectionService, CoordinateProjectionService>();

            services.AddScoped<IAuditService, AuditService>();
            services.AddScoped<ISessionAuthorizationService, SessionAuthorizationService>();
            services.AddScoped<IStateTransitionService, StateTransitionService>();
            services.AddScoped<IEvidenceService, EvidenceService>();
            services.AddScoped<ICollectionEventService, CollectionEventService>();

            services.AddLogging();
            services.AddSignalR();

            _serviceProvider = services.BuildServiceProvider();
            _db = _serviceProvider.GetRequiredService<TelemetryDbContext>();
        }

        public async Task InitializeAsync()
        {
            var resolver = _serviceProvider.GetRequiredService<IStateDefinitionResolver>();
            await resolver.WarmCacheAsync("OPERATIONAL_SESSION", "COLLECTION_EVENT", "DEVICE", "VEHICLE");
        }

        public async Task DisposeAsync()
        {
            try
            {
                if (Directory.Exists(_tempStorageRoot))
                {
                    Directory.Delete(_tempStorageRoot, true);
                }
            }
            catch {}

            await _serviceProvider.DisposeAsync();
        }

        private byte[] CreateSampleJpeg()
        {
            // Valid JPEG header magic bytes (FF D8 FF E0) followed by dummy payload
            return new byte[] { 0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00 };
        }

        private async Task<(VehicleRegistry Vehicle, OperationalSession Session, CollectionEvent Event)> CreateTestEntitiesAsync(string ulbId = "ULB_MH_AMRAVATI")
        {
            var resolver = _serviceProvider.GetRequiredService<IStateDefinitionResolver>();
            var vehicleStateId = await resolver.ResolveAsync("VEHICLE", "IN_SERVICE");
            var sessionStateId = await resolver.ResolveAsync("OPERATIONAL_SESSION", "ACTIVE");
            var eventStateId = await resolver.ResolveAsync("COLLECTION_EVENT", "DETECTED");

            var vehicle = new VehicleRegistry
            {
                VehicleRegistrationNumber = $"MH-27-TEST-{Guid.NewGuid().ToString("N")[..4].ToUpperInvariant()}",
                VehicleType = "TIPPER_TRUCK",
                CapacityTons = 3.5,
                UlbId = ulbId,
                UlbName = "Amravati Municipal Corporation",
                Status = "IN_SERVICE",
                StatusStateDefinitionId = vehicleStateId,
                RegisteredAt = DateTime.UtcNow
            };
            _db.VehicleRegistry.Add(vehicle);
            await _db.SaveChangesAsync();

            var road = new Road
            {
                UlbId = ulbId,
                RoadCode = $"RD-TEST-{Guid.NewGuid().ToString("N")[..6].ToUpperInvariant()}",
                RoadName = "Evidence Test Road",
                RoadType = "PRIMARY",
                IsActive = true
            };
            _db.Roads.Add(road);
            await _db.SaveChangesAsync();

            var lineGeom = new LineString(new[]
            {
                new Coordinate(77.7790, 20.9370),
                new Coordinate(77.7800, 20.9380)
            }) { SRID = 4326 };

            var geomVer = new RoadGeometryVersion
            {
                RoadId = road.RoadId,
                VersionNumber = 1,
                Geometry = lineGeom,
                EffectiveFrom = DateTime.UtcNow
            };
            _db.RoadGeometryVersions.Add(geomVer);
            await _db.SaveChangesAsync();

            var session = new OperationalSession
            {
                SessionCode = $"OPS-TEST-{Guid.NewGuid().ToString("N")[..6].ToUpperInvariant()}",
                Name = "Evidence Test Session",
                UlbId = ulbId,
                VehicleId = vehicle.VehicleId,
                ScheduledStartAt = DateTime.UtcNow.AddMinutes(-10),
                ActualStartAt = DateTime.UtcNow.AddMinutes(-5),
                StatusStateDefinitionId = sessionStateId,
                IsActiveReservation = true,
                CreatedAt = DateTime.UtcNow,
                CreatedBy = "TEST_RUNNER"
            };
            _db.OperationalSessions.Add(session);
            await _db.SaveChangesAsync();

            var roadAssignment = new SessionRoadAssignment
            {
                OperationalSessionId = session.OperationalSessionId,
                RoadId = road.RoadId,
                RoadGeometryVersionId = geomVer.RoadGeometryVersionId,
                AssignedGeometry = lineGeom,
                BufferMeters = 100.0,
                AssignmentType = "FULL",
                AssignedOrder = 1,
                CreatedAt = DateTime.UtcNow,
                CreatedBy = "TEST_RUNNER"
            };
            _db.SessionRoadAssignments.Add(roadAssignment);
            await _db.SaveChangesAsync();

            var collEvent = new CollectionEvent
            {
                OperationalSessionId = session.OperationalSessionId,
                SessionRoadAssignmentId = roadAssignment.SessionRoadAssignmentId,
                VehicleId = vehicle.VehicleId,
                CapturedAt = DateTime.UtcNow,
                ReceivedAt = DateTime.UtcNow,
                Latitude = 20.9374,
                Longitude = 77.7796,
                Location = new Point(77.7796, 20.9374) { SRID = 4326 },
                FusedSpeedKph = 3.2,
                MotionConfidence = 0.95,
                DistanceToRoadMeters = 2.1,
                StatusStateDefinitionId = eventStateId,
                CreatedAt = DateTime.UtcNow
            };
            _db.CollectionEvents.Add(collEvent);
            await _db.SaveChangesAsync();

            return (vehicle, session, collEvent);
        }

        // =========================================================================
        // 1. SIGNALR AUTHORIZATION TESTS
        // =========================================================================

        [Fact]
        public async Task SignalR_SessionSubscription_AuthorizedWhenUlbMatches()
        {
            var (_, session, _) = await CreateTestEntitiesAsync("ULB_MH_AMRAVATI");
            var authService = _serviceProvider.GetRequiredService<ISessionAuthorizationService>();

            var claims = new List<Claim>
            {
                new Claim(ClaimTypes.Name, "officer_amravati"),
                new Claim("ulb_id", "ULB_MH_AMRAVATI"),
                new Claim(ClaimTypes.Role, "OFFICER")
            };
            var user = new ClaimsPrincipal(new ClaimsIdentity(claims, "TestAuth"));

            var isAuthorized = await authService.AuthorizeSessionSubscriptionAsync(user, session.OperationalSessionId);
            Assert.True(isAuthorized);
        }

        [Fact]
        public async Task SignalR_SessionSubscription_RejectedWhenCrossUlb()
        {
            var (_, session, _) = await CreateTestEntitiesAsync("ULB_MH_AMRAVATI");
            var authService = _serviceProvider.GetRequiredService<ISessionAuthorizationService>();

            // Officer from Nagpur trying to subscribe to Amravati session
            var claims = new List<Claim>
            {
                new Claim(ClaimTypes.Name, "officer_nagpur"),
                new Claim("ulb_id", "ULB_MH_NAGPUR"),
                new Claim(ClaimTypes.Role, "OFFICER")
            };
            var user = new ClaimsPrincipal(new ClaimsIdentity(claims, "TestAuth"));

            var isAuthorized = await authService.AuthorizeSessionSubscriptionAsync(user, session.OperationalSessionId);
            Assert.False(isAuthorized);
        }

        [Fact]
        public async Task SignalR_SessionSubscription_AuthorizedForSuperAdmin()
        {
            var (_, session, _) = await CreateTestEntitiesAsync("ULB_MH_AMRAVATI");
            var authService = _serviceProvider.GetRequiredService<ISessionAuthorizationService>();

            var claims = new List<Claim>
            {
                new Claim(ClaimTypes.Name, "superadmin"),
                new Claim(ClaimTypes.Role, "SUPER_ADMIN")
            };
            var user = new ClaimsPrincipal(new ClaimsIdentity(claims, "TestAuth"));

            var isAuthorized = await authService.AuthorizeSessionSubscriptionAsync(user, session.OperationalSessionId);
            Assert.True(isAuthorized);
        }

        [Fact]
        public async Task SignalR_FleetSubscription_RejectedForNonExistentUlb()
        {
            var authService = _serviceProvider.GetRequiredService<ISessionAuthorizationService>();
            var claims = new List<Claim>
            {
                new Claim(ClaimTypes.Name, "superadmin"),
                new Claim(ClaimTypes.Role, "SUPER_ADMIN")
            };
            var user = new ClaimsPrincipal(new ClaimsIdentity(claims, "TestAuth"));

            var isAuthorized = await authService.AuthorizeFleetSubscriptionAsync(user, "ULB_NON_EXISTENT_999");
            Assert.False(isAuthorized);
        }

        [Fact]
        public async Task Vehicle_HistoricalAccess_AuthorizedWhenUlbMatches()
        {
            var (vehicle, _, _) = await CreateTestEntitiesAsync("ULB_MH_AMRAVATI");
            var authService = _serviceProvider.GetRequiredService<ISessionAuthorizationService>();

            var claims = new List<Claim>
            {
                new Claim(ClaimTypes.Name, "officer_amravati"),
                new Claim("ulb_id", "ULB_MH_AMRAVATI"),
                new Claim(ClaimTypes.Role, "OFFICER")
            };
            var user = new ClaimsPrincipal(new ClaimsIdentity(claims, "TestAuth"));

            var isAuthorized = await authService.AuthorizeVehicleAccessAsync(user, vehicle.VehicleId);
            Assert.True(isAuthorized);
        }

        [Fact]
        public async Task Vehicle_HistoricalAccess_RejectedWhenCrossUlb()
        {
            var (vehicle, _, _) = await CreateTestEntitiesAsync("ULB_MH_AMRAVATI");
            var authService = _serviceProvider.GetRequiredService<ISessionAuthorizationService>();

            // Officer from Nagpur trying to access Amravati vehicle history
            var claims = new List<Claim>
            {
                new Claim(ClaimTypes.Name, "officer_nagpur"),
                new Claim("ulb_id", "ULB_MH_NAGPUR"),
                new Claim(ClaimTypes.Role, "OFFICER")
            };
            var user = new ClaimsPrincipal(new ClaimsIdentity(claims, "TestAuth"));

            var isAuthorized = await authService.AuthorizeVehicleAccessAsync(user, vehicle.VehicleId);
            Assert.False(isAuthorized);
        }

        [Fact]
        public async Task Vehicle_HistoricalAccess_AuthorizedForSuperAdmin()
        {
            var (vehicle, _, _) = await CreateTestEntitiesAsync("ULB_MH_AMRAVATI");
            var authService = _serviceProvider.GetRequiredService<ISessionAuthorizationService>();

            var claims = new List<Claim>
            {
                new Claim(ClaimTypes.Name, "superadmin"),
                new Claim(ClaimTypes.Role, "SUPER_ADMIN")
            };
            var user = new ClaimsPrincipal(new ClaimsIdentity(claims, "TestAuth"));

            var isAuthorized = await authService.AuthorizeVehicleAccessAsync(user, vehicle.VehicleId);
            Assert.True(isAuthorized);
        }

        // =========================================================================
        // 2. EVIDENCE STORAGE & AUTHORITATIVE PATH CONVENTION TESTS
        // =========================================================================

        [Fact]
        public async Task Evidence_AuthoritativeRelativePath_FollowsExactConvention()
        {
            var (_, session, collEvent) = await CreateTestEntitiesAsync("ULB_MH_AMRAVATI");
            var evidenceService = _serviceProvider.GetRequiredService<IEvidenceService>();

            var sampleJpeg = CreateSampleJpeg();
            var capturedAt = new DateTime(2026, 8, 17, 14, 30, 0, DateTimeKind.Utc);

            var (image, physicalPath, relativePath) = await evidenceService.SaveEvidenceImageAsync(
                collectionEventId: collEvent.CollectionEventId,
                imageBytes: sampleJpeg,
                capturedAt: capturedAt,
                width: 1280,
                height: 720,
                compressionQuality: 70);

            // Path must follow: sessionimages/{ulbId}/{yyyy}/{MM}/{OperationalSessionId}/{EvidenceImageId}.jpg
            var expectedRelative = $"sessionimages/ULB_MH_AMRAVATI/2026/08/{session.OperationalSessionId}/{image.EvidenceImageId}.jpg";
            Assert.Equal(expectedRelative, relativePath);
            Assert.True(File.Exists(physicalPath));
            Assert.Equal(sampleJpeg.Length, new FileInfo(physicalPath).Length);
        }

        [Fact]
        public async Task Evidence_Sha256Checksum_ComputedAndPersistedCorrectly()
        {
            var (_, _, collEvent) = await CreateTestEntitiesAsync("ULB_MH_AMRAVATI");
            var evidenceService = _serviceProvider.GetRequiredService<IEvidenceService>();

            var sampleJpeg = CreateSampleJpeg();
            string expectedHash;
            using (var sha = SHA256.Create())
            {
                expectedHash = Convert.ToHexString(sha.ComputeHash(sampleJpeg)).ToLowerInvariant();
            }

            var (image, _, _) = await evidenceService.SaveEvidenceImageAsync(
                collectionEventId: collEvent.CollectionEventId,
                imageBytes: sampleJpeg,
                capturedAt: DateTime.UtcNow,
                width: 1280,
                height: 720);

            Assert.Equal(expectedHash, image.Sha256Hash);

            var retrieved = await evidenceService.GetImageByIdAsync(image.EvidenceImageId);
            Assert.NotNull(retrieved);
            Assert.Equal(expectedHash, retrieved.Sha256Hash);
        }

        [Fact]
        public async Task Evidence_IdempotentUpload_ReturnsExistingImage()
        {
            var (_, _, collEvent) = await CreateTestEntitiesAsync("ULB_MH_AMRAVATI");
            var evidenceService = _serviceProvider.GetRequiredService<IEvidenceService>();

            var sampleJpeg = CreateSampleJpeg();
            var idempotencyKey = $"IDEMP-TEST-{Guid.NewGuid():N}";

            var (firstImg, firstPath, _) = await evidenceService.SaveEvidenceImageAsync(
                collectionEventId: collEvent.CollectionEventId,
                imageBytes: sampleJpeg,
                capturedAt: DateTime.UtcNow,
                width: 1280,
                height: 720,
                idempotencyKey: idempotencyKey);

            // Second call with same idempotency key
            var (secondImg, secondPath, _) = await evidenceService.SaveEvidenceImageAsync(
                collectionEventId: collEvent.CollectionEventId,
                imageBytes: sampleJpeg,
                capturedAt: DateTime.UtcNow,
                width: 1280,
                height: 720,
                idempotencyKey: idempotencyKey);

            Assert.Equal(firstImg.EvidenceImageId, secondImg.EvidenceImageId);
            Assert.Equal(firstPath, secondPath);
        }

        [Fact]
        public async Task Evidence_ReadImageBytes_ReturnsCorrectJpegPayload()
        {
            var (_, _, collEvent) = await CreateTestEntitiesAsync("ULB_MH_AMRAVATI");
            var evidenceService = _serviceProvider.GetRequiredService<IEvidenceService>();

            var sampleJpeg = CreateSampleJpeg();
            var (image, _, _) = await evidenceService.SaveEvidenceImageAsync(
                collectionEventId: collEvent.CollectionEventId,
                imageBytes: sampleJpeg,
                capturedAt: DateTime.UtcNow,
                width: 1280,
                height: 720);

            var result = await evidenceService.ReadImageBytesAsync(image.EvidenceImageId);
            Assert.NotNull(result);
            Assert.Equal("image/jpeg", result.Value.ContentType);
            Assert.Equal(sampleJpeg, result.Value.Bytes);
        }

        [Fact]
        public async Task Evidence_RetentionCleanup_PurgesPhysicalFileAndSetsDeletedAt()
        {
            var (_, _, collEvent) = await CreateTestEntitiesAsync("ULB_MH_AMRAVATI");
            var evidenceService = _serviceProvider.GetRequiredService<IEvidenceService>();

            var sampleJpeg = CreateSampleJpeg();
            var (image, physicalPath, _) = await evidenceService.SaveEvidenceImageAsync(
                collectionEventId: collEvent.CollectionEventId,
                imageBytes: sampleJpeg,
                capturedAt: DateTime.UtcNow.AddDays(-22), // Captured 22 days ago
                width: 1280,
                height: 720);

            // Manually backdate ExpiresAt to prove cleanup logic
            var dbImg = await _db.EvidenceImages.FindAsync(image.EvidenceImageId);
            Assert.NotNull(dbImg);
            dbImg.ExpiresAt = DateTime.UtcNow.AddDays(-1);
            await _db.SaveChangesAsync();

            Assert.True(File.Exists(physicalPath));

            // Execute retention cleanup
            var cleanedCount = await evidenceService.CleanupExpiredEvidenceAsync();
            Assert.True(cleanedCount >= 1);

            // Physical file must be deleted from disk
            Assert.False(File.Exists(physicalPath));

            // Database record must have DeletedAt timestamp set
            var reloadedImg = await _db.EvidenceImages.AsNoTracking().FirstOrDefaultAsync(i => i.EvidenceImageId == image.EvidenceImageId);
            Assert.NotNull(reloadedImg);
            Assert.NotNull(reloadedImg.DeletedAt);
            Assert.True(reloadedImg.IsDeleted);

            // CollectionEvent metadata remains preserved
            var parentEvent = await _db.CollectionEvents.AsNoTracking().FirstOrDefaultAsync(ce => ce.CollectionEventId == collEvent.CollectionEventId);
            Assert.NotNull(parentEvent);
        }
    }
}
