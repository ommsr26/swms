using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SWSTP.Telemetry.Backend.Models
{
    [Table("GnssEvents")]
    public class GnssEvent
    {
        [Key]
        [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
        public long GnssEventId { get; set; }

        public long SessionId { get; set; }

        public DateTime OccurredAt { get; set; } = DateTime.UtcNow;

        public long ArduinoUptimeMs { get; set; }

        [Required]
        [StringLength(50)]
        public string EventType { get; set; } = string.Empty;

        public int? Prn { get; set; }

        [StringLength(20)]
        public string? Constellation { get; set; }

        public string? Details { get; set; }

        [ForeignKey("SessionId")]
        public TelemetrySession? Session { get; set; }
    }
}
