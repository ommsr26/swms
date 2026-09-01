using System.Threading.Tasks;

namespace SWSTP.Telemetry.Backend.Services
{
    public interface IAuditService
    {
        Task RecordAsync(
            string action,
            string entityType,
            string entityId,
            string performedBy,
            string? ulbId = null,
            object? details = null,
            string? clientIp = null);
    }
}
