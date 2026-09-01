using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SWSTP.Telemetry.Backend.Migrations
{
    /// <inheritdoc />
    public partial class AddDeviceAndVehicleRegistries : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<long>(
                name: "DeviceId",
                table: "TelemetrySessions",
                type: "bigint",
                nullable: true,
                oldClrType: typeof(string),
                oldType: "nvarchar(50)",
                oldMaxLength: 50);

            migrationBuilder.AddColumn<long>(
                name: "AssignmentId",
                table: "TelemetrySessions",
                type: "bigint",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DeviceCode",
                table: "TelemetrySessions",
                type: "nvarchar(50)",
                maxLength: 50,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "VehicleRegistrationNumber",
                table: "TelemetrySessions",
                type: "nvarchar(50)",
                maxLength: 50,
                nullable: false,
                defaultValue: "");

            migrationBuilder.CreateTable(
                name: "DeviceRegistry",
                columns: table => new
                {
                    DeviceId = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    DeviceCode = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    HardwareVersion = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: true),
                    FirmwareVersion = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: true),
                    RegisteredAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    LastSeenAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    MetadataJson = table.Column<string>(type: "nvarchar(max)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DeviceRegistry", x => x.DeviceId);
                });

            migrationBuilder.CreateTable(
                name: "VehicleRegistry",
                columns: table => new
                {
                    VehicleId = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    VehicleRegistrationNumber = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    VehicleType = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    CapacityTons = table.Column<double>(type: "float", nullable: true),
                    UlbId = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    UlbName = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    Status = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    RegisteredAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    MetadataJson = table.Column<string>(type: "nvarchar(max)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_VehicleRegistry", x => x.VehicleId);
                });

            migrationBuilder.CreateTable(
                name: "DeviceVehicleAssignment",
                columns: table => new
                {
                    AssignmentId = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    DeviceId = table.Column<long>(type: "bigint", nullable: false),
                    VehicleId = table.Column<long>(type: "bigint", nullable: false),
                    AssignedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UnassignedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    AssignedBy = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DeviceVehicleAssignment", x => x.AssignmentId);
                    table.ForeignKey(
                        name: "FK_DeviceVehicleAssignment_DeviceRegistry_DeviceId",
                        column: x => x.DeviceId,
                        principalTable: "DeviceRegistry",
                        principalColumn: "DeviceId",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_DeviceVehicleAssignment_VehicleRegistry_VehicleId",
                        column: x => x.VehicleId,
                        principalTable: "VehicleRegistry",
                        principalColumn: "VehicleId",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_TelemetrySessions_AssignmentId",
                table: "TelemetrySessions",
                column: "AssignmentId");

            migrationBuilder.CreateIndex(
                name: "IX_TelemetrySessions_DeviceId",
                table: "TelemetrySessions",
                column: "DeviceId");

            migrationBuilder.CreateIndex(
                name: "UQ_DeviceRegistry_DeviceCode",
                table: "DeviceRegistry",
                column: "DeviceCode",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_DeviceVehicleAssignment_DeviceId",
                table: "DeviceVehicleAssignment",
                column: "DeviceId");

            migrationBuilder.CreateIndex(
                name: "IX_DeviceVehicleAssignment_VehicleId",
                table: "DeviceVehicleAssignment",
                column: "VehicleId");

            migrationBuilder.CreateIndex(
                name: "UQ_VehicleRegistry_RegNumber",
                table: "VehicleRegistry",
                column: "VehicleRegistrationNumber",
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_TelemetrySessions_DeviceRegistry_DeviceId",
                table: "TelemetrySessions",
                column: "DeviceId",
                principalTable: "DeviceRegistry",
                principalColumn: "DeviceId",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_TelemetrySessions_DeviceVehicleAssignment_AssignmentId",
                table: "TelemetrySessions",
                column: "AssignmentId",
                principalTable: "DeviceVehicleAssignment",
                principalColumn: "AssignmentId",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_TelemetrySessions_DeviceRegistry_DeviceId",
                table: "TelemetrySessions");

            migrationBuilder.DropForeignKey(
                name: "FK_TelemetrySessions_DeviceVehicleAssignment_AssignmentId",
                table: "TelemetrySessions");

            migrationBuilder.DropTable(
                name: "DeviceVehicleAssignment");

            migrationBuilder.DropTable(
                name: "DeviceRegistry");

            migrationBuilder.DropTable(
                name: "VehicleRegistry");

            migrationBuilder.DropIndex(
                name: "IX_TelemetrySessions_AssignmentId",
                table: "TelemetrySessions");

            migrationBuilder.DropIndex(
                name: "IX_TelemetrySessions_DeviceId",
                table: "TelemetrySessions");

            migrationBuilder.DropColumn(
                name: "AssignmentId",
                table: "TelemetrySessions");

            migrationBuilder.DropColumn(
                name: "DeviceCode",
                table: "TelemetrySessions");

            migrationBuilder.DropColumn(
                name: "VehicleRegistrationNumber",
                table: "TelemetrySessions");

            migrationBuilder.AlterColumn<string>(
                name: "DeviceId",
                table: "TelemetrySessions",
                type: "nvarchar(50)",
                maxLength: 50,
                nullable: false,
                defaultValue: "",
                oldClrType: typeof(long),
                oldType: "bigint",
                oldNullable: true);
        }
    }
}
