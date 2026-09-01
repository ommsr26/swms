/**
 * RoutePlaybackModal.jsx — Historical Route Playback for Municipal Fleet.
 *
 * Requirements & Architecture:
 * 1. Timestamp-driven progression: Real sample time differences (e.g. 2s, 3s) scale with playback speed (1x, 2x, 5x, 10x, 20x).
 * 2. Large gap handling (GAP_THRESHOLD_MS = 60s): Holds at last known position and snaps to next point on arrival; no false cross-city lerp.
 * 3. Shortest circular path heading interpolation (e.g. 350° -> 10° rotates smoothly across 0°).
 * 4. High-performance direct Leaflet DOM transforms on requestAnimationFrame; React HUD & scrubber throttled to 10Hz.
 * 5. Step controls (PREV / NEXT) and seek scrubber remain frame-accurate.
 */
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { MapContainer, TileLayer, Polyline, CircleMarker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useTheme, cartoTileUrl } from '../../ThemeContext.jsx';
import { fetchHistoricalTrajectory, fetchVehicleRoute, fetchVehicleSessions } from '../../telemetry/backendApiClient.js';
import { createFleetIcon, ulbColor, DEFAULT_CENTER } from './VehicleMarker.jsx';

const GAP_THRESHOLD_MS = 60 * 1000; // 60 seconds

// Shortest circular angle lerp
function lerpHeading(a, b, alpha) {
  if (a == null) return b ?? 0;
  if (b == null) return a ?? 0;
  const diff = (((b - a) + 540) % 360) - 180;
  return (a + alpha * diff + 360) % 360;
}

// Linear interpolation for scalars
function lerp(a, b, alpha) {
  return a + alpha * (b - a);
}

// Fit map view to trajectory bounds once
function MapTrajectoryFitter({ points }) {
  const map = useMap();
  const fitted = useRef(false);

  useEffect(() => {
    if (!fitted.current && points && points.length > 0 && map) {
      const valid = points.filter((p) => p && p.lat != null && p.lon != null);
      if (valid.length === 1) {
        map.setView([valid[0].lat, valid[0].lon], 15);
        fitted.current = true;
      } else if (valid.length > 1) {
        const bounds = L.latLngBounds(valid.map((p) => [p.lat, p.lon]));
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
        fitted.current = true;
      }
    }
  }, [points, map]);

  return null;
}

// Direct Imperative Leaflet Marker for 60fps movement without React re-renders
function ImperativePlaybackMarker({ markerRef, color, initialPos, initialHeading }) {
  const map = useMap();

  useEffect(() => {
    if (!map || !initialPos) return;

    const icon = createFleetIcon(initialHeading || 0, color, true, true);
    const marker = L.marker(initialPos, { icon, zIndexOffset: 1000 }).addTo(map);
    markerRef.current = marker;

    return () => {
      if (marker) {
        map.removeLayer(marker);
      }
      markerRef.current = null;
    };
  }, [map, color]);

  return null;
}

