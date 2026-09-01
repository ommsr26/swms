using System;
using System.Threading.Tasks;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Logging;
using SWSTP.Telemetry.Backend.Services;

namespace SWSTP.Telemetry.Backend.Hubs
{
    /// <summary>
    /// Real-time SignalR Telemetry Hub for pushing live GNSS, IMU, fused speed,
    /// and operational session state updates to connected clients.
    ///
    /// Clients subscribe to session groups or ULB fleet groups.
    /// Authorization is enforced server-side via ISessionAuthorizationService.
    /// </summary>
    public class TelemetryHub : Hub
    {
        private readonly ISessionAuthorizationService _authService;
        private readonly ILogger<TelemetryHub> _logger;

        public TelemetryHub(
            ISessionAuthorizationService authService,
            ILogger<TelemetryHub> logger)
        {
            _authService = authService;
            _logger = logger;
        }

        /// <summary>
        /// Subscribes the caller's connection to real-time updates for a specific telemetry/operational session.
        /// </summary>
        public async Task SubscribeToSession(long sessionId)
        {
            var isAuthorized = await _authService.AuthorizeSessionSubscriptionAsync(Context.User, sessionId);
            if (!isAuthorized)
            {
                _logger.LogWarning("Connection {ConnectionId} unauthorized to subscribe to session #{SessionId}", Context.ConnectionId, sessionId);
                throw new HubException($"Unauthorized: Caller does not have access to session #{sessionId}.");
            }

            await Groups.AddToGroupAsync(Context.ConnectionId, $"session:{sessionId}");
            _logger.LogInformation("Connection {ConnectionId} subscribed to session:{SessionId}", Context.ConnectionId, sessionId);
        }

        /// <summary>
        /// Unsubscribes from session updates.
        /// </summary>
        public async Task UnsubscribeFromSession(long sessionId)
        {
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, $"session:{sessionId}");
            _logger.LogInformation("Connection {ConnectionId} unsubscribed from session:{SessionId}", Context.ConnectionId, sessionId);
        }

        /// <summary>
        /// Subscribes the caller to live fleet updates for an Urban Local Body.
        /// </summary>
        public async Task SubscribeToFleet(string ulbId)
        {
            if (string.IsNullOrWhiteSpace(ulbId))
            {
                throw new HubException("ulbId is required.");
            }

            var isAuthorized = await _authService.AuthorizeFleetSubscriptionAsync(Context.User, ulbId);
            if (!isAuthorized)
            {
                _logger.LogWarning("Connection {ConnectionId} unauthorized to subscribe to fleet for ULB '{UlbId}'", Context.ConnectionId, ulbId);
                throw new HubException($"Unauthorized: Caller does not have access to ULB '{ulbId}'.");
            }

            var groupName = $"fleet:{ulbId.ToUpperInvariant()}";
            await Groups.AddToGroupAsync(Context.ConnectionId, groupName);
            _logger.LogInformation("Connection {ConnectionId} subscribed to {GroupName}", Context.ConnectionId, groupName);
        }

        /// <summary>
        /// Unsubscribes from ULB fleet updates.
        /// </summary>
        public async Task UnsubscribeFromFleet(string ulbId)
        {
            if (!string.IsNullOrWhiteSpace(ulbId))
            {
                var groupName = $"fleet:{ulbId.ToUpperInvariant()}";
                await Groups.RemoveFromGroupAsync(Context.ConnectionId, groupName);
                _logger.LogInformation("Connection {ConnectionId} unsubscribed from {GroupName}", Context.ConnectionId, groupName);
            }
        }
    }
}
