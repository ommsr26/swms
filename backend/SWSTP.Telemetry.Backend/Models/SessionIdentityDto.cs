using System;

namespace SWSTP.Telemetry.Backend.Models
{
    public class SessionIdentityDto
    {
        public long SessionId { get; set; }
        public string SessionCode { get; set; } = string.Empty;
        public string Mode { get; set; } = "REAL_HARDWARE";
        public DateTime StartedAt { get; set; }
        public DateTime? EndedAt { get; set; }
        public string Status { get; set; } = "ACTIVE";
        public long LastSequenceNumber { get; set; } = 0;

        public DeviceIdentityDto Device { get; set; } = new();
        public AssignmentIdentityDto? Assignment { get; set; }
        public VehicleIdentityDto? Vehicle { get; set; }
        public UlbIdentityDto? Ulb { get; set; }
    }

    public class DeviceIdentityDto
    {
        public long DeviceId { get; set; }
        public string DeviceCode { get; set; } = string.Empty;
        public string? HardwareVersion { get; set; }
        public string? FirmwareVersion { get; set; }
        public bool IsActive { get; set; } = true;
    }

    public class AssignmentIdentityDto
    {
        public long AssignmentId { get; set; }
        public bool IsActive { get; set; } = true;
        public DateTime AssignedAt { get; set; }
    }

    public class VehicleIdentityDto
    {
        public long VehicleId { get; set; }
        public string RegistrationNumber { get; set; } = string.Empty;
        public string VehicleType { get; set; } = "GARBAGE_COMPACTOR";
        public string Status { get; set; } = "IN_SERVICE";
    }

    public class UlbIdentityDto
    {
        public string UlbId { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
    }
}
