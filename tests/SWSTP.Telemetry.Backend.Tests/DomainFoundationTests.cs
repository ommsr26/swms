using System;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using NetTopologySuite.Geometries;
using SWSTP.Telemetry.Backend.Data;
using SWSTP.Telemetry.Backend.Models;
using Xunit;

namespace SWSTP.Telemetry.Backend.Tests
{
    [Collection("DatabaseTests")]
    public class DomainFoundationTests
    {
        private const string ConnectionString = "Server=192.168.1.8;Database=Solid_Waste;User ID=om.r;Password=Om@123;TrustServerCertificate=True;Connect Timeout=15;Encrypt=False;";

        private TelemetryDbContext CreateContext()
        {
            var options = new DbContextOptionsBuilder<TelemetryDbContext>()
                .UseSqlServer(ConnectionString, x => x.UseNetTopologySuite())
                .Options;

            return new TelemetryDbContext(options);
        }

        [Fact]
        public async Task StateDefinitions_SeedData_And_Uniqueness_Test()
        {
            using var db = CreateContext();

            // 1. Verify seed data exists for all 4 state-bearing domain entities
            var deviceStates = await db.StateDefinitions
                .Where(s => s.EntityType == "DEVICE")
                .Select(s => s.StateCode)
                .ToListAsync();

            Assert.Contains("IN_SERVICE", deviceStates);
            Assert.Contains("INVENTORY", deviceStates);
            Assert.Contains("PROVISIONED", deviceStates);
            Assert.Contains("MAINTENANCE", deviceStates);
            Assert.Contains("DISABLED", deviceStates);
            Assert.Contains("RETIRED", deviceStates);

            var vehicleStates = await db.StateDefinitions
                .Where(s => s.EntityType == "VEHICLE")
                .Select(s => s.StateCode)
                .ToListAsync();

            Assert.Contains("IN_SERVICE", vehicleStates);
            Assert.Contains("MAINTENANCE", vehicleStates);
            Assert.Contains("SUSPENDED", vehicleStates);
            Assert.Contains("DECOMMISSIONED", vehicleStates);

            var sessionStates = await db.StateDefinitions
                .Where(s => s.EntityType == "OPERATIONAL_SESSION")
                .Select(s => s.StateCode)
                .ToListAsync();

            Assert.Contains("SCHEDULED", sessionStates);
            Assert.Contains("ACTIVE", sessionStates);
            Assert.Contains("PAUSED", sessionStates);
            Assert.Contains("COMPLETED", sessionStates);
            Assert.Contains("CANCELLED", sessionStates);
            Assert.Contains("ABORTED", sessionStates);

            var collectionStates = await db.StateDefinitions
                .Where(s => s.EntityType == "COLLECTION_EVENT")
                .Select(s => s.StateCode)
                .ToListAsync();

            Assert.Contains("DETECTED", collectionStates);
            Assert.Contains("VERIFIED", collectionStates);
            Assert.Contains("FLAGGED", collectionStates);

            // 2. Verify duplicate (EntityType, StateCode) throws DbUpdateException
            var duplicate = new StateDefinition
            {
                EntityType = "VEHICLE",
                StateCode = "IN_SERVICE",
                DisplayName = "Duplicate In Service",
                CreatedAt = DateTime.UtcNow
            };

            db.StateDefinitions.Add(duplicate);
            await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
        }

        [Fact]
        public async Task EntityStateTransitions_AuditLedger_Test()
        {
            using var db = CreateContext();

            var inService = await db.StateDefinitions.FirstAsync(s => s.EntityType == "VEHICLE" && s.StateCode == "IN_SERVICE");
            var maintenance = await db.StateDefinitions.FirstAsync(s => s.EntityType == "VEHICLE" && s.StateCode == "MAINTENANCE");

            var transition = new EntityStateTransition
            {
                EntityType = "VEHICLE",
                EntityId = "1", // vehicleId string-encoded
                PreviousStateDefinitionId = inService.StateDefinitionId,
                NewStateDefinitionId = maintenance.StateDefinitionId,
                ChangedAt = DateTime.UtcNow,
                ChangedBy = "SYSTEM_TEST_RUNNER",
                Reason = "Hydraulic pressure sensor warning",
                Source = "EDGE_WATCHDOG"
            };

            db.EntityStateTransitions.Add(transition);
            await db.SaveChangesAsync();

            Assert.True(transition.StateTransitionId > 0);

            // Cleanup test record
            db.EntityStateTransitions.Remove(transition);
            await db.SaveChangesAsync();
        }

