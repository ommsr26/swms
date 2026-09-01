using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SWSTP.Telemetry.Backend.Migrations
{
    /// <inheritdoc />
    public partial class InitialTelemetrySchema : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "TelemetrySessions",
                columns: table => new
                {
                    SessionId = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    SessionCode = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    DeviceId = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    Mode = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    StartedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    EndedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    FirmwareVersion = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: true),
                    SerialBaud = table.Column<int>(type: "int", nullable: false),
                    Notes = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    Status = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TelemetrySessions", x => x.SessionId);
                });

            migrationBuilder.CreateTable(
                name: "GnssEvents",
                columns: table => new
                {
                    GnssEventId = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    SessionId = table.Column<long>(type: "bigint", nullable: false),
                    OccurredAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    ArduinoUptimeMs = table.Column<long>(type: "bigint", nullable: false),
                    EventType = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    Prn = table.Column<int>(type: "int", nullable: true),
                    Constellation = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: true),
                    Details = table.Column<string>(type: "nvarchar(max)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GnssEvents", x => x.GnssEventId);
                    table.ForeignKey(
                        name: "FK_GnssEvents_TelemetrySessions_SessionId",
                        column: x => x.SessionId,
                        principalTable: "TelemetrySessions",
                        principalColumn: "SessionId",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "SystemEvents",
                columns: table => new
                {
                    SystemEventId = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    SessionId = table.Column<long>(type: "bigint", nullable: true),
                    OccurredAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    EventType = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    Severity = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    Source = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    Message = table.Column<string>(type: "nvarchar(max)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SystemEvents", x => x.SystemEventId);
                    table.ForeignKey(
                        name: "FK_SystemEvents_TelemetrySessions_SessionId",
                        column: x => x.SessionId,
                        principalTable: "TelemetrySessions",
                        principalColumn: "SessionId");
                });

            migrationBuilder.CreateTable(
                name: "TelemetryPackets",
                columns: table => new
                {
                    TelemetryPacketId = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    SessionId = table.Column<long>(type: "bigint", nullable: false),
                    SequenceNumber = table.Column<long>(type: "bigint", nullable: false),
                    ReceivedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    ArduinoUptimeMs = table.Column<long>(type: "bigint", nullable: false),
                    RtcTimestamp = table.Column<DateTime>(type: "datetime2", nullable: true),
                    RawJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    ParserStatus = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TelemetryPackets", x => x.TelemetryPacketId);
                    table.UniqueConstraint("UQ_TelemetryPackets_Session_Sequence", x => new { x.SessionId, x.SequenceNumber });
                    table.ForeignKey(
                        name: "FK_TelemetryPackets_TelemetrySessions_SessionId",
                        column: x => x.SessionId,
                        principalTable: "TelemetrySessions",
                        principalColumn: "SessionId",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "GnssSamples",
                columns: table => new
                {
                    GnssSampleId = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    SessionId = table.Column<long>(type: "bigint", nullable: false),
                    SequenceNumber = table.Column<long>(type: "bigint", nullable: false),
                    ArduinoUptimeMs = table.Column<long>(type: "bigint", nullable: false),
                    Timestamp = table.Column<DateTime>(type: "datetime2", nullable: false),
                    FixStatus = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    FixValid = table.Column<bool>(type: "bit", nullable: false),
                    Latitude = table.Column<double>(type: "float", nullable: true),
                    Longitude = table.Column<double>(type: "float", nullable: true),
                    AltitudeM = table.Column<double>(type: "float", nullable: true),
                    SpeedKmh = table.Column<double>(type: "float", nullable: true),
                    CourseDeg = table.Column<double>(type: "float", nullable: true),
                    SatellitesCount = table.Column<int>(type: "int", nullable: false),
                    SatellitesInView = table.Column<int>(type: "int", nullable: false),
                    SatellitesUsed = table.Column<int>(type: "int", nullable: false),
                    Hdop = table.Column<double>(type: "float", nullable: true),
                    GsvSeq = table.Column<int>(type: "int", nullable: true),
                    GsvUptimeMs = table.Column<long>(type: "bigint", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GnssSamples", x => x.GnssSampleId);
                    table.ForeignKey(
                        name: "FK_GnssSamples_TelemetryPackets_SessionId_SequenceNumber",
                        columns: x => new { x.SessionId, x.SequenceNumber },
                        principalTable: "TelemetryPackets",
                        principalColumns: new[] { "SessionId", "SequenceNumber" },
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "GnssSatelliteObservations",
                columns: table => new
                {
                    ObservationId = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    SessionId = table.Column<long>(type: "bigint", nullable: false),
                    SequenceNumber = table.Column<long>(type: "bigint", nullable: false),
                    ObservedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    GsvSeq = table.Column<int>(type: "int", nullable: true),
                    Prn = table.Column<int>(type: "int", nullable: false),
                    Constellation = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    ElevationDeg = table.Column<double>(type: "float", nullable: true),
                    AzimuthDeg = table.Column<double>(type: "float", nullable: true),
                    SnrDbHz = table.Column<double>(type: "float", nullable: true),
                    UsedInFix = table.Column<bool>(type: "bit", nullable: false),
                    Status = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GnssSatelliteObservations", x => x.ObservationId);
                    table.ForeignKey(
                        name: "FK_GnssSatelliteObservations_TelemetryPackets_SessionId_SequenceNumber",
                        columns: x => new { x.SessionId, x.SequenceNumber },
                        principalTable: "TelemetryPackets",
                        principalColumns: new[] { "SessionId", "SequenceNumber" },
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "ImuSamples",
                columns: table => new
                {
                    ImuSampleId = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    SessionId = table.Column<long>(type: "bigint", nullable: false),
                    SequenceNumber = table.Column<long>(type: "bigint", nullable: false),
                    ArduinoUptimeMs = table.Column<long>(type: "bigint", nullable: false),
                    Timestamp = table.Column<DateTime>(type: "datetime2", nullable: false),
                    AccelX = table.Column<double>(type: "float", nullable: true),
                    AccelY = table.Column<double>(type: "float", nullable: true),
                    AccelZ = table.Column<double>(type: "float", nullable: true),
                    AccelMagnitude = table.Column<double>(type: "float", nullable: true),
                    GyroX = table.Column<double>(type: "float", nullable: true),
                    GyroY = table.Column<double>(type: "float", nullable: true),
                    GyroZ = table.Column<double>(type: "float", nullable: true),
                    TemperatureC = table.Column<double>(type: "float", nullable: true),
                    Roll = table.Column<double>(type: "float", nullable: true),
                    Pitch = table.Column<double>(type: "float", nullable: true),
                    Yaw = table.Column<double>(type: "float", nullable: true),
                    YawSource = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: true),
                    QuaternionW = table.Column<double>(type: "float", nullable: true),
                    QuaternionX = table.Column<double>(type: "float", nullable: true),
                    QuaternionY = table.Column<double>(type: "float", nullable: true),
                    QuaternionZ = table.Column<double>(type: "float", nullable: true),
                    IsValid = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ImuSamples", x => x.ImuSampleId);
                    table.ForeignKey(
                        name: "FK_ImuSamples_TelemetryPackets_SessionId_SequenceNumber",
                        columns: x => new { x.SessionId, x.SequenceNumber },
                        principalTable: "TelemetryPackets",
                        principalColumns: new[] { "SessionId", "SequenceNumber" },
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_GnssEvents_SessionId",
                table: "GnssEvents",
                column: "SessionId");

            migrationBuilder.CreateIndex(
                name: "IX_GnssSamples_Session_Fix_Timestamp",
                table: "GnssSamples",
                columns: new[] { "SessionId", "FixValid", "Timestamp" })
                .Annotation("SqlServer:Include", new[] { "Latitude", "Longitude", "AltitudeM", "SpeedKmh", "CourseDeg" });

            migrationBuilder.CreateIndex(
                name: "IX_GnssSamples_SessionId_SequenceNumber",
                table: "GnssSamples",
                columns: new[] { "SessionId", "SequenceNumber" });

            migrationBuilder.CreateIndex(
                name: "IX_GnssSatelliteObservations_Session_GsvSeq",
                table: "GnssSatelliteObservations",
                columns: new[] { "SessionId", "GsvSeq" });

            migrationBuilder.CreateIndex(
                name: "IX_GnssSatelliteObservations_Session_PRN",
                table: "GnssSatelliteObservations",
                columns: new[] { "SessionId", "Constellation", "Prn", "ObservedAt" })
                .Annotation("SqlServer:Include", new[] { "ElevationDeg", "AzimuthDeg", "SnrDbHz", "UsedInFix" });

            migrationBuilder.CreateIndex(
                name: "IX_GnssSatelliteObservations_SessionId_SequenceNumber",
                table: "GnssSatelliteObservations",
                columns: new[] { "SessionId", "SequenceNumber" });

            migrationBuilder.CreateIndex(
                name: "IX_ImuSamples_Session_Timestamp",
                table: "ImuSamples",
                columns: new[] { "SessionId", "Timestamp" })
                .Annotation("SqlServer:Include", new[] { "AccelX", "AccelY", "AccelZ", "GyroX", "GyroY", "GyroZ", "Roll", "Pitch", "Yaw" });

            migrationBuilder.CreateIndex(
                name: "IX_ImuSamples_SessionId_SequenceNumber",
                table: "ImuSamples",
                columns: new[] { "SessionId", "SequenceNumber" });

            migrationBuilder.CreateIndex(
                name: "IX_SystemEvents_SessionId",
                table: "SystemEvents",
                column: "SessionId");

            migrationBuilder.CreateIndex(
                name: "IX_TelemetryPackets_Session_Sequence",
                table: "TelemetryPackets",
                columns: new[] { "SessionId", "SequenceNumber" });

            migrationBuilder.CreateIndex(
                name: "IX_TelemetrySessions_Mode_StartedAt",
                table: "TelemetrySessions",
                columns: new[] { "Mode", "StartedAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "GnssEvents");

            migrationBuilder.DropTable(
                name: "GnssSamples");

            migrationBuilder.DropTable(
                name: "GnssSatelliteObservations");

            migrationBuilder.DropTable(
                name: "ImuSamples");

            migrationBuilder.DropTable(
                name: "SystemEvents");

            migrationBuilder.DropTable(
                name: "TelemetryPackets");

            migrationBuilder.DropTable(
                name: "TelemetrySessions");
        }
    }
}
