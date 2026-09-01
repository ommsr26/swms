/**
 * MapPresentation.jsx — Map / GNSS Trajectory & GIS Road Layer.
 *
 * Straight road linking start [20.95582900, 77.76443300] and end [20.95639600, 77.76328900].
 * 14 properties aligned with Google Maps street view.
 * 8-decimal GPS precision, Google Earth style historical timeline bar, dual-color house statuses.
 */
import { useEffect, useRef, useState, useMemo } from 'react';
import { MapContainer, TileLayer, Polyline, Polygon, Circle, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useTheme, cartoTileUrl } from '../ThemeContext.jsx';
import { AnimatedVehicleMarker } from './fleet/VehicleMarker.jsx';
import { fetchGisRoads, fetchGisHouses, fetchGisCollectionEvents, getEvidenceImageUrl } from '../telemetry/backendApiClient.js';

if (L.Icon.Default.prototype._getIconUrl) {
  delete L.Icon.Default.prototype._getIconUrl;
  L.Icon.Default.mergeOptions({ iconRetinaUrl: null, iconUrl: null, shadowUrl: null });
}

function speedColor(speed) {
  if (speed == null || isNaN(speed) || speed < 30) return '#2dc653';   // low speed: green
  if (speed < 60) return '#4cc9f0';   // moderate: cyan
  if (speed < 90) return '#f48c06';   // high: amber
  return '#f72585';                   // maximum: magenta
}

function buildSegments(track) {
  if (!track || track.length < 2) return [];
  const validPoints = track.filter(p => p && p.lat != null && p.lon != null && !isNaN(p.lat) && !isNaN(p.lon));
  if (validPoints.length < 2) return [];

  const segs = [];
  for (let i = 0; i < validPoints.length - 1; i++) {
    const a = validPoints[i];
    const b = validPoints[i + 1];
    segs.push({
      positions: [[a.lat, a.lon], [b.lat, b.lon]],
      color: speedColor(a.speed),
    });
  }
  return segs;
}

function MapFollower({ position, follow }) {
  const map = useMap();
  const prevPos = useRef(null);

  useEffect(() => {
    if (follow && position && position[0] != null && position[1] != null && !isNaN(position[0]) && !isNaN(position[1]) && map) {
      try {
        if (!prevPos.current) {
          map.setView(position, 17, { animate: false });
        } else {
          map.panTo(position, { animate: true, duration: 0.5 });
        }
        prevPos.current = position;
      } catch (err) {
        console.warn('[MapFollower] Set view error:', err);
      }
    }
  }, [position, follow, map]);

  return null;
}

export function GnssCell({ label, value, unit }) {
  return (
    <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)' }}>
      <div style={{ fontFamily: 'var(--text-mono)', fontSize: '9px', color: 'var(--text-label)',
                    textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '3px' }}>
        {label}
      </div>
      <div style={{ fontFamily: 'var(--text-mono)', fontSize: '11px', fontWeight: 500,
                    color: value === '—' || value === 'NO FIX' ? 'var(--status-warn)' : '#52b788',
                    display: 'flex', alignItems: 'baseline', gap: '3px', wordBreak: 'break-all' }}>
        {value ?? '—'}
        {unit && <span style={{ fontSize: '9px', color: 'var(--text-label)' }}>{unit}</span>}
      </div>
    </div>
  );
}

function formatHourDecimal(dec) {
  if (dec >= 24.0) return 'ALL DAY (LATEST)';
  const hourInt = Math.floor(dec);
  const minInt = Math.round((dec - hourInt) * 60);
  const period = hourInt >= 12 ? 'PM' : 'AM';
  const displayHour = hourInt % 12 === 0 ? 12 : hourInt % 12;
  return `${displayHour}:${minInt.toString().padStart(2, '0')} ${period}`;
}

