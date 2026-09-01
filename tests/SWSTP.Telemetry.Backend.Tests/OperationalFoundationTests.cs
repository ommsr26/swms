using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using NetTopologySuite.Geometries;
using SWSTP.Telemetry.Backend.Data;
using SWSTP.Telemetry.Backend.Models;
using SWSTP.Telemetry.Backend.Services;
using SWSTP.Telemetry.Backend.Services.Motion;
using SWSTP.Telemetry.Backend.Services.Spatial;
using Xunit;

namespace SWSTP.Telemetry.Backend.Tests
{
    [Collection("DatabaseTests")]
    public class OperationalFoundationTests
    {
        private const string ConnectionString = "Server=192.168.1.8;Database=Solid_Waste;User ID=om.r;Password=Om@123;TrustServerCertificate=True;Connect Timeout=15;Encrypt=False;";
        private static readonly GeometryFactory Wgs84Factory = new(new PrecisionModel(), 4326);

        private IServiceProvider CreateTestServiceProvider()
        {
            var inMemorySettings = new Dictionary<string, string?>
            {
                { "ConnectionStrings:DefaultConnection", ConnectionString },
                { "SpatialConfig:UlbProjections:ULB_MH_AMRAVATI", "32643" },
                { "SpatialConfig:UlbProjections:ULB_MH_NAGPUR", "32644" },
                { "OperationalConfig:SessionActivationIntervalMs", "2000" },
                { "OperationalConfig:MaxSpeedKmhForArming", "5.0" },
                { "OperationalConfig:DefaultBufferMeters", "100.0" },
                { "OperationalConfig:CollectionRadiusMeters", "10.0" },
                { "OperationalConfig:AssignmentAmbiguityZoneM", "5.0" },
                { "OperationalConfig:GnssDataStalenessSeconds", "3.0" },
                { "OperationalConfig:EvidenceRetentionDays", "21" },
                { "OperationalConfig:CollectionHistoryMonths", "6" }
            };

            var config = new ConfigurationBuilder()
                .AddInMemoryCollection(inMemorySettings)
                .Build();

            var services = new ServiceCollection();
            services.AddSingleton<IConfiguration>(config);
            services.AddDbContext<TelemetryDbContext>(options =>
                options.UseSqlServer(ConnectionString, x => x.UseNetTopologySuite()));

            services.AddSingleton<OperationalConstants>();
            services.AddSingleton<IStateDefinitionResolver, StateDefinitionResolver>();
            services.AddSingleton<ICoordinateProjectionService, CoordinateProjectionService>(sp =>
                new CoordinateProjectionService(config, NullLogger<CoordinateProjectionService>.Instance));
            services.AddSingleton<ISpeedFusionService, PrototypeSpeedFusionService>();

            services.AddScoped<IAuditService, AuditService>(sp =>
                new AuditService(sp, NullLogger<AuditService>.Instance));
            services.AddScoped<IStateTransitionService, StateTransitionService>(sp =>
                new StateTransitionService(sp, sp.GetRequiredService<IStateDefinitionResolver>(), sp.GetRequiredService<IAuditService>(), NullLogger<StateTransitionService>.Instance));
            services.AddScoped<IOperationalSessionService, OperationalSessionService>(sp =>
                new OperationalSessionService(sp, sp.GetRequiredService<IStateDefinitionResolver>(), sp.GetRequiredService<IStateTransitionService>(), sp.GetRequiredService<IAuditService>(), sp.GetRequiredService<OperationalConstants>(), NullLogger<OperationalSessionService>.Instance));
            services.AddScoped<IRoadAssignmentService, RoadAssignmentService>(sp =>
                new RoadAssignmentService(sp, sp.GetRequiredService<ICoordinateProjectionService>(), sp.GetRequiredService<IAuditService>(), sp.GetRequiredService<OperationalConstants>(), NullLogger<RoadAssignmentService>.Instance));
            services.AddScoped<IProximityService, ProximityService>();
            services.AddScoped<ICoverageService, CoverageService>(sp =>
                new CoverageService(sp, sp.GetRequiredService<ICoordinateProjectionService>(), sp.GetRequiredService<IStateTransitionService>(), sp.GetRequiredService<IStateDefinitionResolver>(), sp.GetRequiredService<OperationalConstants>(), NullLogger<CoverageService>.Instance));
            services.AddScoped<ICollectionEventService, CollectionEventService>(sp =>
                new CollectionEventService(sp, sp.GetRequiredService<ICoordinateProjectionService>(), sp.GetRequiredService<IStateDefinitionResolver>(), sp.GetRequiredService<ICoverageService>(), sp.GetRequiredService<IAuditService>(), sp.GetRequiredService<OperationalConstants>(), NullLogger<CollectionEventService>.Instance));
            services.AddScoped<IEvidenceService, EvidenceService>(sp =>
                new EvidenceService(sp, sp.GetRequiredService<OperationalConstants>(), sp.GetRequiredService<IAuditService>(), NullLogger<EvidenceService>.Instance));

            return services.BuildServiceProvider();
        }

        private static async Task<VehicleRegistry> EnsureTestVehicleAsync(TelemetryDbContext db, string ulbId, string regNumber)
        {
            var vehicle = await db.VehicleRegistry.FirstOrDefaultAsync(v => v.VehicleRegistrationNumber == regNumber);
            if (vehicle == null)
            {
                vehicle = new VehicleRegistry
                {
                    VehicleRegistrationNumber = regNumber,
                    VehicleType = "GARBAGE_COMPACTOR",
                    UlbId = ulbId,
                    Status = "IN_SERVICE",
                    RegisteredAt = DateTime.UtcNow
                };
                db.VehicleRegistry.Add(vehicle);
                await db.SaveChangesAsync();
            }

            // Clear any active reservations on this vehicle
            var existing = await db.OperationalSessions
                .Where(s => s.VehicleId == vehicle.VehicleId && s.IsActiveReservation)
                .ToListAsync();

            if (existing.Count > 0)
            {
                foreach (var s in existing) s.IsActiveReservation = false;
                await db.SaveChangesAsync();
            }

            return vehicle;
        }

        private static async Task<(Road Road, RoadGeometryVersion Version)> EnsureTestRoadAndVersionAsync(TelemetryDbContext db, string ulbId)
        {
            var road = await db.Roads
                .Include(r => r.GeometryVersions)
                .FirstOrDefaultAsync(r => r.UlbId == ulbId);

            if (road == null)
            {
                road = new Road
                {
                    UlbId = ulbId,
                    RoadCode = $"RD-{ulbId[..6]}-001",
                    RoadName = $"{ulbId} Main Arterial Road",
                    RoadType = "PRIMARY",
                    IsActive = true,
                    CreatedAt = DateTime.UtcNow
                };
                db.Roads.Add(road);
                await db.SaveChangesAsync();
            }

            var version = road.GeometryVersions.FirstOrDefault();
            if (version == null)
            {
                var defaultLine = ulbId.Contains("AMRAVATI")
                    ? Wgs84Factory.CreateLineString(new[] { new Coordinate(77.7520, 20.9320), new Coordinate(77.7530, 20.9330) })
                    : Wgs84Factory.CreateLineString(new[] { new Coordinate(79.0880, 21.1450), new Coordinate(79.0890, 21.1460) });

                version = new RoadGeometryVersion
                {
                    RoadId = road.RoadId,
                    VersionNumber = 1,
                    Geometry = defaultLine,
                    EffectiveFrom = DateTime.UtcNow,
                    CreatedAt = DateTime.UtcNow
                };
                db.RoadGeometryVersions.Add(version);
                await db.SaveChangesAsync();
            }

            return (road, version);
        }

