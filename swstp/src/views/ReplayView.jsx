import { useState, useEffect, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, Polyline, CircleMarker, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useTelemetryStore } from '../telemetry/telemetryStore.js';
import { fetchSessions, fetchHistoricalTrajectory } from '../telemetry/backendApiClient.js';
import { useTheme, cartoTileUrl } from '../ThemeContext.jsx';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: null, iconUrl: null, shadowUrl: null,
});

/**
 * Speed-encoded color palette matching MapView.jsx
 */
function speedColor(speed) {
  if (speed == null || isNaN(speed) || speed < 30) return '#2dc653';   // low speed: green
  if (speed < 60) return '#4cc9f0';   // moderate: cyan
  if (speed < 90) return '#f48c06';   // high: amber
  return '#f72585';                   // maximum: magenta
}

/**
 * Creates custom SVG Vehicle Marker with Heading Rotation (Garbage Collection Vehicle)
 */
function createVehicleIcon(headingDeg = 0) {
  const rotation = headingDeg || 0;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36" style="transform: rotate(${rotation}deg); transform-origin: center;">
      <circle cx="18" cy="18" r="16" fill="#090d16" stroke="#00d9ff" stroke-width="2" opacity="0.9" />
      <path d="M18 6 L24 26 L18 21 L12 26 Z" fill="#00d9ff" stroke="#ffffff" stroke-width="1.5" />
    </svg>
  `;
  return L.divIcon({
    html: svg,
    className: 'vehicle-replay-icon',
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
}

/**
 * Fits Map bounds once when trajectory data loads
 */
function MapAutoFitter({ trajectory }) {
  const map = useMap();
  const fittedRef = useRef(false);

  useEffect(() => {
    fittedRef.current = false;
  }, [trajectory]);

  useEffect(() => {
    if (!fittedRef.current && trajectory && trajectory.length > 0 && map) {
      const validPts = trajectory.filter(p => p.lat != null && p.lon != null && !isNaN(p.lat) && !isNaN(p.lon));
      if (validPts.length > 0) {
        const bounds = L.latLngBounds(validPts.map(p => [p.lat, p.lon]));
        map.fitBounds(bounds, { padding: [40, 40] });
        fittedRef.current = true;
      }
    }
  }, [trajectory, map]);

  return null;
}

/**
 * Pan map smoothly to vehicle position when Follow Mode is active
 */
function ReplayMapFollower({ position, follow }) {
  const map = useMap();
  const lastPanRef = useRef(0);

  useEffect(() => {
    if (follow && position && position[0] != null && position[1] != null && map) {
      const now = Date.now();
      if (now - lastPanRef.current > 300) {
        map.panTo(position, { animate: true, duration: 0.3 });
        lastPanRef.current = now;
      }
    }
  }, [position, follow, map]);

  return null;
}

export default function ReplayView() {
  const { theme } = useTheme();
  const storeSelectedId = useTelemetryStore((state) => state.selectedReplaySessionId);
  const [sessions, setSessions] = useState([]);
  const [selectedSessionId, setSelectedSessionId] = useState(storeSelectedId);
  const [trajectory, setTrajectory] = useState([]);
  const [loading, setLoading] = useState(false);

  // Playback Control States
  const [isPlaying, setIsPlaying] = useState(false);
  const [speedMultiplier, setSpeedMultiplier] = useState(1.0); // 0.5x, 1x, 2x, 4x, 8x
  const [followVehicle, setFollowVehicle] = useState(true);
  const [currentRtcMs, setCurrentRtcMs] = useState(0);

  const animFrameRef = useRef(null);
  const lastRealTimeRef = useRef(null);

  useEffect(() => {
    fetchSessions().then((data) => {
      setSessions(data || []);
      if (!selectedSessionId && data && data.length > 0) {
        setSelectedSessionId(data[0].sessionId);
      }
    });
  }, []);

  useEffect(() => {
    if (storeSelectedId) {
      setSelectedSessionId(storeSelectedId);
    }
  }, [storeSelectedId]);

  // Load selected session's historical GNSS trajectory
  useEffect(() => {
    if (selectedSessionId) {
      setLoading(true);
      setIsPlaying(false);
      fetchHistoricalTrajectory(selectedSessionId)
        .then((pts) => {
          const valid = (pts || []).filter(p => p.lat != null && p.lon != null && !isNaN(p.lat) && !isNaN(p.lon));
          setTrajectory(valid);
          if (valid.length > 0) {
            const startEpoch = new Date(valid[0].timestamp).getTime();
            setCurrentRtcMs(startEpoch);
          }
          setLoading(false);
        })
        .catch(() => setLoading(false));
    }
  }, [selectedSessionId]);

  // Trajectory Time Bounds
  const timeBounds = useMemo(() => {
    if (!trajectory || trajectory.length === 0) return { startMs: 0, endMs: 0, totalDurationMs: 0 };
    const startMs = new Date(trajectory[0].timestamp).getTime();
    const endMs = new Date(trajectory[trajectory.length - 1].timestamp).getTime();
    return {
      startMs,
      endMs,
      totalDurationMs: Math.max(1, endMs - startMs),
    };
  }, [trajectory]);

  // Interpolated FlightRadar24-style Vehicle State at currentRtcMs
  const currentVehicleState = useMemo(() => {
    if (!trajectory || trajectory.length === 0) {
      return { pointIndex: 0, lat: null, lon: null, alt: null, speed: 0, heading: 0, timeStr: '—' };
    }

    if (currentRtcMs <= timeBounds.startMs) {
      const p0 = trajectory[0];
      return {
        pointIndex: 1,
        lat: p0.lat,
        lon: p0.lon,
        alt: p0.alt,
        speed: p0.speed ?? 0,
        heading: p0.heading ?? 0,
        timeStr: new Date(p0.timestamp).toLocaleTimeString(),
      };
    }

    if (currentRtcMs >= timeBounds.endMs) {
      const pLast = trajectory[trajectory.length - 1];
      return {
        pointIndex: trajectory.length,
        lat: pLast.lat,
        lon: pLast.lon,
        alt: pLast.alt,
        speed: pLast.speed ?? 0,
        heading: pLast.heading ?? 0,
        timeStr: new Date(pLast.timestamp).toLocaleTimeString(),
      };
    }

    // Find bounding trajectory segment [idx, idx + 1]
    let idx = 0;
    for (let i = 0; i < trajectory.length - 1; i++) {
      const t = new Date(trajectory[i].timestamp).getTime();
      const tNext = new Date(trajectory[i + 1].timestamp).getTime();
      if (currentRtcMs >= t && currentRtcMs <= tNext) {
        idx = i;
        break;
      }
    }

    const pA = trajectory[idx];
    const pB = trajectory[idx + 1] || pA;

    const tA = new Date(pA.timestamp).getTime();
    const tB = new Date(pB.timestamp).getTime();
    const duration = Math.max(1, tB - tA);
    const alpha = Math.min(1, Math.max(0, (currentRtcMs - tA) / duration));

    const lat = pA.lat + (pB.lat - pA.lat) * alpha;
    const lon = pA.lon + (pB.lon - pA.lon) * alpha;
    const alt = pA.alt != null && pB.alt != null ? pA.alt + (pB.alt - pA.alt) * alpha : (pA.alt ?? pB.alt);
    const speed = (pA.speed ?? 0) + ((pB.speed ?? 0) - (pA.speed ?? 0)) * alpha;
    const heading = pA.heading ?? pB.heading ?? 0;

    return {
      pointIndex: idx + 1,
      lat,
      lon,
      alt,
      speed,
      heading,
      timeStr: new Date(currentRtcMs).toLocaleTimeString(),
    };
  }, [trajectory, currentRtcMs, timeBounds]);

  // Speed-encoded Completed Segments vs Remaining Polyline (Matching MapView.jsx style)
  const { completedSegments, remainingRoute } = useMemo(() => {
    if (!trajectory || trajectory.length === 0 || currentVehicleState.lat == null) {
      return { completedSegments: [], remainingRoute: [] };
    }

    const idx = Math.max(0, currentVehicleState.pointIndex - 1);

    // Speed-encoded completed path segments up to active index
    const completedSegs = [];
    for (let i = 0; i < idx; i++) {
      const pA = trajectory[i];
      const pB = trajectory[i + 1];
      if (pA && pB) {
        completedSegs.push({
          positions: [[pA.lat, pA.lon], [pB.lat, pB.lon]],
          color: speedColor(pA.speed),
        });
      }
    }

    // Connect last completed point to interpolated current position
    if (idx < trajectory.length && trajectory[idx]) {
      completedSegs.push({
        positions: [[trajectory[idx].lat, trajectory[idx].lon], [currentVehicleState.lat, currentVehicleState.lon]],
        color: speedColor(currentVehicleState.speed),
      });
    }

    // Remaining upcoming route
    const remaining = [[currentVehicleState.lat, currentVehicleState.lon]];
    trajectory.slice(idx + 1).forEach(p => remaining.push([p.lat, p.lon]));

    return { completedSegments: completedSegs, remainingRoute: remaining };
  }, [trajectory, currentVehicleState]);

  // FlightRadar24 Chronological Animation Loop
  useEffect(() => {
    if (isPlaying && trajectory.length > 0) {
      lastRealTimeRef.current = performance.now();

      const tick = (now) => {
        const dtRealMs = now - lastRealTimeRef.current;
        lastRealTimeRef.current = now;

        const dtRtcMs = dtRealMs * speedMultiplier;

        setCurrentRtcMs((prevRtcMs) => {
          const nextRtcMs = prevRtcMs + dtRtcMs;
          if (nextRtcMs >= timeBounds.endMs) {
            setIsPlaying(false);
            return timeBounds.endMs;
          }
          return nextRtcMs;
        });

        animFrameRef.current = requestAnimationFrame(tick);
      };

      animFrameRef.current = requestAnimationFrame(tick);
    } else {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    }

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isPlaying, trajectory, speedMultiplier, timeBounds]);

  const defaultCenter = [20.937400, 77.779600];
  const vehiclePos = currentVehicleState.lat != null ? [currentVehicleState.lat, currentVehicleState.lon] : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div className="view-header">
        <span className="view-header__title">FlightRadar24-Style Historical Vehicle Replay</span>
        <span className="view-header__sep" />
        <span className="view-header__meta">Solid_Waste @ 192.168.1.8</span>
        <span className="view-header__spacer" />
        <span className="rate-badge">RTC REPLAY</span>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left Panel: Session Selector */}
        <div style={{ width: '260px', borderRight: '1px solid var(--border)', background: 'var(--bg-panel)', display: 'flex', flexDirection: 'column' }}>
          <div className="section-header">HISTORICAL SESSIONS</div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
            {sessions.length === 0 ? (
              <div style={{ padding: '16px', fontFamily: 'var(--text-mono)', fontSize: '10px', color: 'var(--text-dim)', textAlign: 'center' }}>
                No sessions in database.
              </div>
            ) : (
              sessions.map((s) => (
                <div
                  key={s.sessionId}
                  onClick={() => setSelectedSessionId(s.sessionId)}
                  style={{
                    padding: '8px 12px',
                    marginBottom: '6px',
                    border: '1px solid var(--border)',
                    borderRadius: '2px',
                    cursor: 'pointer',
                    background: selectedSessionId === s.sessionId ? 'var(--bg-elevated)' : 'transparent',
                    borderLeft: selectedSessionId === s.sessionId ? '3px solid #00d9ff' : (s.mode === 'REAL_HARDWARE' ? '3px solid #2dc653' : '3px solid #00b4d8'),
                    fontFamily: 'var(--text-mono)',
                    fontSize: '10px',
                  }}
                >
                  <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>Session #{s.sessionId}</div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '9px', marginTop: '2px' }}>{s.sessionCode}</div>
                  <div style={{ color: s.mode === 'REAL_HARDWARE' ? '#2dc653' : '#00b4d8', fontSize: '8.5px', marginTop: '2px' }}>
                    {s.mode} · {new Date(s.startedAt).toLocaleTimeString()}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Main Body: Map & FlightRadar24 Playback Controls */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-base)' }}>
          {/* Top Live Replay Metrics Strip */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, 1fr)',
            background: 'var(--bg-panel)',
            borderBottom: '1px solid var(--border)',
            padding: '8px 12px',
            fontFamily: 'var(--text-mono)',
            flexShrink: 0,
          }}>
            <div>
              <div style={{ fontSize: '8.5px', color: 'var(--text-dim)', letterSpacing: '0.08em' }}>PLAYBACK POINT</div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#00d9ff' }}>
                {currentVehicleState.pointIndex} / {trajectory.length}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '8.5px', color: 'var(--text-dim)', letterSpacing: '0.08em' }}>RTC TIMETAG</div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                {currentVehicleState.timeStr}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '8.5px', color: 'var(--text-dim)', letterSpacing: '0.08em' }}>LATITUDE</div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#2dc653' }}>
                {currentVehicleState.lat != null ? currentVehicleState.lat.toFixed(6) : '—'}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '8.5px', color: 'var(--text-dim)', letterSpacing: '0.08em' }}>LONGITUDE</div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#2dc653' }}>
                {currentVehicleState.lon != null ? currentVehicleState.lon.toFixed(6) : '—'}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '8.5px', color: 'var(--text-dim)', letterSpacing: '0.08em' }}>ALTITUDE</div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#9d4edd' }}>
                {currentVehicleState.alt != null ? `${currentVehicleState.alt.toFixed(1)} m` : '—'}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '8.5px', color: 'var(--text-dim)', letterSpacing: '0.08em' }}>SPEED</div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#f48c06' }}>
                {currentVehicleState.speed.toFixed(1)} km/h
              </div>
            </div>
            <div>
              <div style={{ fontSize: '8.5px', color: 'var(--text-dim)', letterSpacing: '0.08em' }}>HEADING</div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                {currentVehicleState.heading.toFixed(0)}°
              </div>
            </div>
          </div>

          {/* Primary Map Playback Canvas (Matching MapView CARTO dark style) */}
          <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
            {loading ? (
              <div style={{ position: 'absolute', inset: 0, zIndex: 1000, background: 'rgba(7,9,13,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--text-mono)', color: '#00d9ff', fontSize: '12px' }}>
                Loading session GNSS trajectory...
              </div>
            ) : trajectory.length === 0 ? (
              <div style={{ position: 'absolute', inset: 0, zIndex: 1000, background: 'rgba(7,9,13,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--text-mono)', color: 'var(--text-dim)', fontSize: '11px' }}>
                No valid GNSS trajectory recorded for Session #{selectedSessionId}.
              </div>
            ) : null}

            <MapContainer center={defaultCenter} zoom={15} style={{ width: '100%', height: '100%' }} zoomControl={false}>
              {/* CARTO Basemap matching MapView.jsx — theme-aware (dark_all / light_all) */}
              <TileLayer
                url={cartoTileUrl(theme)}
                attribution='&copy; <a href="https://carto.com/">CARTO</a>'
                maxZoom={19}
              />

              <MapAutoFitter trajectory={trajectory} />
              <ReplayMapFollower position={vehiclePos} follow={followVehicle} />

              {/* Speed-encoded Completed Trajectory Segments */}
              {completedSegments.map((seg, idx) => (
                <Polyline
                  key={idx}
                  positions={seg.positions}
                  pathOptions={{ color: seg.color, weight: 4, opacity: 0.95 }}
                />
              ))}

              {/* Remaining Upcoming Route (Dashed Line) */}
              {remainingRoute.length > 1 && (
                <Polyline positions={remainingRoute} pathOptions={{ color: '#475569', weight: 2, opacity: 0.5, dashArray: '6, 8' }} />
              )}

              {/* Start Point Marker */}
              {trajectory.length > 0 && (
                <CircleMarker center={[trajectory[0].lat, trajectory[0].lon]} radius={7} pathOptions={{ color: '#2dc653', fillColor: '#2dc653', fillOpacity: 0.9 }}>
                  <Popup><span style={{ fontFamily: 'var(--text-mono)', fontSize: '10px' }}>START: {new Date(trajectory[0].timestamp).toLocaleTimeString()}</span></Popup>
                </CircleMarker>
              )}

              {/* End Point Marker */}
              {trajectory.length > 1 && (
                <CircleMarker center={[trajectory[trajectory.length - 1].lat, trajectory[trajectory.length - 1].lon]} radius={7} pathOptions={{ color: '#ef233c', fillColor: '#ef233c', fillOpacity: 0.9 }}>
                  <Popup><span style={{ fontFamily: 'var(--text-mono)', fontSize: '10px' }}>END: {new Date(trajectory[trajectory.length - 1].timestamp).toLocaleTimeString()}</span></Popup>
                </CircleMarker>
              )}

              {/* Moving Vehicle Marker */}
              {vehiclePos && (
                <Marker
                  position={vehiclePos}
                  icon={createVehicleIcon(currentVehicleState.heading)}
                />
              )}
            </MapContainer>

            {/* Speed Legend Overlay matching MapView.jsx */}
            <div style={{
              position: 'absolute',
              bottom: '16px',
              left: '12px',
              zIndex: 1000,
              background: 'rgba(7,9,13,0.85)',
              border: '1px solid var(--border)',
              padding: '8px 10px',
              fontFamily: 'var(--text-mono)',
              fontSize: '9px',
            }}>
              <div style={{ color: 'var(--text-label)', marginBottom: '6px', letterSpacing: '0.1em' }}>
                TRAJECTORY SPEED ENCODING
              </div>
              {[
                { color: '#2dc653', label: '< 30 km/h' },
                { color: '#4cc9f0', label: '30–60 km/h' },
                { color: '#f48c06', label: '60–90 km/h' },
                { color: '#f72585', label: '> 90 km/h' },
              ].map(({ color, label }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                  <span style={{ width: '16px', height: '2px', background: color, display: 'inline-block' }} />
                  <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
                </div>
              ))}
            </div>

            {/* Floating Map Controls */}
            <div style={{
              position: 'absolute',
              top: '12px',
              right: '12px',
              zIndex: 1000,
              display: 'flex',
              gap: '6px',
            }}>
              <button
                onClick={() => setFollowVehicle(!followVehicle)}
                style={{
                  background: 'var(--bg-panel)',
                  border: `1px solid ${followVehicle ? '#00d9ff' : 'var(--border)'}`,
                  color: followVehicle ? '#00d9ff' : 'var(--text-secondary)',
                  fontFamily: 'var(--text-mono)',
                  fontSize: '10px',
                  fontWeight: 700,
                  padding: '5px 10px',
                  borderRadius: '2px',
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
                }}
              >
                FOLLOW: {followVehicle ? 'ON' : 'OFF'}
              </button>
            </div>
          </div>

          {/* FlightRadar24 Style Interactive Playbar Controls */}
          <div style={{
            background: 'var(--bg-panel)',
            borderTop: '1px solid var(--border)',
            padding: '10px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            flexShrink: 0,
          }}>
            {/* Timeline Scrubber */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontFamily: 'var(--text-mono)', fontSize: '9px', color: 'var(--text-dim)', minWidth: '60px' }}>
                {timeBounds.startMs > 0 ? new Date(timeBounds.startMs).toLocaleTimeString() : '00:00:00'}
              </span>
              <input
                type="range"
                min={timeBounds.startMs}
                max={timeBounds.endMs}
                value={currentRtcMs || timeBounds.startMs}
                onChange={(e) => {
                  setIsPlaying(false);
                  setCurrentRtcMs(Number(e.target.value));
                }}
                disabled={trajectory.length === 0}
                style={{ flex: 1, accentColor: '#00d9ff', cursor: 'pointer' }}
              />
              <span style={{ fontFamily: 'var(--text-mono)', fontSize: '9px', color: 'var(--text-dim)', minWidth: '60px', textAlign: 'right' }}>
                {timeBounds.endMs > 0 ? new Date(timeBounds.endMs).toLocaleTimeString() : '00:00:00'}
              </span>
            </div>

            {/* Play/Pause, Reset & Speed Control Buttons */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  disabled={trajectory.length === 0}
                  style={{
                    background: isPlaying ? 'rgba(239, 35, 60, 0.2)' : 'rgba(45, 198, 83, 0.2)',
                    border: `1px solid ${isPlaying ? '#ef233c' : '#2dc653'}`,
                    color: isPlaying ? '#ef233c' : '#2dc653',
                    fontFamily: 'var(--text-mono)',
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '6px 16px',
                    borderRadius: '2px',
                    cursor: 'pointer',
                  }}
                >
                  {isPlaying ? '❚❚ PAUSE' : '▶ PLAY ROUTE'}
                </button>

                <button
                  onClick={() => {
                    setIsPlaying(false);
                    setCurrentRtcMs(timeBounds.startMs);
                  }}
                  disabled={trajectory.length === 0}
                  style={{
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-secondary)',
                    fontFamily: 'var(--text-mono)',
                    fontSize: '10px',
                    padding: '6px 12px',
                    borderRadius: '2px',
                    cursor: 'pointer',
                  }}
                >
                  ↺ RESET
                </button>
              </div>

              {/* Speed Multipliers */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ fontFamily: 'var(--text-mono)', fontSize: '9px', color: 'var(--text-dim)', marginRight: '4px' }}>SPEED:</span>
                {[0.5, 1.0, 2.0, 4.0, 8.0].map((spd) => (
                  <button
                    key={spd}
                    onClick={() => setSpeedMultiplier(spd)}
                    style={{
                      background: speedMultiplier === spd ? '#00d9ff' : 'var(--bg-elevated)',
                      border: `1px solid ${speedMultiplier === spd ? '#00d9ff' : 'var(--border)'}`,
                      color: speedMultiplier === spd ? '#000000' : 'var(--text-primary)',
                      fontFamily: 'var(--text-mono)',
                      fontSize: '9.5px',
                      fontWeight: 700,
                      padding: '4px 8px',
                      borderRadius: '2px',
                      cursor: 'pointer',
                    }}
                  >
                    {spd}×
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Supporting Telemetry Data Table (Collapsible Detail Log) */}
          <div style={{ height: '140px', overflowY: 'auto', borderTop: '1px solid var(--border)', background: 'var(--bg-panel)', flexShrink: 0 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--text-mono)', fontSize: '9.5px', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: 'var(--bg-elevated)', color: 'var(--text-dim)', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '4px 8px' }}>#</th>
                  <th style={{ padding: '4px 8px' }}>RTC TIMETAG</th>
                  <th style={{ padding: '4px 8px' }}>LATITUDE</th>
                  <th style={{ padding: '4px 8px' }}>LONGITUDE</th>
                  <th style={{ padding: '4px 8px' }}>ALT (m)</th>
                  <th style={{ padding: '4px 8px' }}>SPEED (km/h)</th>
                  <th style={{ padding: '4px 8px' }}>HEADING (°)</th>
                </tr>
              </thead>
              <tbody>
                {trajectory.map((pt, idx) => {
                  const isCurrent = idx + 1 === currentVehicleState.pointIndex;
                  return (
                    <tr
                      key={idx}
                      onClick={() => {
                        setIsPlaying(false);
                        setCurrentRtcMs(new Date(pt.timestamp).getTime());
                      }}
                      style={{
                        borderBottom: '1px solid var(--border)',
                        cursor: 'pointer',
                        background: isCurrent ? 'rgba(0, 217, 255, 0.15)' : 'transparent',
                      }}
                    >
                      <td style={{ padding: '3px 8px', color: isCurrent ? '#00d9ff' : 'var(--text-dim)', fontWeight: isCurrent ? 700 : 400 }}>{idx + 1}</td>
                      <td style={{ padding: '3px 8px', color: 'var(--text-primary)' }}>{new Date(pt.timestamp).toLocaleTimeString()}</td>
                      <td style={{ padding: '3px 8px', color: '#00b4d8', fontWeight: 600 }}>{pt.lat?.toFixed(6)}</td>
                      <td style={{ padding: '3px 8px', color: '#00b4d8', fontWeight: 600 }}>{pt.lon?.toFixed(6)}</td>
                      <td style={{ padding: '3px 8px', color: '#9d4edd' }}>{pt.alt?.toFixed(1) ?? '—'}</td>
                      <td style={{ padding: '3px 8px', color: '#2dc653', fontWeight: 600 }}>{pt.speed?.toFixed(1) ?? '—'}</td>
                      <td style={{ padding: '3px 8px', color: 'var(--text-primary)' }}>{pt.heading?.toFixed(1) ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
