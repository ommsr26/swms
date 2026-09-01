using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using NetTopologySuite.Geometries;

namespace SWSTP.Telemetry.Backend.Models
{
    /// <summary>
    /// Motion-triggered solid waste collection evidence event.
    /// Created when an active session vehicle is within the assigned road buffer with fused speed &lt; 5 km/h
    /// and motion is detected in the rear-trolley camera ROI.
    /// Dual timestamping: CapturedAt (RTC edge time) vs ReceivedAt (backend ingestion time).
    /// </summary>
    [Table("CollectionEvents")]
    public class CollectionEvent
    {
        [Key]
        [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
        public long CollectionEventId { get; set; }

        public long OperationalSessionId { get; set; }

        public long SessionRoadAssignmentId { get; set; }

        public long VehicleId { get; set; }

        /// <summary>
        /// Edge device hardware capture timestamp (DS3231 RTC).
        /// </summary>
        public DateTime CapturedAt { get; set; }

        /// <summary>
        /// Backend server ingestion timestamp when payload was received.
        /// </summary>
        public DateTime ReceivedAt { get; set; } = DateTime.UtcNow;

        public double Latitude { get; set; }

        public double Longitude { get; set; }

        [Required]
        [Column(TypeName = "geography")]
        public Point Location { get; set; } = null!; // Point (SRID 4326)

        public double FusedSpeedKph { get; set; }

        public double MotionConfidence { get; set; }

        /// <summary>
        /// Distance in meters from vehicle GPS to nearest point on SessionRoadAssignment.AssignedGeometry.
        /// </summary>
        public double DistanceToRoadMeters { get; set; }

        public int StatusStateDefinitionId { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        [ForeignKey("OperationalSessionId")]
        public OperationalSession? OperationalSession { get; set; }

        [ForeignKey("SessionRoadAssignmentId")]
        public SessionRoadAssignment? SessionRoadAssignment { get; set; }

        [ForeignKey("VehicleId")]
        public VehicleRegistry? Vehicle { get; set; }

        [ForeignKey("StatusStateDefinitionId")]
        public StateDefinition? StatusStateDefinition { get; set; }

        public ICollection<EvidenceImage> EvidenceImages { get; set; } = new List<EvidenceImage>();
        public ICollection<CollectionEventHouse> ImpactedHouses { get; set; } = new List<CollectionEventHouse>();
    }
}
