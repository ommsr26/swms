using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SWSTP.Telemetry.Backend.Models
{
    [Table("GnssSatelliteObservations")]
    public class GnssSatelliteObservation
    {
        [Key]
        [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
        public long ObservationId { get; set; }

        public long SessionId { get; set; }

        public long SequenceNumber { get; set; }

        public DateTime ObservedAt { get; set; }

        public int? GsvSeq { get; set; }

        public int Prn { get; set; }

        [Required]
        [StringLength(20)]
        public string Constellation { get; set; } = "UNKNOWN";

        public double? ElevationDeg { get; set; }

        public double? AzimuthDeg { get; set; }

        public double? SnrDbHz { get; set; }

        public bool UsedInFix { get; set; }

        [Required]
        [StringLength(20)]
        public string Status { get; set; } = "VISIBLE";
    }
}
