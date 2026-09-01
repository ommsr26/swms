using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace SWSTP.Telemetry.Backend.Services.LiveState
{
    public sealed class LiveTruckStateDto
    {
        [JsonPropertyName("vehicleId")]
        public long VehicleId { get; set; }

        [JsonPropertyName("registration")]
        public string? Registration { get; set; }

        [JsonPropertyName("sessionId")]
        public long? SessionId { get; set; }

        [JsonPropertyName("deviceCode")]
        public string? DeviceCode { get; set; }

        [JsonPropertyName("ulbId")]
        public string? UlbId { get; set; }

        [JsonPropertyName("ulbName")]
        public string? UlbName { get; set; }

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

        [JsonPropertyName("speed")]
        public double? Speed { get; set; }

        [JsonPropertyName("heading")]
        public double? Heading { get; set; }

        [JsonPropertyName("lastSeen")]
        public DateTime LastSeen { get; set; }

        [JsonPropertyName("isLive")]
        public bool IsLive { get; set; }
    }

    public interface ILiveTruckStateStore
    {
        void Update(LiveTruckStateDto state);
        LiveTruckStateDto? GetByVehicleId(long vehicleId);
        LiveTruckStateDto? GetByRegistration(string registration);
        IReadOnlyList<LiveTruckStateDto> GetByUlb(string ulbId);
        IReadOnlyList<LiveTruckStateDto> GetAll();
    }
}
