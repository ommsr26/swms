using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using SWSTP.Telemetry.Backend.Models;

namespace SWSTP.Telemetry.Backend.Services
{
    public interface IOperationalAlertService
    {
        Task<OperationalAlert> RaiseAlertAsync(
            string ulbId,
            string alertType,
            string severity,
            string message,
            long? vehicleId = null,
            string? vehicleReg = null,
            long? sessionId = null,
            string? contextJson = null);

        Task<bool> ResolveAlertAsync(
            string ulbId,
            string alertType,
            long? vehicleId = null,
            string? recoveryMessage = null);

        Task<List<OperationalAlert>> GetAlertsAsync(string ulbId, string? status = null, int limit = 100);

        Task<bool> AcknowledgeAlertAsync(long alertId, string? acknowledgedBy = null);

        Task EvaluateTelemetryAlertsAsync(
            string ulbId,
            long? vehicleId,
            string? vehicleReg,
            long? sessionId,
            bool isGnssValid,
            double? speedKmh,
            bool isInsideSafeZone,
            DateTime lastSeenTimestamp);
    }
}
