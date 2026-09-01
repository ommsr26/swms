using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using SWSTP.Telemetry.Backend.Data;

namespace SWSTP.Telemetry.Backend.Services
{
    /// <summary>
    /// Background worker that periodically executes retention cleanup policies:
    ///   1. Evidence image expiration cleanup (21 days)
    ///   2. Raw IMU sample auto-deletion (3 days) to maintain fast DB queries and smooth operation
    /// Runs once every 6 hours.
    /// </summary>
    public class RetentionCleanupService : BackgroundService
    {
        private readonly IServiceProvider _serviceProvider;
        private readonly ILogger<RetentionCleanupService> _logger;

        public RetentionCleanupService(
            IServiceProvider serviceProvider,
            ILogger<RetentionCleanupService> logger)
        {
            _serviceProvider = serviceProvider;
            _logger = logger;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            _logger.LogInformation("RetentionCleanupService background worker started.");

            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    using var scope = _serviceProvider.CreateScope();
                    var constants = scope.ServiceProvider.GetRequiredService<OperationalConstants>();
                    var db = scope.ServiceProvider.GetRequiredService<TelemetryDbContext>();

                    // 1. Evidence image retention cleanup (21 days)
                    var evidenceService = scope.ServiceProvider.GetRequiredService<IEvidenceService>();
                    var cleanedEvidence = await evidenceService.CleanupExpiredEvidenceAsync();
                    if (cleanedEvidence > 0)
                    {
                        _logger.LogInformation("RetentionCleanupService cleaned up {Count} expired evidence images.", cleanedEvidence);
                    }

                    // 2. IMU sample auto-deletion (3 days)
                    var imuCutoff = DateTime.UtcNow.AddDays(-constants.ImuSampleRetentionDays);
                    var deletedImuCount = await db.ImuSamples
                        .Where(s => s.Timestamp < imuCutoff)
                        .ExecuteDeleteAsync(stoppingToken);

                    if (deletedImuCount > 0)
                    {
                        _logger.LogInformation(
                            "RetentionCleanupService auto-deleted {Count} IMU samples older than {Days} days (cutoff={Cutoff:O}).",
                            deletedImuCount, constants.ImuSampleRetentionDays, imuCutoff);
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error during retention cleanup execution.");
                }

                // Wait 6 hours before next pass
                try
                {
                    await Task.Delay(TimeSpan.FromHours(6), stoppingToken);
                }
                catch (OperationCanceledException)
                {
                    break;
                }
            }

            _logger.LogInformation("RetentionCleanupService background worker stopped.");
        }
    }
}
