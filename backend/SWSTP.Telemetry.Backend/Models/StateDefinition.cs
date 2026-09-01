using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SWSTP.Telemetry.Backend.Models
{
    /// <summary>
    /// Database-backed reference catalog for domain/business state vocabulary.
    /// Manages lifecycles for DEVICE, VEHICLE, OPERATIONAL_SESSION, and COLLECTION_EVENT.
    /// Derived telemetry states (ONLINE/OFFLINE, FIX/NO_FIX, MOVING/STOPPED) are calculated dynamically and NOT stored here.
    /// </summary>
    [Table("StateDefinitions")]
    public class StateDefinition
    {
        [Key]
        [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
        public int StateDefinitionId { get; set; }

        [Required]
        [StringLength(50)]
        public string EntityType { get; set; } = string.Empty; // "DEVICE", "VEHICLE", "OPERATIONAL_SESSION", "COLLECTION_EVENT"

        [Required]
        [StringLength(50)]
        public string StateCode { get; set; } = string.Empty; // "IN_SERVICE", "SCHEDULED", "ACTIVE", etc.

        [Required]
        [StringLength(100)]
        public string DisplayName { get; set; } = string.Empty;

        [StringLength(255)]
        public string? Description { get; set; }

        public bool IsTerminal { get; set; } = false;

        public bool IsActive { get; set; } = true;

        public int SortOrder { get; set; } = 0;

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        public DateTime? UpdatedAt { get; set; }
    }
}
