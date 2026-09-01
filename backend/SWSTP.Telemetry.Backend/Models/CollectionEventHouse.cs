using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SWSTP.Telemetry.Backend.Models
{
    /// <summary>
    /// Temporal association linking a CollectionEvent to houses within its 10m evidence radius.
    /// Does NOT mutate the master House entity.
    /// </summary>
    [Table("CollectionEventHouses")]
    public class CollectionEventHouse
    {
        [Key]
        [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
        public long CollectionEventHouseId { get; set; }

        public long CollectionEventId { get; set; }

        [Required]
        [StringLength(50)]
        public string HouseId { get; set; } = string.Empty;

        /// <summary>
        /// Exact distance in meters between CollectionEvent GPS point and House location.
        /// </summary>
        public double DistanceMeters { get; set; }

        /// <summary>
        /// Coverage evidence radius in meters (Default: 10.0m).
        /// </summary>
        public double CoverageRadiusMeters { get; set; } = 10.0;

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        [ForeignKey("CollectionEventId")]
        public CollectionEvent? CollectionEvent { get; set; }

        [ForeignKey("HouseId")]
        public House? House { get; set; }
    }
}
