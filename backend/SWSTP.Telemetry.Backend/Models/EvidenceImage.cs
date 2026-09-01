using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SWSTP.Telemetry.Backend.Models
{
    /// <summary>
    /// Storage metadata for 21-day compressed JPEG evidence images.
    /// Physical images are stored in filesystem under sessionimages/{ULB}/{YYYY}/{MM}/{OperationalSessionId}/{EvidenceImageId}.jpg.
    /// Lifecycle (AVAILABLE, EXPIRED, DELETED) is derived purely from temporal timestamps.
    /// </summary>
    [Table("EvidenceImages")]
    public class EvidenceImage
    {
        [Key]
        [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
        public long EvidenceImageId { get; set; }

        public long CollectionEventId { get; set; }

        /// <summary>
        /// Relative filesystem storage path (never absolute OS path).
        /// </summary>
        [Required]
        [StringLength(300)]
        public string RelativePath { get; set; } = string.Empty;

        public DateTime CapturedAt { get; set; }

        /// <summary>
        /// Automatic expiration timestamp (typically CapturedAt + 21 days).
        /// Indexed for fast daily cleanup worker query.
        /// </summary>
        public DateTime ExpiresAt { get; set; }

        public long FileSizeBytes { get; set; }

        public int Width { get; set; }

        public int Height { get; set; }

        public int CompressionQuality { get; set; } = 70;

        /// <summary>
        /// Hex-encoded SHA-256 hash of the stored JPEG binary for cryptographic verification.
        /// </summary>
        [StringLength(64)]
        public string? Sha256Hash { get; set; }

        /// <summary>
        /// Client/gateway-supplied idempotency key to prevent duplicate upload on network retry.
        /// </summary>
        [StringLength(100)]
        public string? IdempotencyKey { get; set; }

        /// <summary>
        /// Timestamp when the physical image file was deleted by retention cleaner.
        /// CollectionEvent metadata remains preserved for 6 months.
        /// </summary>
        public DateTime? DeletedAt { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        [ForeignKey("CollectionEventId")]
        public CollectionEvent? CollectionEvent { get; set; }

        // Derived temporal lifecycle helpers (not mapped as db columns)
        [NotMapped]
        public bool IsAvailable => DeletedAt == null && DateTime.UtcNow <= ExpiresAt;

        [NotMapped]
        public bool IsExpired => DeletedAt == null && DateTime.UtcNow > ExpiresAt;

        [NotMapped]
        public bool IsDeleted => DeletedAt != null;
    }
}
