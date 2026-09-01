using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using NetTopologySuite.Geometries;

namespace SWSTP.Telemetry.Backend.Models
{
    /// <summary>
    /// Natural operational section of a road (e.g. between intersections, turns, or endpoints).
    /// Strictly bound to an immutable RoadGeometryVersion.
    /// </summary>
    [Table("RoadSegments")]
    public class RoadSegment
    {
        [Key]
        [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
        public long RoadSegmentId { get; set; }

        public long RoadId { get; set; }

        public long RoadGeometryVersionId { get; set; }

        [Required]
        [StringLength(50)]
        public string SegmentCode { get; set; } = string.Empty;

        [Required]
        [StringLength(150)]
        public string SegmentName { get; set; } = string.Empty;

        [Required]
        [Column(TypeName = "geography")]
        public Geometry Geometry { get; set; } = null!; // LineString (SRID 4326)

        [StringLength(100)]
        public string? StartNodeReference { get; set; }

        [StringLength(100)]
        public string? EndNodeReference { get; set; }

        public double LengthMeters { get; set; }

        public int Sequence { get; set; } = 1;

        public bool IsActive { get; set; } = true;

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        public DateTime? UpdatedAt { get; set; }

        [ForeignKey("RoadId")]
        public Road? Road { get; set; }

        [ForeignKey("RoadGeometryVersionId")]
        public RoadGeometryVersion? RoadGeometryVersion { get; set; }

        public ICollection<SessionRoadAssignment> SessionAssignments { get; set; } = new List<SessionRoadAssignment>();
    }
}
