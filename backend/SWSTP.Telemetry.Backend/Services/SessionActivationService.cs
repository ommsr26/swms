using System;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace SWSTP.Telemetry.Backend.Services
{
    /// <summary>
    /// Background worker that monitors SCHEDULED operational sessions and automatically
    /// transitions them to ACTIVE when ScheduledStartAt is reached.
    /// Runs on a high-precision 2-second cadence (<= 2s activation lag).
    /// </summary>
    public class SessionActivationService : BackgroundService
    {
        private readonly IServiceProvider _serviceProvider;
        private readonly OperationalConstants _constants;
        private readonly ILogger<SessionActivationService> _logger;

        public SessionActivationService(
            IServiceProvider serviceProvider,
            OperationalConstants constants,
            ILogger<SessionActivationService> logger)
        {
            _serviceProvider = serviceProvider;
            _constants = constants;
            _logger = logger;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            _logger.LogInformation("SessionActivationService background worker started (Interval: {Interval}ms).",
                _constants.ActivationLoopIntervalMs);

            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    using var scope = _serviceProvider.CreateScope();
                    var sessionService = scope.ServiceProvider.GetRequiredService<IOperationalSessionService>();
                    int activated = await sessionService.ActivateScheduledSessionsAsync();
                    if (activated > 0)
                    {
                        _logger.LogInformation("SessionActivationService activated {Count} scheduled operational sessions.", activated);
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error occurred during scheduled session activation check.");
                }

                try
                {
                    await Task.Delay(_constants.ActivationLoopIntervalMs, stoppingToken);
                }
                catch (OperationCanceledException)
                {
                    break;
                }
            }

            _logger.LogInformation("SessionActivationService background worker stopped.");
        }
    }
}
