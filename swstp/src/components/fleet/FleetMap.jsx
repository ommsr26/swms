/**
 * FleetMap.jsx — Core fleet operations map component.
 *
 * Extracted and enhanced from AdminPanels.jsx FleetPanel.
 * Renders the Leaflet map with:
 *   - CartoDB dark/light tiles (themed)
 *   - ULB safe-zone circles
 *   - Live vehicle markers (heading-oriented)
 *   - Offline last-known markers (dashed)
 *   - Vehicles with no GNSS fix (amber dot at center)
 *   - Active sessions list sidebar
 *   - Vehicle selection → VehicleDrawer
 * Professional municipal fleet-operations screen:
 *   - Real-time KPI summary (TOTAL, LIVE, STALE, OFFLINE)
 *   - Interactive Map Controls: FIT ALL, FOLLOW TRUCK, QUICK SEARCH
 *   - CartoDB dark/light themed tiles with Safe Zone boundaries
 *   - Live 3D animated truck markers with heading & velocity vectors
 *   - Integrated sidebar search & vehicle list with live relative age
 *   - Detailed telemetry inspection drawer (VehicleDrawer)
 */
import { useState, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Circle, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useTheme, cartoTileUrl } from '../../ThemeContext.jsx';
import VehicleDrawer from './VehicleDrawer.jsx';
import RoutePlaybackModal from './RoutePlaybackModal.jsx';
import {
  FleetMapAutoFit,
  ulbColor,
  DEFAULT_CENTER,
  AnimatedVehicleMarker,
} from './VehicleMarker.jsx';
import { fetchGisRoads } from '../../telemetry/backendApiClient.js';

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

function classifyVehicle(v) {
  const lastSeenTime = v.lastPositionAt || v.lastSeen;
  const ageSec = lastSeenTime ? (Date.now() - new Date(lastSeenTime).getTime()) / 1000 : 999999;
  if (v.isLive !== false && !v.isLastKnown && ageSec <= 15) {
    return 'LIVE';
  }
  if (ageSec <= 60 || v.isLastKnown) {
    return 'STALE';
  }
  return 'OFFLINE';
}

function MapActionController({ targetFollow, isFollowing, onUserPan, fitTrigger, mapPoints }) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;
    const handleDragStart = () => {
      if (onUserPan) onUserPan();
    };
    map.on('dragstart', handleDragStart);
    return () => {
      map.off('dragstart', handleDragStart);
    };
  }, [map, onUserPan]);

  useEffect(() => {
    if (isFollowing && targetFollow && targetFollow[0] != null && targetFollow[1] != null && map) {
      map.panTo(targetFollow, { animate: true, duration: 0.6 });
    }
  }, [targetFollow, isFollowing, map]);

  useEffect(() => {
    if (fitTrigger > 0 && map && mapPoints && mapPoints.length > 0) {
      const validPoints = mapPoints.filter((p) => p && p.lat != null && p.lon != null);
      if (validPoints.length === 1) {
        map.setView([validPoints[0].lat, validPoints[0].lon], 15, { animate: true });
      } else if (validPoints.length > 1) {
        const bounds = L.latLngBounds(validPoints.map((p) => [p.lat, p.lon]));
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15, animate: true });
      }
    }
  }, [fitTrigger, map, mapPoints]);

  return null;
}