        private static async Task<(DeviceRegistry Device, DeviceVehicleAssignment Assignment)> EnsureTestDeviceAndAssignmentAsync(
            TelemetryDbContext db, string ulbId, string regNumber, string devCode)
        {
            var vehicle = await EnsureTestVehicleAsync(db, ulbId, regNumber);

            var device = await db.DeviceRegistry.FirstOrDefaultAsync(d => d.DeviceCode == devCode);
            if (device == null)
            {
                device = new DeviceRegistry
                {
                    DeviceCode = devCode,
                    HardwareVersion = "REV_2.1_AVR",
                    FirmwareVersion = "v2.4.0",
                    IsActive = true,
                    RegisteredAt = DateTime.UtcNow
                };
                db.DeviceRegistry.Add(device);
                await db.SaveChangesAsync();
            }

            var assignment = await db.DeviceVehicleAssignments
                .Include(a => a.Vehicle)
                .FirstOrDefaultAsync(a => a.DeviceId == device.DeviceId && a.VehicleId == vehicle.VehicleId && a.IsActive);

            if (assignment == null)
            {
                // Deactivate any previous assignments for this device
                var oldAssignments = await db.DeviceVehicleAssignments
                    .Where(a => a.DeviceId == device.DeviceId && a.IsActive)
                    .ToListAsync();
                foreach (var a in oldAssignments) a.IsActive = false;

                assignment = new DeviceVehicleAssignment
                {
                    DeviceId = device.DeviceId,
                    VehicleId = vehicle.VehicleId,
                    AssignedAt = DateTime.UtcNow,
                    IsActive = true
                };
                db.DeviceVehicleAssignments.Add(assignment);
                await db.SaveChangesAsync();
            }

            return (device, assignment);
        }

        // ═══════════════════════════════════════════════════════════════════════════
        // GROUP A: State Definition Resolver Tests (No Hardcoded IDs)
        // ═══════════════════════════════════════════════════════════════════════════

        [Fact]
        public async Task Test01_ResolveAsync_Scheduled_ReturnsValidDbId()
        {
            var sp = CreateTestServiceProvider();
            var resolver = sp.GetRequiredService<IStateDefinitionResolver>();

            var id = await resolver.ResolveAsync(SessionStateCodes.EntityType, SessionStateCodes.Scheduled);
            Assert.True(id > 0);

            var code = await resolver.ResolveCodeAsync(id);
            Assert.Equal(SessionStateCodes.Scheduled, code);
        }

        [Fact]
        public async Task Test02_ResolveAsync_Active_ReturnsDifferentIdFromScheduled()
        {
            var sp = CreateTestServiceProvider();
            var resolver = sp.GetRequiredService<IStateDefinitionResolver>();

            var scheduledId = await resolver.ResolveAsync(SessionStateCodes.EntityType, SessionStateCodes.Scheduled);
            var activeId = await resolver.ResolveAsync(SessionStateCodes.EntityType, SessionStateCodes.Active);

            Assert.True(scheduledId > 0);
            Assert.True(activeId > 0);
            Assert.NotEqual(scheduledId, activeId);
        }

        [Fact]
        public async Task Test03_ResolveAsync_CollectionEvent_Detected_ResolvedDynamically()
        {
            var sp = CreateTestServiceProvider();
            var resolver = sp.GetRequiredService<IStateDefinitionResolver>();

            var detectedId = await resolver.ResolveAsync(CollectionEventStateCodes.EntityType, CollectionEventStateCodes.Detected);
            Assert.True(detectedId > 0);

            var code = await resolver.ResolveCodeAsync(detectedId);
            Assert.Equal(CollectionEventStateCodes.Detected, code);
        }

        [Fact]
        public async Task Test04_ResolveAsync_NonexistentState_ThrowsStateDefinitionNotFoundException()
        {
            var sp = CreateTestServiceProvider();
            var resolver = sp.GetRequiredService<IStateDefinitionResolver>();

            await Assert.ThrowsAsync<StateDefinitionNotFoundException>(() =>
                resolver.ResolveAsync(SessionStateCodes.EntityType, "INVALID_STATE_CODE_XYZ"));
        }

        [Fact]
        public async Task Test05_ResolveAsync_UnknownEntityType_ThrowsStateDefinitionNotFoundException()
        {
            var sp = CreateTestServiceProvider();
            var resolver = sp.GetRequiredService<IStateDefinitionResolver>();

            await Assert.ThrowsAsync<StateDefinitionNotFoundException>(() =>
                resolver.ResolveAsync("UNKNOWN_ENTITY_TYPE", "ACTIVE"));
        }

        [Fact]
        public async Task Test06_ResolveAsync_ReturnsCachedResultOnSubsequentCalls()
        {
            var sp = CreateTestServiceProvider();
            var resolver = sp.GetRequiredService<IStateDefinitionResolver>();

            var firstId = await resolver.ResolveAsync(SessionStateCodes.EntityType, SessionStateCodes.Paused);
            var secondId = await resolver.ResolveAsync(SessionStateCodes.EntityType, SessionStateCodes.Paused);

            Assert.Equal(firstId, secondId);
        }

        [Fact]
        public async Task Test07_WarmCacheAsync_ValidatesAllRequiredSessionStates()
        {
            var sp = CreateTestServiceProvider();
            var resolver = sp.GetRequiredService<IStateDefinitionResolver>();

            await resolver.WarmCacheAsync(
                SessionStateCodes.EntityType,
                CollectionEventStateCodes.EntityType,
                DeviceStateCodes.EntityType,
                VehicleStateCodes.EntityType);

            var completedId = await resolver.ResolveAsync(SessionStateCodes.EntityType, SessionStateCodes.Completed);
            Assert.True(completedId > 0);
        }

        [Fact]
        public async Task Test08_ValidateRequiredStatesAsync_FailsFastOnMissingState()
        {
            var sp = CreateTestServiceProvider();
            var resolver = sp.GetRequiredService<IStateDefinitionResolver>();

            var invalidList = new[] { "ACTIVE", "NON_EXISTENT_STATE_999" };
            await Assert.ThrowsAsync<StateDefinitionNotFoundException>(() =>
                resolver.ValidateRequiredStatesAsync(SessionStateCodes.EntityType, invalidList));
        }

