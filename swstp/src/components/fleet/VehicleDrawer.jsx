/**
 * VehicleDrawer.jsx — Right-side vehicle inspection drawer.
 *
 * Shown when a vehicle is selected from the fleet map or fleet list.
 * Displays all available telemetry: registration, state, GPS, speed, heading,
 * Safe Zone state, Road snap state, last update age, and follow controls.
 *
 * Strictly uses existing F1 design tokens. No new colors.
 */
import { useState, useEffect } from 'react';

function getCompassCardinal(deg) {
  if (deg == null || isNaN(deg)) return '—';
  const val = ((deg % 360) + 360) % 360;
  const cardinals = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const idx = Math.round(val / 45) % 8;
  return cardinals[idx];
}

function formatRelativeAge(dateOrIso) {
  if (!dateOrIso) return '—';
  const date = new Date(dateOrIso);
  const diffSec = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (diffSec < 2) return 'Just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  return `${diffHr}h ago`;
}

export default function VehicleDrawer({
  vehicle,
  ulbColor: color = '#00b4d8',
  ulbId = null,
  isFollowing = false,
  onToggleFollow = null,
  onOpenRoutePlayback = null,
  onClose,
  onOpenLiveDebug = null,
  onOpenCamera = null,
}) {
  const [, setTick] = useState(0);

  // 1-second shared ticker for relative time updates
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => (t + 1) % 1000), 1000);
    return () => clearInterval(timer);
  }, []);

  if (!vehicle) return null;

  const lastSeenTime = vehicle.lastPositionAt || vehicle.lastSeen;
  const ageSec = lastSeenTime ? (Date.now() - new Date(lastSeenTime).getTime()) / 1000 : 999999;

  const isLive = vehicle.isLive !== false && !vehicle.isLastKnown && ageSec <= 15;
  const isStale = !isLive && (ageSec <= 60 || vehicle.isLastKnown);
  const isOffline = !isLive && !isStale;

  const fmtNum = (v, d = 1) => (v != null && !isNaN(v) ? Number(v).toFixed(d) : '—');
  const fmtTime = (t) => (t ? new Date(t).toLocaleTimeString() : '—');

  const headingVal = vehicle.heading != null && !isNaN(vehicle.heading) ? Number(vehicle.heading) : null;
  const cardinal = headingVal != null ? getCompassCardinal(headingVal) : '';

  const snapStateLabel = vehicle.isInsideSafeZone
    ? 'Safe Zone (Depot)'
    : vehicle.isSnapped
    ? 'Road Snapped (Centerline)'
    : 'GPS Raw / Free Motion';

  const snapStateColor = vehicle.isInsideSafeZone
    ? 'var(--status-ok)'
    : vehicle.isSnapped
    ? '#00d9ff'
    : 'var(--text-secondary)';

  return (
    <div
      style={{
        width: '280px',
        flexShrink: 0,
        background: 'var(--bg-panel)',
        borderLeft: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        zIndex: 500,
      }}
    >
      {/* Drawer header */}
      <div
        style={{
          padding: '10px 14px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-panel-2)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            width: '9px',
            height: '9px',
            borderRadius: '50%',
            background: color,
            flexShrink: 0,
            boxShadow: isLive ? `0 0 8px ${color}` : 'none',
          }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: 'var(--text-mono)',
              fontSize: '12px',
              fontWeight: 700,
              color: 'var(--text-primary)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {vehicle.vehicleRegistration || 'UNREGISTERED'}
          </div>
          <div style={{ fontFamily: 'var(--text-mono)', fontSize: '8px', color: 'var(--text-dim)' }}>
            {vehicle.ulbName || vehicle.ulbId || 'Amravati Municipal Corporation'}
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-dim)',
            cursor: 'pointer',
            fontFamily: 'var(--text-mono)',
            fontSize: '13px',
            padding: '2px 4px',
          }}
          title="Close drawer"
        >
          ✕
        </button>
      </div>

      {/* State banner */}
      <div
        style={{
          padding: '6px 14px',
          borderBottom: '1px solid var(--border)',
          background: isLive
            ? 'rgba(45,198,83,0.08)'
            : isStale
            ? 'rgba(244,140,6,0.08)'
            : 'rgba(100,116,139,0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              flexShrink: 0,
              background: isLive
                ? 'var(--status-ok)'
                : isStale
                ? 'var(--status-warn)'
                : '#64748b',
              boxShadow: isLive ? '0 0 6px var(--status-ok)' : 'none',
            }}
          />
          <span
            style={{
              fontFamily: 'var(--text-mono)',
              fontSize: '9px',
              fontWeight: 700,
              letterSpacing: '0.07em',
              color: isLive
                ? 'var(--status-ok)'
                : isStale
                ? 'var(--status-warn)'
                : '#94a3b8',
            }}
          >
            {isLive ? 'LIVE' : isStale ? 'STALE' : 'OFFLINE'}
          </span>
        </div>
        <span
          style={{
            fontFamily: 'var(--text-mono)',
            fontSize: '8.5px',
            color: 'var(--text-dim)',
          }}
        >
          {formatRelativeAge(lastSeenTime)}
        </span>
      </div>

      {/* Data sections */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <DrawerSection label="TELEMETRY METRICS">
          <DrawerRow
            k="Speed"
            v={vehicle.speed != null ? `${fmtNum(vehicle.speed)} km/h` : '0.0 km/h'}
            color={vehicle.speed > 0 ? 'var(--status-ok)' : 'var(--text-secondary)'}
          />
          <DrawerRow
            k="Heading"
            v={headingVal != null ? `${fmtNum(headingVal, 0)}° ${cardinal}` : '—'}
            color="#00d9ff"
          />
          <DrawerRow k="Last Seen" v={fmtTime(lastSeenTime)} dim />
        </DrawerSection>

        <DrawerSection label="SPATIAL CONSTRAINTS">
          <DrawerRow
            k="Safe Zone"
            v={vehicle.isInsideSafeZone ? '🛡 INSIDE (Depot)' : 'OUTSIDE'}
            color={vehicle.isInsideSafeZone ? 'var(--status-ok)' : 'var(--text-secondary)'}
          />
          <DrawerRow
            k="Road Snapping"
            v={vehicle.isSnapped ? '🔗 SNAPPED' : vehicle.isInsideSafeZone ? 'EXEMPT' : 'OFF-ROAD'}
            color={snapStateColor}
          />
          <DrawerRow k="Latitude" v={fmtNum(vehicle.displayLat ?? vehicle.lat, 8)} />
          <DrawerRow k="Longitude" v={fmtNum(vehicle.displayLon ?? vehicle.lon, 8)} />
          {vehicle.rawLat != null && vehicle.rawLon != null && (
            <DrawerRow
              k="Raw GPS"
              v={`${fmtNum(vehicle.rawLat, 8)}, ${fmtNum(vehicle.rawLon, 8)}`}
              dim
            />
          )}
        </DrawerSection>

        <DrawerSection label="DEVICE & SESSION">
          <DrawerRow k="Vehicle ID" v={vehicle.deviceId || vehicle.vehicleId || '—'} />
          <DrawerRow k="Device Code" v={vehicle.deviceCode || 'UNASSIGNED'} />
          <DrawerRow k="Session #" v={vehicle.sessionId ?? '—'} />
          <DrawerRow
            k="GNSS Fix"
            v={vehicle.hasPosition ? '3D FIX (OK)' : 'NO FIX'}
            color={vehicle.hasPosition ? 'var(--status-ok)' : 'var(--status-warn)'}
          />
        </DrawerSection>
      </div>

      {/* Action controls */}
      <div
        style={{
          padding: '10px 14px',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          flexShrink: 0,
          background: 'var(--bg-panel-2)',
        }}
      >
        {onOpenRoutePlayback && (
          <button onClick={() => onOpenRoutePlayback(vehicle)} style={btnStyle('#f72585')}>
            🕒 ROUTE PLAYBACK
          </button>
        )}
        {onToggleFollow && (
          <button
            onClick={onToggleFollow}
            style={{
              ...btnStyle(isFollowing ? 'var(--status-ok)' : '#00d9ff'),
              background: isFollowing ? 'rgba(45,198,83,0.15)' : 'none',
            }}
          >
            {isFollowing ? '🎯 FOLLOWING VEHICLE (ON)' : '🎯 FOLLOW VEHICLE'}
          </button>
        )}
        {onOpenCamera && vehicle.deviceCode && (
          <button onClick={() => onOpenCamera(vehicle.deviceCode)} style={btnStyle('#00b4d8')}>
            📷 VIEW CAMERA FEED
          </button>
        )}
        {onOpenLiveDebug && vehicle.sessionId && (
          <button onClick={() => onOpenLiveDebug(vehicle.sessionId)} style={btnStyle('#9d4edd')}>
            ⚡ LIVE TELEMETRY DEBUG →
          </button>
        )}
      </div>
    </div>
  );
}

