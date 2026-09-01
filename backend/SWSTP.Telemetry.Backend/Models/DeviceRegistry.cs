using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SWSTP.Telemetry.Backend.Models
{
    [Table("DeviceRegistry")]
    public class DeviceRegistry
    {
        [Key]
        [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
        public long DeviceId { get; set; }

        [Required]
        [StringLength(50)]
        public string DeviceCode { get; set; } = string.Empty; // e.g. "SWSTP-DEV-000001"

        [StringLength(50)]
        public string? HardwareVersion { get; set; } = "REV_2.1_AVR";

        [StringLength(50)]
        public string? FirmwareVersion { get; set; } = "v2.4.0";

        public DateTime RegisteredAt { get; set; } = DateTime.UtcNow;

        public DateTime? LastSeenAt { get; set; }

        public bool IsActive { get; set; } = true;

        public int? StatusStateDefinitionId { get; set; }

        public string? MetadataJson { get; set; }

        [ForeignKey("StatusStateDefinitionId")]
        public StateDefinition? StatusStateDefinition { get; set; }

        public ICollection<DeviceVehicleAssignment> Assignments { get; set; } = new List<DeviceVehicleAssignment>();
        public ICollection<TelemetrySession> TelemetrySessions { get; set; } = new List<TelemetrySession>();
    }
}
