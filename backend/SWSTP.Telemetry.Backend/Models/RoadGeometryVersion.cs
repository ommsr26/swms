using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using NetTopologySuite.Geometries;

namespace SWSTP.Telemetry.Backend.Models
{
    /// <summary>
    /// Immutable versioned geometry snapshot for a Road.
    /// Ensures historical operational coverage calculations remain reproducible over time.
    /// </summary>
    [Table("RoadGeometryVersions")]
    public class RoadGeometryVersion
    {
        [Key]
        [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
        public long RoadGeometryVersionId { get; set; }

        public long RoadId { get; set; }

        public int VersionNumber { get; set; } = 1;

        [Required]
        [Column(TypeName = "geography")]
        public Geometry Geometry { get; set; } = null!; // LineString or MultiLineString (SRID 4326)

        public DateTime EffectiveFrom { get; set; } = DateTime.UtcNow;

        public DateTime? EffectiveTo { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        [StringLength(100)]
        public string? CreatedBy { get; set; }

        [ForeignKey("RoadId")]
        public Road? Road { get; set; }

        public ICollection<RoadSegment> Segments { get; set; } = new List<RoadSegment>();
        public ICollection<SessionRoadAssignment> SessionAssignments { get; set; } = new List<SessionRoadAssignment>();
    }
}