        [Fact]
        public async Task OperationalSession_OneActiveReservationPerVehicle_Constraint_Test()
        {
            using var db = CreateContext();

            // Ensure test ULB and test vehicle exist
            var ulb = await db.UlbRegistry.FirstOrDefaultAsync(u => u.UlbId == "ULB_MH_NAGPUR");
            if (ulb == null)
            {
                ulb = new UlbRegistry { UlbId = "ULB_MH_NAGPUR", UlbName = "Nagpur Municipal Corporation" };
                db.UlbRegistry.Add(ulb);
                await db.SaveChangesAsync();
            }

            var vehicle = await db.VehicleRegistry.FirstOrDefaultAsync(v => v.VehicleRegistrationNumber == "MH31TEST9999");
            if (vehicle == null)
            {
                vehicle = new VehicleRegistry
                {
                    VehicleRegistrationNumber = "MH31TEST9999",
                    VehicleType = "GARBAGE_COMPACTOR",
                    UlbId = ulb.UlbId,
                    Status = "IN_SERVICE"
                };
                db.VehicleRegistry.Add(vehicle);
                await db.SaveChangesAsync();
            }

            var activeState = await db.StateDefinitions.FirstAsync(s => s.EntityType == "OPERATIONAL_SESSION" && s.StateCode == "ACTIVE");
            var pausedState = await db.StateDefinitions.FirstAsync(s => s.EntityType == "OPERATIONAL_SESSION" && s.StateCode == "PAUSED");

            var oldRes = await db.OperationalSessions.Where(s => s.VehicleId == vehicle.VehicleId && s.IsActiveReservation).ToListAsync();
            if (oldRes.Count > 0)
            {
                foreach (var o in oldRes) o.IsActiveReservation = false;
                await db.SaveChangesAsync();
            }

            var session1 = new OperationalSession
            {
                UlbId = ulb.UlbId,
                VehicleId = vehicle.VehicleId,
                SessionCode = "OPS-TEST-" + Guid.NewGuid().ToString("N")[..8],
                Name = "Morning Ward 12 Route",
                StatusStateDefinitionId = activeState.StateDefinitionId,
                IsActiveReservation = true,
                ScheduledStartAt = DateTime.UtcNow,
                ActualStartAt = DateTime.UtcNow,
                CreatedAt = DateTime.UtcNow
            };

            db.OperationalSessions.Add(session1);
            await db.SaveChangesAsync();

            // Attempting to create a second concurrent session with IsActiveReservation = true for the same vehicle MUST fail
            var session2 = new OperationalSession
            {
                UlbId = ulb.UlbId,
                VehicleId = vehicle.VehicleId,
                SessionCode = "OPS-TEST-" + Guid.NewGuid().ToString("N")[..8],
                Name = "Overlapping Paused Session",
                StatusStateDefinitionId = pausedState.StateDefinitionId,
                IsActiveReservation = true,
                ScheduledStartAt = DateTime.UtcNow,
                ActualStartAt = DateTime.UtcNow,
                CreatedAt = DateTime.UtcNow
            };

            db.OperationalSessions.Add(session2);
            await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());

            // Cleanup test session
            using var cleanupDb = CreateContext();
            var toRemove = await cleanupDb.OperationalSessions.FindAsync(session1.OperationalSessionId);
            if (toRemove != null)
            {
                cleanupDb.OperationalSessions.Remove(toRemove);
                await cleanupDb.SaveChangesAsync();
            }
        }