        // ═══════════════════════════════════════════════════════════════════════════
        // GROUP B: Spatial CRS Configuration Tests (Amravati=32643, Nagpur=32644, No Fallback)
        // ═══════════════════════════════════════════════════════════════════════════

        [Fact]
        public void Test09_GetEpsgForUlb_Amravati_ResolvesTo_EPSG32643()
        {
            var sp = CreateTestServiceProvider();
            var projection = sp.GetRequiredService<ICoordinateProjectionService>();

            var epsg = projection.GetEpsgForUlb("ULB_MH_AMRAVATI");
            Assert.Equal(32643, epsg);
        }

        [Fact]
        public void Test10_GetEpsgForUlb_Nagpur_ResolvesTo_EPSG32644()
        {
            var sp = CreateTestServiceProvider();
            var projection = sp.GetRequiredService<ICoordinateProjectionService>();

            var epsg = projection.GetEpsgForUlb("ULB_MH_NAGPUR");
            Assert.Equal(32644, epsg);
        }

        [Fact]
        public void Test11_GetEpsgForUlb_UnknownUlb_ThrowsUlbCrsNotConfiguredException()
        {
            var sp = CreateTestServiceProvider();
            var projection = sp.GetRequiredService<ICoordinateProjectionService>();

            Assert.Throws<UlbCrsNotConfiguredException>(() =>
                projection.GetEpsgForUlb("ULB_MH_UNKNOWN_CITY"));
        }

        [Fact]
        public void Test12_ToProjected_NagpurGeometry_SetsSRID32644()
        {
            var sp = CreateTestServiceProvider();
            var projection = sp.GetRequiredService<ICoordinateProjectionService>();

            var nagpurPointWgs84 = Wgs84Factory.CreatePoint(new Coordinate(79.0882, 21.1458));
            var projected = projection.ToProjected(nagpurPointWgs84, "ULB_MH_NAGPUR");

            Assert.Equal(32644, projected.SRID);
            Assert.True(projected.Coordinate.X > 100000);
            Assert.True(projected.Coordinate.Y > 100000);
        }

        [Fact]
        public void Test13_ToProjected_AmravatiGeometry_SetsSRID32643()
        {
            var sp = CreateTestServiceProvider();
            var projection = sp.GetRequiredService<ICoordinateProjectionService>();

            var amravatiPointWgs84 = Wgs84Factory.CreatePoint(new Coordinate(77.7523, 20.9320));
            var projected = projection.ToProjected(amravatiPointWgs84, "ULB_MH_AMRAVATI");

            Assert.Equal(32643, projected.SRID);
            Assert.True(projected.Coordinate.X > 100000);
            Assert.True(projected.Coordinate.Y > 100000);
        }

        [Fact]
        public void Test14_ProjectedMetricBuffer_10m_AreaMatchesPiR2()
        {
            var sp = CreateTestServiceProvider();
            var projection = sp.GetRequiredService<ICoordinateProjectionService>();

            var point = Wgs84Factory.CreatePoint(new Coordinate(77.7523, 20.9320));
            var projected = projection.ToProjected(point, "ULB_MH_AMRAVATI");

            var buffer10m = projected.Buffer(10.0);
            double expectedArea = Math.PI * 10.0 * 10.0;

            Assert.InRange(buffer10m.Area, expectedArea * 0.95, expectedArea * 1.05);
        }

        [Fact]
        public void Test15_ProjectedMetricBuffer_100m_AreaMatchesPiR2()
        {
            var sp = CreateTestServiceProvider();
            var projection = sp.GetRequiredService<ICoordinateProjectionService>();

            var point = Wgs84Factory.CreatePoint(new Coordinate(79.0882, 21.1458));
            var projected = projection.ToProjected(point, "ULB_MH_NAGPUR");

            var buffer100m = projected.Buffer(100.0);
            double expectedArea = Math.PI * 100.0 * 100.0;

            Assert.InRange(buffer100m.Area, expectedArea * 0.95, expectedArea * 1.05);
        }

        // ═══════════════════════════════════════════════════════════════════════════
        // GROUP C: Operational Session Lifecycle & Reservation Tests
        // ═══════════════════════════════════════════════════════════════════════════

        [Fact]
        public async Task Test16_CreateSession_CreatesScheduledSession_WithoutReservation()
        {
            var sp = CreateTestServiceProvider();
            using var scope = sp.CreateScope();
            var sessionService = scope.ServiceProvider.GetRequiredService<IOperationalSessionService>();
            var db = scope.ServiceProvider.GetRequiredService<TelemetryDbContext>();

            var vehicle = await EnsureTestVehicleAsync(db, "ULB_MH_NAGPUR", "MH31TEST-T16");

            var dto = new CreateOperationalSessionDto
            {
                UlbId = "ULB_MH_NAGPUR",
                VehicleId = vehicle.VehicleId,
                ScheduledStartAt = DateTime.UtcNow.AddMinutes(30)
            };

            var result = await sessionService.CreateSessionAsync(dto, "TEST_RUNNER");
            Assert.True(result.Success);
            Assert.NotNull(result.Session);
            Assert.False(result.Session.IsActiveReservation);
        }

        [Fact]
        public async Task Test17_ActivateSession_SetsIsActiveReservation_True()
        {
            var sp = CreateTestServiceProvider();
            using var scope = sp.CreateScope();
            var sessionService = scope.ServiceProvider.GetRequiredService<IOperationalSessionService>();
            var transitionService = scope.ServiceProvider.GetRequiredService<IStateTransitionService>();
            var db = scope.ServiceProvider.GetRequiredService<TelemetryDbContext>();

            var vehicle = await EnsureTestVehicleAsync(db, "ULB_MH_AMRAVATI", "MH27TEST-T17");

            var dto = new CreateOperationalSessionDto
            {
                UlbId = "ULB_MH_AMRAVATI",
                VehicleId = vehicle.VehicleId,
                ScheduledStartAt = DateTime.UtcNow.AddSeconds(-5)
            };

            var createRes = await sessionService.CreateSessionAsync(dto, "TEST_RUNNER");
            Assert.True(createRes.Success);

            var transitionRes = await transitionService.TransitionSessionAsync(
                createRes.Session!.OperationalSessionId,
                SessionStateCodes.Active,
                "TEST_RUNNER");

            Assert.True(transitionRes.Success);

            var updatedSession = await sessionService.GetByIdAsync(createRes.Session.OperationalSessionId);
            Assert.True(updatedSession!.IsActiveReservation);
            Assert.NotNull(updatedSession.ActualStartAt);
        }

