using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SWSTP.Telemetry.Backend.Models
{
    [Table("OperationalAlerts")]
    public class OperationalAlert
    {
        [Key]
        [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
        public long AlertId { get; set; }

        [Required]
        [StringLength(50)]
        public string UlbId { get; set; } = string.Empty;

        public long? VehicleId { get; set; }

        [StringLength(50)]
        public string? VehicleRegistrationNumber { get; set; }

        public long? OperationalSessionId { get; set; }

        [Required]
        [StringLength(50)]
        public string AlertType { get; set; } = string.Empty; // TRUCK_OFFLINE, GPS_UNAVAILABLE, PROLONGED_IDLE, ROUTE_DEVIATION

        [Required]
        [StringLength(20)]
        public string Severity { get; set; } = "WARNING"; // CRITICAL, WARNING, INFO

        [Required]
        [StringLength(20)]
        public string Status { get; set; } = "ACTIVE"; // ACTIVE, RESOLVED

        [Required]
        [StringLength(500)]
        public string Message { get; set; } = string.Empty;

        public string? ContextJson { get; set; }

        [Required]
        [StringLength(100)]
        public string DeduplicationKey { get; set; } = string.Empty; // e.g. {UlbId}:{VehicleId}:{AlertType}

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        public DateTime? ResolvedAt { get; set; }

        public DateTime LastEvaluatedAt { get; set; } = DateTime.UtcNow;

        public bool IsAcknowledged { get; set; } = false;

        public DateTime? AcknowledgedAt { get; set; }

        [StringLength(100)]
        public string? AcknowledgedBy { get; set; }
    }
}