        [Fact]
        public async Task Road_GeometryVersioning_And_Segments_Test()
        {
            using var db = CreateContext();

            var ulbId = "ULB_MH_NAGPUR";
            var roadCode = "RD-TEST-" + Guid.NewGuid().ToString("N")[..6];

            var road = new Road
            {
                UlbId = ulbId,
                RoadCode = roadCode,
                RoadName = "Wardha Road Test Bypass",
                RoadType = "PRIMARY",
                IsActive = true,
                CreatedAt = DateTime.UtcNow
            };

            db.Roads.Add(road);
            await db.SaveChangesAsync();

            var geometryFactory = new GeometryFactory(new PrecisionModel(), 4326);
            var line = geometryFactory.CreateLineString(new[]
            {
                new Coordinate(79.0882, 21.1458),
                new Coordinate(79.0895, 21.1472),
                new Coordinate(79.0910, 21.1490)
            });

            var version = new RoadGeometryVersion
            {
                RoadId = road.RoadId,
                VersionNumber = 1,
                Geometry = line,
                EffectiveFrom = DateTime.UtcNow,
                CreatedAt = DateTime.UtcNow
            };

            db.RoadGeometryVersions.Add(version);
            await db.SaveChangesAsync();

            var segment = new RoadSegment
            {
                RoadId = road.RoadId,
                RoadGeometryVersionId = version.RoadGeometryVersionId,
                SegmentCode = roadCode + "-SEG-01",
                SegmentName = "Bypass Section 1",
                Geometry = line,
                LengthMeters = 420.5,
                Sequence = 1,
                IsActive = true,
                CreatedAt = DateTime.UtcNow
            };

            db.RoadSegments.Add(segment);
            await db.SaveChangesAsync();

            Assert.True(segment.RoadSegmentId > 0);
            Assert.Equal(version.RoadGeometryVersionId, segment.RoadGeometryVersionId);

            // Cleanup
            db.RoadSegments.Remove(segment);
            db.RoadGeometryVersions.Remove(version);
            db.Roads.Remove(road);
            await db.SaveChangesAsync();
        }

