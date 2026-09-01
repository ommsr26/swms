using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SWSTP.Telemetry.Backend.Migrations
{
    /// <inheritdoc />
    public partial class AddSha256AndIdempotencyToEvidenceImages : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "IdempotencyKey",
                table: "EvidenceImages",
                type: "nvarchar(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Sha256Hash",
                table: "EvidenceImages",
                type: "nvarchar(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_EvidenceImages_IdempotencyKey",
                table: "EvidenceImages",
                column: "IdempotencyKey",
                filter: "[IdempotencyKey] IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_EvidenceImages_IdempotencyKey",
                table: "EvidenceImages");

            migrationBuilder.DropColumn(
                name: "IdempotencyKey",
                table: "EvidenceImages");

            migrationBuilder.DropColumn(
                name: "Sha256Hash",
                table: "EvidenceImages");
        }
    }
}
