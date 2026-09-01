using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using NetTopologySuite.Geometries;

namespace SWSTP.Telemetry.Backend.Models
{
    /// <summary>
    /// Specific road / segment assigned to an OperationalSession.
    /// Stores the operational coverage truth (AssignedGeometry) and spatial buffer distance.
    /// Supports shortening/trimming start and end of segments without mutating master road geometry.
    /// </summary>
    [Table("SessionRoadAssignments")]
    public class SessionRoadAssignment
    {
        [Key]
        [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
        public long SessionRoadAssignmentId { get; set; }

        public long OperationalSessionId { get; set; }

        public long RoadId { get; set; }

        public long? RoadSegmentId { get; set; }

        public long RoadGeometryVersionId { get; set; }

        /// <summary>
        /// Exact assigned geometry for this mission (default segment geometry or trimmed custom subsegment).
        /// </summary>
        [Required]
        [Column(TypeName = "geography")]
        public Geometry AssignedGeometry { get; set; } = null!; // LineString (SRID 4326)

        /// <summary>
        /// Spatial buffer distance in meters around AssignedGeometry for arming motion detection. Default 100m.
        /// </summary>
        public double BufferMeters { get; set; } = 100.0;

        [Required]
        [StringLength(50)]
        public string AssignmentType { get; set; } = "DEFAULT_SEGMENT"; // "DEFAULT_SEGMENT", "CUSTOM_SUBSEGMENT"

        public int AssignedOrder { get; set; } = 1;

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        [StringLength(100)]
        public string? CreatedBy { get; set; }

        public DateTime? UpdatedAt { get; set; }

        [StringLength(100)]
        public string? UpdatedBy { get; set; }

        [ForeignKey("OperationalSessionId")]
        public OperationalSession? OperationalSession { get; set; }

        [ForeignKey("RoadId")]
        public Road? Road { get; set; }

        [ForeignKey("RoadSegmentId")]
        public RoadSegment? RoadSegment { get; set; }

        [ForeignKey("RoadGeometryVersionId")]
        public RoadGeometryVersion? RoadGeometryVersion { get; set; }

        public ICollection<CollectionEvent> CollectionEvents { get; set; } = new List<CollectionEvent>();
    }
}
