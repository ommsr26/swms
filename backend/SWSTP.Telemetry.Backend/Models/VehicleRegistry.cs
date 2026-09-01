using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SWSTP.Telemetry.Backend.Models
{
    [Table("VehicleRegistry")]
    public class VehicleRegistry
    {
        [Key]
        [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
        public long VehicleId { get; set; }

        [Required]
        [StringLength(50)]
        public string VehicleRegistrationNumber { get; set; } = string.Empty; // e.g. "MH31AB1234"

        [Required]
        [StringLength(50)]
        public string VehicleType { get; set; } = "GARBAGE_COMPACTOR";

        public double? CapacityTons { get; set; }

        [Required]
        [StringLength(50)]
        public string UlbId { get; set; } = "ULB_MH_NAGPUR";

        [StringLength(100)]
        public string? UlbName { get; set; } = "Nagpur Municipal Corporation";

        [Required]
        [StringLength(20)]
        public string Status { get; set; } = "IN_SERVICE";

        public DateTime RegisteredAt { get; set; } = DateTime.UtcNow;

        // Last known location fields (updated on telemetry batch ingest, preserving hardware RTC timestamp)
        public double? LastKnownLatitude { get; set; }
        public double? LastKnownLongitude { get; set; }
        public DateTime? LastKnownTimestamp { get; set; }
        public bool LastKnownRtcValid { get; set; } = false;
        public double? LastKnownSpeedKmh { get; set; }
        public double? LastKnownHeadingDeg { get; set; }

        public int? StatusStateDefinitionId { get; set; }

        public string? MetadataJson { get; set; }

        [ForeignKey("UlbId")]
        public UlbRegistry? Ulb { get; set; }

        [ForeignKey("StatusStateDefinitionId")]
        public StateDefinition? StatusStateDefinition { get; set; }

        public ICollection<DeviceVehicleAssignment> Assignments { get; set; } = new List<DeviceVehicleAssignment>();
        public ICollection<OperationalSession> OperationalSessions { get; set; } = new List<OperationalSession>();
    }
}
