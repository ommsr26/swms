using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SWSTP.Telemetry.Backend.Migrations
{
    /// <inheritdoc />
    public partial class RemoveScheduledEndAt_AddAbortAndCompletionReason : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ScheduledEndAt",
                table: "OperationalSessions");

            migrationBuilder.AddColumn<string>(
                name: "AbortReason",
                table: "OperationalSessions",
                type: "nvarchar(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CompletionReason",
                table: "OperationalSessions",
                type: "nvarchar(100)",
                maxLength: 100,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AbortReason",
                table: "OperationalSessions");

            migrationBuilder.DropColumn(
                name: "CompletionReason",
                table: "OperationalSessions");

            migrationBuilder.AddColumn<DateTime>(
                name: "ScheduledEndAt",
                table: "OperationalSessions",
                type: "datetime2",
                nullable: false,
                defaultValue: new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified));
        }
    }
}