        [Fact]
        public async Task CollectionEvent_DualTimestamp_And_EvidenceImage_Expiry_Test()
        {
            using var db = CreateContext();

            var ulb = await db.UlbRegistry.FirstOrDefaultAsync(u => u.UlbId == "ULB_MH_NAGPUR");
            if (ulb == null)
            {
                ulb = new UlbRegistry { UlbId = "ULB_MH_NAGPUR", UlbName = "Nagpur Municipal Corporation" };
                db.UlbRegistry.Add(ulb);
                await db.SaveChangesAsync();
            }

            var vehicle = await db.VehicleRegistry.FirstOrDefaultAsync(v => v.UlbId == ulb.UlbId);
            if (vehicle == null)
            {
                vehicle = new VehicleRegistry
                {
                    VehicleRegistrationNumber = "MH31EV" + Guid.NewGuid().ToString("N")[..4],
                    VehicleType = "GARBAGE_COMPACTOR",
                    UlbId = ulb.UlbId,
                    Status = "IN_SERVICE"
                };
                db.VehicleRegistry.Add(vehicle);
                await db.SaveChangesAsync();
            }

            var activeSessionState = await db.StateDefinitions.FirstAsync(s => s.EntityType == "OPERATIONAL_SESSION" && s.StateCode == "ACTIVE");
            var eventState = await db.StateDefinitions.FirstAsync(s => s.EntityType == "COLLECTION_EVENT" && s.StateCode == "DETECTED");

            var geometryFactory = new GeometryFactory(new PrecisionModel(), 4326);
            var line = geometryFactory.CreateLineString(new[] { new Coordinate(79.0882, 21.1458), new Coordinate(79.0910, 21.1490) });

            var road = new Road { UlbId = ulb.UlbId, RoadCode = "RD-EV-" + Guid.NewGuid().ToString("N")[..6], RoadName = "Evidence Test Road", CreatedAt = DateTime.UtcNow };
            db.Roads.Add(road);
            await db.SaveChangesAsync();

            var version = new RoadGeometryVersion { RoadId = road.RoadId, VersionNumber = 1, Geometry = line, CreatedAt = DateTime.UtcNow };
            db.RoadGeometryVersions.Add(version);
            await db.SaveChangesAsync();

            var session = new OperationalSession
            {
                UlbId = ulb.UlbId,
                VehicleId = vehicle.VehicleId,
                SessionCode = "OPS-EV-" + Guid.NewGuid().ToString("N")[..6],
                Name = "Evidence Test Session",
                StatusStateDefinitionId = activeSessionState.StateDefinitionId,
                IsActiveReservation = false, // false to prevent conflicting with active reservations
                ScheduledStartAt = DateTime.UtcNow,
                CreatedAt = DateTime.UtcNow
            };
            db.OperationalSessions.Add(session);
            await db.SaveChangesAsync();

            var assignment = new SessionRoadAssignment
            {
                OperationalSessionId = session.OperationalSessionId,
                RoadId = road.RoadId,
                RoadGeometryVersionId = version.RoadGeometryVersionId,
                AssignedGeometry = line,
                BufferMeters = 100.0,
                AssignmentType = "DEFAULT_SEGMENT",
                AssignedOrder = 1,
                CreatedAt = DateTime.UtcNow
            };
            db.SessionRoadAssignments.Add(assignment);
            await db.SaveChangesAsync();

            var rtcCaptureTime = DateTime.UtcNow.AddSeconds(-5); // Edge RTC timestamp
            var serverReceiptTime = DateTime.UtcNow;              // Server ingestion timestamp

            var colEvent = new CollectionEvent
            {
                OperationalSessionId = session.OperationalSessionId,
                SessionRoadAssignmentId = assignment.SessionRoadAssignmentId,
                VehicleId = vehicle.VehicleId,
                CapturedAt = rtcCaptureTime,
                ReceivedAt = serverReceiptTime,
                Latitude = 21.1460,
                Longitude = 79.0885,
                Location = geometryFactory.CreatePoint(new Coordinate(79.0885, 21.1460)),
                FusedSpeedKph = 3.2,
                MotionConfidence = 0.94,
                DistanceToRoadMeters = 4.8,
                StatusStateDefinitionId = eventState.StateDefinitionId,
                CreatedAt = serverReceiptTime
            };
            db.CollectionEvents.Add(colEvent);
            await db.SaveChangesAsync();

            var image = new EvidenceImage
            {
                CollectionEventId = colEvent.CollectionEventId,
                RelativePath = $"sessionimages/{ulb.UlbId}/2026/08/{session.OperationalSessionId}/{Guid.NewGuid():N}.jpg",
                CapturedAt = rtcCaptureTime,
                ExpiresAt = rtcCaptureTime.AddDays(21),
                FileSizeBytes = 148200,
                Width = 1920,
                Height = 1080,
                CompressionQuality = 70,
                DeletedAt = null,
                CreatedAt = serverReceiptTime
            };
            db.EvidenceImages.Add(image);
            await db.SaveChangesAsync();

            Assert.True(image.IsAvailable);
            Assert.False(image.IsExpired);
            Assert.False(image.IsDeleted);

            // Cleanup
            db.EvidenceImages.Remove(image);
            db.CollectionEvents.Remove(colEvent);
            db.SessionRoadAssignments.Remove(assignment);
            db.OperationalSessions.Remove(session);
            db.RoadGeometryVersions.Remove(version);
            db.Roads.Remove(road);
            await db.SaveChangesAsync();
        }

