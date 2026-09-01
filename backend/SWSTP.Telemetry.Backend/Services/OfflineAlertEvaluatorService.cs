using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using SWSTP.Telemetry.Backend.Data;
using SWSTP.Telemetry.Backend.Services.LiveState;

namespace SWSTP.Telemetry.Backend.Services
{
    /// <summary>
    /// Background evaluator that periodically inspects registered vehicles and checks
    /// telemetry timestamps against the authoritative offline threshold (60s).
    /// Raises a persistent TRUCK_OFFLINE alert when the threshold is crossed,
    /// deduplicating against existing active alerts and surviving server restarts.
    /// </summary>
    public class OfflineAlertEvaluatorService : BackgroundService
    {
        private readonly IServiceProvider _serviceProvider;
        private readonly ILiveTruckStateStore _liveStore;
        private readonly OperationalConstants _constants;
        private readonly ILogger<OfflineAlertEvaluatorService> _logger;

        public OfflineAlertEvaluatorService(
            IServiceProvider serviceProvider,
            ILiveTruckStateStore liveStore,
            OperationalConstants constants,
            ILogger<OfflineAlertEvaluatorService> logger)
        {
            _serviceProvider = serviceProvider;
            _liveStore = liveStore;
            _constants = constants;
            _logger = logger;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            _logger.LogInformation("OfflineAlertEvaluatorService background worker started (Interval: {Interval}ms, OfflineThreshold: {Threshold}s).",
                _constants.OfflineEvaluationIntervalMs, _constants.OfflineThresholdSeconds);

            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    await EvaluateOfflineVehiclesAsync();
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error occurred during offline vehicle alert evaluation.");
                }

                try
                {
                    await Task.Delay(_constants.OfflineEvaluationIntervalMs, stoppingToken);
                }
                catch (OperationCanceledException)
                {
                    break;
                }
            }

            _logger.LogInformation("OfflineAlertEvaluatorService background worker stopped.");
        }

        private async Task EvaluateOfflineVehiclesAsync()
        {
            using var scope = _serviceProvider.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<TelemetryDbContext>();
            var alertService = scope.ServiceProvider.GetRequiredService<IOperationalAlertService>();

            var now = DateTime.UtcNow;
            var offlineThresholdSec = _constants.OfflineThresholdSeconds;

            var vehicles = await db.VehicleRegistry
                .AsNoTracking()
                .Where(v => v.Status != "DECOMMISSIONED")
                .ToListAsync();

            foreach (var v in vehicles)
            {
                var liveState = _liveStore.GetByVehicleId(v.VehicleId);
                var lastSeen = liveState?.LastSeen ?? v.LastKnownTimestamp;

                if (lastSeen.HasValue)
                {
                    var ageSeconds = (now - lastSeen.Value).TotalSeconds;

                    if (ageSeconds > offlineThresholdSec)
                    {
                        var ulbId = v.UlbId ?? "ULB_MH_AMRAVATI";
                        await alertService.RaiseAlertAsync(
                            ulbId,
                            "TRUCK_OFFLINE",
                            "CRITICAL",
                            $"Vehicle {v.VehicleRegistrationNumber} offline: no telemetry received for {Math.Round(ageSeconds)}s",
                            v.VehicleId,
                            v.VehicleRegistrationNumber,
                            null,
                            $"{{\"offlineSeconds\": {Math.Round(ageSeconds)}}}");
                    }
                }
            }
        }
    }
}
