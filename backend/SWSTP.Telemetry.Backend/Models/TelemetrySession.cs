using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SWSTP.Telemetry.Backend.Models
{
    [Table("TelemetrySessions")]
    public class TelemetrySession
    {
        [Key]
        [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
        public long SessionId { get; set; }

        [Required]
        [StringLength(50)]
        public string SessionCode { get; set; } = string.Empty;

        public long? DeviceId { get; set; }

        public long? AssignmentId { get; set; }

        [StringLength(50)]
        public string DeviceCode { get; set; } = "SWSTP-DEV-UNPROVISIONED";

        [StringLength(50)]
        public string VehicleRegistrationNumber { get; set; } = "UNASSIGNED";

        [Required]
        [StringLength(20)]
        public string Mode { get; set; } = "REAL_HARDWARE"; // REAL_HARDWARE or SIMULATION

        public DateTime StartedAt { get; set; } = DateTime.UtcNow;

        public DateTime? EndedAt { get; set; }

        [StringLength(50)]
        public string? FirmwareVersion { get; set; }

        public int SerialBaud { get; set; } = 115200;

        public string? Notes { get; set; }

        [Required]
        [StringLength(20)]
        public string Status { get; set; } = "ACTIVE"; // ACTIVE, COMPLETED, ABORTED, UNREGISTERED_DEVICE

        [ForeignKey("DeviceId")]
        public DeviceRegistry? Device { get; set; }

        [ForeignKey("AssignmentId")]
        public DeviceVehicleAssignment? Assignment { get; set; }

        public ICollection<TelemetryPacket> TelemetryPackets { get; set; } = new List<TelemetryPacket>();
        public ICollection<GnssEvent> GnssEvents { get; set; } = new List<GnssEvent>();
        public ICollection<SystemEvent> SystemEvents { get; set; } = new List<SystemEvent>();
    }
}
