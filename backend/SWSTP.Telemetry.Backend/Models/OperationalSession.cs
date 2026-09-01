using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SWSTP.Telemetry.Backend.Models
{
    /// <summary>
    /// Municipal operational coverage mission session.
    /// Represents an operational assignment overlay on continuous GPS telemetry.
    /// One vehicle may have at most one active operational session (ACTIVE or PAUSED),
    /// enforced by the IsActiveReservation filtered unique index.
    /// </summary>
    [Table("OperationalSessions")]
    public class OperationalSession
    {
        [Key]
        [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
        public long OperationalSessionId { get; set; }

        [Required]
        [StringLength(50)]
        public string UlbId { get; set; } = string.Empty;

        public long VehicleId { get; set; }

        [Required]
        [StringLength(50)]
        public string SessionCode { get; set; } = string.Empty; // e.g. "OPS-NAGPUR-20260817-001"

        [Required]
        [StringLength(150)]
        public string Name { get; set; } = string.Empty;

        [StringLength(500)]
        public string? Description { get; set; }

        public int StatusStateDefinitionId { get; set; }

        /// <summary>
        /// True when session is currently in an active or paused state that reserves the vehicle.
        /// Backed by filtered unique index UX_OperationalSession_OneActiveReservationPerVehicle.
        /// </summary>
        public bool IsActiveReservation { get; set; } = false;

        public DateTime ScheduledStartAt { get; set; }

        // NOTE: There is NO ScheduledEndAt. Sessions end via coverage completion,
        // explicit officer action, or abort. See locked business rules.

        public DateTime? ActualStartAt { get; set; }

        public DateTime? ActualEndAt { get; set; }

        public DateTime? CompletedAt { get; set; }

        /// <summary>
        /// Populated when session is COMPLETED. Values: "AUTO_COVERAGE_100", "OFFICER_NORMAL", "OFFICER_EARLY".
        /// Null until session is completed.
        /// </summary>
        [StringLength(100)]
        public string? CompletionReason { get; set; }

        /// <summary>
        /// Required when session is ABORTED. Records the reason for early termination.
        /// </summary>
        [StringLength(500)]
        public string? AbortReason { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        [StringLength(100)]
        public string? CreatedBy { get; set; }

        public DateTime? UpdatedAt { get; set; }

        [StringLength(100)]
        public string? UpdatedBy { get; set; }

        [ForeignKey("UlbId")]
        public UlbRegistry? Ulb { get; set; }

        [ForeignKey("VehicleId")]
        public VehicleRegistry? Vehicle { get; set; }

        [ForeignKey("StatusStateDefinitionId")]
        public StateDefinition? StatusStateDefinition { get; set; }

        public ICollection<SessionRoadAssignment> RoadAssignments { get; set; } = new List<SessionRoadAssignment>();
        public ICollection<CollectionEvent> CollectionEvents { get; set; } = new List<CollectionEvent>();
    }
}