        [Fact]
        public async Task Test18_DuplicateActiveSession_RejectedWithDeterministicConflict()
        {
            var sp = CreateTestServiceProvider();
            using var scope = sp.CreateScope();
            var sessionService = scope.ServiceProvider.GetRequiredService<IOperationalSessionService>();
            var transitionService = scope.ServiceProvider.GetRequiredService<IStateTransitionService>();
            var db = scope.ServiceProvider.GetRequiredService<TelemetryDbContext>();

            var vehicle = await EnsureTestVehicleAsync(db, "ULB_MH_NAGPUR", "MH31TEST-T18");

            var dto1 = new CreateOperationalSessionDto { UlbId = "ULB_MH_NAGPUR", VehicleId = vehicle.VehicleId, ScheduledStartAt = DateTime.UtcNow };
            var res1 = await sessionService.CreateSessionAsync(dto1, "TEST_RUNNER");
            await transitionService.TransitionSessionAsync(res1.Session!.OperationalSessionId, SessionStateCodes.Active, "TEST_RUNNER");

            var dto2 = new CreateOperationalSessionDto { UlbId = "ULB_MH_NAGPUR", VehicleId = vehicle.VehicleId, ScheduledStartAt = DateTime.UtcNow.AddHours(1) };
            var res2 = await sessionService.CreateSessionAsync(dto2, "TEST_RUNNER");

            Assert.False(res2.Success);
            Assert.Equal("VEHICLE_RESERVED", res2.ErrorCode);
        }

        [Fact]
        public async Task Test19_ActivateScheduledSessionsAsync_TransitionsDueSessions()
        {
            var sp = CreateTestServiceProvider();
            using var scope = sp.CreateScope();
            var sessionService = scope.ServiceProvider.GetRequiredService<IOperationalSessionService>();
            var resolver = scope.ServiceProvider.GetRequiredService<IStateDefinitionResolver>();
            var db = scope.ServiceProvider.GetRequiredService<TelemetryDbContext>();

            var vehicle = await EnsureTestVehicleAsync(db, "ULB_MH_NAGPUR", "MH31TEST-T19");

            var dto = new CreateOperationalSessionDto
            {
                UlbId = "ULB_MH_NAGPUR",
                VehicleId = vehicle.VehicleId,
                ScheduledStartAt = DateTime.UtcNow.AddSeconds(-2)
            };

            var createRes = await sessionService.CreateSessionAsync(dto, "TEST_RUNNER");
            Assert.True(createRes.Success);

            int activated = await sessionService.ActivateScheduledSessionsAsync();
            Assert.True(activated >= 1);

            var activeStateId = await resolver.ResolveAsync(SessionStateCodes.EntityType, SessionStateCodes.Active);
            var updated = await sessionService.GetByIdAsync(createRes.Session!.OperationalSessionId);
            Assert.Equal(activeStateId, updated!.StatusStateDefinitionId);
        }

        [Fact]
        public async Task Test20_PauseSession_MaintainsVehicleReservation()
        {
            var sp = CreateTestServiceProvider();
            using var scope = sp.CreateScope();
            var sessionService = scope.ServiceProvider.GetRequiredService<IOperationalSessionService>();
            var transitionService = scope.ServiceProvider.GetRequiredService<IStateTransitionService>();
            var db = scope.ServiceProvider.GetRequiredService<TelemetryDbContext>();

            var vehicle = await EnsureTestVehicleAsync(db, "ULB_MH_NAGPUR", "MH31TEST-T20");

            var dto = new CreateOperationalSessionDto { UlbId = "ULB_MH_NAGPUR", VehicleId = vehicle.VehicleId, ScheduledStartAt = DateTime.UtcNow };
            var res = await sessionService.CreateSessionAsync(dto, "TEST_RUNNER");
            await transitionService.TransitionSessionAsync(res.Session!.OperationalSessionId, SessionStateCodes.Active, "TEST_RUNNER");

            var pauseRes = await sessionService.PauseAsync(res.Session.OperationalSessionId, "ULB_MH_NAGPUR", "OFFICER");
            Assert.True(pauseRes.Success);

            var pausedSession = await sessionService.GetByIdAsync(res.Session.OperationalSessionId);
            Assert.True(pausedSession!.IsActiveReservation);
        }

        [Fact]
        public async Task Test21_ResumeSession_FromPausedToActive()
        {
            var sp = CreateTestServiceProvider();
            using var scope = sp.CreateScope();
            var sessionService = scope.ServiceProvider.GetRequiredService<IOperationalSessionService>();
            var transitionService = scope.ServiceProvider.GetRequiredService<IStateTransitionService>();
            var resolver = scope.ServiceProvider.GetRequiredService<IStateDefinitionResolver>();
            var db = scope.ServiceProvider.GetRequiredService<TelemetryDbContext>();

            var vehicle = await EnsureTestVehicleAsync(db, "ULB_MH_NAGPUR", "MH31TEST-T21");

            var dto = new CreateOperationalSessionDto { UlbId = "ULB_MH_NAGPUR", VehicleId = vehicle.VehicleId, ScheduledStartAt = DateTime.UtcNow };
            var res = await sessionService.CreateSessionAsync(dto, "TEST_RUNNER");
            await transitionService.TransitionSessionAsync(res.Session!.OperationalSessionId, SessionStateCodes.Active, "TEST_RUNNER");
            await sessionService.PauseAsync(res.Session.OperationalSessionId, "ULB_MH_NAGPUR", "OFFICER");

            var resumeRes = await sessionService.ResumeAsync(res.Session.OperationalSessionId, "ULB_MH_NAGPUR", "OFFICER");
            Assert.True(resumeRes.Success);

            var activeStateId = await resolver.ResolveAsync(SessionStateCodes.EntityType, SessionStateCodes.Active);
            var updated = await sessionService.GetByIdAsync(res.Session.OperationalSessionId);
            Assert.Equal(activeStateId, updated!.StatusStateDefinitionId);
        }

        [Fact]
        public async Task Test22_InvalidTransition_CompletedToActive_Rejected()
        {
            var sp = CreateTestServiceProvider();
            using var scope = sp.CreateScope();
            var sessionService = scope.ServiceProvider.GetRequiredService<IOperationalSessionService>();
            var transitionService = scope.ServiceProvider.GetRequiredService<IStateTransitionService>();
            var db = scope.ServiceProvider.GetRequiredService<TelemetryDbContext>();

            var vehicle = await EnsureTestVehicleAsync(db, "ULB_MH_NAGPUR", "MH31TEST-T22");

            var dto = new CreateOperationalSessionDto { UlbId = "ULB_MH_NAGPUR", VehicleId = vehicle.VehicleId, ScheduledStartAt = DateTime.UtcNow };
            var res = await sessionService.CreateSessionAsync(dto, "TEST_RUNNER");
            await transitionService.TransitionSessionAsync(res.Session!.OperationalSessionId, SessionStateCodes.Active, "TEST_RUNNER");
            await sessionService.CompleteAsync(res.Session.OperationalSessionId, "ULB_MH_NAGPUR", "OFFICER");

            var invalidRes = await transitionService.TransitionSessionAsync(res.Session.OperationalSessionId, SessionStateCodes.Active, "TEST_RUNNER");
            Assert.False(invalidRes.Success);
            Assert.Equal("INVALID_STATE_TRANSITION", invalidRes.ErrorCode);
        }

