using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using SWSTP.Telemetry.Backend.Models;

namespace SWSTP.Telemetry.Backend.Services
{
    public interface IEvidenceService
    {
        Task<EvidenceImage> RecordImageAsync(
            long collectionEventId,
            string relativePath,
            DateTime capturedAt,
            long fileSizeBytes,
            int width,
            int height,
            int compressionQuality = 70,
            string? sha256Hash = null,
            string? idempotencyKey = null);

        Task<(EvidenceImage Image, string PhysicalPath, string RelativePath)> SaveEvidenceImageAsync(
            long collectionEventId,
            byte[] imageBytes,
            DateTime capturedAt,
            int width = 1280,
            int height = 720,
            int compressionQuality = 70,
            string? idempotencyKey = null,
            double? latitude = null,
            double? longitude = null,
            double? speedKph = null,
            double? motionConfidence = null,
            long? sessionId = null,
            string? deviceCode = null,
            string? ulbId = null);

        Task<EvidenceImage?> GetImageByIdAsync(long evidenceImageId);

        Task<List<EvidenceImage>> GetImagesAsync(long collectionEventId);

        Task<(byte[] Bytes, string ContentType)?> ReadImageBytesAsync(long evidenceImageId);

        Task<int> CleanupExpiredEvidenceAsync();
    }
}
