using System.Collections.Generic;
using System.Threading.Tasks;

namespace SWSTP.Telemetry.Backend.Services
{
    /// <summary>
    /// Resolves StateDefinition database IDs from stable (EntityType, StateCode) string pairs.
    /// All state-bearing IDs must be resolved through this service — never hardcoded as integers.
    /// </summary>
    public interface IStateDefinitionResolver
    {
        /// <summary>
        /// Returns the StateDefinitionId for the given EntityType and StateCode.
        /// Result is cached in-process after first resolution.
        /// Throws <see cref="StateDefinitionNotFoundException"/> if no matching row exists.
        /// </summary>
        Task<int> ResolveAsync(string entityType, string stateCode);

        /// <summary>
        /// Returns the StateCode string for a given StateDefinitionId.
        /// Used for logging/display only — not for business logic comparisons.
        /// </summary>
        Task<string> ResolveCodeAsync(int stateDefinitionId);

        /// <summary>
        /// Pre-warms the cache for the given entity types and validates all states are present.
        /// Throws <see cref="StateDefinitionNotFoundException"/> for any missing state.
        /// Call at application startup to fail fast on misconfiguration.
        /// </summary>
        Task WarmCacheAsync(params string[] entityTypes);

        /// <summary>
        /// Validates that all provided state codes exist for the given entity type.
        /// </summary>
        Task ValidateRequiredStatesAsync(string entityType, IEnumerable<string> requiredCodes);
    }
}
