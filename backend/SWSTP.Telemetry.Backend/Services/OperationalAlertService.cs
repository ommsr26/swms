using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using SWSTP.Telemetry.Backend.Data;
using SWSTP.Telemetry.Backend.Hubs;
using SWSTP.Telemetry.Backend.Models;

namespace SWSTP.Telemetry.Backend.Services
{
    public class OperationalAlertService : IOperationalAlertService
    {
        private readonly IServiceProvider _serviceProvider;
        private readonly IHubContext<TelemetryHub> _hubContext;
        private readonly ILogger<OperationalAlertService> _logger;

        // In-memory idle tracking per vehicle: VehicleId -> StationarySince
        private static readonly ConcurrentDictionary<long, DateTime> _stationarySinceMap = new();

        public OperationalAlertService(
            IServiceProvider serviceProvider,
            IHubContext<TelemetryHub> hubContext,
            ILogger<OperationalAlertService> logger)
        {
            _serviceProvider = serviceProvider;
            _hubContext = hubContext;
            _logger = logger;
        }

        public async Task<OperationalAlert> RaiseAlertAsync(
            string ulbId,
            string alertType,
            string severity,
            string message,
            long? vehicleId = null,
            string? vehicleReg = null,
            long? sessionId = null,
            string? contextJson = null)
        {
            if (string.IsNullOrWhiteSpace(ulbId)) ulbId = "ULB_MH_AMRAVATI";
            var deduplicationKey = $"{ulbId.ToUpperInvariant()}:{vehicleId ?? 0}:{alertType.ToUpperInvariant()}";

            using var scope = _serviceProvider.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<TelemetryDbContext>();

            // Check if active alert already exists with this deduplication key
            var existing = await db.OperationalAlerts
                .FirstOrDefaultAsync(a => a.DeduplicationKey == deduplicationKey && a.Status == "ACTIVE");

            if (existing != null)
            {
                existing.LastEvaluatedAt = DateTime.UtcNow;
                if (!string.IsNullOrWhiteSpace(contextJson)) existing.ContextJson = contextJson;
                await db.SaveChangesAsync();
                return existing;
            }

            var alert = new OperationalAlert
            {
                UlbId = ulbId,
                VehicleId = vehicleId,
                VehicleRegistrationNumber = vehicleReg,
                OperationalSessionId = sessionId,
                AlertType = alertType,
                Severity = severity,
                Status = "ACTIVE",
                Message = message,
                ContextJson = contextJson,
                DeduplicationKey = deduplicationKey,
                CreatedAt = DateTime.UtcNow,
                LastEvaluatedAt = DateTime.UtcNow,
            };

            db.OperationalAlerts.Add(alert);
            await db.SaveChangesAsync();

            _logger.LogInformation("[ALERT RAISED] {UlbId} {AlertType} on Vehicle #{VehicleId} ({VehicleReg}): {Message}",
                ulbId, alertType, vehicleId, vehicleReg, message);

            // Broadcast via SignalR to ULB fleet group
            try
            {
                var groupName = $"fleet:{ulbId.ToUpperInvariant()}";
                await _hubContext.Clients.Group(groupName).SendAsync("AlertRaised", new
                {
                    alertId = alert.AlertId,
                    ulbId = alert.UlbId,
                    vehicleId = alert.VehicleId,
                    vehicleRegistration = alert.VehicleRegistrationNumber,
                    sessionId = alert.OperationalSessionId,
                    alertType = alert.AlertType,
                    severity = alert.Severity,
                    status = alert.Status,
                    message = alert.Message,
                    contextJson = alert.ContextJson,
                    createdAt = alert.CreatedAt.ToString("o"),
                });
            }
            catch (Exception ex)
            {
                _logger.LogWarning("Failed to broadcast SignalR alert {AlertId}: {Error}", alert.AlertId, ex.Message);
            }

            return alert;
        }

