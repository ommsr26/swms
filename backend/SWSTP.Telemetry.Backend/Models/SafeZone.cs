using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SWSTP.Telemetry.Backend.Models
{
    [Table("SafeZones")]
    public class SafeZone
    {
        [Key]
        [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
        public long SafeZoneId { get; set; }

        [Required]
        [MaxLength(50)]
        public string UlbId { get; set; } = "ULB_MH_AMRAVATI";

        [Required]
        [MaxLength(200)]
        public string Name { get; set; } = "Municipal Depot / Safe Zone";

        public double Latitude { get; set; }

        public double Longitude { get; set; }

        public double RadiusMeters { get; set; } = 1000.0;

        public bool IsActive { get; set; } = true;

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

        [ForeignKey("UlbId")]
        public UlbRegistry? Ulb { get; set; }
    }
}
