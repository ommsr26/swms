using System;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using SWSTP.Telemetry.Backend.Data;
using SWSTP.Telemetry.Backend.Models;

namespace SWSTP.Telemetry.Backend.Services
{
    public class AuditService : IAuditService
    {
        private readonly IServiceProvider _serviceProvider;
        private readonly ILogger<AuditService> _logger;

        public AuditService(IServiceProvider serviceProvider, ILogger<AuditService> logger)
        {
            _serviceProvider = serviceProvider;
            _logger = logger;
        }

        public async Task RecordAsync(
            string action,
            string entityType,
            string entityId,
            string performedBy,
            string? ulbId = null,
            object? details = null,
            string? clientIp = null)
        {
            try
            {
                using var scope = _serviceProvider.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<TelemetryDbContext>();

                string? detailsJson = null;
                if (details != null)
                {
                    detailsJson = details is string s ? s : JsonSerializer.Serialize(details);
                }

                var auditLog = new AuditLog
                {
                    Action = action,
                    EntityType = entityType,
                    EntityId = entityId,
                    PerformedBy = performedBy,
                    UlbId = ulbId,
                    DetailsJson = detailsJson,
                    ClientIp = clientIp,
                    PerformedAt = DateTime.UtcNow
                };

                db.AuditLogs.Add(auditLog);
                await db.SaveChangesAsync();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to persist AuditLog: {Action} on {EntityType}:{EntityId} by {PerformedBy}",
                    action, entityType, entityId, performedBy);
            }
        }
    }
}