export default function MapPresentation({
  latest = null,
  sensorStatus = {},
  track = [],
  isCloudPolled = false,
  collectionEvents: incomingCollectionEvents = [],
}) {
  const { theme } = useTheme();
  const [follow, setFollow] = useState(true);
  const [roads, setRoads] = useState([]);
  const [houses, setHouses] = useState([]);
  const [events, setEvents] = useState([]);
  const [selectedHouse, setSelectedHouse] = useState(null);
  const [cloudVehicle, setCloudVehicle] = useState(null);
  const gpsHistoryRef = useRef([]);
  const lastHeadingRef = useRef(null);

  // Date selection & Timeline scrubber
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [timelineHour, setTimelineHour] = useState(24.0);
  const [isPlaying, setIsPlaying] = useState(false);

  const yesterdayStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  }, []);

  const twoDaysAgoStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 2);
    return d.toISOString().split('T')[0];
  }, []);

  const isLiveDate = selectedDate === todayStr;

  // Fetch GIS Roads once
  useEffect(() => {
    fetchGisRoads('ULB_MH_AMRAVATI').then(data => setRoads(data || []));
  }, []);

  // Fetch GIS Houses & Collection Events for selectedDate
  useEffect(() => {
    const loadDateData = () => {
      fetchGisHouses('ULB_MH_AMRAVATI', null, selectedDate).then(data => setHouses(data || []));
      fetchGisCollectionEvents('ULB_MH_AMRAVATI', selectedDate).then(data => setEvents(data || []));
    };

    loadDateData();

    // In live mode, poll every 2.5s for real-time house updates
    let interval = null;
    if (isLiveDate) {
      interval = setInterval(loadDateData, 2500);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [selectedDate, isLiveDate]);

  // Poll cloud fleet position in Live mode
  useEffect(() => {
    if (!isLiveDate) return;

    const pollFleet = () => {
      const apiBase = import.meta.env.VITE_API_BASE_URL || (import.meta.env.PROD ? 'https://solidwasteapi.scipl.info.in/api' : 'http://localhost:5000/api');
      fetch(`${apiBase}/admin/fleet/live?ulbId=ULB_MH_AMRAVATI`)
        .then(r => r.ok ? r.json() : [])
        .then(list => {
          if (Array.isArray(list) && list.length > 0) {
            const active = list.find(v => v.isLive) || list[0];
            if (active && active.latitude && active.longitude) {
              setCloudVehicle({
                lat: Number(active.latitude),
                lon: Number(active.longitude),
                heading: active.heading,
                speed: active.speedKph || 0,
                valid: true,
                deviceCode: active.deviceCode,
                vehicleReg: active.vehicleRegistrationNumber,
              });
            }
          }
        })
        .catch(() => {});
    };

    pollFleet();
    const timer = setInterval(pollFleet, 2000);
    return () => clearInterval(timer);
  }, [isLiveDate]);

  // Timeline scrubber playback animation loop
  useEffect(() => {
    let animTimer = null;
    if (isPlaying) {
      animTimer = setInterval(() => {
        setTimelineHour((h) => {
          if (h >= 20.0) {
            setIsPlaying(false);
            return 24.0;
          }
          if (h >= 24.0) return 6.0;
          return parseFloat((h + 0.25).toFixed(2));
        });
      }, 350);
    }
    return () => {
      if (animTimer) clearInterval(animTimer);
    };
  }, [isPlaying]);

  // Scrubber-filtered houses and events
  const { visibleHouses, visibleEvents } = useMemo(() => {
    if (timelineHour >= 24.0) {
      return { visibleHouses: houses, visibleEvents: events };
    }

    const filteredEvents = events.filter(ev => {
      if (!ev.capturedAt) return true;
      const timePart = ev.capturedAt.split(' ')[1];
      if (!timePart) return true;
      const [hh, mm] = timePart.split(':').map(Number);
      const evDec = hh + (mm || 0) / 60;
      return evDec <= timelineHour;
    });

    const activeEventIds = new Set(filteredEvents.map(e => e.collectionEventId));

    const filteredHouses = houses.map(h => {
      if (h.status === 'NOT_COLLECTED') return h;
      if (h.latestEvidenceImage?.capturedAt) {
        const timePart = h.latestEvidenceImage.capturedAt.split(' ')[1];
        if (timePart) {
          const [hh, mm] = timePart.split(':').map(Number);
          const houseDec = hh + (mm || 0) / 60;
          if (houseDec > timelineHour) {
            return { ...h, status: 'NOT_COLLECTED' };
          }
        }
      }
      return h;
    });

    return { visibleHouses: filteredHouses, visibleEvents: filteredEvents };
  }, [houses, events, timelineHour]);

  const g = isLiveDate
    ? (latest?.gnss?.valid ? latest.gnss : (cloudVehicle?.valid ? cloudVehicle : latest?.gnss))
    : null;

  const isFixValid = Boolean(g?.valid && g?.lat != null && g?.lon != null && !isNaN(g.lat) && !isNaN(g.lon));

  // Dynamic road coordinates from DB
  const roadCoords = roads.length > 0 && roads[0].coordinates?.length > 0
    ? roads[0].coordinates
    : [
        [20.95582900, 77.76443300],
        [20.95639600, 77.76328900]
      ];

  // Track recent GPS fixes over a 2-4 second sliding window to estimate heading
  useEffect(() => {
    if (isFixValid && g.lat != null && g.lon != null) {
      const now = Date.now();
      const newHistory = [...gpsHistoryRef.current, { lat: g.lat, lon: g.lon, timestamp: now }]
        .filter(p => now - p.timestamp <= 4500)
        .slice(-8);
      gpsHistoryRef.current = newHistory;
    }
  }, [g?.lat, g?.lon, isFixValid]);

  // Direct Authoritative Position from backend
  let position = null;
  let isSnapped = false;
  let vehicleHeading = lastHeadingRef.current ?? 0;

  if (isFixValid) {
    const dispLat = g.displayLat ?? g.lat;
    const dispLon = g.displayLon ?? g.lon;
    position = [dispLat, dispLon];
    isSnapped = g.isSnapped ?? false;

    vehicleHeading = g?.heading ?? lastHeadingRef.current ?? 0;
    lastHeadingRef.current = vehicleHeading;
  }

  const validTrack = Array.isArray(track) ? track.filter(p => p && p.lat != null && p.lon != null && !isNaN(p.lat) && !isNaN(p.lon)) : [];
  const segments = buildSegments(validTrack);

  // 8-decimal precision coordinate formatter
  const fmtCoord = (v, d = 8) => (v != null && !isNaN(v) ? Number(v).toFixed(d) : '—');
  const fmtNum   = (v, d = 1) => (v != null && !isNaN(v) ? Number(v).toFixed(d) : '—');

  const defaultCenter = [20.95611200, 77.76386100];
  const initialCenter = position || defaultCenter;

  const getHouseColor = (status) => {
    if (status === 'COLLECTED') return '#2dc653';     // Solid Dark Green (Direct Primary Collected)
    if (status === 'INTERSECTED') return '#74c69d';   // Light Sage Green (In-Radius 15m)
    return '#ef233c';                                 // Red (Not Collected)
  };

  const collectedCount = visibleHouses.filter(h => h.status === 'COLLECTED').length;
  const intersectedCount = visibleHouses.filter(h => h.status === 'INTERSECTED').length;
  const uncollectedCount = visibleHouses.filter(h => h.status === 'NOT_COLLECTED').length;
  const totalCount = visibleHouses.length || 14;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* ─── TOP VIEW HEADER ─────────────────────────────────────────────────── */}
      <div className="view-header" style={{ gap: '10px', flexWrap: 'wrap' }}>
        <span className="view-header__title">GIS Road & Telemetry Workstation</span>
        <span className="view-header__sep" />
        
        {isLiveDate ? (
          <div className={`live-indicator live-indicator--${isFixValid ? 'ok' : 'warn'}`}>
            <span className={`status-dot status-dot--${isFixValid ? 'ok' : 'warn'}`} />
            {isFixValid ? (isSnapped ? 'GNSS ROAD-SNAPPED (10m)' : 'GNSS FIX LOCK') : (sensorStatus.gnss || 'NO FIX')}
          </div>
        ) : (
          <div style={{ fontFamily: 'var(--text-mono)', fontSize: '10px', color: '#00d9ff', background: 'rgba(0,217,255,0.1)', padding: '2px 8px', borderRadius: '2px', border: '1px solid rgba(0,217,255,0.3)' }}>
            HISTORICAL TIMELINE: {selectedDate}
          </div>
        )}

        <span className="view-header__spacer" />

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            className={`btn btn--sm${follow ? ' btn--active' : ''}`}
            onClick={() => setFollow(f => !f)}
          >
            {follow ? '⊙ Following Truck' : '◎ Free Pan'}
          </button>
        </div>
      </div>

      {/* ─── GOOGLE EARTH STYLE TIMELINE & DATE BAR ───────────────────────────── */}
      <div
        style={{
          padding: '8px 14px',
          background: 'var(--bg-panel-2, #0d121a)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '10px',
          flexShrink: 0,
        }}
      >
        {/* Left: Quick Date Switchers */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontFamily: 'var(--text-mono)', fontSize: '9px', fontWeight: 800, color: 'var(--text-dim)' }}>
            TIMELINE DATE:
          </span>
          <button
            onClick={() => { setSelectedDate(todayStr); setTimelineHour(24.0); setIsPlaying(false); }}
            style={{
              padding: '3px 8px',
              fontFamily: 'var(--text-mono)',
              fontSize: '9px',
              fontWeight: selectedDate === todayStr ? 800 : 500,
              color: selectedDate === todayStr ? '#000' : 'var(--text-primary)',
              background: selectedDate === todayStr ? '#00d9ff' : 'var(--bg-elevated, #161e2c)',
              border: selectedDate === todayStr ? '1px solid #00d9ff' : '1px solid var(--border)',
              borderRadius: '2px',
              cursor: 'pointer',
            }}
          >
            ● TODAY (LIVE)
          </button>
          <button
            onClick={() => { setSelectedDate(yesterdayStr); setTimelineHour(24.0); setIsPlaying(false); }}
            style={{
              padding: '3px 8px',
              fontFamily: 'var(--text-mono)',
              fontSize: '9px',
              fontWeight: selectedDate === yesterdayStr ? 800 : 500,
              color: selectedDate === yesterdayStr ? '#000' : 'var(--text-primary)',
              background: selectedDate === yesterdayStr ? '#00d9ff' : 'var(--bg-elevated, #161e2c)',
              border: selectedDate === yesterdayStr ? '1px solid #00d9ff' : '1px solid var(--border)',
              borderRadius: '2px',
              cursor: 'pointer',
            }}
          >
            YESTERDAY
          </button>
          <button
            onClick={() => { setSelectedDate(twoDaysAgoStr); setTimelineHour(24.0); setIsPlaying(false); }}
            style={{
              padding: '3px 8px',
              fontFamily: 'var(--text-mono)',
              fontSize: '9px',
              fontWeight: selectedDate === twoDaysAgoStr ? 800 : 500,
              color: selectedDate === twoDaysAgoStr ? '#000' : 'var(--text-primary)',
              background: selectedDate === twoDaysAgoStr ? '#00d9ff' : 'var(--bg-elevated, #161e2c)',
              border: selectedDate === twoDaysAgoStr ? '1px solid #00d9ff' : '1px solid var(--border)',
              borderRadius: '2px',
              cursor: 'pointer',
            }}
          >
            2 DAYS AGO
          </button>

          <input
            type="date"
            value={selectedDate}
            onChange={(e) => {
              if (e.target.value) {
                setSelectedDate(e.target.value);
                setTimelineHour(24.0);
                setIsPlaying(false);
              }
            }}
            style={{
              background: 'var(--bg-elevated, #161e2c)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
              fontFamily: 'var(--text-mono)',
              fontSize: '9px',
              padding: '3px 6px',
              borderRadius: '2px',
              outline: 'none',
              marginLeft: '2px',
            }}
          />
        </div>

        {/* Center: Time-of-Day Slider Scrubber */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={() => {
              if (isPlaying) {
                setIsPlaying(false);
              } else {
                if (timelineHour >= 24.0 || timelineHour >= 20.0) {
                  setTimelineHour(6.0);
                }
                setIsPlaying(true);
              }
            }}
            style={{
              padding: '3px 8px',
              fontFamily: 'var(--text-mono)',
              fontSize: '9px',
              fontWeight: 700,
              background: isPlaying ? '#ef233c' : 'rgba(0,217,255,0.15)',
              border: isPlaying ? '1px solid #ef233c' : '1px solid #00d9ff',
              color: isPlaying ? '#fff' : '#00d9ff',
              borderRadius: '2px',
              cursor: 'pointer',
            }}
          >
            {isPlaying ? '⏸ PAUSE' : '▶ PLAY'}
          </button>

          <input
            type="range"
            min="6.0"
            max="24.0"
            step="0.25"
            value={timelineHour}
            onChange={(e) => {
              setTimelineHour(parseFloat(e.target.value));
              if (isPlaying) setIsPlaying(false);
            }}
            style={{ width: '130px', accentColor: '#00d9ff', cursor: 'pointer' }}
          />

          <span style={{ fontFamily: 'var(--text-mono)', fontSize: '10px', color: '#00d9ff', fontWeight: 700, minWidth: '110px' }}>
            {formatHourDecimal(timelineHour)}
          </span>
        </div>

        {/* Right: Daily Collection KPI summary */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontFamily: 'var(--text-mono)', fontSize: '9px', color: '#2dc653', fontWeight: 700 }}>
            COLLECTED: {collectedCount}/{totalCount}
          </span>
          <span style={{ fontFamily: 'var(--text-mono)', fontSize: '9px', color: '#74c69d' }}>
            INTERSECTED: {intersectedCount}
          </span>
          <span style={{ fontFamily: 'var(--text-mono)', fontSize: '9px', color: uncollectedCount > 0 ? '#ef233c' : 'var(--text-dim)' }}>
            NOT COLLECTED: {uncollectedCount}
          </span>
        </div>
      </div>

      <div className="map-layout" style={{ flex: 1 }}>
        {/* Map Container */}
        <div className="map-container" style={{ position: 'relative' }}>
          {isLiveDate && !isFixValid && (
            <div style={{
              position: 'absolute',
              top: '16px',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 1000,
              background: 'rgba(239, 35, 60, 0.9)',
              color: '#ffffff',
              padding: '6px 16px',
              borderRadius: '2px',
              fontFamily: 'var(--text-mono)',
              fontSize: '11px',
              fontWeight: 600,
              letterSpacing: '0.08em',
              boxShadow: '0 2px 10px rgba(0,0,0,0.5)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#fff' }} />
              GNSS SATELLITE FIX UNAVAILABLE (NO FIX / WAITING)
            </div>
          )}

          <MapContainer
            center={initialCenter}
            zoom={19}
            style={{ width: '100%', height: '100%' }}
            zoomControl={true}
            attributionControl={true}
          >
            <TileLayer
              url={cartoTileUrl(theme)}
              attribution='&copy; <a href="https://carto.com/">CARTO</a>'
              maxZoom={20}
            />

            {/* Straight Road Centerline & Buffer Corridor */}
            {roadCoords.length > 1 && (
              <>
                <Polyline
                  positions={roadCoords}
                  pathOptions={{ color: '#00d9ff', weight: 4, opacity: 0.9 }}
                />
                <Polyline
                  positions={roadCoords}
                  pathOptions={{ color: 'rgba(0, 217, 255, 0.18)', weight: 20, opacity: 0.35, lineCap: 'round' }}
                />
              </>
            )}

            {/* 14 Google Maps Aligned Buildings with Dual-Color Status */}
            {visibleHouses.map(h => {
              const color = getHouseColor(h.status);
              return (
                <Polygon
                  key={h.houseId}
                  positions={h.polygon}
                  pathOptions={{
                    color: color,
                    fillColor: color,
                    fillOpacity: h.status === 'NOT_COLLECTED' ? 0.45 : (h.status === 'COLLECTED' ? 0.82 : 0.65),
                    weight: 1.5,
                  }}
                  eventHandlers={{
                    click: () => setSelectedHouse(h),
                  }}
                >
                  <Tooltip direction="top" offset={[0, -5]} opacity={0.95}>
                    <div style={{ fontFamily: 'var(--text-mono)', fontSize: '10px' }}>
                      <strong style={{ color: '#00d9ff' }}>{h.address}</strong>
                      <br />
                      Status: <span style={{ color, fontWeight: 700 }}>{h.status}</span>
                      {h.collectionEventsCount > 0 && (
                        <span> ({h.collectionEventsCount} hits)</span>
                      )}
                      <br />
                      <span style={{ fontSize: '8.5px', color: 'var(--text-dim)' }}>
                        Lat: {fmtCoord(h.latitude)}, Lon: {fmtCoord(h.longitude)}
                      </span>
                      <br />
                      <span style={{ fontSize: '8.5px', color: '#00d9ff' }}>Click to view evidence photo</span>
                    </div>
                  </Tooltip>
                </Polygon>
              );
            })}

            {/* 15m Thin Semi-Transparent Detection Circles for Collection Events */}
            {(() => {
              const activeEventCircles = [];
              if (Array.isArray(visibleEvents) && visibleEvents.length > 0) {
                visibleEvents.forEach(ev => {
                  if (ev && ev.latitude != null && ev.longitude != null) {
                    activeEventCircles.push({ lat: ev.latitude, lon: ev.longitude, id: ev.collectionEventId });
                  }
                });
              } else if (Array.isArray(incomingCollectionEvents)) {
                incomingCollectionEvents.forEach(ev => {
                  if (ev && ev.lat != null && ev.lon != null) {
                    activeEventCircles.push({ lat: ev.lat, lon: ev.lon });
                  }
                });
              }

              return activeEventCircles.map((ev, idx) => (
                <Circle
                  key={`circle-${ev.id || idx}`}
                  center={[ev.lat, ev.lon]}
                  radius={15}
                  pathOptions={{
                    color: '#2dc653',
                    fillColor: 'rgba(45, 198, 83, 0.08)',
                    weight: 1.2,
                    dashArray: '4, 4',
                  }}
                />
              ));
            })()}

            {/* Speed-encoded historical trajectory */}
            {segments.map((seg, i) => (
              <Polyline
                key={`seg-${i}`}
                positions={seg.positions}
                pathOptions={{ color: seg.color, weight: 3, opacity: 0.8 }}
              />
            ))}

            {/* Current 3D Waste Tipper Truck Position with smooth real-time interpolation (Live Mode) */}
            {isLiveDate && position && (
              <AnimatedVehicleMarker
                position={position}
                heading={vehicleHeading}
                speed={g?.speed ?? 0}
                color="#00d9ff"
                isSelected={true}
                isLive={isFixValid}
              />
            )}

            <MapFollower position={position} follow={follow} />
          </MapContainer>

          {/* Road & Building Legend Overlay */}
          <div style={{
            position: 'absolute',
            bottom: '24px',
            left: '12px',
            zIndex: 1000,
            background: 'rgba(7,9,13,0.88)',
            border: '1px solid var(--border-mid)',
            padding: '8px 12px',
            fontFamily: 'var(--text-mono)',
            fontSize: '9px',
            display: 'flex',
            flexDirection: 'column',
            gap: '5px',
          }}>
            <div style={{ color: '#00d9ff', fontWeight: 700, letterSpacing: '0.08em', marginBottom: '2px' }}>
              SIDDHIVINAYAK NAGAR GIS LAYER
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ width: '10px', height: '10px', background: '#ef233c', display: 'inline-block' }} />
              <span style={{ color: '#ef233c' }}>NOT COLLECTED</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ width: '10px', height: '10px', background: '#74c69d', display: 'inline-block' }} />
              <span style={{ color: '#74c69d' }}>INTERSECTED (15m ADJACENT)</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ width: '10px', height: '10px', background: '#2dc653', display: 'inline-block' }} />
              <span style={{ color: '#2dc653' }}>COLLECTED (PRIMARY / MULTI)</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ width: '10px', height: '1px', borderTop: '1.5px dashed #2dc653', display: 'inline-block' }} />
              <span style={{ color: '#2dc653' }}>15m DETECTION CIRCLE</span>
            </div>
          </div>

          {/* Evidence Photo Modal Lightbox */}
          {selectedHouse && (
            <div style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.8)',
              zIndex: 9999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '20px',
            }} onClick={() => setSelectedHouse(null)}>
              <div style={{
                background: 'var(--bg-card, #0f141c)',
                border: '1px solid var(--border-active, #00d9ff)',
                borderRadius: '4px',
                maxWidth: '480px',
                width: '100%',
                overflow: 'hidden',
                boxShadow: '0 8px 32px rgba(0,0,0,0.8)',
              }} onClick={e => e.stopPropagation()}>
                <div style={{
                  padding: '10px 14px',
                  background: 'rgba(0,217,255,0.08)',
                  borderBottom: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}>
                  <span style={{ fontFamily: 'var(--text-mono)', fontSize: '11px', fontWeight: 700, color: '#00d9ff' }}>
                    HOUSE EVIDENCE: {selectedHouse.address}
                  </span>
                  <button
                    onClick={() => setSelectedHouse(null)}
                    style={{ background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '16px' }}
                  >
                    ✕
                  </button>
                </div>
                <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {selectedHouse.latestEvidenceImage ? (
                    <img
                      src={getEvidenceImageUrl(selectedHouse.latestEvidenceImage.imageUrl || selectedHouse.latestEvidenceImage.url || selectedHouse.latestEvidenceImage.evidenceImageId)}
                      alt="House Evidence"
                      style={{ width: '100%', maxHeight: '280px', objectFit: 'cover', borderRadius: '3px', border: '1px solid var(--border)' }}
                      onError={(e) => {
                        e.target.style.display = 'none';
                        if (e.target.parentElement && !e.target.parentElement.querySelector('.img-err-fallback')) {
                          const errDiv = document.createElement('div');
                          errDiv.className = 'img-err-fallback';
                          errDiv.style.cssText = 'padding:24px 10px;text-align:center;font-family:var(--text-mono);font-size:10px;color:var(--text-dim);background:rgba(0,0,0,0.3);border-radius:3px;';
                          errDiv.innerText = 'Evidence photo unavailable on disk or pending sync.';
                          e.target.parentElement.insertBefore(errDiv, e.target.nextSibling);
                        }
                      }}
                    />
                  ) : (
                    <div style={{
                      padding: '30px 10px',
                      textAlign: 'center',
                      fontFamily: 'var(--text-mono)',
                      fontSize: '11px',
                      color: 'var(--text-dim)',
                      background: 'rgba(0,0,0,0.3)',
                      borderRadius: '3px',
                    }}>
                      No waste collection evidence photo captured for {selectedDate}.
                    </div>
                  )}
                  <div style={{ fontFamily: 'var(--text-mono)', fontSize: '10px', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div><strong>House ID:</strong> {selectedHouse.houseId}</div>
                    <div><strong>Address:</strong> {selectedHouse.address}</div>
                    <div><strong>Status:</strong> <span style={{ color: getHouseColor(selectedHouse.status), fontWeight: 700 }}>{selectedHouse.status}</span></div>
                    <div><strong>Collection Hits:</strong> {selectedHouse.collectionEventsCount}</div>
                    <div><strong>Coordinates:</strong> {fmtCoord(selectedHouse.latitude)}, {fmtCoord(selectedHouse.longitude)}</div>
                    {selectedHouse.latestEvidenceImage?.capturedAt && (
                      <div><strong>Captured Time:</strong> {selectedHouse.latestEvidenceImage.capturedAt}</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Telemetry Sidebar */}
        <div className="map-sidebar">
          <GnssCell label="Latitude" value={fmtCoord(position?.[0] ?? g?.lat)} unit="°" />
          <GnssCell label="Longitude" value={fmtCoord(position?.[1] ?? g?.lon)} unit="°" />
          <GnssCell label="Fused Speed" value={fmtNum(g?.speed)} unit="km/h" />
          <GnssCell label="Heading" value={fmtNum(g?.heading, 0)} unit="°" />
          <GnssCell label="Fix Status" value={g?.fix || (isLiveDate ? 'NO FIX' : 'HISTORICAL')} />
          <GnssCell label="Road Snapping" value={isSnapped ? 'LOCKED (≤10m)' : 'FREE GPS'} />
        </div>
      </div>
    </div>
  );
}
