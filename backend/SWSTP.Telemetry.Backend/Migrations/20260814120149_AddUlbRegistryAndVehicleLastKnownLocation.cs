using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SWSTP.Telemetry.Backend.Migrations
{
    /// <inheritdoc />
    public partial class AddUlbRegistryAndVehicleLastKnownLocation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<double>(
                name: "LastKnownHeadingDeg",
                table: "VehicleRegistry",
                type: "float",
                nullable: true);

            migrationBuilder.AddColumn<double>(
                name: "LastKnownLatitude",
                table: "VehicleRegistry",
                type: "float",
                nullable: true);

            migrationBuilder.AddColumn<double>(
                name: "LastKnownLongitude",
                table: "VehicleRegistry",
                type: "float",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "LastKnownRtcValid",
                table: "VehicleRegistry",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<double>(
                name: "LastKnownSpeedKmh",
                table: "VehicleRegistry",
                type: "float",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "LastKnownTimestamp",
                table: "VehicleRegistry",
                type: "datetime2",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "ULBRegistry",
                columns: table => new
                {
                    UlbId = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    UlbName = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    SafeZoneLatitude = table.Column<double>(type: "float", nullable: true),
                    SafeZoneLongitude = table.Column<double>(type: "float", nullable: true),
                    SafeZoneRadiusMeters = table.Column<double>(type: "float", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ULBRegistry", x => x.UlbId);
                });

            migrationBuilder.CreateIndex(
                name: "IX_VehicleRegistry_UlbId",
                table: "VehicleRegistry",
                column: "UlbId");

            // Backfill ULBRegistry from existing distinct VehicleRegistry entries
            migrationBuilder.Sql(@"
                INSERT INTO ULBRegistry (UlbId, UlbName, CreatedAt)
                SELECT DISTINCT UlbId, COALESCE(UlbName, UlbId), GETUTCDATE()
                FROM VehicleRegistry
                WHERE UlbId IS NOT NULL AND UlbId <> ''
                AND UlbId NOT IN (SELECT UlbId FROM ULBRegistry);
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ULBRegistry");

            migrationBuilder.DropIndex(
                name: "IX_VehicleRegistry_UlbId",
                table: "VehicleRegistry");

            migrationBuilder.DropColumn(
                name: "LastKnownHeadingDeg",
                table: "VehicleRegistry");

            migrationBuilder.DropColumn(
                name: "LastKnownLatitude",
                table: "VehicleRegistry");

            migrationBuilder.DropColumn(
                name: "LastKnownLongitude",
                table: "VehicleRegistry");

            migrationBuilder.DropColumn(
                name: "LastKnownRtcValid",
                table: "VehicleRegistry");

            migrationBuilder.DropColumn(
                name: "LastKnownSpeedKmh",
                table: "VehicleRegistry");

            migrationBuilder.DropColumn(
                name: "LastKnownTimestamp",
                table: "VehicleRegistry");
        }
    }
}