        [Fact]
        public async Task Test23_CompleteSession_ClearsReservation_SetsCompletedAt()
        {
            var sp = CreateTestServiceProvider();
            using var scope = sp.CreateScope();
            var sessionService = scope.ServiceProvider.GetRequiredService<IOperationalSessionService>();
            var transitionService = scope.ServiceProvider.GetRequiredService<IStateTransitionService>();
            var db = scope.ServiceProvider.GetRequiredService<TelemetryDbContext>();

            var vehicle = await EnsureTestVehicleAsync(db, "ULB_MH_NAGPUR", "MH31TEST-T23");

            var dto = new CreateOperationalSessionDto { UlbId = "ULB_MH_NAGPUR", VehicleId = vehicle.VehicleId, ScheduledStartAt = DateTime.UtcNow };
            var res = await sessionService.CreateSessionAsync(dto, "TEST_RUNNER");
            await transitionService.TransitionSessionAsync(res.Session!.OperationalSessionId, SessionStateCodes.Active, "TEST_RUNNER");

            var compRes = await sessionService.CompleteAsync(res.Session.OperationalSessionId, "ULB_MH_NAGPUR", "OFFICER", "OFFICER_NORMAL");
            Assert.True(compRes.Success);

            var completed = await sessionService.GetByIdAsync(res.Session.OperationalSessionId);
            Assert.False(completed!.IsActiveReservation);
            Assert.NotNull(completed.CompletedAt);
            Assert.Equal("OFFICER_NORMAL", completed.CompletionReason);
        }

        [Fact]
        public async Task Test24_AbortSession_MandatesReason_AndPersistsAbortReason()
        {
            var sp = CreateTestServiceProvider();
            using var scope = sp.CreateScope();
            var sessionService = scope.ServiceProvider.GetRequiredService<IOperationalSessionService>();
            var transitionService = scope.ServiceProvider.GetRequiredService<IStateTransitionService>();
            var db = scope.ServiceProvider.GetRequiredService<TelemetryDbContext>();

            var vehicle = await EnsureTestVehicleAsync(db, "ULB_MH_NAGPUR", "MH31TEST-T24");

            var dto = new CreateOperationalSessionDto { UlbId = "ULB_MH_NAGPUR", VehicleId = vehicle.VehicleId, ScheduledStartAt = DateTime.UtcNow };
            var res = await sessionService.CreateSessionAsync(dto, "TEST_RUNNER");
            await transitionService.TransitionSessionAsync(res.Session!.OperationalSessionId, SessionStateCodes.Active, "TEST_RUNNER");

            var failRes = await sessionService.AbortAsync(res.Session.OperationalSessionId, "ULB_MH_NAGPUR", "OFFICER", "");
            Assert.False(failRes.Success);
            Assert.Equal("REASON_REQUIRED", failRes.ErrorCode);

            var abortRes = await sessionService.AbortAsync(res.Session.OperationalSessionId, "ULB_MH_NAGPUR", "OFFICER", "VEHICLE_BREAKDOWN_FLAT_TYRE");
            Assert.True(abortRes.Success);

            var aborted = await sessionService.GetByIdAsync(res.Session.OperationalSessionId);
            Assert.False(aborted!.IsActiveReservation);
            Assert.Equal("VEHICLE_BREAKDOWN_FLAT_TYRE", aborted.AbortReason);
        }

        [Fact]
        public async Task Test25_CancelSession_FromScheduledState_Succeeds()
        {
            var sp = CreateTestServiceProvider();
            using var scope = sp.CreateScope();
            var sessionService = scope.ServiceProvider.GetRequiredService<IOperationalSessionService>();
            var db = scope.ServiceProvider.GetRequiredService<TelemetryDbContext>();

            var vehicle = await EnsureTestVehicleAsync(db, "ULB_MH_NAGPUR", "MH31TEST-T25");
            var dto = new CreateOperationalSessionDto { UlbId = "ULB_MH_NAGPUR", VehicleId = vehicle.VehicleId, ScheduledStartAt = DateTime.UtcNow.AddHours(2) };
            var res = await sessionService.CreateSessionAsync(dto, "TEST_RUNNER");

            var cancelRes = await sessionService.CancelAsync(res.Session!.OperationalSessionId, "ULB_MH_NAGPUR", "OFFICER");
            Assert.True(cancelRes.Success);

            var cancelled = await sessionService.GetByIdAsync(res.Session.OperationalSessionId);
            Assert.False(cancelled!.IsActiveReservation);
        }

        // ═══════════════════════════════════════════════════════════════════════════
        // GROUP D: Road Assignment & Proximity Diagnostic Tests
        // ═══════════════════════════════════════════════════════════════════════════

        [Fact]
        public async Task Test26_RoadAssignment_StoredAsWGS84_And_CalculatesMetricLength()
        {
            var sp = CreateTestServiceProvider();
            using var scope = sp.CreateScope();
            var roadService = scope.ServiceProvider.GetRequiredService<IRoadAssignmentService>();
            var sessionService = scope.ServiceProvider.GetRequiredService<IOperationalSessionService>();
            var db = scope.ServiceProvider.GetRequiredService<TelemetryDbContext>();

            var vehicle = await EnsureTestVehicleAsync(db, "ULB_MH_NAGPUR", "MH31TEST-T26");
            var (road, version) = await EnsureTestRoadAndVersionAsync(db, "ULB_MH_NAGPUR");

            var sessionRes = await sessionService.CreateSessionAsync(
                new CreateOperationalSessionDto { UlbId = "ULB_MH_NAGPUR", VehicleId = vehicle.VehicleId, ScheduledStartAt = DateTime.UtcNow }, "TEST_RUNNER");

            var assignment = await roadService.CreateAssignmentAsync(
                sessionId: sessionRes.Session!.OperationalSessionId,
                roadId: road.RoadId,
                roadGeometryVersionId: version.RoadGeometryVersionId,
                roadSegmentId: null,
                customGeometryWkt: null,
                bufferMeters: 100.0,
                assignmentType: "DEFAULT_SEGMENT",
                assignedOrder: 1,
                createdBy: "TEST_RUNNER");

            Assert.NotNull(assignment);
            Assert.Equal(4326, assignment.AssignedGeometry.SRID);
            Assert.Equal(100.0, assignment.BufferMeters);
        }

        [Fact]
        public void Test27_ProximityService_WithinBuffer_ReturnsIsWithinOperationalBoundary_True()
        {
            var sp = CreateTestServiceProvider();
            var proximity = sp.GetRequiredService<IProximityService>();

            var roadLine = Wgs84Factory.CreateLineString(new[]
            {
                new Coordinate(79.0880, 21.1450),
                new Coordinate(79.0890, 21.1460)
            });

            var assignment = new SessionRoadAssignment
            {
                AssignedGeometry = roadLine,
                BufferMeters = 100.0
            };

            var motion = new FusedVehicleMotion(3.2, "GNSS_ONLY", 0.9, true);
            var result = proximity.Evaluate(21.1455, 79.0885, motion, assignment, "ULB_MH_NAGPUR");

            Assert.True(result.IsWithinOperationalBoundary);
            Assert.True(result.IsBelowArmingSpeed);
            Assert.True(result.IsEligibleForArming);
            Assert.InRange(result.DistanceMeters, 0.0, 100.0);
            Assert.Equal("GNSS_ONLY", result.SpeedSource);
        }

