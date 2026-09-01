using System.Collections.Generic;
using System.Threading.Tasks;
using SWSTP.Telemetry.Backend.Models;

namespace SWSTP.Telemetry.Backend.Services
{
    public interface IRoadAssignmentService
    {
        Task<SessionRoadAssignment> CreateAssignmentAsync(
            long sessionId,
            long roadId,
            long roadGeometryVersionId,
            long? roadSegmentId,
            string? customGeometryWkt,
            double? bufferMeters,
            string assignmentType,
            int assignedOrder,
            string createdBy);

        Task<List<SessionRoadAssignment>> GetAssignmentsAsync(long sessionId, string? ulbId = null);
        Task<bool> UpdateBufferMetersAsync(long assignmentId, double bufferMeters, string ulbId, string updatedBy);
    }
}