        public async Task<bool> ResolveAlertAsync(
            string ulbId,
            string alertType,
            long? vehicleId = null,
            string? recoveryMessage = null)
        {
            if (string.IsNullOrWhiteSpace(ulbId)) ulbId = "ULB_MH_AMRAVATI";
            var deduplicationKey = $"{ulbId.ToUpperInvariant()}:{vehicleId ?? 0}:{alertType.ToUpperInvariant()}";

            using var scope = _serviceProvider.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<TelemetryDbContext>();

            var existing = await db.OperationalAlerts
                .FirstOrDefaultAsync(a => a.DeduplicationKey == deduplicationKey && a.Status == "ACTIVE");

            if (existing == null) return false;

            existing.Status = "RESOLVED";
            existing.ResolvedAt = DateTime.UtcNow;
            existing.LastEvaluatedAt = DateTime.UtcNow;
            if (!string.IsNullOrWhiteSpace(recoveryMessage))
            {
                existing.Message = $"{existing.Message} [Resolved: {recoveryMessage}]";
            }

            await db.SaveChangesAsync();

            _logger.LogInformation("[ALERT RESOLVED] {UlbId} {AlertType} on Vehicle #{VehicleId}", ulbId, alertType, vehicleId);

            // Broadcast resolution via SignalR
            try
            {
                var groupName = $"fleet:{ulbId.ToUpperInvariant()}";
                await _hubContext.Clients.Group(groupName).SendAsync("AlertResolved", new
                {
                    alertId = existing.AlertId,
                    alertType = existing.AlertType,
                    status = "RESOLVED",
                    resolvedAt = existing.ResolvedAt?.ToString("o"),
                });
            }
            catch (Exception ex)
            {
                _logger.LogWarning("Failed to broadcast SignalR resolution {AlertId}: {Error}", existing.AlertId, ex.Message);
            }

            return true;
        }

        public async Task<List<OperationalAlert>> GetAlertsAsync(string ulbId, string? status = null, int limit = 100)
        {
            using var scope = _serviceProvider.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<TelemetryDbContext>();

            var query = db.OperationalAlerts
                .AsNoTracking()
                .Where(a => a.UlbId == ulbId);

            if (!string.IsNullOrWhiteSpace(status))
            {
                query = query.Where(a => a.Status == status);
            }

            return await query
                .OrderByDescending(a => a.CreatedAt)
                .Take(limit)
                .ToListAsync();
        }

        public async Task<bool> AcknowledgeAlertAsync(long alertId, string? acknowledgedBy = null)
        {
            using var scope = _serviceProvider.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<TelemetryDbContext>();

            var alert = await db.OperationalAlerts.FirstOrDefaultAsync(a => a.AlertId == alertId);
            if (alert == null) return false;

            alert.IsAcknowledged = true;
            alert.AcknowledgedAt = DateTime.UtcNow;
            alert.AcknowledgedBy = acknowledgedBy ?? "OFFICER";

            await db.SaveChangesAsync();
            return true;
        }

        public async Task EvaluateTelemetryAlertsAsync(
            string ulbId,
            long? vehicleId,
            string? vehicleReg,
            long? sessionId,
            bool isGnssValid,
            double? speedKmh,
            bool isInsideSafeZone,
            DateTime lastSeenTimestamp)
        {
            if (string.IsNullOrWhiteSpace(ulbId)) return;

            // 1. Telemetry Arrival automatically resolves any active TRUCK_OFFLINE alert
            await ResolveAlertAsync(ulbId, "TRUCK_OFFLINE", vehicleId, "Telemetry resumed");

            // 2. GNSS Fix Evaluation
            if (!isGnssValid)
            {
                await RaiseAlertAsync(
                    ulbId,
                    "GPS_UNAVAILABLE",
                    "WARNING",
                    $"GNSS signal lost or fix invalid for vehicle {vehicleReg ?? "N/A"}",
                    vehicleId,
                    vehicleReg,
                    sessionId);
            }
            else
            {
                await ResolveAlertAsync(ulbId, "GPS_UNAVAILABLE", vehicleId, "Valid GNSS fix restored");
            }

            // 3. Prolonged Idle Evaluation (outside Safe Zone only)
            if (vehicleId.HasValue)
            {
                var vId = vehicleId.Value;
                var currentSpeed = speedKmh ?? 0.0;

                if (isInsideSafeZone || currentSpeed >= 3.0)
                {
                    // Moving or inside depot: reset idle counter & resolve any active PROLONGED_IDLE
                    _stationarySinceMap.TryRemove(vId, out _);
                    await ResolveAlertAsync(ulbId, "PROLONGED_IDLE", vehicleId, "Vehicle moving or entered Safe Zone");
                }
                else if (currentSpeed < 1.0)
                {
                    // Stationary outside safe zone
                    var stationarySince = _stationarySinceMap.GetOrAdd(vId, lastSeenTimestamp);
                    var idleDurationSec = (lastSeenTimestamp - stationarySince).TotalSeconds;

                    // Idle threshold: 5 minutes (300 seconds)
                    if (idleDurationSec >= 300.0)
                    {
                        await RaiseAlertAsync(
                            ulbId,
                            "PROLONGED_IDLE",
                            "WARNING",
                            $"Vehicle {vehicleReg ?? "N/A"} stationary outside Safe Zone for {Math.Round(idleDurationSec / 60.0)} mins",
                            vehicleId,
                            vehicleReg,
                            sessionId,
                            contextJson: $"{{\"idleSeconds\": {Math.Round(idleDurationSec)}}}");
                    }
                }
            }
        }
    }
}