export default function FleetMap({
  fleet = [],
  ulbs = [],
  fixedUlbId = null,
  loading = false,
  lastRefresh = null,
  onSelectLiveDebug = null,
}) {
  const { theme } = useTheme();
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [playbackVehicle, setPlaybackVehicle] = useState(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [fitTrigger, setFitTrigger] = useState(0);
  const [roads, setRoads] = useState([]);
  const [, setTick] = useState(0);

  const effectiveUlb = fixedUlbId || 'ULB_MH_AMRAVATI';

  useEffect(() => {
    const timer = setInterval(() => setTick((t) => (t + 1) % 1000), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    fetchGisRoads(effectiveUlb).then((data) => setRoads(data || []));
  }, [effectiveUlb]);

  const safeZoneUlbs = (fixedUlbId
    ? ulbs.filter((u) => u.ulbId === fixedUlbId)
    : ulbs
  ).filter((u) => u.safeZoneLatitude != null && u.safeZoneLongitude != null);

  const formatVehicle = (v) => {
    const lat = v.displayLat ?? v.lat;
    const lon = v.displayLon ?? v.lon;
    const status = classifyVehicle(v);
    return {
      ...v,
      lat,
      lon,
      hasPosition: (lat != null && lon != null) || v.hasPosition,
      heading: v.heading ?? 0,
      isSnapped: v.isSnapped ?? false,
      isInsideSafeZone: v.isInsideSafeZone ?? false,
      operationalStatus: status,
    };
  };

  const formattedFleet = useMemo(() => fleet.map(formatVehicle), [fleet]);

  useEffect(() => {
    if (selectedVehicle) {
      const updated = formattedFleet.find(
        (v) =>
          (selectedVehicle.sessionId && v.sessionId === selectedVehicle.sessionId) ||
          (selectedVehicle.vehicleRegistration && v.vehicleRegistration === selectedVehicle.vehicleRegistration) ||
          (selectedVehicle.deviceId && v.deviceId === selectedVehicle.deviceId)
      );
      if (updated) {
        setSelectedVehicle(updated);
      }
    }
  }, [formattedFleet]);

  const totalCount = formattedFleet.length;
  const liveCount = formattedFleet.filter((v) => v.operationalStatus === 'LIVE').length;
  const staleCount = formattedFleet.filter((v) => v.operationalStatus === 'STALE').length;
  const offlineCount = formattedFleet.filter((v) => v.operationalStatus === 'OFFLINE').length;

  const filteredFleet = useMemo(() => {
    if (!searchQuery.trim()) return formattedFleet;
    const q = searchQuery.toLowerCase().trim();
    return formattedFleet.filter(
      (v) =>
        (v.vehicleRegistration && v.vehicleRegistration.toLowerCase().includes(q)) ||
        (v.deviceCode && v.deviceCode.toLowerCase().includes(q)) ||
        (v.ulbName && v.ulbName.toLowerCase().includes(q)) ||
        (v.ulbId && v.ulbId.toLowerCase().includes(q))
    );
  }, [formattedFleet, searchQuery]);

  const allMapPoints = useMemo(
    () => formattedFleet.filter((v) => v.hasPosition && v.lat != null && v.lon != null),
    [formattedFleet]
  );

  const selectedColor = selectedVehicle ? ulbColor(selectedVehicle.ulbId, ulbs) : '#00b4d8';
  const followTarget = selectedVehicle && selectedVehicle.lat != null ? [selectedVehicle.lat, selectedVehicle.lon] : null;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '6px 14px',
          background: 'var(--bg-panel)',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontFamily: 'var(--text-mono)', fontSize: '10px', fontWeight: 700, padding: '2px 7px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: '2px', color: 'var(--text-primary)' }}>
            <strong style={{ color: '#fff' }}>{totalCount}</strong> TOTAL
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontFamily: 'var(--text-mono)', fontSize: '10px', fontWeight: 700, padding: '2px 7px', background: 'rgba(45,198,83,0.1)', border: '1px solid rgba(45,198,83,0.3)', borderRadius: '2px', color: 'var(--status-ok)' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--status-ok)' }} />
            <strong>{liveCount}</strong> LIVE
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontFamily: 'var(--text-mono)', fontSize: '10px', fontWeight: 700, padding: '2px 7px', background: 'rgba(244,140,6,0.1)', border: '1px solid rgba(244,140,6,0.3)', borderRadius: '2px', color: 'var(--status-warn)' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--status-warn)' }} />
            <strong>{staleCount}</strong> STALE
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontFamily: 'var(--text-mono)', fontSize: '10px', fontWeight: 700, padding: '2px 7px', background: 'rgba(100,116,139,0.1)', border: '1px solid rgba(100,116,139,0.3)', borderRadius: '2px', color: '#94a3b8' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#64748b' }} />
            <strong>{offlineCount}</strong> OFFLINE
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>
          <button
            onClick={() => setFitTrigger((c) => c + 1)}
            style={{ padding: '4px 9px', fontFamily: 'var(--text-mono)', fontSize: '9px', fontWeight: 700, letterSpacing: '0.05em', background: 'rgba(0,217,255,0.08)', border: '1px solid rgba(0,217,255,0.3)', color: '#00d9ff', cursor: 'pointer', borderRadius: '2px' }}
            title="Fit map to all visible trucks"
          >
            ⛶ FIT ALL ({allMapPoints.length})
          </button>
          {selectedVehicle && (
            <button
              onClick={() => setIsFollowing((f) => !f)}
              style={{ padding: '4px 9px', fontFamily: 'var(--text-mono)', fontSize: '9px', fontWeight: 700, letterSpacing: '0.05em', background: isFollowing ? 'rgba(45,198,83,0.2)' : 'rgba(255,255,255,0.05)', border: isFollowing ? '1px solid var(--status-ok)' : '1px solid var(--border)', color: isFollowing ? 'var(--status-ok)' : 'var(--text-secondary)', cursor: 'pointer', borderRadius: '2px' }}
              title="Keep map centered on selected vehicle"
            >
              {isFollowing ? '🎯 FOLLOWING (ON)' : '🎯 FOLLOW'}
            </button>
          )}
          <input
            type="text"
            placeholder="Search vehicle / reg..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ background: 'var(--bg-panel-2)', border: '1px solid var(--border)', borderRadius: '2px', color: 'var(--text-primary)', fontFamily: 'var(--text-mono)', fontSize: '9.5px', padding: '4px 8px', width: '150px', outline: 'none' }}
          />
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
          {loading && (
            <div style={{ position: 'absolute', inset: 0, zIndex: 1000, background: 'rgba(7,9,13,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--text-mono)', color: '#00d9ff', fontSize: '11px' }}>
              Loading fleet positions…
            </div>
          )}
          <MapContainer center={DEFAULT_CENTER} zoom={12} style={{ width: '100%', height: '100%' }} zoomControl={false}>
            <TileLayer url={cartoTileUrl(theme)} attribution='&copy; <a href="https://carto.com/">CARTO</a>' maxZoom={19} />
            <FleetMapAutoFit vehicles={allMapPoints} />
            <MapActionController
              targetFollow={followTarget}
              isFollowing={isFollowing}
              onUserPan={() => setIsFollowing(false)}
              fitTrigger={fitTrigger}
              mapPoints={allMapPoints}
            />
            {safeZoneUlbs.map((u) => (
              <Circle
                key={`sz-${u.ulbId}`}
                center={[u.safeZoneLatitude, u.safeZoneLongitude]}
                radius={u.safeZoneRadiusMeters != null ? u.safeZoneRadiusMeters : 1000}
                pathOptions={{ color: ulbColor(u.ulbId, ulbs), fillColor: ulbColor(u.ulbId, ulbs), fillOpacity: 0.05, dashArray: '6, 6', weight: 1.5 }}
              >
                <Popup>
                  <div style={{ fontFamily: 'var(--text-mono)', fontSize: '10px', lineHeight: 1.5 }}>
                    <strong style={{ color: ulbColor(u.ulbId, ulbs) }}>🛡 SAFE ZONE: {u.ulbName}</strong>
                    <br />
                    Radius: {u.safeZoneRadiusMeters || 1000} m (Depot / Garage)
                  </div>
                </Popup>
              </Circle>
            ))}
            {allMapPoints.map((v) => {
              const isSelected = (selectedVehicle?.sessionId && selectedVehicle.sessionId === v.sessionId) || (selectedVehicle?.vehicleRegistration && selectedVehicle.vehicleRegistration === v.vehicleRegistration);
              const isLiveMarker = v.operationalStatus === 'LIVE';
              return (
                <AnimatedVehicleMarker
                  key={`truck-${v.sessionId || v.vehicleRegistration}`}
                  position={[v.lat, v.lon]}
                  heading={v.heading ?? 0}
                  speed={v.speed ?? 0}
                  color={ulbColor(v.ulbId, ulbs)}
                  isLive={isLiveMarker}
                  isSelected={isSelected}
                  eventHandlers={{
                    click: () => {
                      setSelectedVehicle(v);
                      setIsFollowing(false);
                    },
                  }}
                >
                  <Popup>
                    <div style={{ fontFamily: 'var(--text-mono)', fontSize: '10px', lineHeight: 1.5 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '3px' }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: isLiveMarker ? 'var(--status-ok)' : '#64748b' }} />
                        <strong style={{ color: ulbColor(v.ulbId, ulbs) }}>{v.vehicleRegistration}</strong>
                      </div>
                      <div>{v.ulbName || v.ulbId}</div>
                      <div>Speed: {v.speed != null ? `${v.speed.toFixed(1)} km/h` : '0.0 km/h'}</div>
                      <div>Heading: {v.heading != null ? `${v.heading.toFixed(0)}°` : '—'}</div>
                      <div>Status: {v.isInsideSafeZone ? '🛡 Safe Zone' : v.isSnapped ? '🔗 Road Snapped' : '📍 Free GPS'}</div>
                      <div style={{ color: 'var(--text-dim)', fontSize: '8.5px', marginTop: '2px' }}>
                        Seen: {formatRelativeAge(v.lastPositionAt || v.lastSeen)}
                      </div>
                    </div>
                  </Popup>
                </AnimatedVehicleMarker>
              );
            })}
          </MapContainer>
        </div>

        <div style={{ width: '230px', flexShrink: 0, background: 'var(--bg-panel)', borderLeft: '1px solid var(--border)', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '7px 10px', borderBottom: '1px solid var(--border)', fontFamily: 'var(--text-mono)', fontSize: '8.5px', fontWeight: 700, color: 'var(--text-dim)', letterSpacing: '0.1em', background: 'var(--bg-panel-2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
            <span>FLEET VEHICLES ({filteredFleet.length})</span>
            {searchQuery && (
              <span onClick={() => setSearchQuery('')} style={{ color: '#00d9ff', cursor: 'pointer', fontSize: '8px' }}>
                CLEAR
              </span>
            )}
          </div>
          {filteredFleet.length === 0 && !loading && (
            <div style={{ padding: '14px 10px', fontFamily: 'var(--text-mono)', fontSize: '8.5px', color: 'var(--text-dim)' }}>
              {searchQuery ? 'No vehicles match search.' : 'No registered fleet vehicles.'}
            </div>
          )}
          {filteredFleet.map((v) => {
            const isSelected = (selectedVehicle?.sessionId && selectedVehicle.sessionId === v.sessionId) || (selectedVehicle?.vehicleRegistration && selectedVehicle.vehicleRegistration === v.vehicleRegistration);
            const status = v.operationalStatus;
            const statusColor = status === 'LIVE' ? 'var(--status-ok)' : status === 'STALE' ? 'var(--status-warn)' : '#64748b';
            return (
              <div
                key={`side-item-${v.sessionId || v.vehicleRegistration}`}
                onClick={() => {
                  setSelectedVehicle(isSelected ? null : v);
                  setIsFollowing(false);
                }}
                style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', borderLeft: `3px solid ${isSelected ? '#00d9ff' : ulbColor(v.ulbId, ulbs)}`, cursor: 'pointer', background: isSelected ? 'var(--bg-elevated)' : 'transparent', transition: 'background 0.12s' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontFamily: 'var(--text-mono)', fontSize: '10px', fontWeight: 700, color: isSelected ? '#00d9ff' : 'var(--text-primary)' }}>
                    {v.vehicleRegistration || 'UNREGISTERED'}
                  </div>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontFamily: 'var(--text-mono)', fontSize: '7.5px', fontWeight: 700, color: statusColor, background: status === 'LIVE' ? 'rgba(45,198,83,0.1)' : 'rgba(255,255,255,0.04)', padding: '1px 4px', borderRadius: '2px' }}>
                    <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: statusColor }} />
                    {status}
                  </span>
                </div>
                <div style={{ fontFamily: 'var(--text-mono)', fontSize: '8px', color: 'var(--text-dim)', marginTop: '2px' }}>
                  {v.ulbName || v.ulbId}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontFamily: 'var(--text-mono)', fontSize: '8px', color: 'var(--text-secondary)', marginTop: '3px' }}>
                  <span>
                    {v.speed != null ? `${v.speed.toFixed(1)} km/h` : '0.0 km/h'}
                    {v.heading != null ? ` · ${v.heading.toFixed(0)}°` : ''}
                  </span>
                  <span style={{ color: 'var(--text-dim)', fontSize: '7.5px' }}>
                    {formatRelativeAge(v.lastPositionAt || v.lastSeen)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        {selectedVehicle && (
          <VehicleDrawer
            vehicle={selectedVehicle}
            ulbColor={selectedColor}
            ulbId={fixedUlbId}
            isFollowing={isFollowing}
            onToggleFollow={() => setIsFollowing((f) => !f)}
            onOpenRoutePlayback={(v) => setPlaybackVehicle(v)}
            onClose={() => {
              setSelectedVehicle(null);
              setIsFollowing(false);
            }}
            onOpenLiveDebug={onSelectLiveDebug}
          />
        )}
      </div>

      {/* ─── HISTORICAL ROUTE PLAYBACK MODAL ───────────────────────────────── */}
      {playbackVehicle && (
        <RoutePlaybackModal
          vehicle={playbackVehicle}
          sessionId={playbackVehicle.sessionId}
          ulbId={effectiveUlb}
          ulbs={ulbs}
          onClose={() => setPlaybackVehicle(null)}
        />
      )}
    </div>
  );
}
