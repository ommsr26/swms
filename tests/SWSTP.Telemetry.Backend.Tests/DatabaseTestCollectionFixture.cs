using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using SWSTP.Telemetry.Backend.Data;
using Xunit;

namespace SWSTP.Telemetry.Backend.Tests
{
    public class DatabaseTestCollectionFixture : IAsyncLifetime
    {
        private const string ConnectionString = "Server=192.168.1.8;Database=Solid_Waste;User ID=om.r;Password=Om@123;TrustServerCertificate=True;Connect Timeout=15;Encrypt=False;";

        public async Task InitializeAsync()
        {
            await CleanDatabaseAsync();
        }

        public async Task DisposeAsync()
        {
            await CleanDatabaseAsync();
        }

        public static async Task CleanDatabaseAsync()
        {
            var options = new DbContextOptionsBuilder<TelemetryDbContext>()
                .UseSqlServer(ConnectionString, x => x.UseNetTopologySuite())
                .Options;

            using var db = new TelemetryDbContext(options);
            await db.Database.ExecuteSqlRawAsync(@"
                DECLARE @TestVehicleIds TABLE (VehicleId BIGINT);
                INSERT INTO @TestVehicleIds
                SELECT VehicleId FROM VehicleRegistry WHERE VehicleRegistrationNumber LIKE '%M3-%' OR VehicleRegistrationNumber LIKE '%TEST%' OR VehicleRegistrationNumber LIKE '%M2B%' OR VehicleRegistrationNumber LIKE '%MH31EV%';

                DECLARE @TestDeviceIds TABLE (DeviceId BIGINT);
                INSERT INTO @TestDeviceIds
                SELECT DeviceId FROM DeviceRegistry WHERE DeviceCode LIKE 'DEV-M3-%' OR DeviceCode LIKE '%TEST%' OR DeviceCode LIKE 'DEV-M2B-%';

                DECLARE @TestRoadIds TABLE (RoadId BIGINT);
                INSERT INTO @TestRoadIds
                SELECT RoadId FROM Roads WHERE RoadCode LIKE 'RD-M3-%' OR RoadCode LIKE '%TEST%' OR RoadCode LIKE 'RD-M2B-%';

                DECLARE @TestSessionIds TABLE (OperationalSessionId BIGINT);
                INSERT INTO @TestSessionIds
                SELECT OperationalSessionId FROM OperationalSessions 
                WHERE VehicleId IN (SELECT VehicleId FROM @TestVehicleIds)
                   OR SessionCode LIKE 'OPS-TEST%' OR SessionCode LIKE 'SES-TEST%' OR SessionCode LIKE '%TEST%'
                   OR CreatedBy IN ('OFFICER_TEST', 'OFFICER_AUDIT_TEST', 'TEST_RUNNER');

                DELETE FROM EvidenceImages WHERE CollectionEventId IN (SELECT CollectionEventId FROM CollectionEvents WHERE OperationalSessionId IN (SELECT OperationalSessionId FROM @TestSessionIds) OR VehicleId IN (SELECT VehicleId FROM @TestVehicleIds));
                DELETE FROM CollectionEvents WHERE OperationalSessionId IN (SELECT OperationalSessionId FROM @TestSessionIds) OR VehicleId IN (SELECT VehicleId FROM @TestVehicleIds);
                DELETE FROM SessionRoadAssignments WHERE OperationalSessionId IN (SELECT OperationalSessionId FROM @TestSessionIds) OR RoadId IN (SELECT RoadId FROM @TestRoadIds);
                DELETE FROM OperationalSessions WHERE OperationalSessionId IN (SELECT OperationalSessionId FROM @TestSessionIds);
                DELETE FROM EntityStateTransitions WHERE ChangedBy IN ('OFFICER_TEST', 'OFFICER_AUDIT_TEST', 'TEST_RUNNER') OR (EntityType = 'OPERATIONAL_SESSION' AND EntityId NOT IN (SELECT CAST(OperationalSessionId AS NVARCHAR(100)) FROM OperationalSessions));
                DELETE FROM AuditLogs WHERE PerformedBy IN ('OFFICER_TEST', 'OFFICER_AUDIT_TEST', 'TEST_RUNNER') OR (EntityType = 'OPERATIONAL_SESSION' AND EntityId NOT IN (SELECT CAST(OperationalSessionId AS NVARCHAR(100)) FROM OperationalSessions));
                DELETE FROM RoadSegments WHERE RoadGeometryVersionId IN (SELECT RoadGeometryVersionId FROM RoadGeometryVersions WHERE RoadId IN (SELECT RoadId FROM @TestRoadIds));
                DELETE FROM RoadGeometryVersions WHERE RoadId IN (SELECT RoadId FROM @TestRoadIds);
                DELETE FROM Roads WHERE RoadId IN (SELECT RoadId FROM @TestRoadIds);
                DELETE FROM [DeviceVehicleAssignment] WHERE DeviceId IN (SELECT DeviceId FROM @TestDeviceIds) OR VehicleId IN (SELECT VehicleId FROM @TestVehicleIds);
                DELETE FROM DeviceRegistry WHERE DeviceId IN (SELECT DeviceId FROM @TestDeviceIds);
                DELETE FROM VehicleRegistry WHERE VehicleId IN (SELECT VehicleId FROM @TestVehicleIds);
            ");
        }
    }

    [CollectionDefinition("DatabaseTests")]
    public class DatabaseTestCollection : ICollectionFixture<DatabaseTestCollectionFixture>
    {
    }
}