        [Fact]
        public async Task House_SpatialLocation_And_CollectionEventHouse_Test()
        {
            using var db = CreateContext();

            var ulb = await db.UlbRegistry.FirstAsync(u => u.UlbId == "ULB_MH_NAGPUR");
            var vehicle = await db.VehicleRegistry.FirstAsync(v => v.UlbId == ulb.UlbId);
            var activeSessionState = await db.StateDefinitions.FirstAsync(s => s.EntityType == "OPERATIONAL_SESSION" && s.StateCode == "ACTIVE");
            var eventState = await db.StateDefinitions.FirstAsync(s => s.EntityType == "COLLECTION_EVENT" && s.StateCode == "DETECTED");

            var geometryFactory = new GeometryFactory(new PrecisionModel(), 4326);
            var line = geometryFactory.CreateLineString(new[] { new Coordinate(79.0882, 21.1458), new Coordinate(79.0910, 21.1490) });

            var houseId = "HS-" + Guid.NewGuid().ToString("N")[..8];
            var house = new House
            {
                HouseId = houseId,
                UlbId = ulb.UlbId,
                Latitude = 21.1461,
                Longitude = 79.0886,
                Location = geometryFactory.CreatePoint(new Coordinate(79.0886, 21.1461)),
                Address = "Plot 42, Civil Lines, Nagpur",
                IsActive = true,
                CreatedAt = DateTime.UtcNow
            };
            db.Houses.Add(house);
            await db.SaveChangesAsync();

            var road = new Road { UlbId = ulb.UlbId, RoadCode = "RD-HS-" + Guid.NewGuid().ToString("N")[..6], RoadName = "House Test Road", CreatedAt = DateTime.UtcNow };
            db.Roads.Add(road);
            await db.SaveChangesAsync();

            var version = new RoadGeometryVersion { RoadId = road.RoadId, VersionNumber = 1, Geometry = line, CreatedAt = DateTime.UtcNow };
            db.RoadGeometryVersions.Add(version);
            await db.SaveChangesAsync();

            var session = new OperationalSession
            {
                UlbId = ulb.UlbId,
                VehicleId = vehicle.VehicleId,
                SessionCode = "OPS-HS-" + Guid.NewGuid().ToString("N")[..6],
                Name = "House Association Test Session",
                StatusStateDefinitionId = activeSessionState.StateDefinitionId,
                IsActiveReservation = false,
                ScheduledStartAt = DateTime.UtcNow,
                CreatedAt = DateTime.UtcNow
            };
            db.OperationalSessions.Add(session);
            await db.SaveChangesAsync();

            var assignment = new SessionRoadAssignment
            {
                OperationalSessionId = session.OperationalSessionId,
                RoadId = road.RoadId,
                RoadGeometryVersionId = version.RoadGeometryVersionId,
                AssignedGeometry = line,
                BufferMeters = 100.0,
                AssignmentType = "DEFAULT_SEGMENT",
                AssignedOrder = 1,
                CreatedAt = DateTime.UtcNow
            };
            db.SessionRoadAssignments.Add(assignment);
            await db.SaveChangesAsync();

            var colEvent = new CollectionEvent
            {
                OperationalSessionId = session.OperationalSessionId,
                SessionRoadAssignmentId = assignment.SessionRoadAssignmentId,
                VehicleId = vehicle.VehicleId,
                CapturedAt = DateTime.UtcNow,
                ReceivedAt = DateTime.UtcNow,
                Latitude = 21.1461,
                Longitude = 79.0886,
                Location = geometryFactory.CreatePoint(new Coordinate(79.0886, 21.1461)),
                FusedSpeedKph = 2.5,
                MotionConfidence = 0.98,
                DistanceToRoadMeters = 3.2,
                StatusStateDefinitionId = eventState.StateDefinitionId,
                CreatedAt = DateTime.UtcNow
            };
            db.CollectionEvents.Add(colEvent);
            await db.SaveChangesAsync();

            var eventHouse = new CollectionEventHouse
            {
                CollectionEventId = colEvent.CollectionEventId,
                HouseId = house.HouseId,
                DistanceMeters = 4.5,
                CoverageRadiusMeters = 10.0,
                CreatedAt = DateTime.UtcNow
            };
            db.CollectionEventHouses.Add(eventHouse);
            await db.SaveChangesAsync();

            Assert.True(eventHouse.CollectionEventHouseId > 0);

            // Cleanup
            db.CollectionEventHouses.Remove(eventHouse);
            db.CollectionEvents.Remove(colEvent);
            db.SessionRoadAssignments.Remove(assignment);
            db.OperationalSessions.Remove(session);
            db.RoadGeometryVersions.Remove(version);
            db.Roads.Remove(road);
            db.Houses.Remove(house);
            await db.SaveChangesAsync();
        }

        [Fact]
        public async Task ContinuousTelemetry_Regression_Test()
        {
            using var db = CreateContext();

            // Verify continuous telemetry tables can be queried without errors
            var sampleCount = await db.TelemetryPackets.AsNoTracking().CountAsync();
            var imuCount = await db.ImuSamples.AsNoTracking().CountAsync();
            var gnssCount = await db.GnssSamples.AsNoTracking().CountAsync();

            Assert.True(sampleCount >= 0);
            Assert.True(imuCount >= 0);
            Assert.True(gnssCount >= 0);
        }
    }
}
