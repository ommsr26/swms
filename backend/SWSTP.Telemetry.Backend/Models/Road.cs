using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SWSTP.Telemetry.Backend.Models
{
    /// <summary>
    /// Master road catalog entity scoped to an Urban Local Body (ULB).
    /// </summary>
    [Table("Roads")]
    public class Road
    {
        [Key]
        [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
        public long RoadId { get; set; }

        [Required]
        [StringLength(50)]
        public string UlbId { get; set; } = string.Empty;

        [Required]
        [StringLength(50)]
        public string RoadCode { get; set; } = string.Empty;

        [Required]
        [StringLength(150)]
        public string RoadName { get; set; } = string.Empty;

        [StringLength(50)]
        public string? RoadType { get; set; } // "PRIMARY", "SECONDARY", "RESIDENTIAL", "COMMERCIAL"

        public bool IsActive { get; set; } = true;

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        [StringLength(100)]
        public string? CreatedBy { get; set; }

        public DateTime? UpdatedAt { get; set; }

        [StringLength(100)]
        public string? UpdatedBy { get; set; }

        [ForeignKey("UlbId")]
        public UlbRegistry? Ulb { get; set; }

        public ICollection<RoadGeometryVersion> GeometryVersions { get; set; } = new List<RoadGeometryVersion>();
        public ICollection<RoadSegment> Segments { get; set; } = new List<RoadSegment>();
        public ICollection<SessionRoadAssignment> SessionAssignments { get; set; } = new List<SessionRoadAssignment>();
    }
}