export default function RoutePlaybackModal({
  vehicle,
  sessionId = null,
  ulbId = 'ULB_MH_AMRAVATI',
  ulbs = [],
  onClose,
}) {
  const { theme } = useTheme();
  const [trajectory, setTrajectory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState(2); // 1x, 2x, 5x, 10x, 20x
  const [sessions, setSessions] = useState([]);
  const [selectedSessionId, setSelectedSessionId] = useState(sessionId);

  // HUD & Scrubber state (throttled to avoid 60fps React re-renders)
  const [hudState, setHudState] = useState({
    currentTimeMs: 0,
    currentIndex: 0,
    speed: 0,
    heading: 0,
    isInsideSafeZone: false,
    isSnapped: false,
    isGap: false,
  });

  const markerRef = useRef(null);
  const playbackClockRef = useRef(0); // Current playback virtual timestamp (ms)
  const isPlayingRef = useRef(false);
  const playSpeedRef = useRef(2);
  const lastWallTimeRef = useRef(0);
  const animFrameHandleRef = useRef(null);
  const lastHudUpdateRef = useRef(0);

  const vehicleId = vehicle?.deviceId || vehicle?.vehicleId;
  const vehicleColor = ulbColor(ulbId, ulbs);

  // Load available sessions for this vehicle
  useEffect(() => {
    if (vehicleId) {
      fetchVehicleSessions(vehicleId).then((sess) => {
        setSessions(sess || []);
        if (!selectedSessionId && sess && sess.length > 0) {
          setSelectedSessionId(sess[0].sessionId);
        }
      });
    }
  }, [vehicleId]);

  // Load trajectory points
  useEffect(() => {
    setLoading(true);
    setIsPlaying(false);
    isPlayingRef.current = false;

    const onData = (pts) => {
      const parsed = (pts || [])
        .filter((p) => p && (p.displayLat != null || p.lat != null) && (p.displayLon != null || p.lon != null))
        .map((p) => ({
          ...p,
          lat: p.displayLat ?? p.lat,
          lon: p.displayLon ?? p.lon,
          timeMs: new Date(p.timestamp).getTime(),
          heading: p.heading ?? 0,
          speed: p.speed ?? 0,
        }))
        .sort((a, b) => a.timeMs - b.timeMs);

      setTrajectory(parsed);
      setLoading(false);

      if (parsed.length > 0) {
        playbackClockRef.current = parsed[0].timeMs;
        setHudState({
          currentTimeMs: parsed[0].timeMs,
          currentIndex: 0,
          speed: parsed[0].speed,
          heading: parsed[0].heading,
          isInsideSafeZone: parsed[0].isInsideSafeZone,
          isSnapped: parsed[0].isSnapped,
          isGap: false,
        });
      }
    };

    if (selectedSessionId) {
      fetchHistoricalTrajectory(selectedSessionId).then(onData);
    } else if (vehicleId) {
      fetchVehicleRoute(vehicleId).then(onData);
    } else {
      setLoading(false);
    }
  }, [selectedSessionId, vehicleId]);

  // Keep refs in sync with state
  useEffect(() => {
    isPlayingRef.current = isPlaying;
    playSpeedRef.current = playSpeed;
  }, [isPlaying, playSpeed]);

  const startTimeMs = trajectory.length > 0 ? trajectory[0].timeMs : 0;
  const endTimeMs = trajectory.length > 0 ? trajectory[trajectory.length - 1].timeMs : 0;
  const totalDurationMs = Math.max(0, endTimeMs - startTimeMs);

  // Compute interpolated point at timestamp t
  const getInterpolatedState = useCallback((targetTimeMs) => {
    if (!trajectory || trajectory.length === 0) return null;
    if (trajectory.length === 1 || targetTimeMs <= trajectory[0].timeMs) {
      return {
        lat: trajectory[0].lat,
        lon: trajectory[0].lon,
        heading: trajectory[0].heading,
        speed: trajectory[0].speed,
        isInsideSafeZone: trajectory[0].isInsideSafeZone,
        isSnapped: trajectory[0].isSnapped,
        index: 0,
        isGap: false,
      };
    }
    const last = trajectory[trajectory.length - 1];
    if (targetTimeMs >= last.timeMs) {
      return {
        lat: last.lat,
        lon: last.lon,
        heading: last.heading,
        speed: last.speed,
        isInsideSafeZone: last.isInsideSafeZone,
        isSnapped: last.isSnapped,
        index: trajectory.length - 1,
        isGap: false,
      };
    }

    // Binary search to find segment i where trajectory[i].timeMs <= targetTimeMs < trajectory[i+1].timeMs
    let low = 0;
    let high = trajectory.length - 2;
    let segIdx = 0;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (trajectory[mid].timeMs <= targetTimeMs) {
        segIdx = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    const p0 = trajectory[segIdx];
    const p1 = trajectory[segIdx + 1];
    const segSpan = p1.timeMs - p0.timeMs;

    // Handle large gap (> 60 seconds): snap on arrival rather than lerping across missing gap
    if (segSpan > GAP_THRESHOLD_MS) {
      return {
        lat: p0.lat,
        lon: p0.lon,
        heading: p0.heading,
        speed: 0,
        isInsideSafeZone: p0.isInsideSafeZone,
        isSnapped: p0.isSnapped,
        index: segIdx,
        isGap: true,
      };
    }

    // Normal smooth interpolation
    const alpha = segSpan > 0 ? (targetTimeMs - p0.timeMs) / segSpan : 0;
    const clampedAlpha = Math.max(0, Math.min(1, alpha));

    return {
      lat: lerp(p0.lat, p1.lat, clampedAlpha),
      lon: lerp(p0.lon, p1.lon, clampedAlpha),
      heading: lerpHeading(p0.heading, p1.heading, clampedAlpha),
      speed: lerp(p0.speed, p1.speed, clampedAlpha),
      isInsideSafeZone: clampedAlpha < 0.5 ? p0.isInsideSafeZone : p1.isInsideSafeZone,
      isSnapped: clampedAlpha < 0.5 ? p0.isSnapped : p1.isSnapped,
      index: segIdx,
      isGap: false,
    };
  }, [trajectory]);

  // Update marker position and rotation imperatively
  const applyMarkerTransform = useCallback((state) => {
    if (!markerRef.current || !state) return;
    markerRef.current.setLatLng([state.lat, state.lon]);
    const el = markerRef.current.getElement();
    if (el) {
      const truckSvg = el.querySelector('.swstp-vehicle-truck');
      if (truckSvg) {
        truckSvg.style.transform = `rotate(${Math.round(state.heading)}deg)`;
      }
    }
  }, []);

  // Main 60 FPS requestAnimationFrame Playback Engine
  useEffect(() => {
    if (!isPlaying) {
      if (animFrameHandleRef.current) {
        cancelAnimationFrame(animFrameHandleRef.current);
        animFrameHandleRef.current = null;
      }
      return;
    }

    lastWallTimeRef.current = performance.now();

    const frameLoop = (now) => {
      if (!isPlayingRef.current) return;

      const deltaWallMs = now - lastWallTimeRef.current;
      lastWallTimeRef.current = now;

      // Virtual playback advancement
      const deltaVirtualMs = deltaWallMs * playSpeedRef.current;
      const nextVirtualTime = playbackClockRef.current + deltaVirtualMs;

      if (nextVirtualTime >= endTimeMs) {
        playbackClockRef.current = endTimeMs;
        setIsPlaying(false);
        isPlayingRef.current = false;
        const finalState = getInterpolatedState(endTimeMs);
        applyMarkerTransform(finalState);
        if (finalState) {
          setHudState({
            currentTimeMs: endTimeMs,
            currentIndex: trajectory.length - 1,
            speed: finalState.speed,
            heading: finalState.heading,
            isInsideSafeZone: finalState.isInsideSafeZone,
            isSnapped: finalState.isSnapped,
            isGap: false,
          });
        }
        return;
      }

      playbackClockRef.current = nextVirtualTime;
      const state = getInterpolatedState(nextVirtualTime);
      applyMarkerTransform(state);

      // Throttled HUD & Scrubber update (every 100ms) to preserve 60fps smoothness
      if (now - lastHudUpdateRef.current > 100 && state) {
        lastHudUpdateRef.current = now;
        setHudState({
          currentTimeMs: nextVirtualTime,
          currentIndex: state.index,
          speed: state.speed,
          heading: state.heading,
          isInsideSafeZone: state.isInsideSafeZone,
          isSnapped: state.isSnapped,
          isGap: state.isGap,
        });
      }

      animFrameHandleRef.current = requestAnimationFrame(frameLoop);
    };

    animFrameHandleRef.current = requestAnimationFrame(frameLoop);

    return () => {
      if (animFrameHandleRef.current) {
        cancelAnimationFrame(animFrameHandleRef.current);
        animFrameHandleRef.current = null;
      }
    };
  }, [isPlaying, endTimeMs, getInterpolatedState, applyMarkerTransform, trajectory.length]);

  // Direct Seek / Scrub Handler
  const seekToTimestamp = (targetTimeMs) => {
    const clamped = Math.max(startTimeMs, Math.min(endTimeMs, targetTimeMs));
    playbackClockRef.current = clamped;
    const state = getInterpolatedState(clamped);
    applyMarkerTransform(state);
    if (state) {
      setHudState({
        currentTimeMs: clamped,
        currentIndex: state.index,
        speed: state.speed,
        heading: state.heading,
        isInsideSafeZone: state.isInsideSafeZone,
        isSnapped: state.isSnapped,
        isGap: state.isGap,
      });
    }
  };

  const seekToIndex = (idx) => {
    if (!trajectory || trajectory.length === 0) return;
    const clamped = Math.max(0, Math.min(trajectory.length - 1, idx));
    seekToTimestamp(trajectory[clamped].timeMs);
  };

  const polylineCoords = useMemo(() => {
    return trajectory.map((p) => [p.lat, p.lon]);
  }, [trajectory]);

  const startPoint = trajectory[0];
  const endPoint = trajectory[trajectory.length - 1];
  const initialPos = startPoint ? [startPoint.lat, startPoint.lon] : DEFAULT_CENTER;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2000,
        background: 'rgba(5, 7, 10, 0.88)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
    >
      <div
        style={{
          width: '95vw',
          maxWidth: '1200px',
          height: '85vh',
          background: 'var(--bg-panel)',
          border: '1px solid var(--border)',
          borderRadius: '4px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 12px 40px rgba(0, 0, 0, 0.7)',
        }}
      >
        {/* ─── HEADER ──────────────────────────────────────────────────────────── */}
        <div
          style={{
            padding: '10px 16px',
            background: 'var(--bg-panel-2)',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span
              style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                background: vehicleColor,
                boxShadow: `0 0 8px ${vehicleColor}`,
              }}
            />
            <span style={{ fontFamily: 'var(--text-mono)', fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
              {vehicle?.vehicleRegistration || 'VEHICLE ROUTE PLAYBACK'}
            </span>
            <span
              style={{
                fontFamily: 'var(--text-mono)',
                fontSize: '9px',
                color: '#00d9ff',
                background: 'rgba(0, 217, 255, 0.08)',
                padding: '2px 6px',
                borderRadius: '2px',
                border: '1px solid rgba(0, 217, 255, 0.2)',
              }}
            >
              TIMESTAMP-ACCURATE PLAYBACK
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {sessions.length > 0 && (
              <select
                value={selectedSessionId || ''}
                onChange={(e) => setSelectedSessionId(Number(e.target.value))}
                style={{
                  background: 'var(--bg-panel)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--text-mono)',
                  fontSize: '10px',
                  padding: '4px 8px',
                  borderRadius: '2px',
                  outline: 'none',
                }}
              >
                {sessions.map((s) => (
                  <option key={s.sessionId} value={s.sessionId}>
                    Session #{s.sessionId} ({new Date(s.startedAt).toLocaleTimeString()}) - {s.status}
                  </option>
                ))}
              </select>
            )}

            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-dim)',
                cursor: 'pointer',
                fontFamily: 'var(--text-mono)',
                fontSize: '16px',
                padding: '0 4px',
              }}
              title="Close modal"
            >
              ✕
            </button>
          </div>
        </div>

        {/* ─── MAP CANVAS & TELEMETRY HUD ──────────────────────────────────────── */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          {loading ? (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(7,9,13,0.9)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: 'var(--text-mono)',
                color: '#00d9ff',
                fontSize: '12px',
              }}
            >
              Loading historical route points…
            </div>
          ) : trajectory.length === 0 ? (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(7,9,13,0.9)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: 'var(--text-mono)',
                color: 'var(--text-dim)',
                fontSize: '12px',
              }}
            >
              No recorded GNSS trajectory points found for this mission.
            </div>
          ) : null}

          <MapContainer center={DEFAULT_CENTER} zoom={13} style={{ width: '100%', height: '100%' }} zoomControl={false}>
            <TileLayer url={cartoTileUrl(theme)} attribution='&copy; <a href="https://carto.com/">CARTO</a>' maxZoom={19} />
            <MapTrajectoryFitter points={trajectory} />

            {/* Historical route line */}
            {polylineCoords.length > 1 && (
              <Polyline
                positions={polylineCoords}
                pathOptions={{
                  color: '#00d9ff',
                  weight: 3.5,
                  opacity: 0.75,
                  dashArray: '1, 6',
                }}
              />
            )}

            {/* Start Marker */}
            {startPoint && (
              <CircleMarker
                center={[startPoint.lat, startPoint.lon]}
                radius={6}
                pathOptions={{ color: 'var(--status-ok)', fillColor: 'var(--status-ok)', fillOpacity: 0.9 }}
              >
                <Popup>
                  <div style={{ fontFamily: 'var(--text-mono)', fontSize: '10px' }}>
                    <strong style={{ color: 'var(--status-ok)' }}>🚩 MISSION START</strong>
                    <br />
                    Time: {new Date(startPoint.timestamp).toLocaleString()}
                  </div>
                </Popup>
              </CircleMarker>
            )}

            {/* End Marker */}
            {endPoint && (
              <CircleMarker
                center={[endPoint.lat, endPoint.lon]}
                radius={6}
                pathOptions={{ color: '#f72585', fillColor: '#f72585', fillOpacity: 0.9 }}
              >
                <Popup>
                  <div style={{ fontFamily: 'var(--text-mono)', fontSize: '10px' }}>
                    <strong style={{ color: '#f72585' }}>🏁 MISSION END</strong>
                    <br />
                    Time: {new Date(endPoint.timestamp).toLocaleString()}
                  </div>
                </Popup>
              </CircleMarker>
            )}

            {/* Imperative 60fps Playback Vehicle Marker */}
            {startPoint && (
              <ImperativePlaybackMarker
                markerRef={markerRef}
                color={vehicleColor}
                initialPos={initialPos}
                initialHeading={startPoint.heading ?? 0}
              />
            )}
          </MapContainer>

          {/* ─── FLOATING TELEMETRY HUD ───────────────────────────────────────── */}
          {trajectory.length > 0 && (
            <div
              style={{
                position: 'absolute',
                top: '12px',
                right: '12px',
                background: 'rgba(10, 14, 22, 0.92)',
                border: '1px solid var(--border)',
                borderRadius: '3px',
                padding: '10px 14px',
                zIndex: 1000,
                fontFamily: 'var(--text-mono)',
                minWidth: '230px',
                boxShadow: '0 6px 18px rgba(0,0,0,0.5)',
              }}
            >
              <div style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-dim)', letterSpacing: '0.1em', marginBottom: '6px' }}>
                PLAYBACK TELEMETRY
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', marginBottom: '3px' }}>
                <span style={{ color: 'var(--text-dim)' }}>Playback Time</span>
                <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                  {new Date(hudState.currentTimeMs || startTimeMs).toLocaleTimeString()}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', marginBottom: '3px' }}>
                <span style={{ color: 'var(--text-dim)' }}>Speed</span>
                <span style={{ color: 'var(--status-ok)', fontWeight: 700 }}>
                  {hudState.speed != null ? `${hudState.speed.toFixed(1)} km/h` : '0.0 km/h'}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', marginBottom: '3px' }}>
                <span style={{ color: 'var(--text-dim)' }}>Heading</span>
                <span style={{ color: '#00d9ff', fontWeight: 700 }}>
                  {hudState.heading != null ? `${hudState.heading.toFixed(0)}°` : '—'}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', marginBottom: '3px' }}>
                <span style={{ color: 'var(--text-dim)' }}>Constraint</span>
                <span style={{ color: hudState.isInsideSafeZone ? 'var(--status-ok)' : hudState.isSnapped ? '#00d9ff' : 'var(--text-secondary)' }}>
                  {hudState.isInsideSafeZone ? '🛡 Safe Zone' : hudState.isSnapped ? '🔗 Road Snapped' : '📍 Free GPS'}
                </span>
              </div>

              {hudState.isGap && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9.5px', color: 'var(--status-warn)', marginTop: '2px', padding: '2px 4px', background: 'rgba(244,140,6,0.1)' }}>
                  <span>⚠️ Gap Detected</span>
                  <span>Holding position</span>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', marginTop: '3px' }}>
                <span style={{ color: 'var(--text-dim)' }}>Sample</span>
                <span style={{ color: 'var(--text-secondary)' }}>
                  {hudState.currentIndex + 1} / {trajectory.length}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* ─── PLAYBACK CONTROLS & TIMELINE FOOTER ─────────────────────────────── */}
        <div
          style={{
            padding: '12px 16px',
            background: 'var(--bg-panel-2)',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            flexShrink: 0,
          }}
        >
          {/* Progress Timeline Scrubber */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontFamily: 'var(--text-mono)', fontSize: '9px', color: 'var(--text-dim)', width: '55px' }}>
              {startTimeMs ? new Date(startTimeMs).toLocaleTimeString() : '00:00:00'}
            </span>

            <input
              type="range"
              min={startTimeMs}
              max={Math.max(startTimeMs, endTimeMs)}
              value={hudState.currentTimeMs || startTimeMs}
              onChange={(e) => {
                const target = Number(e.target.value);
                seekToTimestamp(target);
              }}
              style={{
                flex: 1,
                cursor: 'pointer',
                accentColor: '#00d9ff',
              }}
            />

            <span style={{ fontFamily: 'var(--text-mono)', fontSize: '9px', color: 'var(--text-dim)', width: '55px', textAlign: 'right' }}>
              {endTimeMs ? new Date(endTimeMs).toLocaleTimeString() : '00:00:00'}
            </span>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                onClick={() => seekToIndex(0)}
                style={controlBtnStyle}
                title="Reset to start"
              >
                ⟲ RESET
              </button>

              <button
                onClick={() => seekToIndex(hudState.currentIndex - 1)}
                style={controlBtnStyle}
                title="Step back 1 sample"
              >
                ◀ PREV
              </button>

              <button
                onClick={() => setIsPlaying((p) => !p)}
                style={{
                  ...controlBtnStyle,
                  background: isPlaying ? 'rgba(244,140,6,0.15)' : 'rgba(0,217,255,0.15)',
                  border: `1px solid ${isPlaying ? 'var(--status-warn)' : '#00d9ff'}`,
                  color: isPlaying ? 'var(--status-warn)' : '#00d9ff',
                  padding: '5px 14px',
                  fontWeight: 800,
                }}
              >
                {isPlaying ? '⏸ PAUSE' : '▶ PLAY'}
              </button>

              <button
                onClick={() => seekToIndex(hudState.currentIndex + 1)}
                style={controlBtnStyle}
                title="Step forward 1 sample"
              >
                NEXT ▶
              </button>
            </div>

            {/* Multiplier speed buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ fontFamily: 'var(--text-mono)', fontSize: '8.5px', color: 'var(--text-dim)', marginRight: '4px' }}>
                SPEED:
              </span>
              {[1, 2, 5, 10, 20].map((s) => (
                <button
                  key={s}
                  onClick={() => setPlaySpeed(s)}
                  style={{
                    padding: '3px 7px',
                    fontFamily: 'var(--text-mono)',
                    fontSize: '8.5px',
                    fontWeight: playSpeed === s ? 700 : 400,
                    color: playSpeed === s ? '#00d9ff' : 'var(--text-dim)',
                    background: playSpeed === s ? 'rgba(0,217,255,0.12)' : 'none',
                    border: `1px solid ${playSpeed === s ? '#00d9ff' : 'var(--border)'}`,
                    cursor: 'pointer',
                    borderRadius: '2px',
                  }}
                >
                  {s}x
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const controlBtnStyle = {
  padding: '4px 10px',
  fontFamily: 'var(--text-mono)',
  fontSize: '9.5px',
  fontWeight: 700,
  letterSpacing: '0.05em',
  color: 'var(--text-primary)',
  background: 'var(--bg-panel)',
  border: '1px solid var(--border)',
  cursor: 'pointer',
  borderRadius: '2px',
  transition: 'all 0.12s',
};
