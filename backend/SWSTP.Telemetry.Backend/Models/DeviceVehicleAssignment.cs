using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SWSTP.Telemetry.Backend.Models
{
    [Table("DeviceVehicleAssignment")]
    public class DeviceVehicleAssignment
    {
        [Key]
        [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
        public long AssignmentId { get; set; }

        public long DeviceId { get; set; }

        public long VehicleId { get; set; }

        public DateTime AssignedAt { get; set; } = DateTime.UtcNow;

        public DateTime? UnassignedAt { get; set; }

        [Required]
        [StringLength(100)]
        public string AssignedBy { get; set; } = "SYSTEM_ADMIN";

        public bool IsActive { get; set; } = true;

        [ForeignKey("DeviceId")]
        public DeviceRegistry? Device { get; set; }

        [ForeignKey("VehicleId")]
        public VehicleRegistry? Vehicle { get; set; }

        public ICollection<TelemetrySession> TelemetrySessions { get; set; } = new List<TelemetrySession>();
    }
}