        [Fact]
        public void Test28_ProximityService_OutsideBuffer_ReturnsIsWithinOperationalBoundary_False()
        {
            var sp = CreateTestServiceProvider();
            var proximity = sp.GetRequiredService<IProximityService>();

            var roadLine = Wgs84Factory.CreateLineString(new[]
            {
                new Coordinate(79.0880, 21.1450),
                new Coordinate(79.0890, 21.1460)
            });

            var assignment = new SessionRoadAssignment
            {
                AssignedGeometry = roadLine,
                BufferMeters = 100.0
            };

            var motion = new FusedVehicleMotion(2.0, "GNSS_ONLY", 0.9, true);
            var result = proximity.Evaluate(21.1550, 79.0885, motion, assignment, "ULB_MH_NAGPUR");

            Assert.False(result.IsWithinOperationalBoundary);
            Assert.False(result.IsEligibleForArming);
            Assert.True(result.DistanceMeters > 100.0);
        }

        [Fact]
        public void Test29_ProximityService_SpeedBelowThreshold_ArmingEligible()
        {
            var sp = CreateTestServiceProvider();
            var proximity = sp.GetRequiredService<IProximityService>();

            var roadLine = Wgs84Factory.CreateLineString(new[]
            {
                new Coordinate(77.7520, 20.9320),
                new Coordinate(77.7530, 20.9330)
            });

            var assignment = new SessionRoadAssignment { AssignedGeometry = roadLine, BufferMeters = 100.0 };
            var motion = new FusedVehicleMotion(4.5, "GNSS_ONLY", 0.95, true);

            var result = proximity.Evaluate(20.9325, 77.7525, motion, assignment, "ULB_MH_AMRAVATI");

            Assert.True(result.IsBelowArmingSpeed);
            Assert.True(result.IsEligibleForArming);
        }

        [Fact]
        public void Test30_ProximityService_SpeedAboveThreshold_ArmingIneligible()
        {
            var sp = CreateTestServiceProvider();
            var proximity = sp.GetRequiredService<IProximityService>();

            var roadLine = Wgs84Factory.CreateLineString(new[]
            {
                new Coordinate(77.7520, 20.9320),
                new Coordinate(77.7530, 20.9330)
            });

            var assignment = new SessionRoadAssignment { AssignedGeometry = roadLine, BufferMeters = 100.0 };
            var motion = new FusedVehicleMotion(15.0, "GNSS_ONLY", 0.95, true);

            var result = proximity.Evaluate(20.9325, 77.7525, motion, assignment, "ULB_MH_AMRAVATI");

            Assert.False(result.IsBelowArmingSpeed);
            Assert.False(result.IsEligibleForArming);
        }

        // ═══════════════════════════════════════════════════════════════════════════
        // GROUP E: Collection Event Spatial Resolution & Coverage Tests
        // ═══════════════════════════════════════════════════════════════════════════

        [Fact]
        public async Task Test31_CollectionEvent_ResolvesNearestRoadAssignment_FromPhysicalFacts()
        {
            var sp = CreateTestServiceProvider();
            using var scope = sp.CreateScope();
            var sessionService = scope.ServiceProvider.GetRequiredService<IOperationalSessionService>();
            var transitionService = scope.ServiceProvider.GetRequiredService<IStateTransitionService>();
            var collectionService = scope.ServiceProvider.GetRequiredService<ICollectionEventService>();
            var db = scope.ServiceProvider.GetRequiredService<TelemetryDbContext>();

            var (device, assignment) = await EnsureTestDeviceAndAssignmentAsync(db, "ULB_MH_NAGPUR", "MH31TEST-T31", "DEV-TEST-T31");
            var (road, version) = await EnsureTestRoadAndVersionAsync(db, "ULB_MH_NAGPUR");

            var roadLine = Wgs84Factory.CreateLineString(new[] { new Coordinate(79.0880, 21.1450), new Coordinate(79.0890, 21.1460) });
            var sessionDto = new CreateOperationalSessionDto
            {
                UlbId = "ULB_MH_NAGPUR",
                VehicleId = assignment.VehicleId,
                ScheduledStartAt = DateTime.UtcNow,
                RoadAssignments = new List<CreateRoadAssignmentDto>
                {
                    new() { RoadId = road.RoadId, RoadGeometryVersionId = version.RoadGeometryVersionId, BufferMeters = 100.0, AssignedOrder = 1, CustomGeometryWkt = roadLine.ToText() }
                }
            };

            var sessionRes = await sessionService.CreateSessionAsync(sessionDto, "TEST_RUNNER");
            Assert.True(sessionRes.Success);
            await transitionService.TransitionSessionAsync(sessionRes.Session!.OperationalSessionId, SessionStateCodes.Active, "TEST_RUNNER");

            var eventDto = new RecordCollectionEventDto
            {
                DeviceCode = device.DeviceCode,
                CapturedAt = DateTime.UtcNow,
                Latitude = 21.1455,
                Longitude = 79.0885,
                FusedSpeedKph = 2.5,
                MotionConfidence = 0.95
            };

            var eventRes = await collectionService.RecordCollectionEventAsync(eventDto);
            Assert.True(eventRes.Success);
            Assert.NotNull(eventRes.CollectionEventId);
            Assert.Equal(sessionRes.Session.OperationalSessionId, eventRes.OperationalSessionId);
            Assert.NotNull(eventRes.SessionRoadAssignmentId);
        }

        [Fact]
        public async Task Test32_CollectionEvent_AmbiguousAssignments_TieBreaksByAssignedOrder()
        {
            var sp = CreateTestServiceProvider();
            using var scope = sp.CreateScope();
            var sessionService = scope.ServiceProvider.GetRequiredService<IOperationalSessionService>();
            var transitionService = scope.ServiceProvider.GetRequiredService<IStateTransitionService>();
            var collectionService = scope.ServiceProvider.GetRequiredService<ICollectionEventService>();
            var db = scope.ServiceProvider.GetRequiredService<TelemetryDbContext>();

            var (device, assignment) = await EnsureTestDeviceAndAssignmentAsync(db, "ULB_MH_NAGPUR", "MH31TEST-T32", "DEV-TEST-T32");
            var (road, version) = await EnsureTestRoadAndVersionAsync(db, "ULB_MH_NAGPUR");

            var roadLine = Wgs84Factory.CreateLineString(new[] { new Coordinate(79.0880, 21.1450), new Coordinate(79.0890, 21.1460) });
            var sessionDto = new CreateOperationalSessionDto
            {
                UlbId = "ULB_MH_NAGPUR",
                VehicleId = assignment.VehicleId,
                ScheduledStartAt = DateTime.UtcNow,
                RoadAssignments = new List<CreateRoadAssignmentDto>
                {
                    new() { RoadId = road.RoadId, RoadGeometryVersionId = version.RoadGeometryVersionId, BufferMeters = 100.0, AssignedOrder = 1, CustomGeometryWkt = roadLine.ToText() },
                    new() { RoadId = road.RoadId, RoadGeometryVersionId = version.RoadGeometryVersionId, BufferMeters = 100.0, AssignedOrder = 2, CustomGeometryWkt = roadLine.ToText() }
                }
            };

            var sessionRes = await sessionService.CreateSessionAsync(sessionDto, "TEST_RUNNER");
            Assert.True(sessionRes.Success);
            await transitionService.TransitionSessionAsync(sessionRes.Session!.OperationalSessionId, SessionStateCodes.Active, "TEST_RUNNER");

            var eventDto = new RecordCollectionEventDto
            {
                DeviceCode = device.DeviceCode,
                CapturedAt = DateTime.UtcNow,
                Latitude = 21.1455,
                Longitude = 79.0885,
                FusedSpeedKph = 2.0,
                MotionConfidence = 0.9
            };

            var eventRes = await collectionService.RecordCollectionEventAsync(eventDto);
            Assert.True(eventRes.Success);
            Assert.NotNull(eventRes.TieBreakNote);
        }

