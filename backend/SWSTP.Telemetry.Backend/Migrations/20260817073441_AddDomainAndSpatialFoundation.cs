using System;
using Microsoft.EntityFrameworkCore.Migrations;
using NetTopologySuite.Geometries;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace SWSTP.Telemetry.Backend.Migrations
{
    /// <inheritdoc />
    public partial class AddDomainAndSpatialFoundation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_DeviceVehicleAssignment_DeviceId",
                table: "DeviceVehicleAssignment");

            migrationBuilder.DropIndex(
                name: "IX_DeviceVehicleAssignment_VehicleId",
                table: "DeviceVehicleAssignment");

            migrationBuilder.AddColumn<int>(
                name: "StatusStateDefinitionId",
                table: "VehicleRegistry",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "StatusStateDefinitionId",
                table: "DeviceRegistry",
                type: "int",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "AuditLogs",
                columns: table => new
                {
                    AuditLogId = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    UlbId = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: true),
                    Action = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    EntityType = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    EntityId = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    PerformedBy = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    PerformedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    ClientIp = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: true),
                    DetailsJson = table.Column<string>(type: "nvarchar(max)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AuditLogs", x => x.AuditLogId);
                    table.ForeignKey(
                        name: "FK_AuditLogs_ULBRegistry_UlbId",
                        column: x => x.UlbId,
                        principalTable: "ULBRegistry",
                        principalColumn: "UlbId",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "Houses",
                columns: table => new
                {
                    HouseId = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    UlbId = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    Latitude = table.Column<double>(type: "float", nullable: false),
                    Longitude = table.Column<double>(type: "float", nullable: false),
                    Location = table.Column<Point>(type: "geography", nullable: false),
                    Address = table.Column<string>(type: "nvarchar(255)", maxLength: 255, nullable: true),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Houses", x => x.HouseId);
                    table.ForeignKey(
                        name: "FK_Houses_ULBRegistry_UlbId",
                        column: x => x.UlbId,
                        principalTable: "ULBRegistry",
                        principalColumn: "UlbId",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "Roads",
                columns: table => new
                {
                    RoadId = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    UlbId = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    RoadCode = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    RoadName = table.Column<string>(type: "nvarchar(150)", maxLength: 150, nullable: false),
                    RoadType = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: true),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreatedBy = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    UpdatedBy = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Roads", x => x.RoadId);
                    table.ForeignKey(
                        name: "FK_Roads_ULBRegistry_UlbId",
                        column: x => x.UlbId,
                        principalTable: "ULBRegistry",
                        principalColumn: "UlbId",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "StateDefinitions",
                columns: table => new
                {
                    StateDefinitionId = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    EntityType = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    StateCode = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    DisplayName = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Description = table.Column<string>(type: "nvarchar(255)", maxLength: 255, nullable: true),
                    IsTerminal = table.Column<bool>(type: "bit", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    SortOrder = table.Column<int>(type: "int", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StateDefinitions", x => x.StateDefinitionId);
                });

            migrationBuilder.CreateTable(
                name: "RoadGeometryVersions",
                columns: table => new
                {
                    RoadGeometryVersionId = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    RoadId = table.Column<long>(type: "bigint", nullable: false),
                    VersionNumber = table.Column<int>(type: "int", nullable: false),
                    Geometry = table.Column<Geometry>(type: "geography", nullable: false),
                    EffectiveFrom = table.Column<DateTime>(type: "datetime2", nullable: false),
                    EffectiveTo = table.Column<DateTime>(type: "datetime2", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreatedBy = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RoadGeometryVersions", x => x.RoadGeometryVersionId);
                    table.ForeignKey(
                        name: "FK_RoadGeometryVersions_Roads_RoadId",
                        column: x => x.RoadId,
                        principalTable: "Roads",
                        principalColumn: "RoadId",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "EntityStateTransitions",
                columns: table => new
                {
                    StateTransitionId = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    EntityType = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    EntityId = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    PreviousStateDefinitionId = table.Column<int>(type: "int", nullable: true),
                    NewStateDefinitionId = table.Column<int>(type: "int", nullable: false),
                    ChangedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    ChangedBy = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    Reason = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    Source = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EntityStateTransitions", x => x.StateTransitionId);
                    table.ForeignKey(
                        name: "FK_EntityStateTransitions_StateDefinitions_NewStateDefinitionId",
                        column: x => x.NewStateDefinitionId,
                        principalTable: "StateDefinitions",
                        principalColumn: "StateDefinitionId",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_EntityStateTransitions_StateDefinitions_PreviousStateDefinitionId",
                        column: x => x.PreviousStateDefinitionId,
                        principalTable: "StateDefinitions",
                        principalColumn: "StateDefinitionId",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "OperationalSessions",
                columns: table => new
                {
                    OperationalSessionId = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    UlbId = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    VehicleId = table.Column<long>(type: "bigint", nullable: false),
                    SessionCode = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(150)", maxLength: 150, nullable: false),
                    Description = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    StatusStateDefinitionId = table.Column<int>(type: "int", nullable: false),
                    IsActiveReservation = table.Column<bool>(type: "bit", nullable: false),
                    ScheduledStartAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    ScheduledEndAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    ActualStartAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ActualEndAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    CompletedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreatedBy = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    UpdatedBy = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OperationalSessions", x => x.OperationalSessionId);
                    table.ForeignKey(
                        name: "FK_OperationalSessions_StateDefinitions_StatusStateDefinitionId",
                        column: x => x.StatusStateDefinitionId,
                        principalTable: "StateDefinitions",
                        principalColumn: "StateDefinitionId",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_OperationalSessions_ULBRegistry_UlbId",
                        column: x => x.UlbId,
                        principalTable: "ULBRegistry",
                        principalColumn: "UlbId",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_OperationalSessions_VehicleRegistry_VehicleId",
                        column: x => x.VehicleId,
                        principalTable: "VehicleRegistry",
                        principalColumn: "VehicleId",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "RoadSegments",
                columns: table => new
                {
                    RoadSegmentId = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    RoadId = table.Column<long>(type: "bigint", nullable: false),
                    RoadGeometryVersionId = table.Column<long>(type: "bigint", nullable: false),
                    SegmentCode = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    SegmentName = table.Column<string>(type: "nvarchar(150)", maxLength: 150, nullable: false),
                    Geometry = table.Column<Geometry>(type: "geography", nullable: false),
                    StartNodeReference = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    EndNodeReference = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    LengthMeters = table.Column<double>(type: "float", nullable: false),
                    Sequence = table.Column<int>(type: "int", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RoadSegments", x => x.RoadSegmentId);
                    table.ForeignKey(
                        name: "FK_RoadSegments_RoadGeometryVersions_RoadGeometryVersionId",
                        column: x => x.RoadGeometryVersionId,
                        principalTable: "RoadGeometryVersions",
                        principalColumn: "RoadGeometryVersionId",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_RoadSegments_Roads_RoadId",
                        column: x => x.RoadId,
                        principalTable: "Roads",
                        principalColumn: "RoadId",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "SessionRoadAssignments",
                columns: table => new
                {
                    SessionRoadAssignmentId = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    OperationalSessionId = table.Column<long>(type: "bigint", nullable: false),
                    RoadId = table.Column<long>(type: "bigint", nullable: false),
                    RoadSegmentId = table.Column<long>(type: "bigint", nullable: true),
                    RoadGeometryVersionId = table.Column<long>(type: "bigint", nullable: false),
                    AssignedGeometry = table.Column<Geometry>(type: "geography", nullable: false),
                    BufferMeters = table.Column<double>(type: "float", nullable: false),
                    AssignmentType = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    AssignedOrder = table.Column<int>(type: "int", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreatedBy = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    UpdatedBy = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SessionRoadAssignments", x => x.SessionRoadAssignmentId);
                    table.ForeignKey(
                        name: "FK_SessionRoadAssignments_OperationalSessions_OperationalSessionId",
                        column: x => x.OperationalSessionId,
                        principalTable: "OperationalSessions",
                        principalColumn: "OperationalSessionId",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_SessionRoadAssignments_RoadGeometryVersions_RoadGeometryVersionId",
                        column: x => x.RoadGeometryVersionId,
                        principalTable: "RoadGeometryVersions",
                        principalColumn: "RoadGeometryVersionId",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_SessionRoadAssignments_RoadSegments_RoadSegmentId",
                        column: x => x.RoadSegmentId,
                        principalTable: "RoadSegments",
                        principalColumn: "RoadSegmentId",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_SessionRoadAssignments_Roads_RoadId",
                        column: x => x.RoadId,
                        principalTable: "Roads",
                        principalColumn: "RoadId",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "CollectionEvents",
                columns: table => new
                {
                    CollectionEventId = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    OperationalSessionId = table.Column<long>(type: "bigint", nullable: false),
                    SessionRoadAssignmentId = table.Column<long>(type: "bigint", nullable: false),
                    VehicleId = table.Column<long>(type: "bigint", nullable: false),
                    CapturedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    ReceivedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    Latitude = table.Column<double>(type: "float", nullable: false),
                    Longitude = table.Column<double>(type: "float", nullable: false),
                    Location = table.Column<Point>(type: "geography", nullable: false),
                    FusedSpeedKph = table.Column<double>(type: "float", nullable: false),
                    MotionConfidence = table.Column<double>(type: "float", nullable: false),
                    DistanceToRoadMeters = table.Column<double>(type: "float", nullable: false),
                    StatusStateDefinitionId = table.Column<int>(type: "int", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CollectionEvents", x => x.CollectionEventId);
                    table.ForeignKey(
                        name: "FK_CollectionEvents_OperationalSessions_OperationalSessionId",
                        column: x => x.OperationalSessionId,
                        principalTable: "OperationalSessions",
                        principalColumn: "OperationalSessionId",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_CollectionEvents_SessionRoadAssignments_SessionRoadAssignmentId",
                        column: x => x.SessionRoadAssignmentId,
                        principalTable: "SessionRoadAssignments",
                        principalColumn: "SessionRoadAssignmentId",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_CollectionEvents_StateDefinitions_StatusStateDefinitionId",
                        column: x => x.StatusStateDefinitionId,
                        principalTable: "StateDefinitions",
                        principalColumn: "StateDefinitionId",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_CollectionEvents_VehicleRegistry_VehicleId",
                        column: x => x.VehicleId,
                        principalTable: "VehicleRegistry",
                        principalColumn: "VehicleId",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "CollectionEventHouses",
                columns: table => new
                {
                    CollectionEventHouseId = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    CollectionEventId = table.Column<long>(type: "bigint", nullable: false),
                    HouseId = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    DistanceMeters = table.Column<double>(type: "float", nullable: false),
                    CoverageRadiusMeters = table.Column<double>(type: "float", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CollectionEventHouses", x => x.CollectionEventHouseId);
                    table.ForeignKey(
                        name: "FK_CollectionEventHouses_CollectionEvents_CollectionEventId",
                        column: x => x.CollectionEventId,
                        principalTable: "CollectionEvents",
                        principalColumn: "CollectionEventId",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_CollectionEventHouses_Houses_HouseId",
                        column: x => x.HouseId,
                        principalTable: "Houses",
                        principalColumn: "HouseId",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "EvidenceImages",
                columns: table => new
                {
                    EvidenceImageId = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    CollectionEventId = table.Column<long>(type: "bigint", nullable: false),
                    RelativePath = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: false),
                    CapturedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    ExpiresAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    FileSizeBytes = table.Column<long>(type: "bigint", nullable: false),
                    Width = table.Column<int>(type: "int", nullable: false),
                    Height = table.Column<int>(type: "int", nullable: false),
                    CompressionQuality = table.Column<int>(type: "int", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EvidenceImages", x => x.EvidenceImageId);
                    table.ForeignKey(
                        name: "FK_EvidenceImages_CollectionEvents_CollectionEventId",
                        column: x => x.CollectionEventId,
                        principalTable: "CollectionEvents",
                        principalColumn: "CollectionEventId",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.InsertData(
                table: "StateDefinitions",
                columns: new[] { "StateDefinitionId", "CreatedAt", "Description", "DisplayName", "EntityType", "IsActive", "IsTerminal", "SortOrder", "StateCode", "UpdatedAt" },
                values: new object[,]
                {
                    { 1, new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "Unassigned hardware in storage", "In Inventory", "DEVICE", true, false, 1, "INVENTORY", null },
                    { 2, new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "Assigned to vehicle, awaiting installation", "Provisioned", "DEVICE", true, false, 2, "PROVISIONED", null },
                    { 3, new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "Active in field and transmitting telemetry", "In Service", "DEVICE", true, false, 3, "IN_SERVICE", null },
                    { 4, new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "Under diagnostic inspection or repair", "Maintenance", "DEVICE", true, false, 4, "MAINTENANCE", null },
                    { 5, new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "Temporarily disabled by operator", "Disabled", "DEVICE", true, false, 5, "DISABLED", null },
                    { 6, new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "Decommissioned from municipal inventory", "Retired", "DEVICE", true, true, 6, "RETIRED", null },
                    { 10, new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "Operational vehicle available for missions", "In Service", "VEHICLE", true, false, 1, "IN_SERVICE", null },
                    { 11, new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "In garage workshop for repair/service", "Maintenance", "VEHICLE", true, false, 2, "MAINTENANCE", null },
                    { 12, new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "Temporarily barred from municipal route", "Suspended", "VEHICLE", true, false, 3, "SUSPENDED", null },
                    { 13, new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "Retired permanently from municipal fleet", "Decommissioned", "VEHICLE", true, true, 4, "DECOMMISSIONED", null },
                    { 20, new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "Planned for future time window", "Scheduled", "OPERATIONAL_SESSION", true, false, 1, "SCHEDULED", null },
                    { 21, new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "In field execution, vehicle reserved", "Mission Active", "OPERATIONAL_SESSION", true, false, 2, "ACTIVE", null },
                    { 22, new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "Temporarily paused in field, vehicle remains reserved", "Mission Paused", "OPERATIONAL_SESSION", true, false, 3, "PAUSED", null },
                    { 23, new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "Mission finished within schedule", "Completed", "OPERATIONAL_SESSION", true, true, 4, "COMPLETED", null },
                    { 24, new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "Cancelled by officer prior to execution", "Cancelled", "OPERATIONAL_SESSION", true, true, 5, "CANCELLED", null },
                    { 25, new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "Terminated early due to emergency or breakdown", "Aborted", "OPERATIONAL_SESSION", true, true, 6, "ABORTED", null },
                    { 30, new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "Motion detected within road buffer & speed threshold", "Detected", "COLLECTION_EVENT", true, false, 1, "DETECTED", null },
                    { 31, new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "Confirmed solid waste collection", "Verified", "COLLECTION_EVENT", true, false, 2, "VERIFIED", null },
                    { 32, new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "Flagged for officer inspection or anomalies", "Flagged", "COLLECTION_EVENT", true, false, 3, "FLAGGED", null }
                });

            migrationBuilder.CreateIndex(
                name: "IX_VehicleRegistry_StatusStateDefinitionId",
                table: "VehicleRegistry",
                column: "StatusStateDefinitionId");

            migrationBuilder.CreateIndex(
                name: "UX_DeviceVehicleAssignment_OneActivePerDevice",
                table: "DeviceVehicleAssignment",
                column: "DeviceId",
                unique: true,
                filter: "[IsActive] = 1");

            migrationBuilder.CreateIndex(
                name: "UX_DeviceVehicleAssignment_OneActivePerVehicle",
                table: "DeviceVehicleAssignment",
                column: "VehicleId",
                unique: true,
                filter: "[IsActive] = 1");

            migrationBuilder.CreateIndex(
                name: "IX_DeviceRegistry_StatusStateDefinitionId",
                table: "DeviceRegistry",
                column: "StatusStateDefinitionId");

            migrationBuilder.CreateIndex(
                name: "IX_AuditLogs_Entity_PerformedAt",
                table: "AuditLogs",
                columns: new[] { "EntityType", "EntityId", "PerformedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_AuditLogs_UlbId_PerformedAt",
                table: "AuditLogs",
                columns: new[] { "UlbId", "PerformedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_CollectionEventHouses_CollectionEventId",
                table: "CollectionEventHouses",
                column: "CollectionEventId");

            migrationBuilder.CreateIndex(
                name: "IX_CollectionEventHouses_HouseId",
                table: "CollectionEventHouses",
                column: "HouseId");

            migrationBuilder.CreateIndex(
                name: "IX_CollectionEvents_Session_CapturedAt",
                table: "CollectionEvents",
                columns: new[] { "OperationalSessionId", "CapturedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_CollectionEvents_SessionRoadAssignmentId",
                table: "CollectionEvents",
                column: "SessionRoadAssignmentId");

            migrationBuilder.CreateIndex(
                name: "IX_CollectionEvents_StatusStateDefinitionId",
                table: "CollectionEvents",
                column: "StatusStateDefinitionId");

            migrationBuilder.CreateIndex(
                name: "IX_CollectionEvents_Vehicle_CapturedAt",
                table: "CollectionEvents",
                columns: new[] { "VehicleId", "CapturedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_EntityStateTransitions_Entity_ChangedAt",
                table: "EntityStateTransitions",
                columns: new[] { "EntityType", "EntityId", "ChangedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_EntityStateTransitions_NewStateDefinitionId",
                table: "EntityStateTransitions",
                column: "NewStateDefinitionId");

            migrationBuilder.CreateIndex(
                name: "IX_EntityStateTransitions_PreviousStateDefinitionId",
                table: "EntityStateTransitions",
                column: "PreviousStateDefinitionId");

            migrationBuilder.CreateIndex(
                name: "IX_EvidenceImages_CollectionEventId",
                table: "EvidenceImages",
                column: "CollectionEventId");

            migrationBuilder.CreateIndex(
                name: "IX_EvidenceImages_ExpiresAt_DeletedAt",
                table: "EvidenceImages",
                columns: new[] { "ExpiresAt", "DeletedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_Houses_UlbId_IsActive",
                table: "Houses",
                columns: new[] { "UlbId", "IsActive" });

            migrationBuilder.CreateIndex(
                name: "IX_OperationalSessions_StatusStateDefinitionId",
                table: "OperationalSessions",
                column: "StatusStateDefinitionId");

            migrationBuilder.CreateIndex(
                name: "IX_OperationalSessions_Ulb_Status_Scheduled",
                table: "OperationalSessions",
                columns: new[] { "UlbId", "StatusStateDefinitionId", "ScheduledStartAt" });

            migrationBuilder.CreateIndex(
                name: "UQ_OperationalSessions_SessionCode",
                table: "OperationalSessions",
                column: "SessionCode",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "UX_OperationalSession_OneActiveReservationPerVehicle",
                table: "OperationalSessions",
                column: "VehicleId",
                unique: true,
                filter: "[IsActiveReservation] = 1");

            migrationBuilder.CreateIndex(
                name: "UQ_RoadGeometryVersions_Road_Version",
                table: "RoadGeometryVersions",
                columns: new[] { "RoadId", "VersionNumber" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "UQ_Roads_UlbId_RoadCode",
                table: "Roads",
                columns: new[] { "UlbId", "RoadCode" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_RoadSegments_Road_Sequence",
                table: "RoadSegments",
                columns: new[] { "RoadId", "Sequence" });

            migrationBuilder.CreateIndex(
                name: "IX_RoadSegments_RoadGeometryVersionId",
                table: "RoadSegments",
                column: "RoadGeometryVersionId");

            migrationBuilder.CreateIndex(
                name: "IX_SessionRoadAssignments_RoadGeometryVersionId",
                table: "SessionRoadAssignments",
                column: "RoadGeometryVersionId");

            migrationBuilder.CreateIndex(
                name: "IX_SessionRoadAssignments_RoadId",
                table: "SessionRoadAssignments",
                column: "RoadId");

            migrationBuilder.CreateIndex(
                name: "IX_SessionRoadAssignments_RoadSegmentId",
                table: "SessionRoadAssignments",
                column: "RoadSegmentId");

            migrationBuilder.CreateIndex(
                name: "IX_SessionRoadAssignments_Session_Order",
                table: "SessionRoadAssignments",
                columns: new[] { "OperationalSessionId", "AssignedOrder" });

            migrationBuilder.CreateIndex(
                name: "UQ_StateDefinitions_EntityType_StateCode",
                table: "StateDefinitions",
                columns: new[] { "EntityType", "StateCode" },
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_DeviceRegistry_StateDefinitions_StatusStateDefinitionId",
                table: "DeviceRegistry",
                column: "StatusStateDefinitionId",
                principalTable: "StateDefinitions",
                principalColumn: "StateDefinitionId",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_VehicleRegistry_StateDefinitions_StatusStateDefinitionId",
                table: "VehicleRegistry",
                column: "StatusStateDefinitionId",
                principalTable: "StateDefinitions",
                principalColumn: "StateDefinitionId",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_VehicleRegistry_ULBRegistry_UlbId",
                table: "VehicleRegistry",
                column: "UlbId",
                principalTable: "ULBRegistry",
                principalColumn: "UlbId",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_DeviceRegistry_StateDefinitions_StatusStateDefinitionId",
                table: "DeviceRegistry");

            migrationBuilder.DropForeignKey(
                name: "FK_VehicleRegistry_StateDefinitions_StatusStateDefinitionId",
                table: "VehicleRegistry");

            migrationBuilder.DropForeignKey(
                name: "FK_VehicleRegistry_ULBRegistry_UlbId",
                table: "VehicleRegistry");

            migrationBuilder.DropTable(
                name: "AuditLogs");

            migrationBuilder.DropTable(
                name: "CollectionEventHouses");

            migrationBuilder.DropTable(
                name: "EntityStateTransitions");

            migrationBuilder.DropTable(
                name: "EvidenceImages");

            migrationBuilder.DropTable(
                name: "Houses");

            migrationBuilder.DropTable(
                name: "CollectionEvents");

            migrationBuilder.DropTable(
                name: "SessionRoadAssignments");

            migrationBuilder.DropTable(
                name: "OperationalSessions");

            migrationBuilder.DropTable(
                name: "RoadSegments");

            migrationBuilder.DropTable(
                name: "StateDefinitions");

            migrationBuilder.DropTable(
                name: "RoadGeometryVersions");

            migrationBuilder.DropTable(
                name: "Roads");

            migrationBuilder.DropIndex(
                name: "IX_VehicleRegistry_StatusStateDefinitionId",
                table: "VehicleRegistry");

            migrationBuilder.DropIndex(
                name: "UX_DeviceVehicleAssignment_OneActivePerDevice",
                table: "DeviceVehicleAssignment");

            migrationBuilder.DropIndex(
                name: "UX_DeviceVehicleAssignment_OneActivePerVehicle",
                table: "DeviceVehicleAssignment");

            migrationBuilder.DropIndex(
                name: "IX_DeviceRegistry_StatusStateDefinitionId",
                table: "DeviceRegistry");

            migrationBuilder.DropColumn(
                name: "StatusStateDefinitionId",
                table: "VehicleRegistry");

            migrationBuilder.DropColumn(
                name: "StatusStateDefinitionId",
                table: "DeviceRegistry");

            migrationBuilder.CreateIndex(
                name: "IX_DeviceVehicleAssignment_DeviceId",
                table: "DeviceVehicleAssignment",
                column: "DeviceId");

            migrationBuilder.CreateIndex(
                name: "IX_DeviceVehicleAssignment_VehicleId",
                table: "DeviceVehicleAssignment",
                column: "VehicleId");
        }
    }
}
