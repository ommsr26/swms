using System.Threading.Tasks;
using SWSTP.Telemetry.Backend.Models;

namespace SWSTP.Telemetry.Backend.Services
{
    public interface ITelemetryIngestionService
    {
        Task EnqueueBatchAsync(IngestBatchDto batch);
        Task<SessionIdentityDto?> GetOrCreateSessionIdentityForDeviceAsync(string deviceCode, string mode);
        Task EndSessionAsync(long sessionId, string status = "COMPLETED");
    }
}

