using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SWSTP.Telemetry.Backend.Models
{
    [Table("SystemEvents")]
    public class SystemEvent
    {
        [Key]
        [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
        public long SystemEventId { get; set; }

        public long? SessionId { get; set; }

        public DateTime OccurredAt { get; set; } = DateTime.UtcNow;

        [Required]
        [StringLength(50)]
        public string EventType { get; set; } = string.Empty;

        [Required]
        [StringLength(20)]
        public string Severity { get; set; } = "INFO"; // INFO, WARNING, ERROR, CRITICAL

        [Required]
        [StringLength(50)]
        public string Source { get; set; } = "BACKEND"; // BACKEND, WEB_SERIAL, DATABASE

        [Required]
        public string Message { get; set; } = string.Empty;

        [ForeignKey("SessionId")]
        public TelemetrySession? Session { get; set; }
    }
}
