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
    /// <summary>
    /// Milestone 3 — Officer Session Operations End-to-End Workflow Integration Tests.
    /// Explicitly tests all 20 requirements against SQL Server test database.
    /// </summary>
    [Collection("DatabaseTests")]
    public class Milestone3OfficerWorkflowTests
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

            var configuration = new ConfigurationBuilder()
                .AddInMemoryCollection(inMemorySettings)
                .Build();

            var services = new ServiceCollection();
            services.AddSingleton<IConfiguration>(configuration);
            services.AddDbContext<TelemetryDbContext>(options =>
                options.UseSqlServer(ConnectionString, x => x.UseNetTopologySuite()));

            services.AddMemoryCache();
            services.AddSingleton<OperationalConstants>();
            services.AddSingleton<IStateDefinitionResolver, StateDefinitionResolver>();
            services.AddSingleton<ICoordinateProjectionService, CoordinateProjectionService>(sp =>
                new CoordinateProjectionService(configuration, NullLogger<CoordinateProjectionService>.Instance));
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

        private async Task<(UlbRegistry Ulb, VehicleRegistry Vehicle, DeviceRegistry Device, Road Road, RoadSegment Segment, RoadGeometryVersion Version)> ProvisionTestEntitiesAsync(TelemetryDbContext db, string ulbId = "ULB_MH_NAGPUR")
        {
            var ulb = await db.UlbRegistry.FirstOrDefaultAsync(u => u.UlbId == ulbId);
            if (ulb == null)
            {
                ulb = new UlbRegistry { UlbId = ulbId, UlbName = "Nagpur Municipal Corporation" };
                db.UlbRegistry.Add(ulb);
                await db.SaveChangesAsync();
            }

            var devCode = "DEV-M3-" + Guid.NewGuid().ToString("N")[..6].ToUpper();
            var device = new DeviceRegistry
            {
                DeviceCode = devCode,
                HardwareVersion = "v2.1",
                FirmwareVersion = "v2.0.0",
                IsActive = true,
                RegisteredAt = DateTime.UtcNow
            };
            db.DeviceRegistry.Add(device);

            var regNo = "MH31M3-" + Guid.NewGuid().ToString("N")[..6].ToUpper();
            var vehicle = new VehicleRegistry
            {
                UlbId = ulbId,
                VehicleRegistrationNumber = regNo,
                VehicleType = "GARBAGE_COMPACTOR",
                CapacityTons = 5.0,
                Status = "ACTIVE"
            };
            db.VehicleRegistry.Add(vehicle);
            await db.SaveChangesAsync();

            var assignment = new DeviceVehicleAssignment
            {
                DeviceId = device.DeviceId,
                VehicleId = vehicle.VehicleId,
                AssignedAt = DateTime.UtcNow,
                IsActive = true
            };
            db.DeviceVehicleAssignments.Add(assignment);

            var roadCode = "RD-M3-" + Guid.NewGuid().ToString("N")[..6].ToUpper();
            var road = new Road
            {
                UlbId = ulbId,
                RoadCode = roadCode,
                RoadName = "Milestone3 Test Boulevard",
                RoadType = "PRIMARY",
                IsActive = true
            };
            db.Roads.Add(road);
            await db.SaveChangesAsync();

            var lineGeom = Wgs84Factory.CreateLineString(new[]
            {
                new Coordinate(79.0882, 21.1458),
                new Coordinate(79.0892, 21.1468)
            });

            var geomVer = new RoadGeometryVersion
            {
                RoadId = road.RoadId,
                VersionNumber = 1,
                Geometry = lineGeom,
                EffectiveFrom = DateTime.UtcNow
            };
            db.RoadGeometryVersions.Add(geomVer);
            await db.SaveChangesAsync();

            var segment = new RoadSegment
            {
                RoadId = road.RoadId,
                RoadGeometryVersionId = geomVer.RoadGeometryVersionId,
                SegmentCode = "SEG-M3-01",
                SegmentName = "Sector A",
                Sequence = 1,
                Geometry = lineGeom,
                LengthMeters = 150.0,
                IsActive = true
            };
            db.RoadSegments.Add(segment);
            await db.SaveChangesAsync();

            return (ulb, vehicle, device, road, segment, geomVer);
        }

        // 1 & 2: Create scheduled session -> Verify no active reservation while SCHEDULED
        [Fact]
        public async Task M3_01_02_CreateScheduledSession_HasNoActiveReservation()
        {
            var sp = CreateTestServiceProvider();
            using var scope = sp.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<TelemetryDbContext>();
            var sessionService = scope.ServiceProvider.GetRequiredService<IOperationalSessionService>();

            var fixture = await ProvisionTestEntitiesAsync(db);

            var dto = new CreateOperationalSessionDto
            {
                UlbId = fixture.Ulb.UlbId,
                VehicleId = fixture.Vehicle.VehicleId,
                ScheduledStartAt = DateTime.UtcNow.AddHours(2), // Future
                RoadAssignments = new List<CreateRoadAssignmentDto>
                {
                    new() { RoadId = fixture.Road.RoadId, RoadGeometryVersionId = fixture.Version.RoadGeometryVersionId, BufferMeters = 100 }
                }
            };

            var res = await sessionService.CreateSessionAsync(dto, "OFFICER_TEST");
            Assert.True(res.Success);
            Assert.False(res.Session!.IsActiveReservation);

            // Re-verify in DB
            var dbSession = await db.OperationalSessions.FindAsync(res.Session.OperationalSessionId);
            Assert.NotNull(dbSession);
            Assert.False(dbSession.IsActiveReservation);
        }

        // 3 & 4: Scheduler activates session -> Verify ACTIVE reservation
        [Fact]
        public async Task M3_03_04_SchedulerActivation_SetsActiveReservation()
        {
            var sp = CreateTestServiceProvider();
            using var scope = sp.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<TelemetryDbContext>();
            var sessionService = scope.ServiceProvider.GetRequiredService<IOperationalSessionService>();

            var fixture = await ProvisionTestEntitiesAsync(db);

            var dto = new CreateOperationalSessionDto
            {
                UlbId = fixture.Ulb.UlbId,
                VehicleId = fixture.Vehicle.VehicleId,
                ScheduledStartAt = DateTime.UtcNow.AddSeconds(-5), // Due now
                RoadAssignments = new List<CreateRoadAssignmentDto>
                {
                    new() { RoadId = fixture.Road.RoadId, RoadGeometryVersionId = fixture.Version.RoadGeometryVersionId, BufferMeters = 100 }
                }
            };

            var createRes = await sessionService.CreateSessionAsync(dto, "OFFICER_TEST");
            Assert.True(createRes.Success);

            var activatedCount = await sessionService.ActivateScheduledSessionsAsync();
            Assert.True(activatedCount >= 1);

            var activeSession = await db.OperationalSessions.FindAsync(createRes.Session!.OperationalSessionId);
            Assert.NotNull(activeSession);
            Assert.True(activeSession.IsActiveReservation);
            Assert.NotNull(activeSession.ActualStartAt);
        }

        // 5 & 6: Pause session -> Verify PAUSED reservation remains
        [Fact]
        public async Task M3_05_06_PauseSession_RetainsActiveReservation()
        {
            var sp = CreateTestServiceProvider();
            using var scope = sp.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<TelemetryDbContext>();
            var sessionService = scope.ServiceProvider.GetRequiredService<IOperationalSessionService>();

            var fixture = await ProvisionTestEntitiesAsync(db);

            var dto = new CreateOperationalSessionDto
            {
                UlbId = fixture.Ulb.UlbId,
                VehicleId = fixture.Vehicle.VehicleId,
                ScheduledStartAt = DateTime.UtcNow.AddSeconds(-2),
                RoadAssignments = new List<CreateRoadAssignmentDto>
                {
                    new() { RoadId = fixture.Road.RoadId, RoadGeometryVersionId = fixture.Version.RoadGeometryVersionId, BufferMeters = 100 }
                }
            };

            var res = await sessionService.CreateSessionAsync(dto, "OFFICER_TEST");
            await sessionService.ActivateScheduledSessionsAsync();

            var pauseRes = await sessionService.PauseAsync(res.Session!.OperationalSessionId, fixture.Ulb.UlbId, "OFFICER_TEST");
            Assert.True(pauseRes.Success);

            var pausedSession = await db.OperationalSessions.FindAsync(res.Session.OperationalSessionId);
            Assert.NotNull(pausedSession);
            Assert.True(pausedSession.IsActiveReservation); // PAUSED still holds reservation!
        }

        // 7, 8, 9: Resume -> Complete manually -> Verify reservation released
        [Fact]
        public async Task M3_07_08_09_Resume_And_ManualComplete_ReleasesReservation()
        {
            var sp = CreateTestServiceProvider();
            using var scope = sp.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<TelemetryDbContext>();
            var sessionService = scope.ServiceProvider.GetRequiredService<IOperationalSessionService>();

            var fixture = await ProvisionTestEntitiesAsync(db);

            var dto = new CreateOperationalSessionDto
            {
                UlbId = fixture.Ulb.UlbId,
                VehicleId = fixture.Vehicle.VehicleId,
                ScheduledStartAt = DateTime.UtcNow.AddSeconds(-2),
                RoadAssignments = new List<CreateRoadAssignmentDto>
                {
                    new() { RoadId = fixture.Road.RoadId, RoadGeometryVersionId = fixture.Version.RoadGeometryVersionId, BufferMeters = 100 }
                }
            };

            var res = await sessionService.CreateSessionAsync(dto, "OFFICER_TEST");
            await sessionService.ActivateScheduledSessionsAsync();
            await sessionService.PauseAsync(res.Session!.OperationalSessionId, fixture.Ulb.UlbId, "OFFICER_TEST");

            // Resume
            var resumeRes = await sessionService.ResumeAsync(res.Session.OperationalSessionId, fixture.Ulb.UlbId, "OFFICER_TEST");
            Assert.True(resumeRes.Success);

            // Complete manually
            var compRes = await sessionService.CompleteAsync(res.Session.OperationalSessionId, fixture.Ulb.UlbId, "OFFICER_TEST", "OFFICER_NORMAL");
            Assert.True(compRes.Success);

            // Re-fetch from DB
            var finalSession = await db.OperationalSessions.FindAsync(res.Session.OperationalSessionId);
            Assert.NotNull(finalSession);
            Assert.False(finalSession.IsActiveReservation); // Released!
            Assert.NotNull(finalSession.CompletedAt);
            Assert.Equal("OFFICER_NORMAL", finalSession.CompletionReason);
        }

        // 10 & 11: Abort with reason vs Reject abort without reason
        [Fact]
        public async Task M3_10_11_AbortRequiresReason_AndReleasesReservation()
        {
            var sp = CreateTestServiceProvider();
            using var scope = sp.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<TelemetryDbContext>();
            var sessionService = scope.ServiceProvider.GetRequiredService<IOperationalSessionService>();

            var fixture = await ProvisionTestEntitiesAsync(db);

            var dto = new CreateOperationalSessionDto
            {
                UlbId = fixture.Ulb.UlbId,
                VehicleId = fixture.Vehicle.VehicleId,
                ScheduledStartAt = DateTime.UtcNow.AddSeconds(-2),
                RoadAssignments = new List<CreateRoadAssignmentDto>
                {
                    new() { RoadId = fixture.Road.RoadId, RoadGeometryVersionId = fixture.Version.RoadGeometryVersionId, BufferMeters = 100 }
                }
            };

            var res = await sessionService.CreateSessionAsync(dto, "OFFICER_TEST");
            await sessionService.ActivateScheduledSessionsAsync();

            // Attempt to abort without reason must fail
            var failAbort = await sessionService.AbortAsync(res.Session!.OperationalSessionId, fixture.Ulb.UlbId, "OFFICER_TEST", "");
            Assert.False(failAbort.Success);
            Assert.Equal("REASON_REQUIRED", failAbort.ErrorCode);

            // Abort with reason must succeed
            var okAbort = await sessionService.AbortAsync(res.Session.OperationalSessionId, fixture.Ulb.UlbId, "OFFICER_TEST", "VEHICLE_BREAKDOWN: Flat tyre on route");
            Assert.True(okAbort.Success);

            var abortedSession = await db.OperationalSessions.FindAsync(res.Session.OperationalSessionId);
            Assert.NotNull(abortedSession);
            Assert.False(abortedSession.IsActiveReservation);
            Assert.Equal("VEHICLE_BREAKDOWN: Flat tyre on route", abortedSession.AbortReason);
        }

        // 12: Reject second active session for same vehicle
        [Fact]
        public async Task M3_12_RejectSecondActiveSessionForSameVehicle()
        {
            var sp = CreateTestServiceProvider();
            using var scope = sp.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<TelemetryDbContext>();
            var sessionService = scope.ServiceProvider.GetRequiredService<IOperationalSessionService>();

            var fixture = await ProvisionTestEntitiesAsync(db);

            // Session 1: Active now
            var dto1 = new CreateOperationalSessionDto
            {
                UlbId = fixture.Ulb.UlbId,
                VehicleId = fixture.Vehicle.VehicleId,
                ScheduledStartAt = DateTime.UtcNow.AddSeconds(-1),
                RoadAssignments = new List<CreateRoadAssignmentDto>
                {
                    new() { RoadId = fixture.Road.RoadId, RoadGeometryVersionId = fixture.Version.RoadGeometryVersionId, BufferMeters = 100 }
                }
            };
            var res1 = await sessionService.CreateSessionAsync(dto1, "OFFICER_TEST");
            await sessionService.ActivateScheduledSessionsAsync();

            // Session 2: Attempting to create active session for same vehicle must fail with VEHICLE_RESERVED
            var dto2 = new CreateOperationalSessionDto
            {
                UlbId = fixture.Ulb.UlbId,
                VehicleId = fixture.Vehicle.VehicleId,
                ScheduledStartAt = DateTime.UtcNow.AddSeconds(-1),
                RoadAssignments = new List<CreateRoadAssignmentDto>
                {
                    new() { RoadId = fixture.Road.RoadId, RoadGeometryVersionId = fixture.Version.RoadGeometryVersionId, BufferMeters = 100 }
                }
            };
            var res2 = await sessionService.CreateSessionAsync(dto2, "OFFICER_TEST");
            Assert.False(res2.Success);
            Assert.Equal("VEHICLE_RESERVED", res2.ErrorCode);
        }

        // 13 & 14: Reject cross-ULB vehicle and cross-ULB road
        [Fact]
        public async Task M3_13_14_RejectCrossUlbVehicle_AndRoad()
        {
            var sp = CreateTestServiceProvider();
            using var scope = sp.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<TelemetryDbContext>();
            var sessionService = scope.ServiceProvider.GetRequiredService<IOperationalSessionService>();

            var nagpurFixture = await ProvisionTestEntitiesAsync(db, "ULB_MH_NAGPUR");
            var amravatiFixture = await ProvisionTestEntitiesAsync(db, "ULB_MH_AMRAVATI");

            // Attempt to assign Amravati vehicle to Nagpur session
            var dtoCrossVehicle = new CreateOperationalSessionDto
            {
                UlbId = "ULB_MH_NAGPUR",
                VehicleId = amravatiFixture.Vehicle.VehicleId, // Wrong ULB
                ScheduledStartAt = DateTime.UtcNow.AddHours(1),
                RoadAssignments = new List<CreateRoadAssignmentDto>
                {
                    new() { RoadId = nagpurFixture.Road.RoadId, RoadGeometryVersionId = nagpurFixture.Version.RoadGeometryVersionId, BufferMeters = 100 }
                }
            };
            var res1 = await sessionService.CreateSessionAsync(dtoCrossVehicle, "OFFICER_TEST");
            Assert.False(res1.Success);
            Assert.Equal("ULB_MISMATCH", res1.ErrorCode);

            // Attempt to assign Amravati road to Nagpur session
            var dtoCrossRoad = new CreateOperationalSessionDto
            {
                UlbId = "ULB_MH_NAGPUR",
                VehicleId = nagpurFixture.Vehicle.VehicleId,
                ScheduledStartAt = DateTime.UtcNow.AddHours(1),
                RoadAssignments = new List<CreateRoadAssignmentDto>
                {
                    new() { RoadId = amravatiFixture.Road.RoadId, RoadGeometryVersionId = amravatiFixture.Version.RoadGeometryVersionId, BufferMeters = 100 } // Wrong ULB
                }
            };
            var res2 = await sessionService.CreateSessionAsync(dtoCrossRoad, "OFFICER_TEST");
            Assert.False(res2.Success);
            Assert.Equal("ULB_MISMATCH", res2.ErrorCode);
        }

        // 15 & 16: Save trimmed AssignedGeometry -> Master RoadSegment unchanged
        [Fact]
        public async Task M3_15_16_SaveTrimmedAssignedGeometry_MasterSegmentUnchanged()
        {
            var sp = CreateTestServiceProvider();
            using var scope = sp.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<TelemetryDbContext>();
            var sessionService = scope.ServiceProvider.GetRequiredService<IOperationalSessionService>();

            var fixture = await ProvisionTestEntitiesAsync(db);

            var masterWktBefore = fixture.Segment.Geometry.ToText();

            // Trimmed geometry (shortened)
            var trimmedWkt = "LINESTRING (79.0885 21.146, 79.089 21.1465)";

            var dto = new CreateOperationalSessionDto
            {
                UlbId = fixture.Ulb.UlbId,
                VehicleId = fixture.Vehicle.VehicleId,
                ScheduledStartAt = DateTime.UtcNow.AddHours(1),
                RoadAssignments = new List<CreateRoadAssignmentDto>
                {
                    new()
                    {
                        RoadId = fixture.Road.RoadId,
                        RoadGeometryVersionId = fixture.Version.RoadGeometryVersionId,
                        RoadSegmentId = fixture.Segment.RoadSegmentId,
                        CustomGeometryWkt = trimmedWkt,
                        AssignmentType = "CUSTOM_SUBSEGMENT",
                        BufferMeters = 100
                    }
                }
            };

            var res = await sessionService.CreateSessionAsync(dto, "OFFICER_TEST");
            Assert.True(res.Success);

            // Verify the created SessionRoadAssignment has the trimmed geometry
            var assignment = await db.SessionRoadAssignments.FirstOrDefaultAsync(a => a.OperationalSessionId == res.Session!.OperationalSessionId);
            Assert.NotNull(assignment);
            Assert.Equal(trimmedWkt, assignment.AssignedGeometry.ToText());

            // Re-query master RoadSegment and verify it was NOT modified
            var segmentInDb = await db.RoadSegments.FindAsync(fixture.Segment.RoadSegmentId);
            Assert.NotNull(segmentInDb);
            Assert.Equal(masterWktBefore, segmentInDb.Geometry.ToText());
        }

        // 17 & 18: Verify automatic completion at 100% vs incomplete does not complete
        [Fact]
        public async Task M3_17_18_AutomaticCompletionAt100Percent()
        {
            var sp = CreateTestServiceProvider();
            using var scope = sp.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<TelemetryDbContext>();
            var sessionService = scope.ServiceProvider.GetRequiredService<IOperationalSessionService>();
            var coverageService = scope.ServiceProvider.GetRequiredService<ICoverageService>();
            var collectionService = scope.ServiceProvider.GetRequiredService<ICollectionEventService>();

            var fixture = await ProvisionTestEntitiesAsync(db);

            var dto = new CreateOperationalSessionDto
            {
                UlbId = fixture.Ulb.UlbId,
                VehicleId = fixture.Vehicle.VehicleId,
                ScheduledStartAt = DateTime.UtcNow.AddSeconds(-2),
                RoadAssignments = new List<CreateRoadAssignmentDto>
                {
                    new() { RoadId = fixture.Road.RoadId, RoadGeometryVersionId = fixture.Version.RoadGeometryVersionId, BufferMeters = 100 }
                }
            };

            var res = await sessionService.CreateSessionAsync(dto, "OFFICER_TEST");
            await sessionService.ActivateScheduledSessionsAsync();

            // Ingest partial collection event
            var eventDto = new RecordCollectionEventDto
            {
                DeviceCode = fixture.Device.DeviceCode,
                Latitude = 21.1458,
                Longitude = 79.0882,
                FusedSpeedKph = 3.0,
                MotionConfidence = 0.95
            };
            await collectionService.RecordCollectionEventAsync(eventDto);

            // Compute coverage: partial route should NOT auto-complete
            var partialCoverage = await coverageService.GetSessionCoverageAsync(res.Session.OperationalSessionId, fixture.Ulb.UlbId);
            Assert.NotNull(partialCoverage);
            Assert.True(partialCoverage.OverallCoveragePercentage < 100.0);

            var stillActive = await db.OperationalSessions.FindAsync(res.Session.OperationalSessionId);
            Assert.True(stillActive!.IsActiveReservation);
            Assert.Null(stillActive.CompletedAt);

            // Add events across the entire 150m segment to reach 100%
            for (double t = 0.0; t <= 1.0; t += 0.05)
            {
                double lat = 21.1458 + t * (21.1468 - 21.1458);
                double lon = 79.0882 + t * (79.0892 - 79.0882);

                await collectionService.RecordCollectionEventAsync(new RecordCollectionEventDto
                {
                    DeviceCode = fixture.Device.DeviceCode,
                    Latitude = lat,
                    Longitude = lon,
                    FusedSpeedKph = 3.0,
                    MotionConfidence = 0.95
                });
            }

            // Check and auto-complete session
            var completed = await coverageService.CheckAndAutoCompleteSessionAsync(res.Session.OperationalSessionId);
            Assert.True(completed);

            // Verify in fresh db context
            using var verifyScope = sp.CreateScope();
            var verifyDb = verifyScope.ServiceProvider.GetRequiredService<TelemetryDbContext>();
            var autoCompleted = await verifyDb.OperationalSessions.FindAsync(res.Session.OperationalSessionId);
            Assert.NotNull(autoCompleted!.CompletedAt);
            Assert.False(autoCompleted.IsActiveReservation); // Released!
            Assert.Equal("AUTO_COVERAGE_100", autoCompleted.CompletionReason);
        }

        // 19 & 20: Verify AuditLogs and EntityStateTransitions ledger populated accurately
        [Fact]
        public async Task M3_19_20_VerifyAuditLogs_AndStateTransitionsLedger()
        {
            var sp = CreateTestServiceProvider();
            using var scope = sp.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<TelemetryDbContext>();
            var sessionService = scope.ServiceProvider.GetRequiredService<IOperationalSessionService>();

            var fixture = await ProvisionTestEntitiesAsync(db);

            var dto = new CreateOperationalSessionDto
            {
                UlbId = fixture.Ulb.UlbId,
                VehicleId = fixture.Vehicle.VehicleId,
                ScheduledStartAt = DateTime.UtcNow.AddSeconds(-2),
                RoadAssignments = new List<CreateRoadAssignmentDto>
                {
                    new() { RoadId = fixture.Road.RoadId, RoadGeometryVersionId = fixture.Version.RoadGeometryVersionId, BufferMeters = 100 }
                }
            };

            var res = await sessionService.CreateSessionAsync(dto, "OFFICER_AUDIT_TEST");
            await sessionService.ActivateScheduledSessionsAsync();
            await sessionService.PauseAsync(res.Session!.OperationalSessionId, fixture.Ulb.UlbId, "OFFICER_AUDIT_TEST");
            await sessionService.ResumeAsync(res.Session.OperationalSessionId, fixture.Ulb.UlbId, "OFFICER_AUDIT_TEST");
            await sessionService.CompleteAsync(res.Session.OperationalSessionId, fixture.Ulb.UlbId, "OFFICER_AUDIT_TEST", "OFFICER_NORMAL");

            // Verify AuditLogs entries
            var auditLogs = await db.AuditLogs
                .Where(a => a.EntityType == "OPERATIONAL_SESSION" && a.EntityId == res.Session.OperationalSessionId.ToString())
                .OrderBy(a => a.PerformedAt)
                .ToListAsync();

            Assert.True(auditLogs.Count >= 4); // Created, Activated, Paused, Resumed, Completed
            Assert.Contains(auditLogs, a => a.Action == "SESSION_CREATED");
            Assert.Contains(auditLogs, a => a.Action == "SESSION_STATE_TRANSITION_PAUSED");
            Assert.Contains(auditLogs, a => a.Action == "SESSION_STATE_TRANSITION_COMPLETED");

            // Verify EntityStateTransitions ledger
            var sessionIdStr = res.Session.OperationalSessionId.ToString();
            var transitions = await db.EntityStateTransitions
                .Where(t => t.EntityType == "OPERATIONAL_SESSION" && t.EntityId == sessionIdStr)
                .OrderBy(t => t.ChangedAt)
                .ToListAsync();

            Assert.True(transitions.Count >= 3); // SCHEDULED->ACTIVE, ACTIVE->PAUSED, PAUSED->ACTIVE, ACTIVE->COMPLETED
            Assert.Contains(transitions, t => t.ChangedBy == "OFFICER_AUDIT_TEST");
        }
    }
}
