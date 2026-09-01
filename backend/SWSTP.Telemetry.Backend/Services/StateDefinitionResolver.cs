using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using SWSTP.Telemetry.Backend.Data;

namespace SWSTP.Telemetry.Backend.Services
{
    /// <summary>
    /// DB-backed, in-process-cached resolver for StateDefinition IDs.
    /// Cache is populated lazily on first resolve and never expires within a process lifetime
    /// (StateDefinition catalog data is stable and only changes via migrations).
    /// </summary>
    public class StateDefinitionResolver : IStateDefinitionResolver
    {
        private readonly IServiceProvider _serviceProvider;

        // (entityType, stateCode) -> stateDefinitionId
        private readonly ConcurrentDictionary<(string, string), int> _codeToIdCache = new();
        // stateDefinitionId -> stateCode
        private readonly ConcurrentDictionary<int, string> _idToCodeCache = new();

        public StateDefinitionResolver(IServiceProvider serviceProvider)
        {
            _serviceProvider = serviceProvider;
        }

        public async Task<int> ResolveAsync(string entityType, string stateCode)
        {
            var key = (entityType.ToUpperInvariant(), stateCode.ToUpperInvariant());

            if (_codeToIdCache.TryGetValue(key, out var cachedId))
                return cachedId;

            using var scope = _serviceProvider.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<TelemetryDbContext>();

            var state = await db.StateDefinitions
                .AsNoTracking()
                .FirstOrDefaultAsync(s =>
                    s.EntityType == key.Item1 &&
                    s.StateCode  == key.Item2);

            if (state == null)
                throw new StateDefinitionNotFoundException(entityType, stateCode);

            _codeToIdCache[key] = state.StateDefinitionId;
            _idToCodeCache[state.StateDefinitionId] = state.StateCode;

            return state.StateDefinitionId;
        }

        public async Task<string> ResolveCodeAsync(int stateDefinitionId)
        {
            if (_idToCodeCache.TryGetValue(stateDefinitionId, out var cachedCode))
                return cachedCode;

            using var scope = _serviceProvider.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<TelemetryDbContext>();

            var state = await db.StateDefinitions
                .AsNoTracking()
                .FirstOrDefaultAsync(s => s.StateDefinitionId == stateDefinitionId);

            if (state == null)
                throw new InvalidOperationException(
                    $"StateDefinition with ID {stateDefinitionId} does not exist.");

            _codeToIdCache[(state.EntityType.ToUpperInvariant(), state.StateCode.ToUpperInvariant())] = state.StateDefinitionId;
            _idToCodeCache[state.StateDefinitionId] = state.StateCode;

            return state.StateCode;
        }

        public async Task WarmCacheAsync(params string[] entityTypes)
        {
            using var scope = _serviceProvider.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<TelemetryDbContext>();

            var normalizedTypes = entityTypes.Select(t => t.ToUpperInvariant()).ToList();

            var states = await db.StateDefinitions
                .AsNoTracking()
                .Where(s => normalizedTypes.Contains(s.EntityType))
                .ToListAsync();

            foreach (var s in states)
            {
                var key = (s.EntityType.ToUpperInvariant(), s.StateCode.ToUpperInvariant());
                _codeToIdCache[key]            = s.StateDefinitionId;
                _idToCodeCache[s.StateDefinitionId] = s.StateCode;
            }
        }

        public async Task ValidateRequiredStatesAsync(string entityType, IEnumerable<string> requiredCodes)
        {
            foreach (var code in requiredCodes)
            {
                // ResolveAsync throws StateDefinitionNotFoundException if missing
                await ResolveAsync(entityType, code);
            }
        }
    }
}
