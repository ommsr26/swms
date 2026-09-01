$connStr = "Server=192.168.1.8;Database=Solid_Waste;User ID=om.r;Password=Om@123;TrustServerCertificate=True;Connect Timeout=15;Encrypt=False;"
$conn = New-Object System.Data.SqlClient.SqlConnection($connStr)
$conn.Open()

$cmd = $conn.CreateCommand()
$cmd.CommandText = @"
    DELETE FROM AuditLogs 
    WHERE EntityType = 'COLLECTION_EVENT' 
      AND EntityId NOT IN (SELECT CAST(CollectionEventId AS NVARCHAR(100)) FROM CollectionEvents);
"@
$deleted = $cmd.ExecuteNonQuery()
Write-Host "Purged $deleted orphan collection event audit records."

$cmd.CommandText = "SELECT COUNT(*) FROM AuditLogs;"
$cnt = $cmd.ExecuteScalar()
Write-Host "Remaining AuditLogs count: $cnt"

$conn.Close()
