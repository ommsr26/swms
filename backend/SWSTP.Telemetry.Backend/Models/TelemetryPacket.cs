using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SWSTP.Telemetry.Backend.Models
{
    [Table("TelemetryPackets")]
    public class TelemetryPacket
    {
        [Key]
        [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
        public long TelemetryPacketId { get; set; }

        public long SessionId { get; set; }

        public long SequenceNumber { get; set; }

        public DateTime ReceivedAt { get; set; } = DateTime.UtcNow;

        public long ArduinoUptimeMs { get; set; }

        public DateTime? RtcTimestamp { get; set; }

        [Required]
        public string RawJson { get; set; } = string.Empty;

        [Required]
        [StringLength(20)]
        public string ParserStatus { get; set; } = "OK";

        [ForeignKey("SessionId")]
        public TelemetrySession? Session { get; set; }
    }
}
