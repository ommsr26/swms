$connStr = "Server=192.168.1.8;Database=Solid_Waste;User ID=om.r;Password=Om@123;TrustServerCertificate=True;Connect Timeout=15;Encrypt=False;"
$conn = New-Object System.Data.SqlClient.SqlConnection($connStr)
$conn.Open()

Write-Host "========================================="
Write-Host "CLEANING UP TEST/DEVELOPMENT FIXTURES"
Write-Host "========================================="

$tx = $conn.BeginTransaction()
try {
    $cmd = $conn.CreateCommand()
    $cmd.Transaction = $tx
    $cmd.CommandText = @"
        -- 1. Identify test vehicles and test devices
        DECLARE @TestVehicleIds TABLE (VehicleId BIGINT);
        INSERT INTO @TestVehicleIds
        SELECT VehicleId FROM VehicleRegistry 
        WHERE VehicleRegistrationNumber LIKE '%M3-%' 
           OR VehicleRegistrationNumber LIKE '%TEST%' 
           OR VehicleRegistrationNumber LIKE '%M2B%'
           OR VehicleRegistrationNumber LIKE '%MH31EV%'
           OR VehicleRegistrationNumber LIKE 'MH31M3-%';

        DECLARE @TestDeviceIds TABLE (DeviceId BIGINT);
        INSERT INTO @TestDeviceIds
        SELECT DeviceId FROM DeviceRegistry 
        WHERE DeviceCode LIKE 'DEV-M3-%' 
           OR DeviceCode LIKE '%TEST%' 
           OR DeviceCode LIKE 'DEV-M2B-%';

        DECLARE @TestRoadIds TABLE (RoadId BIGINT);
        INSERT INTO @TestRoadIds
        SELECT RoadId FROM Roads 
        WHERE RoadCode LIKE 'RD-M3-%' 
           OR RoadCode LIKE '%TEST%' 
           OR RoadCode LIKE 'RD-M2B-%';

        DECLARE @TestSessionIds TABLE (OperationalSessionId BIGINT);
        INSERT INTO @TestSessionIds
        SELECT OperationalSessionId FROM OperationalSessions 
        WHERE VehicleId IN (SELECT VehicleId FROM @TestVehicleIds)
           OR SessionCode LIKE 'OPS-TEST%' 
           OR SessionCode LIKE 'SES-TEST%' 
           OR SessionCode LIKE '%TEST%'
           OR CreatedBy IN ('OFFICER_TEST', 'OFFICER_AUDIT_TEST', 'TEST_RUNNER');

        -- Delete EvidenceImages
        DELETE FROM EvidenceImages 
        WHERE CollectionEventId IN (
            SELECT CollectionEventId FROM CollectionEvents 
            WHERE OperationalSessionId IN (SELECT OperationalSessionId FROM @TestSessionIds)
               OR VehicleId IN (SELECT VehicleId FROM @TestVehicleIds)
        );

        -- Delete CollectionEvents
        DELETE FROM CollectionEvents 
        WHERE OperationalSessionId IN (SELECT OperationalSessionId FROM @TestSessionIds)
           OR VehicleId IN (SELECT VehicleId FROM @TestVehicleIds);

        -- Delete SessionRoadAssignments
        DELETE FROM SessionRoadAssignments 
        WHERE OperationalSessionId IN (SELECT OperationalSessionId FROM @TestSessionIds)
           OR RoadId IN (SELECT RoadId FROM @TestRoadIds);

        -- Delete OperationalSessions
        DELETE FROM OperationalSessions 
        WHERE OperationalSessionId IN (SELECT OperationalSessionId FROM @TestSessionIds);

        -- Delete EntityStateTransitions & AuditLogs for test sessions
        DELETE FROM EntityStateTransitions 
        WHERE ChangedBy IN ('OFFICER_TEST', 'OFFICER_AUDIT_TEST', 'TEST_RUNNER')
           OR (EntityType = 'OPERATIONAL_SESSION' AND EntityId NOT IN (SELECT CAST(OperationalSessionId AS NVARCHAR(100)) FROM OperationalSessions));

        DELETE FROM AuditLogs 
        WHERE PerformedBy IN ('OFFICER_TEST', 'OFFICER_AUDIT_TEST', 'TEST_RUNNER')
           OR (EntityType = 'OPERATIONAL_SESSION' AND EntityId NOT IN (SELECT CAST(OperationalSessionId AS NVARCHAR(100)) FROM OperationalSessions));

        -- Delete RoadSegments, RoadGeometryVersions, Roads
        DELETE FROM RoadSegments 
        WHERE RoadGeometryVersionId IN (SELECT RoadGeometryVersionId FROM RoadGeometryVersions WHERE RoadId IN (SELECT RoadId FROM @TestRoadIds));

        DELETE FROM RoadGeometryVersions 
        WHERE RoadId IN (SELECT RoadId FROM @TestRoadIds);

        DELETE FROM Roads 
        WHERE RoadId IN (SELECT RoadId FROM @TestRoadIds);

        -- Delete DeviceVehicleAssignment
        DELETE FROM [DeviceVehicleAssignment] 
        WHERE DeviceId IN (SELECT DeviceId FROM @TestDeviceIds)
           OR VehicleId IN (SELECT VehicleId FROM @TestVehicleIds);

        -- Delete DeviceRegistry & VehicleRegistry
        DELETE FROM DeviceRegistry 
        WHERE DeviceId IN (SELECT DeviceId FROM @TestDeviceIds);

        DELETE FROM VehicleRegistry 
        WHERE VehicleId IN (SELECT VehicleId FROM @TestVehicleIds);
"@
    $affected = $cmd.ExecuteNonQuery()
    $tx.Commit()
    Write-Host "Database cleanup completed and committed successfully."
} catch {
    $tx.Rollback()
    Write-Host "Error during cleanup: $_"
}

Write-Host "`n=== REMAINING LEGITIMATE ASSETS IN DATABASE ==="
$cmd = $conn.CreateCommand()
$cmd.CommandText = @"
    SELECT 'ULBs' as Category, COUNT(*) as [Count] FROM UlbRegistry
    UNION ALL
    SELECT 'Vehicles', COUNT(*) FROM VehicleRegistry
    UNION ALL
    SELECT 'Devices', COUNT(*) FROM DeviceRegistry
    UNION ALL
    SELECT 'Roads', COUNT(*) FROM Roads
    UNION ALL
    SELECT 'Operational Sessions', COUNT(*) FROM OperationalSessions
    UNION ALL
    SELECT 'State Definitions', COUNT(*) FROM StateDefinitions
    UNION ALL
    SELECT 'Audit Logs', COUNT(*) FROM AuditLogs
"@
$r = $cmd.ExecuteReader()
while ($r.Read()) {
    Write-Host ("{0,-22} : {1}" -f $r["Category"], $r["Count"])
}
$r.Close()

$conn.Close()
