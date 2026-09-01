using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SWSTP.Telemetry.Backend.Models
{
    /// <summary>
    /// Append-only audit ledger recording state transitions for state-bearing domain entities
    /// (DEVICE, VEHICLE, OPERATIONAL_SESSION, COLLECTION_EVENT).
    /// </summary>
    [Table("EntityStateTransitions")]
    public class EntityStateTransition
    {
        [Key]
        [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
        public long StateTransitionId { get; set; }

        [Required]
        [StringLength(50)]
        public string EntityType { get; set; } = string.Empty; // "DEVICE", "VEHICLE", "OPERATIONAL_SESSION", "COLLECTION_EVENT"

        [Required]
        [StringLength(100)]
        public string EntityId { get; set; } = string.Empty; // String-encoded primary key (e.g. VehicleId, DeviceId, etc.)

        public int? PreviousStateDefinitionId { get; set; }

        public int NewStateDefinitionId { get; set; }

        public DateTime ChangedAt { get; set; } = DateTime.UtcNow;

        [StringLength(100)]
        public string? ChangedBy { get; set; }

        [StringLength(500)]
        public string? Reason { get; set; }

        [StringLength(50)]
        public string? Source { get; set; } // "ULB_OFFICER", "SYSTEM_HEARTBEAT", "ADMIN_PORTAL", "EDGE_DEVICE"

        [ForeignKey("PreviousStateDefinitionId")]
        public StateDefinition? PreviousStateDefinition { get; set; }

        [ForeignKey("NewStateDefinitionId")]
        public StateDefinition? NewStateDefinition { get; set; }
    }
}