        [Fact]
        public async Task Test33_CollectionEvent_NoActiveSession_Rejected()
        {
            var sp = CreateTestServiceProvider();
            using var scope = sp.CreateScope();
            var collectionService = scope.ServiceProvider.GetRequiredService<ICollectionEventService>();
            var db = scope.ServiceProvider.GetRequiredService<TelemetryDbContext>();

            var (device, _) = await EnsureTestDeviceAndAssignmentAsync(db, "ULB_MH_NAGPUR", "MH31TEST-T33", "DEV-TEST-T33");

            var eventDto = new RecordCollectionEventDto
            {
                DeviceCode = device.DeviceCode,
                CapturedAt = DateTime.UtcNow,
                Latitude = 21.1455,
                Longitude = 79.0885,
                FusedSpeedKph = 2.0,
                MotionConfidence = 0.9
            };

            var result = await collectionService.RecordCollectionEventAsync(eventDto);
            Assert.False(result.Success);
            Assert.Equal("NO_ACTIVE_SESSION", result.ErrorCode);
        }

        [Fact]
        public async Task Test34_CollectionEvent_AssociatesHousesWithin10m()
        {
            var sp = CreateTestServiceProvider();
            using var scope = sp.CreateScope();
            var sessionService = scope.ServiceProvider.GetRequiredService<IOperationalSessionService>();
            var transitionService = scope.ServiceProvider.GetRequiredService<IStateTransitionService>();
            var collectionService = scope.ServiceProvider.GetRequiredService<ICollectionEventService>();
            var db = scope.ServiceProvider.GetRequiredService<TelemetryDbContext>();

            var (device, assignment) = await EnsureTestDeviceAndAssignmentAsync(db, "ULB_MH_NAGPUR", "MH31TEST-T34", "DEV-TEST-T34");
            var (road, version) = await EnsureTestRoadAndVersionAsync(db, "ULB_MH_NAGPUR");

            var testHouse = new House
            {
                HouseId = $"TEST-HSE-{Guid.NewGuid().ToString()[..6]}",
                UlbId = "ULB_MH_NAGPUR",
                Latitude = 21.145501,
                Longitude = 79.088501,
                Location = Wgs84Factory.CreatePoint(new Coordinate(79.088501, 21.145501)),
                IsActive = true,
                CreatedAt = DateTime.UtcNow
            };
            db.Houses.Add(testHouse);
            await db.SaveChangesAsync();

            var roadLine = Wgs84Factory.CreateLineString(new[] { new Coordinate(79.0880, 21.1450), new Coordinate(79.0890, 21.1460) });
            var sessionDto = new CreateOperationalSessionDto
            {
                UlbId = "ULB_MH_NAGPUR",
                VehicleId = assignment.VehicleId,
                ScheduledStartAt = DateTime.UtcNow,
                RoadAssignments = new List<CreateRoadAssignmentDto>
                {
                    new() { RoadId = road.RoadId, RoadGeometryVersionId = version.RoadGeometryVersionId, BufferMeters = 100.0, AssignedOrder = 1, CustomGeometryWkt = roadLine.ToText() }
                }
            };

            var sessionRes = await sessionService.CreateSessionAsync(sessionDto, "TEST_RUNNER");
            Assert.True(sessionRes.Success);
            await transitionService.TransitionSessionAsync(sessionRes.Session!.OperationalSessionId, SessionStateCodes.Active, "TEST_RUNNER");

            var eventDto = new RecordCollectionEventDto
            {
                DeviceCode = device.DeviceCode,
                CapturedAt = DateTime.UtcNow,
                Latitude = 21.145500,
                Longitude = 79.088500,
                FusedSpeedKph = 2.0,
                MotionConfidence = 0.95
            };

            var eventRes = await collectionService.RecordCollectionEventAsync(eventDto);
            Assert.True(eventRes.Success);
            Assert.True(eventRes.ImpactedHousesCount >= 1);
        }

        [Fact]
        public async Task Test35_CoverageCalculation_PartialCoverage_ResultInMeters()
        {
            var sp = CreateTestServiceProvider();
            using var scope = sp.CreateScope();
            var coverageService = scope.ServiceProvider.GetRequiredService<ICoverageService>();
            var sessionService = scope.ServiceProvider.GetRequiredService<IOperationalSessionService>();
            var transitionService = scope.ServiceProvider.GetRequiredService<IStateTransitionService>();
            var collectionService = scope.ServiceProvider.GetRequiredService<ICollectionEventService>();
            var db = scope.ServiceProvider.GetRequiredService<TelemetryDbContext>();

            var (device, assignment) = await EnsureTestDeviceAndAssignmentAsync(db, "ULB_MH_NAGPUR", "MH31TEST-T35", "DEV-TEST-T35");
            var (road, version) = await EnsureTestRoadAndVersionAsync(db, "ULB_MH_NAGPUR");

            var roadLine = Wgs84Factory.CreateLineString(new[] { new Coordinate(79.0880, 21.1450), new Coordinate(79.0890, 21.1460) });
            var sessionDto = new CreateOperationalSessionDto
            {
                UlbId = "ULB_MH_NAGPUR",
                VehicleId = assignment.VehicleId,
                ScheduledStartAt = DateTime.UtcNow,
                RoadAssignments = new List<CreateRoadAssignmentDto>
                {
                    new() { RoadId = road.RoadId, RoadGeometryVersionId = version.RoadGeometryVersionId, BufferMeters = 100.0, AssignedOrder = 1, CustomGeometryWkt = roadLine.ToText() }
                }
            };

            var sessionRes = await sessionService.CreateSessionAsync(sessionDto, "TEST_RUNNER");
            Assert.True(sessionRes.Success);
            await transitionService.TransitionSessionAsync(sessionRes.Session!.OperationalSessionId, SessionStateCodes.Active, "TEST_RUNNER");

            var eventDto = new RecordCollectionEventDto
            {
                DeviceCode = device.DeviceCode,
                CapturedAt = DateTime.UtcNow,
                Latitude = 21.1455,
                Longitude = 79.0885,
                FusedSpeedKph = 2.0,
                MotionConfidence = 0.9
            };
            await collectionService.RecordCollectionEventAsync(eventDto);

            var coverage = await coverageService.GetSessionCoverageAsync(sessionRes.Session.OperationalSessionId);
            Assert.NotNull(coverage);
            Assert.True(coverage.TotalAssignedLengthMeters > 50.0);
            Assert.True(coverage.TotalCoveredLengthMeters > 0.0);
            Assert.True(coverage.OverallCoveragePercentage > 0.0 && coverage.OverallCoveragePercentage < 100.0);
        }

