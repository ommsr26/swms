using System;
using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using SWSTP.Telemetry.Backend.Data;

namespace SWSTP.Telemetry.Backend.Services
{
    public class SessionAuthorizationService : ISessionAuthorizationService
    {
        private readonly IServiceProvider _serviceProvider;
        private readonly ILogger<SessionAuthorizationService> _logger;

        public SessionAuthorizationService(
            IServiceProvider serviceProvider,
            ILogger<SessionAuthorizationService> logger)
        {
            _serviceProvider = serviceProvider;
            _logger = logger;
        }

        public async Task<bool> AuthorizeSessionSubscriptionAsync(ClaimsPrincipal? user, long sessionId)
        {
            using var scope = _serviceProvider.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<TelemetryDbContext>();

            // 1. Resolve session from database
            var session = await db.OperationalSessions
                .AsNoTracking()
                .FirstOrDefaultAsync(s => s.OperationalSessionId == sessionId);

            if (session == null)
            {
                // Fallback check against raw TelemetrySessions for backward compatibility
                var teleSession = await db.TelemetrySessions
                    .AsNoTracking()
                    .FirstOrDefaultAsync(ts => ts.SessionId == sessionId);

                if (teleSession == null)
                {
                    _logger.LogWarning("Subscription rejected: Session #{SessionId} does not exist in database.", sessionId);
                    return false;
                }

                return EvaluateUserUlb(user, null); // Cross-ULB/telemetry debug session
            }

            return EvaluateUserUlb(user, session.UlbId);
        }

        public async Task<bool> AuthorizeFleetSubscriptionAsync(ClaimsPrincipal? user, string ulbId)
        {
            if (string.IsNullOrWhiteSpace(ulbId)) return false;

            using var scope = _serviceProvider.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<TelemetryDbContext>();

            var exists = await db.UlbRegistry
                .AsNoTracking()
                .AnyAsync(u => u.UlbId == ulbId);

            if (!exists)
            {
                _logger.LogWarning("Fleet subscription rejected: ULB '{UlbId}' not found in registry.", ulbId);
                return false;
            }

            return EvaluateUserUlb(user, ulbId);
        }

        public async Task<bool> AuthorizeImageAccessAsync(ClaimsPrincipal? user, long evidenceImageId)
        {
            using var scope = _serviceProvider.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<TelemetryDbContext>();

            var image = await db.EvidenceImages
                .AsNoTracking()
                .Include(img => img.CollectionEvent)
                .ThenInclude(ce => ce!.OperationalSession)
                .FirstOrDefaultAsync(img => img.EvidenceImageId == evidenceImageId);

            if (image == null)
            {
                _logger.LogWarning("Image access rejected: EvidenceImage #{ImageId} does not exist.", evidenceImageId);
                return false;
            }

            var ulbId = image.CollectionEvent?.OperationalSession?.UlbId;
            return EvaluateUserUlb(user, ulbId);
        }

        public async Task<bool> AuthorizeCollectionEventAccessAsync(ClaimsPrincipal? user, long collectionEventId)
        {
            using var scope = _serviceProvider.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<TelemetryDbContext>();

            var ev = await db.CollectionEvents
                .AsNoTracking()
                .Include(ce => ce.OperationalSession)
                .FirstOrDefaultAsync(ce => ce.CollectionEventId == collectionEventId);

            if (ev == null)
            {
                _logger.LogWarning("Collection event access rejected: CollectionEvent #{EventId} does not exist.", collectionEventId);
                return false;
            }

            var ulbId = ev.OperationalSession?.UlbId;
            return EvaluateUserUlb(user, ulbId);
        }

        public async Task<bool> AuthorizeVehicleAccessAsync(ClaimsPrincipal? user, long vehicleId)
        {
            using var scope = _serviceProvider.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<TelemetryDbContext>();

            var vehicle = await db.VehicleRegistry
                .AsNoTracking()
                .FirstOrDefaultAsync(v => v.VehicleId == vehicleId);

            if (vehicle == null)
            {
                _logger.LogWarning("Vehicle access rejected: Vehicle #{VehicleId} does not exist.", vehicleId);
                return false;
            }

            return EvaluateUserUlb(user, vehicle.UlbId);
        }

        private bool EvaluateUserUlb(ClaimsPrincipal? user, string? entityUlbId)
        {
            // If user is authenticated with claims
            if (user != null && user.Identity?.IsAuthenticated == true)
            {
                // Super Admin has global inspection rights across all ULBs
                if (user.IsInRole("SUPER_ADMIN") || user.HasClaim(ClaimTypes.Role, "SUPER_ADMIN"))
                {
                    return true;
                }

                // Check caller's ULB claim
                var userUlb = user.FindFirst("ulb_id")?.Value
                              ?? user.FindFirst("UlbId")?.Value
                              ?? user.FindFirst(ClaimTypes.GroupSid)?.Value;

                if (string.IsNullOrWhiteSpace(userUlb))
                {
                    _logger.LogWarning("Authenticated user lacks ULB claim. Access denied.");
                    return false;
                }

                if (entityUlbId != null && !string.Equals(userUlb, entityUlbId, StringComparison.OrdinalIgnoreCase))
                {
                    _logger.LogWarning("Access denied: User ULB '{UserUlb}' does not match entity ULB '{EntityUlb}'.", userUlb, entityUlbId);
                    return false;
                }

                return true;
            }

            // Authentication Fallback:
            // When authentication middleware is not active, access is permitted if the entity exists
            // and is strictly resolved against the authoritative database.
            _logger.LogDebug("Authorization fallback active (unauthenticated phase). Entity ULB: '{EntityUlb}'.", entityUlbId ?? "GLOBAL");
            return true;
        }
    }
}
