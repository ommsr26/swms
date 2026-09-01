using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SWSTP.Telemetry.Backend.Models
{
    [Table("GnssSamples")]
    public class GnssSample
    {
        [Key]
        [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
        public long GnssSampleId { get; set; }

        public long SessionId { get; set; }

        public long SequenceNumber { get; set; }

        public long ArduinoUptimeMs { get; set; }

        public DateTime Timestamp { get; set; }

        [Required]
        [StringLength(20)]
        public string FixStatus { get; set; } = "NO_FIX";

        public bool FixValid { get; set; }

        public double? Latitude { get; set; } // MUST PRESERVE NULL WHEN NO_FIX! NEVER 0.0
        public double? Longitude { get; set; } // MUST PRESERVE NULL WHEN NO_FIX! NEVER 0.0

        public double? RawLatitude { get; set; }
        public double? RawLongitude { get; set; }

        public double? DisplayLatitude { get; set; }
        public double? DisplayLongitude { get; set; }

        public bool IsInsideSafeZone { get; set; }
        public bool IsSnapped { get; set; }

        public double? AltitudeM { get; set; } // MUST PRESERVE NULL WHEN NO_FIX! NEVER 0.0

        public double? SpeedKmh { get; set; }

        public double? CourseDeg { get; set; }

        public int SatellitesCount { get; set; }

        public int SatellitesInView { get; set; } // STRICTLY A COUNT

        public int SatellitesUsed { get; set; }

        public double? Hdop { get; set; }

        public int? GsvSeq { get; set; }

        public long? GsvUptimeMs { get; set; }
    }
}
