using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SWSTP.Telemetry.Backend.Models
{
    [Table("ULBRegistry")]
    public class UlbRegistry
    {
        [Key]
        [StringLength(50)]
        public string UlbId { get; set; } = string.Empty; // e.g. "ULB_MH_NAGPUR" or "ULB_MH_AMRAVATI"

        [Required]
        [StringLength(100)]
        public string UlbName { get; set; } = string.Empty;

        public double? SafeZoneLatitude { get; set; }

        public double? SafeZoneLongitude { get; set; }

        public double? SafeZoneRadiusMeters { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        public System.Collections.Generic.ICollection<VehicleRegistry> Vehicles { get; set; } = new System.Collections.Generic.List<VehicleRegistry>();
        public System.Collections.Generic.ICollection<Road> Roads { get; set; } = new System.Collections.Generic.List<Road>();
        public System.Collections.Generic.ICollection<House> Houses { get; set; } = new System.Collections.Generic.List<House>();
        public System.Collections.Generic.ICollection<OperationalSession> OperationalSessions { get; set; } = new System.Collections.Generic.List<OperationalSession>();
        public System.Collections.Generic.ICollection<AuditLog> AuditLogs { get; set; } = new System.Collections.Generic.List<AuditLog>();
    }
}
