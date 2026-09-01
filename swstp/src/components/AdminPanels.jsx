/**
 * AdminPanels.jsx — Shared panel components for /admin and /officer.
 *
 * All 4 operational panels (FleetPanel, SessionsPanel, VehiclesPanel,
 * DevicesPanel) live here. Both AdminView and OfficerView import from
 * this module — no JSX duplication between the two screens.
 *
 * SCOPING CONTRACT:
 *   AdminView passes  fixedUlbId={null}  → filter dropdown visible,
 *                                           all ULBs queryable.
 *   OfficerView passes fixedUlbId="ULB_X" → filter hidden entirely,
 *                                           queries always scoped to ULB_X.
 *                                           Officer NEVER sees cross-ULB data.
 *
 * The `ulbs` prop is the array from /api/admin/ulbs (used for the legend
 * and the dropdown options in Admin mode). In Officer mode the caller
 * passes a single-item array [ { ulbId, ulbName } ] — the map legend
 * still renders correctly; the dropdown is simply hidden.
 *
 * DevicesPanel accepts an optional `fixedUlbId` for display consistency
 * (shows only devices assigned to vehicles in that ULB) but the backend
 * /api/admin/devices endpoint currently returns all devices — a future
 * Phase 5+ backend filter can be added without changing this component.
 */
import { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Circle, CircleMarker, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import CameraViewer from './CameraViewer.jsx';
import { useTheme, cartoTileUrl } from '../ThemeContext.jsx';
import OverviewPresentation from './OverviewPresentation.jsx';
import IMUPresentation from './IMUPresentation.jsx';
import MapPresentation from './MapPresentation.jsx';
import GNSSPresentation from './GNSSPresentation.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';
import {
  fetchAdminVehicles,
  fetchAdminDevices,
  fetchAdminFleetLive,
  fetchAdminSessions,
  fetchAdminSessionLive,
} from '../telemetry/backendApiClient.js';
import { SignalRTelemetrySource } from '../telemetry/SignalRTelemetrySource.js';

// ─── Leaflet default icon fix (same as MapView.jsx / ReplayView.jsx) ─────────
// Guard against duplicate execution when both AdminView and OfficerView are
// ever hot-reloaded in the same session.
if (L.Icon.Default.prototype._getIconUrl) {
  delete L.Icon.Default.prototype._getIconUrl;
  L.Icon.Default.mergeOptions({ iconRetinaUrl: null, iconUrl: null, shadowUrl: null });
}

// Default map center: Nagpur (primary ULB)
export const DEFAULT_CENTER = [21.1458, 79.0882];

// ULB color palette — uses existing signal color tokens only
export const ULB_COLORS = ['#00b4d8', '#9d4edd', '#2dc653', '#f48c06', '#f72585', '#43aa8b'];
export function ulbColor(ulbId, ulbList) {
  const idx = ulbList.findIndex(u => u.ulbId === ulbId);
  return ULB_COLORS[Math.max(0, idx) % ULB_COLORS.length];
}

// ─── Vehicle map icon (uses 3D Municipal Truck from VehicleMarker.jsx) ─────────
import { createFleetIcon, createOfflineFleetIcon } from './fleet/VehicleMarker.jsx';
export { createFleetIcon, createOfflineFleetIcon };

// ─── Map auto-fit helper ──────────────────────────────────────────────────────
export function FleetMapAutoFit({ vehicles }) {
  const map = useMap();
  const fitted = useRef(false);
  useEffect(() => {
    if (!fitted.current && vehicles.length > 0 && map) {
      const pts = vehicles.filter(v => v.lat != null && v.lon != null);
      if (pts.length > 0) {
        const bounds = L.latLngBounds(pts.map(v => [v.lat, v.lon]));
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
        fitted.current = true;
      }
    }
  }, [vehicles, map]);
  return null;
}

// ─── Table primitives ─────────────────────────────────────────────────────────
export function THead({ cols }) {
  return (
    <thead>
      <tr>
        {cols.map(c => (
          <th key={c} style={{
            fontFamily: 'var(--text-mono)',
            fontSize: '8.5px',
            fontWeight: 700,
            color: 'var(--text-dim)',
            letterSpacing: '0.1em',
            padding: '5px 10px',
            textAlign: 'left',
            background: 'var(--bg-panel-2)',
            borderBottom: '1px solid var(--border)',
            position: 'sticky',
            top: 0,
            whiteSpace: 'nowrap',
          }}>{c}</th>
        ))}
      </tr>
    </thead>
  );
}

export function TRow({ children, accent }) {
  return (
    <tr style={{ borderLeft: accent ? `2px solid ${accent}` : '2px solid transparent' }}>
      {children}
    </tr>
  );
}

export function TD({ children, mono, dim, color }) {
  return (
    <td style={{
      padding: '5px 10px',
      fontFamily: mono ? 'var(--text-mono)' : 'var(--text-sans)',
      fontSize: mono ? '10px' : '11px',
      color: color || (dim ? 'var(--text-dim)' : 'var(--text-secondary)'),
      borderBottom: '1px solid var(--border)',
      whiteSpace: 'nowrap',
    }}>
      {children}
    </td>
  );
}

export function StatusDot({ ok }) {
  return (
    <span style={{
      display: 'inline-block',
      width: '6px',
      height: '6px',
      borderRadius: '50%',
      background: ok ? 'var(--status-ok)' : 'var(--status-off)',
      boxShadow: ok ? '0 0 5px var(--status-ok)' : 'none',
      marginRight: '6px',
      verticalAlign: 'middle',
    }} />
  );
}

export function EmptyRow({ cols, msg }) {
  return (
    <tr>
      <td colSpan={cols} style={{
        padding: '20px',
        fontFamily: 'var(--text-mono)',
        fontSize: '10px',
        color: 'var(--text-dim)',
        textAlign: 'center',
      }}>{msg}</td>
    </tr>
  );
}

export function LoadingRow({ cols }) {
  return <EmptyRow cols={cols} msg="Loading from MSSQL…" />;
}

// ─── Reusable tab bar ─────────────────────────────────────────────────────────
export function TabBar({ tabs, active, onSelect, idPrefix = 'tab' }) {
  return (
    <div style={{
      display: 'flex',
      background: 'var(--bg-panel)',
      borderBottom: '1px solid var(--border)',
      flexShrink: 0,
    }}>
      {tabs.map(t => (
        <button
          key={t.id}
          id={`${idPrefix}-${t.id}`}
          onClick={() => onSelect(t.id)}
          style={{
            padding: '8px 16px',
            fontFamily: 'var(--text-mono)',
            fontSize: '10px',
            fontWeight: active === t.id ? 700 : 400,
            color: active === t.id ? 'var(--text-primary)' : 'var(--text-dim)',
            background: 'none',
            border: 'none',
            borderBottom: active === t.id ? '2px solid var(--accent)' : '2px solid transparent',
            cursor: 'pointer',
            letterSpacing: '0.06em',
            transition: 'color 0.12s',
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ─── Fleet Live Map Panel ─────────────────────────────────────────────────────
// fixedUlbId: when set, fetches fleet for that ULB only and hides the
//             legend ULB switcher (Officer mode).
//             When null (Admin mode), fetches all ULBs.
export function FleetPanel({ ulbs, fixedUlbId = null, onSelectLiveDebug = null }) {
  const { theme } = useTheme();
  const [fleet, setFleet] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);

  const load = () => {
    fetchAdminFleetLive(fixedUlbId || null).then(data => {
      setFleet(data || []);
      setLastRefresh(new Date());
      setLoading(false);
    });
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, [fixedUlbId]);

  const liveVehicles    = fleet.filter(v => v.isLive !== false);
  const offlineVehicles = fleet.filter(v => v.isLastKnown === true);

  const liveWithPosition    = liveVehicles.filter(v => v.hasPosition && v.lat != null && v.lon != null);
  const offlineWithPosition = offlineVehicles.filter(v => v.hasPosition && v.lat != null && v.lon != null);
  const noPosition          = liveVehicles.filter(v => !v.hasPosition);

  const allMapPoints = [...liveWithPosition, ...offlineWithPosition];

  // ULBs with valid safe zones
  const safeZoneUlbs = (fixedUlbId
    ? ulbs.filter(u => u.ulbId === fixedUlbId)
    : ulbs
  ).filter(u => u.safeZoneLatitude != null && u.safeZoneLongitude != null);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
      {/* Legend bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        padding: '6px 14px',
        background: 'var(--bg-panel)',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
        flexWrap: 'wrap',
      }}>
        {/* ULB Legends */}
        {(fixedUlbId
          ? ulbs.filter(u => u.ulbId === fixedUlbId)
          : ulbs
        ).map(u => (
          <span key={u.ulbId} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontFamily: 'var(--text-mono)', fontSize: '9px', color: 'var(--text-secondary)' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: ulbColor(u.ulbId, ulbs), display: 'inline-block' }} />
            {u.ulbName}
            {u.safeZoneLatitude != null && (
              <span style={{ fontSize: '8px', color: 'var(--status-ok)', background: 'rgba(45,198,83,0.1)', padding: '1px 4px', borderRadius: '2px' }}>
                🛡 SAFE ZONE
              </span>
            )}
          </span>
        ))}
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--text-mono)', fontSize: '8.5px', color: 'var(--text-dim)' }}>
          {liveVehicles.length} active sessions · {offlineVehicles.length} offline (last known) · 10 s refresh
          {lastRefresh ? ` · ${lastRefresh.toLocaleTimeString()}` : ''}
        </span>
      </div>

      {/* Map + list sidebar */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        {/* Map canvas */}
        <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
          {loading && (
            <div style={{ position: 'absolute', inset: 0, zIndex: 1000, background: 'rgba(7,9,13,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--text-mono)', color: '#00d9ff', fontSize: '11px' }}>
              Loading fleet positions…
            </div>
          )}
          <MapContainer center={DEFAULT_CENTER} zoom={10} style={{ width: '100%', height: '100%' }} zoomControl={false}>
            {/* CARTO basemap */}
            <TileLayer
              url={cartoTileUrl(theme)}
              attribution='&copy; <a href="https://carto.com/">CARTO</a>'
              maxZoom={19}
            />
            <FleetMapAutoFit vehicles={allMapPoints} />

            {/* ULB Safe-Zone Circles (rendered cleanly only if coordinates seeded) */}
            {safeZoneUlbs.map(u => (
              <Circle
                key={`sz-${u.ulbId}`}
                center={[u.safeZoneLatitude, u.safeZoneLongitude]}
                radius={u.safeZoneRadiusMeters != null ? u.safeZoneRadiusMeters : 20}
                pathOptions={{
                  color: ulbColor(u.ulbId, ulbs),
                  fillColor: ulbColor(u.ulbId, ulbs),
                  fillOpacity: 0.12,
                  dashArray: '6, 6',
                  weight: 1.8,
                }}
              >
                <Popup>
                  <div style={{ fontFamily: 'var(--text-mono)', fontSize: '10px', lineHeight: 1.5 }}>
                    <strong style={{ color: ulbColor(u.ulbId, ulbs) }}>🛡 SAFE ZONE: {u.ulbName}</strong><br />
                    Radius: {u.safeZoneRadiusMeters != null ? u.safeZoneRadiusMeters : 20} m<br />
                    Center: {u.safeZoneLatitude.toFixed(5)}, {u.safeZoneLongitude.toFixed(5)}
                  </div>
                </Popup>
              </Circle>
            ))}

            {/* Live Active Vehicle Markers */}
            {liveWithPosition.map(v => (
              <Marker
                key={`live-${v.sessionId}`}
                position={[v.lat, v.lon]}
                icon={createFleetIcon(v.heading ?? 0, ulbColor(v.ulbId, ulbs))}
              >
                <Popup>
                  <div style={{ fontFamily: 'var(--text-mono)', fontSize: '10px', lineHeight: 1.5 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '3px' }}>
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--status-ok)' }} />
                      <strong style={{ color: ulbColor(v.ulbId, ulbs) }}>{v.vehicleRegistration}</strong>
                    </div>
                    {v.ulbName || v.ulbId}<br />
                    Device: {v.deviceCode}<br />
                    Speed: {v.speed != null ? `${v.speed.toFixed(1)} km/h` : '—'}<br />
                    {v.lat?.toFixed(5)}, {v.lon?.toFixed(5)}<br />
                    {v.lastPositionAt ? `@ ${new Date(v.lastPositionAt).toLocaleTimeString()}` : ''}
                    {onSelectLiveDebug && (
                      <div style={{ marginTop: '8px', borderTop: '1px solid var(--border)', paddingTop: '6px' }}>
                        <button
                          onClick={() => onSelectLiveDebug(v.sessionId)}
                          style={{
                            background: '#9d4edd',
                            color: '#ffffff',
                            border: 'none',
                            fontFamily: 'var(--text-mono)',
                            fontSize: '9px',
                            fontWeight: 700,
                            padding: '4px 8px',
                            cursor: 'pointer',
                            borderRadius: '2px',
                            width: '100%',
                          }}
                        >
                          ⚡ OPEN LIVE DEBUG
                        </button>
                      </div>
                    )}
                  </div>
                </Popup>
              </Marker>
            ))}

            {/* Offline Vehicles with Last-Known Location (Phase 9b data surfaced distinctly) */}
            {offlineWithPosition.map(v => (
              <Marker
                key={`offline-${v.vehicleRegistration}`}
                position={[v.lat, v.lon]}
                icon={createOfflineFleetIcon(v.heading ?? 0, ulbColor(v.ulbId, ulbs))}
              >
                <Popup>
                  <div style={{ fontFamily: 'var(--text-mono)', fontSize: '10px', lineHeight: 1.5 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '3px' }}>
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#64748b' }} />
                      <strong style={{ color: 'var(--text-secondary)' }}>{v.vehicleRegistration}</strong>
                      <span style={{ fontSize: '8px', color: '#64748b', marginLeft: 'auto' }}>[OFFLINE]</span>
                    </div>
                    {v.ulbName || v.ulbId}<br />
                    Device: {v.deviceCode}<br />
                    Last Known Coords: {v.lat?.toFixed(5)}, {v.lon?.toFixed(5)}<br />
                    Last Seen: {v.lastPositionAt ? `@ ${new Date(v.lastPositionAt).toLocaleString()}` : '—'}
                  </div>
                </Popup>
              </Marker>
            ))}

            {/* Active Vehicles with No Fix */}
            {noPosition.map(v => (
              <CircleMarker key={`np-${v.sessionId}`} center={DEFAULT_CENTER} radius={4}
                pathOptions={{ color: '#f48c06', fillColor: '#f48c06', fillOpacity: 0.6 }}>
                <Popup><span style={{ fontFamily: 'var(--text-mono)', fontSize: '9px' }}>
                  {v.vehicleRegistration} — no GNSS fix
                </span></Popup>
              </CircleMarker>
            ))}
          </MapContainer>
        </div>

        {/* Right session list */}
        <div style={{
          width: '240px',
          flexShrink: 0,
          background: 'var(--bg-panel)',
          borderLeft: '1px solid var(--border)',
          overflowY: 'auto',
        }}>
          {/* Active Live Section */}
          <div style={{ padding: '7px 10px', borderBottom: '1px solid var(--border)', fontFamily: 'var(--text-mono)', fontSize: '9px', fontWeight: 700, color: 'var(--text-dim)', letterSpacing: '0.1em' }}>
            ACTIVE SESSIONS ({liveVehicles.length})
          </div>
          {liveVehicles.length === 0 && !loading && (
            <div style={{ padding: '10px', fontFamily: 'var(--text-mono)', fontSize: '8.5px', color: 'var(--text-dim)' }}>
              No active live sessions.
            </div>
          )}
          {liveVehicles.map(v => (
            <div key={`live-item-${v.sessionId}`} style={{
              padding: '7px 10px',
              borderBottom: '1px solid var(--border)',
              borderLeft: `2px solid ${ulbColor(v.ulbId, ulbs)}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontFamily: 'var(--text-mono)', fontSize: '10px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {v.vehicleRegistration}
                </div>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--status-ok)' }} />
              </div>
              <div style={{ fontFamily: 'var(--text-mono)', fontSize: '8.5px', color: 'var(--text-dim)', marginTop: '2px' }}>
                {v.ulbName || v.ulbId}
              </div>
              <div style={{ fontFamily: 'var(--text-mono)', fontSize: '8px', color: v.hasPosition ? 'var(--status-ok)' : 'var(--status-warn)', marginTop: '3px' }}>
                {v.hasPosition ? `📍 ${v.lat?.toFixed(4)}, ${v.lon?.toFixed(4)}` : '◌ NO FIX'}
              </div>
              {v.speed != null && (
                <div style={{ fontFamily: 'var(--text-mono)', fontSize: '8.5px', color: '#00b4d8', marginTop: '2px' }}>
                  {v.speed.toFixed(1)} km/h
                </div>
              )}
              {onSelectLiveDebug && (
                <button
                  onClick={() => onSelectLiveDebug(v.sessionId)}
                  style={{
                    background: 'none',
                    border: '1px solid var(--border)',
                    color: '#9d4edd',
                    fontFamily: 'var(--text-mono)',
                    fontSize: '8px',
                    fontWeight: 600,
                    padding: '2px 6px',
                    marginTop: '5px',
                    cursor: 'pointer',
                    borderRadius: '2px',
                    width: '100%',
                    textAlign: 'center',
                  }}
                >
                  ⚡ LIVE DEBUG →
                </button>
              )}
            </div>
          ))}

          {/* Offline with Last-Known Location Section */}
          {offlineVehicles.length > 0 && (
            <>
              <div style={{ padding: '7px 10px', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', background: 'var(--bg-panel-2)', fontFamily: 'var(--text-mono)', fontSize: '9px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.1em' }}>
                OFFLINE · LAST KNOWN ({offlineVehicles.length})
              </div>
              {offlineVehicles.map(v => (
                <div key={`offline-item-${v.vehicleRegistration}`} style={{
                  padding: '7px 10px',
                  borderBottom: '1px solid var(--border)',
                  borderLeft: `2px solid #64748b`,
                  opacity: 0.85,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ fontFamily: 'var(--text-mono)', fontSize: '9.5px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                      {v.vehicleRegistration}
                    </div>
                    <span style={{ fontSize: '8px', color: '#64748b' }}>OFFLINE</span>
                  </div>
                  <div style={{ fontFamily: 'var(--text-mono)', fontSize: '8px', color: 'var(--text-dim)', marginTop: '2px' }}>
                    {v.ulbName || v.ulbId}
                  </div>
                  <div style={{ fontFamily: 'var(--text-mono)', fontSize: '8px', color: '#94a3b8', marginTop: '3px' }}>
                    📍 {v.lat?.toFixed(4)}, {v.lon?.toFixed(4)}
                  </div>
                  <div style={{ fontFamily: 'var(--text-mono)', fontSize: '7.5px', color: 'var(--text-dim)', marginTop: '2px' }}>
                    Seen: {v.lastPositionAt ? new Date(v.lastPositionAt).toLocaleTimeString() : '—'}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Sessions Panel ───────────────────────────────────────────────────────────
// fixedUlbId: always-scoped to one ULB (Officer). Null = all ULBs (Admin).
// ULB filter dropdown is hidden entirely when fixedUlbId is set.
export function SessionsPanel({ ulbs, fixedUlbId = null }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading]   = useState(true);
  // In Admin mode the user can change filterUlb; in Officer mode it's locked
  const [filterUlb, setFilterUlb] = useState(fixedUlbId || '');
  const [cameraDeviceId, setCameraDeviceId] = useState(null);

  useEffect(() => {
    setLoading(true);
    fetchAdminSessions(filterUlb || null, 150).then(data => {
      setSessions(data || []);
      setLoading(false);
    });
  }, [filterUlb]);

  // If Officer mode and fixedUlbId changes, re-lock
  useEffect(() => {
    if (fixedUlbId && filterUlb !== fixedUlbId) {
      setFilterUlb(fixedUlbId);
    }
  }, [fixedUlbId]);

  const fmtDur = sec => {
    if (sec == null) return '—';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60).toString().padStart(2, '0');
    const s = Math.floor(sec % 60).toString().padStart(2, '0');
    return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Filter bar — ULB dropdown hidden when fixedUlbId is set (Officer) */}
      <div style={{ padding: '7px 14px', background: 'var(--bg-panel)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
        {!fixedUlbId && (
          <>
            <span style={{ fontFamily: 'var(--text-mono)', fontSize: '9px', color: 'var(--text-dim)' }}>ULB FILTER:</span>
            <select
              value={filterUlb}
              onChange={e => { setLoading(true); setFilterUlb(e.target.value); }}
              style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-mid)',
                color: 'var(--text-primary)',
                fontFamily: 'var(--text-mono)',
                fontSize: '10px',
                padding: '2px 6px',
                outline: 'none',
              }}
            >
              <option value="">ALL ULBs</option>
              {ulbs.map(u => <option key={u.ulbId} value={u.ulbId}>{u.ulbName}</option>)}
            </select>
          </>
        )}
        {fixedUlbId && (
          <span style={{ fontFamily: 'var(--text-mono)', fontSize: '9px', color: 'var(--text-label)' }}>
            SCOPED TO: <strong style={{ color: 'var(--text-primary)' }}>{ulbs.find(u => u.ulbId === fixedUlbId)?.ulbName ?? fixedUlbId}</strong>
          </span>
        )}
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--text-mono)', fontSize: '8.5px', color: 'var(--text-dim)' }}>
          {sessions.length} sessions
        </span>
        {/* Camera pane close button when a session is selected */}
        {cameraDeviceId && (
          <button
            onClick={() => setCameraDeviceId(null)}
            style={{
              padding: '2px 8px',
              fontFamily: 'var(--text-mono)',
              fontSize: '8.5px',
              background: 'none',
              border: '1px solid var(--border)',
              color: 'var(--text-dim)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            📷 {cameraDeviceId} &nbsp;✕
          </button>
        )}
      </div>

      {/* Table + optional camera side pane */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        <div style={{ flex: 1, overflowY: 'auto', minWidth: 0 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <THead cols={['#', 'SESSION CODE', 'DEVICE', 'VEHICLE', 'ULB', 'MODE', 'STATUS', 'STARTED', 'DURATION', '📷']} />
            <tbody>
              {loading ? <LoadingRow cols={10} /> :
               sessions.length === 0 ? <EmptyRow cols={10} msg="No sessions found." /> :
               sessions.map(s => (
                 <TRow key={s.sessionId} accent={s.status === 'ACTIVE' ? 'var(--status-ok)' : 'var(--border)'}>
                   <TD mono dim>{s.sessionId}</TD>
                   <TD mono color="var(--text-primary)">{s.sessionCode}</TD>
                   <TD mono>{s.deviceCode}</TD>
                   <TD mono>{s.vehicleRegistration}</TD>
                   <TD mono color={s.ulbId ? 'var(--text-secondary)' : 'var(--text-dim)'}>{s.ulbName || s.ulbId || '—'}</TD>
                   <TD mono dim>{s.mode}</TD>
                   <TD mono color={s.status === 'ACTIVE' ? 'var(--status-ok)' : 'var(--text-dim)'}>
                     {s.status === 'ACTIVE' && <StatusDot ok />}{s.status}
                   </TD>
                   <TD mono dim>{s.startedAt ? new Date(s.startedAt).toLocaleString() : '—'}</TD>
                   <TD mono dim>{fmtDur(s.durationSeconds)}</TD>
                   <td style={{ padding: '3px 6px', borderBottom: '1px solid var(--border)' }}>
                     {/* Camera button — only for sessions with a known deviceCode.
                         Officer: fixedUlbId is passed through to CameraViewer → getCameraFrameUrl,
                         which sends ?ulbId= to the server for server-side ULB enforcement. */}
                     {s.deviceCode && (
                       <button
                         onClick={() => setCameraDeviceId(
                           cameraDeviceId === s.deviceCode ? null : s.deviceCode
                         )}
                         title={`View camera for ${s.deviceCode}`}
                         style={{
                           background: cameraDeviceId === s.deviceCode ? 'rgba(0,180,216,0.2)' : 'none',
                           border: `1px solid ${cameraDeviceId === s.deviceCode ? '#00b4d8' : 'var(--border)'}`,
                           color: cameraDeviceId === s.deviceCode ? '#00b4d8' : 'var(--text-dim)',
                           fontFamily: 'var(--text-mono)',
                           fontSize: '9px',
                           padding: '2px 5px',
                           cursor: 'pointer',
                           borderRadius: '2px',
                         }}
                       >
                         📷
                       </button>
                     )}
                   </td>
                 </TRow>
               ))}
            </tbody>
          </table>
        </div>

        {/* Camera side pane — appears when a session's 📷 button is clicked */}
        {cameraDeviceId && (
          <div style={{
            width: '260px',
            flexShrink: 0,
            borderLeft: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--bg-panel)',
          }}>
            <div style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)', fontFamily: 'var(--text-mono)', fontSize: '9px', fontWeight: 700, color: 'var(--text-dim)', letterSpacing: '0.1em' }}>
              LIVE CAMERA
            </div>
            <CameraViewer
              deviceId={cameraDeviceId}
              ulbId={fixedUlbId}  /* Server-side ULB enforcement: null=Admin (unrestricted), set=Officer */
              intervalMs={1500}
              style={{ flex: 1, minHeight: 0 }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Vehicles Panel ───────────────────────────────────────────────────────────
// fixedUlbId: Officer mode — always scoped, dropdown hidden.
export function VehiclesPanel({ ulbs, fixedUlbId = null }) {
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [filterUlb, setFilterUlb] = useState(fixedUlbId || '');
  const [cameraDeviceId, setCameraDeviceId] = useState(null);

  useEffect(() => {
    setLoading(true);
    fetchAdminVehicles(filterUlb || null).then(data => {
      setVehicles(data || []);
      setLoading(false);
    });
  }, [filterUlb]);

  useEffect(() => {
    if (fixedUlbId && filterUlb !== fixedUlbId) {
      setFilterUlb(fixedUlbId);
    }
  }, [fixedUlbId]);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '7px 14px', background: 'var(--bg-panel)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
        {!fixedUlbId && (
          <>
            <span style={{ fontFamily: 'var(--text-mono)', fontSize: '9px', color: 'var(--text-dim)' }}>ULB FILTER:</span>
            <select
              value={filterUlb}
              onChange={e => { setLoading(true); setFilterUlb(e.target.value); }}
              style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-mid)',
                color: 'var(--text-primary)',
                fontFamily: 'var(--text-mono)',
                fontSize: '10px',
                padding: '2px 6px',
                outline: 'none',
              }}
            >
              <option value="">ALL ULBs</option>
              {ulbs.map(u => <option key={u.ulbId} value={u.ulbId}>{u.ulbName}</option>)}
            </select>
          </>
        )}
        {fixedUlbId && (
          <span style={{ fontFamily: 'var(--text-mono)', fontSize: '9px', color: 'var(--text-label)' }}>
            SCOPED TO: <strong style={{ color: 'var(--text-primary)' }}>{ulbs.find(u => u.ulbId === fixedUlbId)?.ulbName ?? fixedUlbId}</strong>
          </span>
        )}
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--text-mono)', fontSize: '8.5px', color: 'var(--text-dim)' }}>
          {vehicles.length} vehicles
        </span>
        {cameraDeviceId && (
          <button
            onClick={() => setCameraDeviceId(null)}
            style={{
              padding: '2px 8px',
              fontFamily: 'var(--text-mono)',
              fontSize: '8.5px',
              background: 'none',
              border: '1px solid var(--border)',
              color: 'var(--text-dim)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            ✕ CLOSE CAMERA
          </button>
        )}
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <THead cols={['REG. NO.', 'TYPE', 'ULB', 'STATUS', 'LAST KNOWN POS.', 'DEVICE', 'ASSIGNMENT', 'CAMERA']} />
            <tbody>
              {loading ? <LoadingRow cols={8} /> :
               vehicles.length === 0 ? <EmptyRow cols={8} msg="No vehicles found." /> :
               vehicles.map(v => (
                 <TRow key={v.vehicleId} accent={v.assignmentActive ? '#2dc653' : 'var(--border)'}>
                   <TD mono color="var(--text-primary)">{v.registrationNumber}</TD>
                   <TD mono dim>{v.vehicleType}</TD>
                   <TD mono color="var(--text-secondary)">{v.ulbName || v.ulbId}</TD>
                   <TD mono color={v.status === 'IN_SERVICE' ? 'var(--status-ok)' : 'var(--status-warn)'}>{v.status}</TD>
                   <TD mono dim>
                     {v.lastKnownLatitude != null && v.lastKnownLongitude != null ? (
                       <span style={{ color: 'var(--text-secondary)' }}>
                         📍 {v.lastKnownLatitude.toFixed(4)}, {v.lastKnownLongitude.toFixed(4)}
                       </span>
                     ) : '—'}
                   </TD>
                   <TD mono color={v.assignedDeviceCode ? 'var(--text-primary)' : 'var(--text-dim)'}>
                     {v.assignedDeviceCode || 'UNASSIGNED'}
                   </TD>
                   <TD mono color={v.assignmentActive ? 'var(--status-ok)' : 'var(--text-dim)'}>
                     {v.assignmentActive ? '● ACTIVE' : '○ NONE'}
                   </TD>
                   <td style={{ padding: '5px 10px', borderBottom: '1px solid var(--border)', textAlign: 'center' }}>
                     {v.assignedDeviceCode ? (
                       <button
                         onClick={() => setCameraDeviceId(cameraDeviceId === v.assignedDeviceCode ? null : v.assignedDeviceCode)}
                         title="Toggle live camera inspection"
                         style={{
                           padding: '2px 6px',
                           fontFamily: 'var(--text-mono)',
                           fontSize: '8.5px',
                           background: cameraDeviceId === v.assignedDeviceCode ? '#00d9ff' : 'var(--bg-elevated)',
                           color: cameraDeviceId === v.assignedDeviceCode ? '#000000' : 'var(--text-primary)',
                           border: '1px solid var(--border)',
                           borderRadius: '2px',
                           cursor: 'pointer',
                           fontWeight: 600,
                         }}
                       >
                         📷
                       </button>
                     ) : (
                       <span style={{ fontFamily: 'var(--text-mono)', fontSize: '8.5px', color: 'var(--text-dim)' }}>—</span>
                     )}
                   </td>
                 </TRow>
               ))}
            </tbody>
          </table>
        </div>

        {/* Camera side pane */}
        {cameraDeviceId && (
          <div style={{
            width: '280px',
            flexShrink: 0,
            borderLeft: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--bg-panel)',
          }}>
            <div style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)', fontFamily: 'var(--text-mono)', fontSize: '9px', fontWeight: 700, color: 'var(--text-dim)', letterSpacing: '0.1em' }}>
              LIVE CAMERA · {cameraDeviceId}
            </div>
            <CameraViewer
              deviceId={cameraDeviceId}
              ulbId={fixedUlbId}
              intervalMs={1500}
              style={{ flex: 1, minHeight: 0 }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Devices Panel ────────────────────────────────────────────────────────────
// fixedUlbId: when set (Officer), filters the displayed list client-side
// to devices whose assignedVehicleUlbId matches the scoped ULB.
// The API currently returns all devices; ULB scope is applied here in JS.
// No officer-accessible data from other ULBs is shown.
export function DevicesPanel({ fixedUlbId = null }) {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    fetchAdminDevices().then(data => {
      const all = data || [];
      // Officer: only show devices whose assigned vehicle's ULB matches
      const scoped = fixedUlbId
        ? all.filter(d => d.assignedVehicleUlbId === fixedUlbId)
        : all;
      setDevices(scoped);
      setLoading(false);
    });
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, [fixedUlbId]);

  const fmtAge = sec => {
    if (sec == null) return 'NEVER';
    if (sec < 60) return `${sec}s ago`;
    if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
    return `${Math.floor(sec / 3600)}h ago`;
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '7px 14px', background: 'var(--bg-panel)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
        <span style={{ fontFamily: 'var(--text-mono)', fontSize: '9px', color: 'var(--text-dim)' }}>
          {devices.length} devices · heartbeat 15 s · online = seen &lt; 30 s ago
          {fixedUlbId ? ' · scoped to ULB' : ''}
        </span>
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <THead cols={['DEVICE CODE', 'HW VER.', 'FW VER.', 'ONLINE', 'LAST SEEN', 'VEHICLE', 'ULB', 'ACTIVE']} />
          <tbody>
            {loading ? <LoadingRow cols={8} /> :
             devices.length === 0 ? <EmptyRow cols={8} msg="No devices found." /> :
             devices.map(d => (
               <TRow key={d.deviceId} accent={d.isOnline ? 'var(--status-ok)' : 'var(--status-off)'}>
                 <TD mono color="var(--text-primary)">{d.deviceCode}</TD>
                 <TD mono dim>{d.hardwareVersion || '—'}</TD>
                 <TD mono dim>{d.firmwareVersion || '—'}</TD>
                 <TD mono>
                   <StatusDot ok={d.isOnline} />
                   <span style={{ color: d.isOnline ? 'var(--status-ok)' : 'var(--text-dim)' }}>
                     {d.isOnline ? 'ONLINE' : 'OFFLINE'}
                   </span>
                 </TD>
                 <TD mono dim>{fmtAge(d.secondsSinceLastSeen)}</TD>
                 <TD mono color={d.assignedVehicleReg ? 'var(--text-secondary)' : 'var(--text-dim)'}>
                   {d.assignedVehicleReg || 'UNASSIGNED'}
                 </TD>
                 <TD mono dim>{d.assignedVehicleUlbName || d.assignedVehicleUlbId || '—'}</TD>
                  <TD mono color={d.isActive ? 'var(--status-ok)' : 'var(--status-error)'}>
                    {d.isActive ? 'YES' : 'NO'}
                  </TD>
                </TRow>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Live Debug Panel (Admin-only) ──────────────────────────────────────────
export function LiveDebugPanel({ initialSessionId = null, onSelectSession = null }) {
  const [sessions, setSessions] = useState([]);
  const [selectedId, setSelectedId] = useState(initialSessionId);
  const [subView, setSubView] = useState('overview'); // 'overview' | 'imu' | 'map' | 'gnss'
  const [liveData, setLiveData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastPollTime, setLastPollTime] = useState(null);

  // Load available sessions for the picker (active sessions first)
  useEffect(() => {
    fetchAdminSessions(null, 50).then(data => {
      const list = data || [];
      setSessions(list);
      if (!selectedId && list.length > 0) {
        // Default to first active session or first session
        const active = list.find(s => s.status === 'ACTIVE');
        const defaultId = active ? active.sessionId : list[0].sessionId;
        setSelectedId(defaultId);
        if (onSelectSession) onSelectSession(defaultId);
      }
    });
  }, []);

  // Sync if parent updates selectedId
  useEffect(() => {
    if (initialSessionId && initialSessionId !== selectedId) {
      setSelectedId(initialSessionId);
    }
  }, [initialSessionId]);

  // Connect via SignalR real-time stream for selected session
  useEffect(() => {
    if (!selectedId) return;

    let mounted = true;

    // 1. Initial snapshot fetch
    const loadSnapshot = async () => {
      const data = await fetchAdminSessionLive(selectedId);
      if (mounted && data) {
        setLiveData(data);
        setLastPollTime(new Date());
        setLoading(false);
      }
    };
    loadSnapshot();

    // 2. Real-time SignalR Telemetry Subscription
    const signalRSource = new SignalRTelemetrySource({ sessionId: selectedId });
    signalRSource.start().catch((err) => {
      console.warn('[LiveDebugPanel] SignalR stream start error:', err);
    });

    const unsubscribe = signalRSource.onPacket((packet) => {
      if (!mounted) return;
      setLiveData((prev) => ({
        ...prev,
        latest: {
          imu: packet.imu ? {
            valid: true,
            accel: packet.imu.accel || { x: packet.imu.accelX ?? 0, y: packet.imu.accelY ?? 0, z: packet.imu.accelZ ?? 0 },
            gyro: packet.imu.gyro || { x: packet.imu.gyroX ?? 0, y: packet.imu.gyroY ?? 0, z: packet.imu.gyroZ ?? 0 },
            orientation: {
              roll: packet.imu.orientation?.roll ?? packet.imu.roll ?? 0,
              pitch: packet.imu.orientation?.pitch ?? packet.imu.pitch ?? 0,
              yaw: packet.imu.orientation?.yaw ?? packet.imu.yaw ?? 0,
            },
            quaternion: packet.imu.quaternion,
            accel_magnitude: packet.imu.accel_magnitude,
          } : prev?.latest?.imu,
          gnss: packet.gnss ? {
            lat: packet.gnss.lat ?? packet.gnss.latitude,
            lon: packet.gnss.lon ?? packet.gnss.longitude,
            alt: packet.gnss.alt ?? packet.gnss.altitudeM,
            speed: packet.gnss.speed ?? packet.gnss.speedKmh,
            heading: packet.gnss.heading ?? packet.gnss.headingDeg,
            fix: packet.gnss.fix ?? packet.gnss.fixStatus,
            satellites: packet.gnss.satellites ?? packet.gnss.satellitesCount,
            valid: packet.gnss.valid ?? packet.gnss.fixValid ?? true,
          } : prev?.latest?.gnss,
          rtc: packet.rtc || prev?.latest?.rtc,
        },
        latestGnss: packet.gnss ? {
          latitude: packet.gnss.lat,
          longitude: packet.gnss.lon,
          altitudeM: packet.gnss.alt,
          speedKmh: packet.gnss.speed,
          headingDeg: packet.gnss.heading,
          fixStatus: packet.gnss.fix,
          fixValid: packet.gnss.valid,
          satellitesCount: packet.gnss.satellites,
          hdop: packet.gnss.hdop,
          timestamp: new Date().toISOString(),
        } : prev?.latestGnss,
        latestImu: packet.imu ? {
          accelX: packet.imu.accel?.x,
          accelY: packet.imu.accel?.y,
          accelZ: packet.imu.accel?.z,
          accelMagnitude: packet.imu.accel_magnitude,
          gyroX: packet.imu.gyro?.x,
          gyroY: packet.imu.gyro?.y,
          gyroZ: packet.imu.gyro?.z,
          roll: packet.imu.orientation?.roll ?? packet.imu.roll,
          pitch: packet.imu.orientation?.pitch ?? packet.imu.pitch,
          yaw: packet.imu.orientation?.yaw ?? packet.imu.yaw,
          quaternion: packet.imu.quaternion,
          timestamp: new Date().toISOString(),
        } : prev?.latestImu,
        fusedMotion: packet.fusedMotion || prev?.fusedMotion,
      }));
      setLastPollTime(new Date());
      setLoading(false);
    });

    return () => {
      mounted = false;
      unsubscribe();
      signalRSource.stop();
    };
  }, [selectedId]);

  const unifiedLatest = {
    imu: {
      valid: true,
      accel: liveData?.latest?.imu?.accel || {
        x: liveData?.latestImu?.accelX ?? 0,
        y: liveData?.latestImu?.accelY ?? 0,
        z: liveData?.latestImu?.accelZ ?? 0,
      },
      gyro: liveData?.latest?.imu?.gyro || {
        x: liveData?.latestImu?.gyroX ?? 0,
        y: liveData?.latestImu?.gyroY ?? 0,
        z: liveData?.latestImu?.gyroZ ?? 0,
      },
      orientation: {
        roll: liveData?.latest?.imu?.orientation?.roll ?? liveData?.latestImu?.roll ?? 0,
        pitch: liveData?.latest?.imu?.orientation?.pitch ?? liveData?.latestImu?.pitch ?? 0,
        yaw: liveData?.latest?.imu?.orientation?.yaw ?? liveData?.latestImu?.yaw ?? 0,
      },
      quaternion: liveData?.latest?.imu?.quaternion || liveData?.latestImu?.quaternion,
      accel_magnitude: liveData?.latest?.imu?.accel_magnitude ?? liveData?.latestImu?.accelMagnitude,
    },
    gnss: {
      lat: liveData?.latest?.gnss?.lat ?? liveData?.latestGnss?.latitude,
      lon: liveData?.latest?.gnss?.lon ?? liveData?.latestGnss?.longitude,
      alt: liveData?.latest?.gnss?.alt ?? liveData?.latestGnss?.altitudeM,
      speed: liveData?.latest?.gnss?.speed ?? liveData?.latestGnss?.speedKmh,
      heading: liveData?.latest?.gnss?.heading ?? liveData?.latestGnss?.headingDeg,
      fix: liveData?.latest?.gnss?.fix ?? liveData?.latestGnss?.fixStatus,
      satellites: liveData?.latest?.gnss?.satellites ?? liveData?.latestGnss?.satellitesCount,
      valid: liveData?.latest?.gnss?.valid ?? liveData?.latestGnss?.fixValid ?? true,
    },
    fusedMotion: liveData?.fusedMotion,
    rtc: liveData?.latest?.rtc || { iso: liveData?.latestImu?.timestamp },
  };

  const SUB_VIEWS = [
    { id: 'overview', label: '📊  Overview' },
    { id: 'imu',      label: '🎲  3D IMU & Orientation' },
    { id: 'map',      label: '🗺  Map Trajectory' },
    { id: 'gnss',     label: '🛰  GNSS Satellites' },
  ];

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Top Session Stream Picker & SignalR Status Bar */}
      <div style={{
        padding: '7px 14px',
        background: 'var(--bg-panel)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        flexShrink: 0,
        flexWrap: 'wrap',
      }}>
        <span style={{ fontFamily: 'var(--text-mono)', fontSize: '9px', fontWeight: 700, color: '#9d4edd', letterSpacing: '0.08em' }}>
          SESSION STREAM:
        </span>

        <select
          id="live-debug-session-select"
          value={selectedId || ''}
          onChange={e => {
            const sid = Number(e.target.value);
            setSelectedId(sid);
            setLoading(true);
            if (onSelectSession) onSelectSession(sid);
          }}
          style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-mid)',
            color: 'var(--text-primary)',
            fontFamily: 'var(--text-mono)',
            fontSize: '10px',
            padding: '3px 8px',
            outline: 'none',
            borderRadius: '2px',
            minWidth: '280px',
          }}
        >
          {sessions.map(s => (
            <option key={s.sessionId} value={s.sessionId}>
              {s.status === 'ACTIVE' ? '● [ACTIVE] ' : '○ '}
              #{s.sessionId} · {s.deviceCode} · {s.vehicleRegistration || 'UNASSIGNED'} ({s.ulbName || s.ulbId || 'No ULB'})
            </option>
          ))}
        </select>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{
            display: 'inline-block',
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: liveData?.status === 'ACTIVE' ? 'var(--status-ok)' : 'var(--text-dim)',
            boxShadow: liveData?.status === 'ACTIVE' ? '0 0 6px var(--status-ok)' : 'none',
          }} />
          <span style={{ fontFamily: 'var(--text-mono)', fontSize: '9px', color: 'var(--text-secondary)' }}>
            {liveData?.status === 'ACTIVE' ? 'SIGNALR REAL-TIME STREAM (ACTIVE)' : 'SESSION COMPLETED · SNAPSHOT VIEW'}
          </span>
        </div>

        <span style={{ marginLeft: 'auto', fontFamily: 'var(--text-mono)', fontSize: '8.5px', color: 'var(--text-dim)' }}>
          {lastPollTime ? `LAST EVENT: ${lastPollTime.toLocaleTimeString()}` : 'WAITING FOR DATA…'}
        </span>
      </div>

      {/* Sub-view Navigation Bar */}
      <div style={{
        display: 'flex',
        background: 'var(--bg-base)',
        borderBottom: '1px solid var(--border)',
        padding: '0 12px',
        gap: '4px',
        flexShrink: 0,
      }}>
        {SUB_VIEWS.map(v => (
          <button
            key={v.id}
            id={`live-debug-subview-${v.id}`}
            onClick={() => setSubView(v.id)}
            style={{
              background: 'transparent',
              border: 'none',
              borderBottom: subView === v.id ? '2px solid #9d4edd' : '2px solid transparent',
              color: subView === v.id ? 'var(--text-primary)' : 'var(--text-dim)',
              fontFamily: 'var(--text-mono)',
              fontSize: '10px',
              fontWeight: 600,
              padding: '7px 14px',
              cursor: 'pointer',
              letterSpacing: '0.04em',
              transition: 'all 0.15s ease',
            }}
          >
            {v.label}
          </button>
        ))}
      </div>

      {/* Main Live Debug Content with Sub-View Switcher */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {loading && !liveData ? (
          <div style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'var(--text-mono)',
            fontSize: '11px',
            color: '#00d9ff',
          }}>
            Connecting to cloud telemetry stream for Session #{selectedId}…
          </div>
        ) : (
          <>
            {subView === 'overview' && (
              <ErrorBoundary name="Live Debug Overview">
                <OverviewPresentation
                  latest={unifiedLatest}
                  sensorStatus={liveData?.sensorStatus}
                  sessionElapsed={liveData?.sessionElapsed ?? 0}
                  runCount={liveData?.runCount ?? 1}
                  sessionId={liveData?.sessionId ?? selectedId}
                  sessionCode={liveData?.sessionCode}
                  mode={liveData?.mode ?? 'REAL_HARDWARE'}
                  activeFaults={[]}
                  sourceType="CLOUD_POLLED"
                  serialConnected={liveData?.status === 'ACTIVE'}
                  vehicleRegistration={liveData?.vehicleRegistration}
                  ulbName={liveData?.ulbName}
                  isCloudPolled={true}
                  traces={liveData?.traces}
                />
              </ErrorBoundary>
            )}

            {subView === 'imu' && (
              <ErrorBoundary name="Live Debug IMU">
                <IMUPresentation
                  latest={unifiedLatest}
                  activeFaults={[]}
                  isCloudPolled={true}
                  traces={liveData?.traces}
                />
              </ErrorBoundary>
            )}

            {subView === 'map' && (
              <ErrorBoundary name="Live Debug Map">
                <MapPresentation
                  latest={liveData?.latest}
                  sensorStatus={liveData?.sensorStatus}
                  track={liveData?.trajectory || []}
                  isCloudPolled={true}
                />
              </ErrorBoundary>
            )}

            {subView === 'gnss' && (
              <ErrorBoundary name="Live Debug GNSS">
                <GNSSPresentation
                  latest={liveData?.latest}
                  sensorStatus={liveData?.sensorStatus}
                  sourceType="CLOUD_POLLED"
                  isCloudPolled={true}
                />
              </ErrorBoundary>
            )}
          </>
        )}
      </div>
    </div>
  );
}