        [Fact]
        public async Task Test36_CoverageCalculation_100Percent_TriggersAutoCompletion()
        {
            var sp = CreateTestServiceProvider();
            using var scope = sp.CreateScope();
            var coverageService = scope.ServiceProvider.GetRequiredService<ICoverageService>();
            var sessionService = scope.ServiceProvider.GetRequiredService<IOperationalSessionService>();
            var transitionService = scope.ServiceProvider.GetRequiredService<IStateTransitionService>();
            var collectionService = scope.ServiceProvider.GetRequiredService<ICollectionEventService>();
            var resolver = scope.ServiceProvider.GetRequiredService<IStateDefinitionResolver>();
            var db = scope.ServiceProvider.GetRequiredService<TelemetryDbContext>();

            var (device, assignment) = await EnsureTestDeviceAndAssignmentAsync(db, "ULB_MH_NAGPUR", "MH31TEST-T36", "DEV-TEST-T36");
            var (road, version) = await EnsureTestRoadAndVersionAsync(db, "ULB_MH_NAGPUR");

            // 5-meter road segment
            var roadLine = Wgs84Factory.CreateLineString(new[] { new Coordinate(79.08850, 21.14550), new Coordinate(79.08855, 21.14555) });
            var sessionDto = new CreateOperationalSessionDto
            {
                UlbId = "ULB_MH_NAGPUR",
                VehicleId = assignment.VehicleId,
                ScheduledStartAt = DateTime.UtcNow,
                RoadAssignments = new List<CreateRoadAssignmentDto>
                {
                    new() { RoadId = road.RoadId, RoadGeometryVersionId = version.RoadGeometryVersionId, BufferMeters = 100.0, AssignedOrder = 1, CustomGeometryWkt = roadLine.ToText() }
                }
            };

            var sessionRes = await sessionService.CreateSessionAsync(sessionDto, "TEST_RUNNER");
            Assert.True(sessionRes.Success);
            await transitionService.TransitionSessionAsync(sessionRes.Session!.OperationalSessionId, SessionStateCodes.Active, "TEST_RUNNER");

            // Event with 10m buffer completely covers the 5m line
            var eventDto = new RecordCollectionEventDto
            {
                DeviceCode = device.DeviceCode,
                CapturedAt = DateTime.UtcNow,
                Latitude = 21.14552,
                Longitude = 79.08852,
                FusedSpeedKph = 2.0,
                MotionConfidence = 0.95
            };
            await collectionService.RecordCollectionEventAsync(eventDto);

            var completedStateId = await resolver.ResolveAsync(SessionStateCodes.EntityType, SessionStateCodes.Completed);
            var sessionAfter = await sessionService.GetByIdAsync(sessionRes.Session.OperationalSessionId);
            Assert.Equal(completedStateId, sessionAfter!.StatusStateDefinitionId);
            Assert.False(sessionAfter.IsActiveReservation);
        }

        // ═══════════════════════════════════════════════════════════════════════════
        // GROUP F: Audit, Speed Fusion, and ULB Scoping Tests
        // ═══════════════════════════════════════════════════════════════════════════

        [Fact]
        public async Task Test37_AuditService_RecordsSessionCreatedAuditLog()
        {
            var sp = CreateTestServiceProvider();
            using var scope = sp.CreateScope();
            var sessionService = scope.ServiceProvider.GetRequiredService<IOperationalSessionService>();
            var db = scope.ServiceProvider.GetRequiredService<TelemetryDbContext>();

            var vehicle = await EnsureTestVehicleAsync(db, "ULB_MH_NAGPUR", "MH31TEST-T37");
            var dto = new CreateOperationalSessionDto { UlbId = "ULB_MH_NAGPUR", VehicleId = vehicle.VehicleId, ScheduledStartAt = DateTime.UtcNow };
            var res = await sessionService.CreateSessionAsync(dto, "TEST_AUDIT_USER");

            var log = await db.AuditLogs
                .OrderByDescending(a => a.PerformedAt)
                .FirstOrDefaultAsync(a => a.EntityId == res.Session!.OperationalSessionId.ToString() && a.Action == "SESSION_CREATED");

            Assert.NotNull(log);
            Assert.Equal("TEST_AUDIT_USER", log.PerformedBy);
            Assert.Equal("ULB_MH_NAGPUR", log.UlbId);
        }

        [Fact]
        public void Test38_SpeedFusionService_FreshGnss_ReturnsGnssOnly()
        {
            var sp = CreateTestServiceProvider();
            var fusion = sp.GetRequiredService<ISpeedFusionService>();

            var result = fusion.Fuse(
                gnssSpeedKmh: 3.8,
                gnssFixValid: true,
                accelMagnitude: 0.2,
                gyroMagnitude: 0.05,
                gnssTimestamp: DateTime.UtcNow,
                imuTimestamp: DateTime.UtcNow);

            Assert.Equal(3.8, result.FusedSpeedKmh);
            Assert.Equal("GNSS_ONLY", result.Source);
            Assert.True(result.IsReliable);
        }

        [Fact]
        public async Task Test39_UlbScopeEnforcement_CrossUlbSessionMutation_Rejected()
        {
            var sp = CreateTestServiceProvider();
            using var scope = sp.CreateScope();
            var sessionService = scope.ServiceProvider.GetRequiredService<IOperationalSessionService>();
            var db = scope.ServiceProvider.GetRequiredService<TelemetryDbContext>();

            var vehicle = await EnsureTestVehicleAsync(db, "ULB_MH_NAGPUR", "MH31TEST-T39");
            var dto = new CreateOperationalSessionDto { UlbId = "ULB_MH_NAGPUR", VehicleId = vehicle.VehicleId, ScheduledStartAt = DateTime.UtcNow };
            var res = await sessionService.CreateSessionAsync(dto, "TEST_RUNNER");
            Assert.True(res.Success);

            // Amravati officer attempts to pause a Nagpur session
            var pauseRes = await sessionService.PauseAsync(res.Session!.OperationalSessionId, "ULB_MH_AMRAVATI", "OFFICER_AMRAVATI");
            Assert.False(pauseRes.Success);
            Assert.Equal("ULB_SCOPE_VIOLATION", pauseRes.ErrorCode);
        }
    }
}
