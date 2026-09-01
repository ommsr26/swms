using System.Security.Claims;
using System.Threading.Tasks;

namespace SWSTP.Telemetry.Backend.Services
{
    /// <summary>
    /// Server-side authorization service for real-time SignalR subscriptions and evidence retrieval.
    /// Enforces strict ULB operational boundaries and role hierarchies.
    /// </summary>
    public interface ISessionAuthorizationService
    {
        /// <summary>
        /// Authorizes a caller to subscribe to real-time telemetry for an operational session.
        /// </summary>
        Task<bool> AuthorizeSessionSubscriptionAsync(ClaimsPrincipal? user, long sessionId);

        /// <summary>
        /// Authorizes a caller to subscribe to live fleet updates for an Urban Local Body (ULB).
        /// </summary>
        Task<bool> AuthorizeFleetSubscriptionAsync(ClaimsPrincipal? user, string ulbId);

        /// <summary>
        /// Authorizes a caller to retrieve or view a specific evidence image.
        /// </summary>
        Task<bool> AuthorizeImageAccessAsync(ClaimsPrincipal? user, long evidenceImageId);

        /// <summary>
        /// Authorizes a caller to access collection events for a session.
        /// </summary>
        Task<bool> AuthorizeCollectionEventAccessAsync(ClaimsPrincipal? user, long collectionEventId);

        /// <summary>
        /// Authorizes a caller to access historical route / telemetry for a vehicle.
        /// </summary>
        Task<bool> AuthorizeVehicleAccessAsync(ClaimsPrincipal? user, long vehicleId);
    }
}
