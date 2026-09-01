using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SWSTP.Telemetry.Backend.Models
{
    /// <summary>
    /// Operational audit log for tracking administrative and municipal actions
    /// (session creation, road assignment modifications, vehicle reassignments, evidence deletions).
    /// </summary>
    [Table("AuditLogs")]
    public class AuditLog
    {
        [Key]
        [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
        public long AuditLogId { get; set; }

        [StringLength(50)]
        public string? UlbId { get; set; }

        [Required]
        [StringLength(100)]
        public string Action { get; set; } = string.Empty; // "SESSION_CREATED", "ROAD_ASSIGNMENT_UPDATED", etc.

        [Required]
        [StringLength(50)]
        public string EntityType { get; set; } = string.Empty; // "OPERATIONAL_SESSION", "ROAD_ASSIGNMENT", "VEHICLE", etc.

        [Required]
        [StringLength(100)]
        public string EntityId { get; set; } = string.Empty;

        [Required]
        [StringLength(100)]
        public string PerformedBy { get; set; } = string.Empty;

        public DateTime PerformedAt { get; set; } = DateTime.UtcNow;

        [StringLength(50)]
        public string? ClientIp { get; set; }

        public string? DetailsJson { get; set; }

        [ForeignKey("UlbId")]
        public UlbRegistry? Ulb { get; set; }
    }
}
