using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;

namespace SWSTP.Telemetry.Backend.Services.LiveState
{
    public class LiveTruckStateStore : ILiveTruckStateStore
    {
        private readonly ConcurrentDictionary<long, LiveTruckStateDto> _storeByVehicleId = new();
        private readonly ConcurrentDictionary<string, long> _regToVehicleId = new(StringComparer.OrdinalIgnoreCase);

        public void Update(LiveTruckStateDto state)
        {
            if (state == null || state.VehicleId <= 0) return;

            _storeByVehicleId.AddOrUpdate(
                state.VehicleId,
                state,
                (_, existing) =>
                {
                    // Monotonic guard: reject out-of-order older packets
                    if (existing != null && state.LastSeen < existing.LastSeen)
                    {
                        return existing;
                    }
                    return state;
                });

            if (!string.IsNullOrWhiteSpace(state.Registration))
            {
                _regToVehicleId[state.Registration] = state.VehicleId;
            }
        }

        public LiveTruckStateDto? GetByVehicleId(long vehicleId)
        {
            _storeByVehicleId.TryGetValue(vehicleId, out var state);
            return state;
        }

        public LiveTruckStateDto? GetByRegistration(string registration)
        {
            if (string.IsNullOrWhiteSpace(registration)) return null;

            if (_regToVehicleId.TryGetValue(registration, out var vehicleId))
            {
                return GetByVehicleId(vehicleId);
            }
            return null;
        }

        public IReadOnlyList<LiveTruckStateDto> GetByUlb(string ulbId)
        {
            if (string.IsNullOrWhiteSpace(ulbId)) return Array.Empty<LiveTruckStateDto>();

            return _storeByVehicleId.Values
                .Where(s => string.Equals(s.UlbId, ulbId, StringComparison.OrdinalIgnoreCase))
                .ToList();
        }

        public IReadOnlyList<LiveTruckStateDto> GetAll()
        {
            return _storeByVehicleId.Values.ToList();
        }
    }
}
