using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SWSTP.Telemetry.Backend.Models
{
    [Table("ImuSamples")]
    public class ImuSample
    {
        [Key]
        [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
        public long ImuSampleId { get; set; }

        public long SessionId { get; set; }

        public long SequenceNumber { get; set; }

        public long ArduinoUptimeMs { get; set; }

        public DateTime Timestamp { get; set; }

        public double? AccelX { get; set; }
        public double? AccelY { get; set; }
        public double? AccelZ { get; set; }
        public double? AccelMagnitude { get; set; }

        public double? GyroX { get; set; }
        public double? GyroY { get; set; }
        public double? GyroZ { get; set; }

        public double? TemperatureC { get; set; }

        public double? Roll { get; set; }
        public double? Pitch { get; set; }
        public double? Yaw { get; set; }

        [StringLength(50)]
        public string? YawSource { get; set; }

        public double? QuaternionW { get; set; }
        public double? QuaternionX { get; set; }
        public double? QuaternionY { get; set; }
        public double? QuaternionZ { get; set; }

        public bool IsValid { get; set; } = true;
    }
}
