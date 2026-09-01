using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace SWSTP.Telemetry.Backend.Models
{
    public class IngestBatchDto
    {
        [JsonPropertyName("sessionId")]
        public long SessionId { get; set; }

        [JsonPropertyName("mode")]
        public string Mode { get; set; } = "REAL_HARDWARE";

        [JsonPropertyName("packets")]
        public List<RawTelemetryPacketDto> Packets { get; set; } = new List<RawTelemetryPacketDto>();
    }

    public class RawTelemetryPacketDto
    {
        [JsonPropertyName("sequence")]
        public long Sequence { get; set; }

        [JsonPropertyName("timestamp")]
        public long Timestamp { get; set; } // Epoch ms

        [JsonPropertyName("uptime_ms")]
        public long UptimeMs { get; set; }

        [JsonPropertyName("rawJson")]
        public string RawJson { get; set; } = string.Empty;

        [JsonPropertyName("imu")]
        public ImuDto? Imu { get; set; }

        [JsonPropertyName("gnss")]
        public GnssDto? Gnss { get; set; }

        [JsonPropertyName("rtc")]
        public RtcDto? Rtc { get; set; }
    }

    public class ImuDto
    {
        [JsonPropertyName("accel")]
        public Vector3Dto? Accel { get; set; }

        [JsonPropertyName("gyro")]
        public Vector3Dto? Gyro { get; set; }

        [JsonPropertyName("orientation")]
        public OrientationDto? Orientation { get; set; }

        [JsonPropertyName("quaternion")]
        public QuaternionDto? Quaternion { get; set; }

        [JsonPropertyName("temperature_c")]
        public double? TemperatureC { get; set; }

        [JsonPropertyName("accel_magnitude")]
        public double? AccelMagnitude { get; set; }

        [JsonPropertyName("valid")]
        public bool Valid { get; set; } = true;
    }

    public class Vector3Dto
    {
        [JsonPropertyName("x")]
        public double? X { get; set; }

        [JsonPropertyName("y")]
        public double? Y { get; set; }

        [JsonPropertyName("z")]
        public double? Z { get; set; }
    }

    public class OrientationDto
    {
        [JsonPropertyName("roll")]
        public double? Roll { get; set; }

        [JsonPropertyName("pitch")]
        public double? Pitch { get; set; }

        [JsonPropertyName("yaw")]
        public double? Yaw { get; set; }

        [JsonPropertyName("yaw_source")]
        public string? YawSource { get; set; }
    }

    public class QuaternionDto
    {
        [JsonPropertyName("w")]
        public double? W { get; set; }

        [JsonPropertyName("x")]
        public double? X { get; set; }

        [JsonPropertyName("y")]
        public double? Y { get; set; }

        [JsonPropertyName("z")]
        public double? Z { get; set; }
    }

    public class GnssDto
    {
        [JsonPropertyName("lat")]
        public double? Lat { get; set; } // Nullable float! NEVER 0.0

        [JsonPropertyName("lon")]
        public double? Lon { get; set; } // Nullable float! NEVER 0.0

        [JsonPropertyName("rawLat")]
        public double? RawLat { get; set; }

        [JsonPropertyName("rawLon")]
        public double? RawLon { get; set; }

        [JsonPropertyName("displayLat")]
        public double? DisplayLat { get; set; }

        [JsonPropertyName("displayLon")]
        public double? DisplayLon { get; set; }

        [JsonPropertyName("isInsideSafeZone")]
        public bool IsInsideSafeZone { get; set; }

        [JsonPropertyName("isSnapped")]
        public bool IsSnapped { get; set; }

        [JsonPropertyName("alt")]
        public double? Alt { get; set; } // Nullable float! NEVER 0.0

        [JsonPropertyName("speed")]
        public double? Speed { get; set; }

        [JsonPropertyName("heading")]
        public double? Heading { get; set; }

        [JsonPropertyName("satellites")]
        public int Satellites { get; set; }

        [JsonPropertyName("satellites_in_view")]
        public int SatellitesInView { get; set; }

        [JsonPropertyName("satellites_used")]
        public int SatellitesUsed { get; set; }

        [JsonPropertyName("hdop")]
        public double? Hdop { get; set; }

        [JsonPropertyName("gsv_seq")]
        public int? GsvSeq { get; set; }

        [JsonPropertyName("gsv_uptime_ms")]
        public long? GsvUptimeMs { get; set; }

        [JsonPropertyName("fix")]
        public string Fix { get; set; } = "NO_FIX";

        [JsonPropertyName("valid")]
        public bool Valid { get; set; }

        [JsonPropertyName("satellites_detail")]
        public List<SatelliteDetailDto>? SatellitesDetail { get; set; }
    }

    public class SatelliteDetailDto
    {
        [JsonPropertyName("prn")]
        public int Prn { get; set; }

        [JsonPropertyName("constellation")]
        public string Constellation { get; set; } = "UNKNOWN";

        [JsonPropertyName("elevation")]
        public double? Elevation { get; set; }

        [JsonPropertyName("azimuth")]
        public double? Azimuth { get; set; }

        [JsonPropertyName("snr")]
        public double? Snr { get; set; }

        [JsonPropertyName("used_in_fix")]
        public bool UsedInFix { get; set; }

        [JsonPropertyName("status")]
        public string Status { get; set; } = "VISIBLE";
    }

    public class RtcDto
    {
        [JsonPropertyName("iso")]
        public string? Iso { get; set; }

        [JsonPropertyName("epoch")]
        public long? Epoch { get; set; }

        [JsonPropertyName("synced")]
        public bool Synced { get; set; }
    }
}
