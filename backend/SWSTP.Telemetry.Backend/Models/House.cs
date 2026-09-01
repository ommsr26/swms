using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using NetTopologySuite.Geometries;

namespace SWSTP.Telemetry.Backend.Models
{
    /// <summary>
    /// Master municipal house/property entity.
    /// Used for geographic 10m evidence radius association during collection events.
    /// Houses are NOT directly assigned to operational sessions.
    /// </summary>
    [Table("Houses")]
    public class House
    {
        [Key]
        [StringLength(50)]
        public string HouseId { get; set; } = string.Empty; // Municipal property tax / house identifier

        [Required]
        [StringLength(50)]
        public string UlbId { get; set; } = string.Empty;

        public double Latitude { get; set; }

        public double Longitude { get; set; }

        [Required]
        [Column(TypeName = "geography")]
        public Point Location { get; set; } = null!; // Point (SRID 4326)

        [StringLength(255)]
        public string? Address { get; set; }

        public bool IsActive { get; set; } = true;

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        public DateTime? UpdatedAt { get; set; }

        [ForeignKey("UlbId")]
        public UlbRegistry? Ulb { get; set; }

        public ICollection<CollectionEventHouse> CollectionEvents { get; set; } = new List<CollectionEventHouse>();
    }
}