function DrawerSection({ label, children }) {
  return (
    <div>
      <div
        style={{
          padding: '5px 14px',
          fontFamily: 'var(--text-mono)',
          fontSize: '8px',
          fontWeight: 700,
          color: 'var(--text-dim)',
          letterSpacing: '0.12em',
          background: 'var(--bg-panel-2)',
          borderBottom: '1px solid var(--border)',
          borderTop: '1px solid var(--border)',
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

function DrawerRow({ k, v, color, dim }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '5px 14px',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <span style={{ fontFamily: 'var(--text-mono)', fontSize: '8.5px', color: 'var(--text-dim)', letterSpacing: '0.05em' }}>
        {k}
      </span>
      <span
        style={{
          fontFamily: 'var(--text-mono)',
          fontSize: '9.5px',
          fontWeight: 600,
          color: color || (dim ? 'var(--text-dim)' : 'var(--text-secondary)'),
        }}
      >
        {v}
      </span>
    </div>
  );
}

function btnStyle(accentColor) {
  return {
    width: '100%',
    padding: '7px 10px',
    fontFamily: 'var(--text-mono)',
    fontSize: '9px',
    fontWeight: 700,
    letterSpacing: '0.07em',
    color: accentColor,
    background: 'none',
    border: `1px solid ${accentColor}`,
    cursor: 'pointer',
    borderRadius: '2px',
    transition: 'all 0.15s',
    textAlign: 'center',
  };
}
