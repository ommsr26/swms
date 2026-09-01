using System;
using System.IO;
using System.Security.Claims;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using SWSTP.Telemetry.Backend.Services;

namespace SWSTP.Telemetry.Backend.Controllers
{
    [ApiController]
    [Route("api/evidence")]
    public class EvidenceController : ControllerBase
    {
        private readonly IEvidenceService _evidenceService;
        private readonly ISessionAuthorizationService _authService;
        private readonly ILogger<EvidenceController> _logger;

        public EvidenceController(
            IEvidenceService evidenceService,
            ISessionAuthorizationService authService,
            ILogger<EvidenceController> logger)
        {
            _evidenceService = evidenceService;
            _authService = authService;
            _logger = logger;
        }

        /// <summary>
        /// Uploads an evidence image associated with a collection event.
        /// Destination path follows authoritative scheme: sessionimages/{ulbId}/{yyyy}/{MM}/{OperationalSessionId}/{EvidenceImageId}.jpg.
        /// </summary>
        [HttpPost("upload")]
        [RequestSizeLimit(10 * 1024 * 1024)] // 10 MB per evidence image
        public async Task<IActionResult> UploadEvidenceImage(
            [FromForm] long collectionEventId = 0,
            [FromForm] DateTime? capturedAt = null,
            [FromForm] int width = 1280,
            [FromForm] int height = 720,
            [FromForm] int compressionQuality = 70,
            [FromForm] string? idempotencyKey = null,
            [FromForm] double? latitude = null,
            [FromForm] double? longitude = null,
            [FromForm] double? speedKph = null,
            [FromForm] double? motionConfidence = null,
            [FromForm] long? sessionId = null,
            [FromForm] string? deviceId = null,
            [FromForm] string? ulbId = null,
            IFormFile? file = null)
        {
            if (collectionEventId < 0)
            {
                return BadRequest(new { success = false, message = "Invalid collectionEventId." });
            }

            // Read image binary from form file or raw request body
            byte[] imageBytes;
            if (file != null && file.Length > 0)
            {
                using var ms = new MemoryStream();
                await file.CopyToAsync(ms);
                imageBytes = ms.ToArray();
            }
            else if (Request.Body.CanRead && Request.ContentLength > 0)
            {
                using var ms = new MemoryStream();
                await Request.Body.CopyToAsync(ms);
                imageBytes = ms.ToArray();
            }
            else
            {
                return BadRequest(new { success = false, message = "No image payload provided." });
            }

            if (imageBytes.Length < 3 || imageBytes[0] != 0xFF || imageBytes[1] != 0xD8 || imageBytes[2] != 0xFF)
            {
                return BadRequest(new { success = false, message = "Payload is not a valid JPEG image (missing JPEG magic bytes FF D8 FF)." });
            }

            try
            {
                var timestamp = capturedAt ?? DateTime.UtcNow;
                var (image, _, relativePath) = await _evidenceService.SaveEvidenceImageAsync(
                    collectionEventId: collectionEventId,
                    imageBytes: imageBytes,
                    capturedAt: timestamp,
                    width: width,
                    height: height,
                    compressionQuality: compressionQuality,
                    idempotencyKey: idempotencyKey,
                    latitude: latitude,
                    longitude: longitude,
                    speedKph: speedKph,
                    motionConfidence: motionConfidence,
                    sessionId: sessionId,
                    deviceCode: deviceId,
                    ulbId: ulbId);

                return Ok(new
                {
                    success = true,
                    evidenceImageId = image.EvidenceImageId,
                    collectionEventId = image.CollectionEventId,
                    relativePath = relativePath,
                    imageUrl = $"/api/evidence/images/{image.EvidenceImageId}",
                    sha256Hash = image.Sha256Hash,
                    fileSizeBytes = image.FileSizeBytes,
                    width = image.Width,
                    height = image.Height,
                    compressionQuality = image.CompressionQuality,
                    capturedAt = image.CapturedAt,
                    expiresAt = image.ExpiresAt,
                    isIdempotent = image.CreatedAt < DateTime.UtcNow.AddSeconds(-2)
                });
            }
            catch (InvalidOperationException ex)
            {
                return NotFound(new { success = false, message = ex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to store evidence image for CollectionEvent #{EventId}: {Message}", collectionEventId, ex.Message);
                return StatusCode(500, new { success = false, message = $"Internal error storing evidence image: {ex.Message}", detail = ex.ToString() });
            }
        }

        /// <summary>
        /// Retrieves the JPEG image binary for an authorized caller.
        /// Enforces server-side ULB scoping and prevents path traversal.
        /// </summary>
        [HttpGet("images/{id:long}")]
        public async Task<IActionResult> GetImage(long id)
        {
            var isAuthorized = await _authService.AuthorizeImageAccessAsync(User, id);
            if (!isAuthorized)
            {
                return Forbid();
            }

            var imageResult = await _evidenceService.ReadImageBytesAsync(id);
            if (imageResult == null)
            {
                return NotFound(new { success = false, message = $"Evidence image #{id} not found or has been purged by retention cleaner." });
            }

            // Return JPEG with HTTP caching headers
            Response.Headers.Append("Cache-Control", "public, max-age=86400, immutable");
            return File(imageResult.Value.Bytes, imageResult.Value.ContentType);
        }

        /// <summary>
        /// Retrieves image metadata.
        /// </summary>
        [HttpGet("images/{id:long}/metadata")]
        public async Task<IActionResult> GetImageMetadata(long id)
        {
            var isAuthorized = await _authService.AuthorizeImageAccessAsync(User, id);
            if (!isAuthorized)
            {
                return Forbid();
            }

            var image = await _evidenceService.GetImageByIdAsync(id);
            if (image == null)
            {
                return NotFound(new { success = false, message = $"Evidence image #{id} not found." });
            }

            return Ok(new
            {
                evidenceImageId = image.EvidenceImageId,
                collectionEventId = image.CollectionEventId,
                relativePath = image.RelativePath,
                imageUrl = $"/api/evidence/images/{image.EvidenceImageId}",
                sha256Hash = image.Sha256Hash,
                fileSizeBytes = image.FileSizeBytes,
                width = image.Width,
                height = image.Height,
                compressionQuality = image.CompressionQuality,
                capturedAt = image.CapturedAt,
                expiresAt = image.ExpiresAt,
                isAvailable = image.IsAvailable,
                isDeleted = image.IsDeleted,
                deletedAt = image.DeletedAt
            });
        }
    }
}
