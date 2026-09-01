import { useSimulationStore } from '../../telemetry/simulationStore.js';
import VirtualJoystick from './VirtualJoystick.jsx';

export default function VehicleCommandDeck() {
  const {
    engineOn,
    gear,
    speed,
    targetSpeed,
    heading,
    isAutoPatrol,
    closestHouse,
    closestHouseDistanceM,
    isEligibleForCollection,
    houses,
    collectionEvents,
    speedWarningMessage,
    toggleEngine,
    setGear,
    setSpeed,
    toggleAutoPatrol,
    snapToRoad,
    resetToDepot,
    capturePicture,
  } = useSimulationStore();

  const isSpeedArmed = speed <= 5.0;
  const collectedCount = houses.filter((h) => h.status === 'COLLECTED').length;
  const collectionPct = Math.round((collectedCount / (houses.length || 1)) * 100);

  return (
    <div
      style={{
        background: 'var(--bg-panel)',
        border: '1px solid var(--border)',
        borderRadius: '4px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        padding: '14px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
      }}
    >
      {/* Speed Warning Banner if speed > 5 km/h */}
      {speedWarningMessage && (
        <div
          style={{
            background: 'rgba(239, 35, 60, 0.2)',
            border: '1px solid #ef233c',
            borderRadius: '3px',
            padding: '6px 12px',
            fontFamily: 'var(--text-mono)',
            fontSize: '9.5px',
            fontWeight: 700,
            color: '#ff6b6b',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            animation: 'fadeIn 0.2s',
          }}
        >
          <span>⚠️</span>
          <span>{speedWarningMessage}</span>
        </div>
      )}

      {/* Deck Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid var(--border)',
          paddingBottom: '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '14px' }}>🕹️</span>
          <span style={{ fontFamily: 'var(--text-mono)', fontSize: '11px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '0.08em' }}>
            VEHICLE COMMAND & TELEMATICS DECK
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Speed Arming Status Badge */}
          <span
            style={{
              fontFamily: 'var(--text-mono)',
              fontSize: '8.5px',
              fontWeight: 800,
              color: isSpeedArmed ? '#2dc653' : '#f48c06',
              background: isSpeedArmed ? 'rgba(45,198,83,0.15)' : 'rgba(244,140,6,0.15)',
              padding: '2px 8px',
              borderRadius: '2px',
              border: `1px solid ${isSpeedArmed ? '#2dc653' : '#f48c06'}`,
            }}
          >
            {isSpeedArmed ? '● ARMED (SPD ≤ 5 KM/H)' : '○ DISARMED (SPD > 5 KM/H)'}
          </span>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: engineOn ? '#2dc653' : '#6c757d',
                boxShadow: engineOn ? '0 0 8px #2dc653' : 'none',
              }}
            />
            <span style={{ fontFamily: 'var(--text-mono)', fontSize: '9px', color: engineOn ? '#2dc653' : 'var(--text-dim)', fontWeight: 700 }}>
              {engineOn ? 'ENGINE RUNNING' : 'ENGINE STOPPED'}
            </span>
          </div>
        </div>
      </div>

      {/* Main Controls Row: Telemetry Gauges + Joystick + Command Switches */}
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
        {/* Left: Speedometer & Telemetry Meters */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '160px' }}>
          {/* Speed Dial */}
          <div
            style={{
              background: 'var(--bg-panel-2)',
              border: `1px solid ${isSpeedArmed ? 'rgba(45,198,83,0.4)' : 'var(--border)'}`,
              borderRadius: '4px',
              padding: '8px 12px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
            }}
          >
            <span style={{ fontFamily: 'var(--text-mono)', fontSize: '8px', color: 'var(--text-dim)', letterSpacing: '0.1em' }}>
              VEHICLE VELOCITY (LIMIT ≤ 5 KM/H)
            </span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', marginTop: '2px' }}>
              <span style={{ fontFamily: 'var(--text-mono)', fontSize: '24px', fontWeight: 800, color: isSpeedArmed ? '#2dc653' : '#f48c06' }}>
                {speed.toFixed(1)}
              </span>
              <span style={{ fontFamily: 'var(--text-mono)', fontSize: '9.5px', color: 'var(--text-secondary)' }}>
                KM/H
              </span>
            </div>
            <div style={{ fontFamily: 'var(--text-mono)', fontSize: '8.5px', color: 'var(--text-dim)', marginTop: '2px' }}>
              HEADING: <strong style={{ color: 'var(--text-primary)' }}>{heading.toFixed(0)}°</strong> | GEAR: <strong style={{ color: gear === 'R' ? '#f48c06' : '#2dc653' }}>{gear}</strong>
            </div>
          </div>

          {/* Speed limit slider */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--text-mono)', fontSize: '8px', color: 'var(--text-dim)' }}>
              <span>CRUISE LIMIT</span>
              <span>{targetSpeed.toFixed(0)} km/h</span>
            </div>
            <input
              type="range"
              min="0"
              max="50"
              step="1"
              value={targetSpeed}
              onChange={(e) => setSpeed(Number(e.target.value))}
              disabled={!engineOn}
              style={{ width: '100%', accentColor: isSpeedArmed ? '#2dc653' : '#00d9ff', cursor: 'pointer' }}
            />
          </div>

          {/* Gear Selection */}
          <div style={{ display: 'flex', gap: '4px' }}>
            {['P', 'R', 'D'].map((g) => (
              <button
                key={g}
                onClick={() => setGear(g)}
                disabled={!engineOn}
                style={{
                  flex: 1,
                  padding: '4px',
                  fontFamily: 'var(--text-mono)',
                  fontSize: '9px',
                  fontWeight: 800,
                  color: gear === g ? '#000000' : 'var(--text-primary)',
                  background: gear === g ? (g === 'R' ? '#f48c06' : g === 'P' ? '#ef233c' : '#2dc653') : 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  borderRadius: '2px',
                  cursor: 'pointer',
                }}
              >
                {g === 'P' ? 'PARK' : g === 'R' ? 'REV' : 'DRIVE'}
              </button>
            ))}
          </div>
        </div>

        {/* Center: Virtual Joystick */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <VirtualJoystick />
        </div>

        {/* Right: Operational Actions & Camera Trigger */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '200px' }}>
          {/* Main Camera Picture Button (Speed <= 5 km/h enforced) */}
          <button
            onClick={capturePicture}
            disabled={!engineOn || !isSpeedArmed}
            style={{
              padding: '10px 14px',
              fontFamily: 'var(--text-mono)',
              fontSize: '11px',
              fontWeight: 800,
              color: '#ffffff',
              background: !isSpeedArmed
                ? 'linear-gradient(135deg, #475569 0%, #334155 100%)'
                : isEligibleForCollection
                ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                : 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
              border: !isSpeedArmed
                ? '1px solid #64748b'
                : isEligibleForCollection
                ? '2px solid #34d399'
                : '1px solid #38bdf8',
              borderRadius: '4px',
              cursor: engineOn && isSpeedArmed ? 'pointer' : 'not-allowed',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '2px',
              boxShadow: isSpeedArmed && isEligibleForCollection
                ? '0 0 16px rgba(16, 185, 129, 0.6)'
                : 'none',
              transition: 'all 0.15s ease',
              opacity: isSpeedArmed ? 1 : 0.65,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '15px' }}>{isSpeedArmed ? '📸' : '⛔'}</span>
              <span>{isSpeedArmed ? 'SNAP PICTURE & FORM CIRCLE' : 'SLOW DOWN TO SNAP'}</span>
            </div>
            <span style={{ fontSize: '8px', opacity: 0.85, fontWeight: 500 }}>
              {isSpeedArmed ? 'ARMED: SPEED ≤ 5.0 KM/H' : `CURRENT SPEED ${speed.toFixed(1)} KM/H > 5.0`}
            </span>
          </button>

          {/* Quick Commands Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
            <button
              onClick={toggleEngine}
              style={{
                padding: '6px',
                fontFamily: 'var(--text-mono)',
                fontSize: '8.5px',
                fontWeight: 700,
                color: engineOn ? '#ef233c' : '#2dc653',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: '2px',
                cursor: 'pointer',
              }}
            >
              {engineOn ? '⛔ STOP ENGINE' : '⚡ START ENGINE'}
            </button>

            <button
              onClick={toggleAutoPatrol}
              disabled={!engineOn}
              style={{
                padding: '6px',
                fontFamily: 'var(--text-mono)',
                fontSize: '8.5px',
                fontWeight: 700,
                color: isAutoPatrol ? '#000000' : '#00d9ff',
                background: isAutoPatrol ? '#00d9ff' : 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: '2px',
                cursor: 'pointer',
              }}
            >
              {isAutoPatrol ? '🤖 AUTO ACTIVE' : '🛣 AUTO PATROL'}
            </button>

            <button
              onClick={snapToRoad}
              style={{
                padding: '6px',
                fontFamily: 'var(--text-mono)',
                fontSize: '8.5px',
                color: 'var(--text-secondary)',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: '2px',
                cursor: 'pointer',
              }}
            >
              ⌖ SNAP TO ROAD
            </button>

            <button
              onClick={resetToDepot}
              style={{
                padding: '6px',
                fontFamily: 'var(--text-mono)',
                fontSize: '8.5px',
                color: 'var(--text-secondary)',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: '2px',
                cursor: 'pointer',
              }}
            >
              🏠 RESET DEPOT
            </button>
          </div>
        </div>
      </div>

      {/* Proximity & Waste Collection Radar Banner */}
      <div
        style={{
          padding: '8px 12px',
          background: isEligibleForCollection ? 'rgba(45, 198, 83, 0.12)' : 'var(--bg-panel-2)',
          border: isEligibleForCollection ? '1px solid rgba(45, 198, 83, 0.4)' : '1px solid var(--border)',
          borderRadius: '3px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '13px' }}>{isEligibleForCollection ? '🎯' : '📡'}</span>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontFamily: 'var(--text-mono)', fontSize: '8px', color: 'var(--text-dim)' }}>
              NEAREST BUILDING / HOUSE
            </span>
            <span style={{ fontFamily: 'var(--text-mono)', fontSize: '10px', fontWeight: 700, color: isEligibleForCollection ? '#2dc653' : 'var(--text-primary)' }}>
              {closestHouse?.id}: {closestHouse?.address || 'Scanning road…'} ({closestHouseDistanceM.toFixed(1)}m)
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <span style={{ fontFamily: 'var(--text-mono)', fontSize: '8px', color: 'var(--text-dim)' }}>
              TRASH COLLECTED
            </span>
            <span style={{ fontFamily: 'var(--text-mono)', fontSize: '10px', fontWeight: 800, color: '#00d9ff' }}>
              {collectedCount} / {houses.length} ({collectionPct}%)
            </span>
          </div>

          <span
            style={{
              fontFamily: 'var(--text-mono)',
              fontSize: '8px',
              fontWeight: 800,
              color: isEligibleForCollection ? '#2dc653' : '#6c757d',
              background: isEligibleForCollection ? 'rgba(45,198,83,0.2)' : 'rgba(255,255,255,0.05)',
              padding: '3px 8px',
              borderRadius: '2px',
              border: isEligibleForCollection ? '1px solid #2dc653' : '1px solid var(--border)',
            }}
          >
            {isEligibleForCollection ? 'IN COLLECTION RANGE (<15m)' : 'OUT OF RANGE'}
          </span>
        </div>
      </div>
    </div>
  );
}
