/**
 * CoverageMap.jsx — Road coverage map with GIS Houses, Road Snapping & Route Adherence.
 * Includes Google Earth style Timeline Bar, Date Switcher, and Dual-Color House Collection Statuses.
 */
import { useEffect, useState, useMemo } from 'react';
import { MapContainer, TileLayer, Circle, Polyline, Polygon, Tooltip, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useTheme, cartoTileUrl } from '../../ThemeContext.jsx';
import { ulbColor, AnimatedVehicleMarker } from '../fleet/VehicleMarker.jsx';
import { fetchGisRoads, fetchGisHouses, fetchGisCollectionEvents, getEvidenceImageUrl } from '../../telemetry/backendApiClient.js';

function formatHourDecimal(dec) {
  if (dec >= 24.0) return 'ALL DAY (LATEST)';
  const hourInt = Math.floor(dec);
  const minInt = Math.round((dec - hourInt) * 60);
  const period = hourInt >= 12 ? 'PM' : 'AM';
  const displayHour = hourInt % 12 === 0 ? 12 : hourInt % 12;
  return `${displayHour}:${minInt.toString().padStart(2, '0')} ${period}`;
}

export default function CoverageMap({
  sessionId = null,
  fleet = [],
  ulbId = null,
  ulbs = [],
  loading = false,
  coverageData = null,
  adherenceData = null,
}) {
  const { theme } = useTheme();
  const [roads, setRoads] = useState([]);
  const [houses, setHouses] = useState([]);
  const [events, setEvents] = useState([]);
  const [selectedHouse, setSelectedHouse] = useState(null);
  const [safeZones, setSafeZones] = useState([]);
  const [showTrajectory, setShowTrajectory] = useState(true);
  const [showDeviations, setShowDeviations] = useState(true);

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
  const effectiveUlb = ulbId || 'ULB_MH_AMRAVATI';
  const color = effectiveUlb ? ulbColor(effectiveUlb, ulbs) : '#00b4d8';

  // Fetch GIS Roads & Safe Zones
  useEffect(() => {
    const apiBase = import.meta.env.VITE_API_BASE_URL || (import.meta.env.PROD ? 'https://solidwasteapi.scipl.info.in/api' : 'http://localhost:5000/api');
    fetchGisRoads(effectiveUlb).then((data) => setRoads(data || []));
    fetch(`${apiBase}/gis/safe-zones?ulbId=${effectiveUlb}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((szList) => setSafeZones(Array.isArray(szList) ? szList : []))
      .catch(() => {});
  }, [effectiveUlb]);

  // Fetch Houses & Events for selectedDate
  useEffect(() => {
    const loadGisData = () => {
      fetchGisHouses(effectiveUlb, null, selectedDate).then((data) => setHouses(data || []));
      fetchGisCollectionEvents(effectiveUlb, selectedDate).then((data) => setEvents(data || []));
    };

    loadGisData();

    let interval = null;
    if (isLiveDate) {
      interval = setInterval(loadGisData, 2500);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [effectiveUlb, selectedDate, isLiveDate]);

  // Playback loop
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

  // Filtered by time scrubber
  const { visibleHouses, visibleEvents } = useMemo(() => {
    if (timelineHour >= 24.0) {
      return { visibleHouses: houses, visibleEvents: events };
    }

    const filteredEvents = events.filter((ev) => {
      if (!ev.capturedAt) return true;
      const timePart = ev.capturedAt.split(' ')[1];
      if (!timePart) return true;
      const [hh, mm] = timePart.split(':').map(Number);
      const evDec = hh + (mm || 0) / 60;
      return evDec <= timelineHour;
    });

    const filteredHouses = houses.map((h) => {
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

  // Road assignment coverage lookup
  const assignmentLookup = useMemo(() => {
    const map = new Map();
    if (coverageData?.assignments) {
      coverageData.assignments.forEach((a) => {
        map.set(a.roadId, a);
      });
    }
    return map;
  }, [coverageData]);

  // Live Fleet Vehicles
  const liveVehicles = fleet
    .filter((v) => (v.hasPosition || v.lat != null || v.displayLat != null) && (v.displayLat != null || v.lat != null) && (v.displayLon != null || v.lon != null))
    .map((v) => ({
      ...v,
      lat: v.displayLat ?? v.lat,
      lon: v.displayLon ?? v.lon,
      heading: v.heading ?? 0,
      isSnapped: v.isSnapped ?? false,
      isInsideSafeZone: v.isInsideSafeZone ?? false,
    }));

  const getHouseColor = (status) => {
    if (status === 'COLLECTED') return '#2dc653';     // Solid Dark Green (Direct Primary)
    if (status === 'INTERSECTED') return '#74c69d';   // Light Sage Green (In 15m radius)
    return '#ef233c';                                 // Red (Not Collected)
  };

  const getRoadColor = (roadId) => {
    const assignment = assignmentLookup.get(roadId);
    if (!assignment) return '#00d9ff';
    if (assignment.coveragePercentage >= 95.0) return '#2dc653'; // COMPLETED (Green)
    if (assignment.coveragePercentage > 0.0) return '#f48c06'; // PARTIAL (Amber)
    return '#6c757d'; // UNCOVERED (Muted Gray)
  };

  const mapCenter = [20.956112, 77.763861];

  const fmtCoord = (v, d = 8) => (v != null && !isNaN(v) ? Number(v).toFixed(d) : '—');

  const collectedCount = visibleHouses.filter((h) => h.status === 'COLLECTED').length;
  const intersectedCount = visibleHouses.filter((h) => h.status === 'INTERSECTED').length;
  const uncollectedCount = visibleHouses.filter((h) => h.status === 'NOT_COLLECTED').length;
  const totalCount = visibleHouses.length || 14;

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
      {/* ─── GOOGLE EARTH STYLE TIMELINE & DATE BAR ───────────────────────────── */}
      <div
        style={{
          padding: '6px 12px',
          background: 'var(--bg-panel-2, #0d121a)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '8px',
          zIndex: 10,
          flexShrink: 0,
        }}
      >
        {/* Left: Quick Date Switchers */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span style={{ fontFamily: 'var(--text-mono)', fontSize: '9px', fontWeight: 800, color: 'var(--text-dim)' }}>
            DATE:
          </span>
          <button
            onClick={() => { setSelectedDate(todayStr); setTimelineHour(24.0); setIsPlaying(false); }}
            style={{
              padding: '2px 7px',
              fontFamily: 'var(--text-mono)',
              fontSize: '8.5px',
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
              padding: '2px 7px',
              fontFamily: 'var(--text-mono)',
              fontSize: '8.5px',
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
              padding: '2px 7px',
              fontFamily: 'var(--text-mono)',
              fontSize: '8.5px',
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
              fontSize: '8.5px',
              padding: '2px 5px',
              borderRadius: '2px',
              outline: 'none',
              marginLeft: '2px',
            }}
          />
        </div>

        {/* Center: Time Scrubber */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
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
              padding: '2px 6px',
              fontFamily: 'var(--text-mono)',
              fontSize: '8.5px',
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
            style={{ width: '100px', accentColor: '#00d9ff', cursor: 'pointer' }}
          />

          <span style={{ fontFamily: 'var(--text-mono)', fontSize: '9px', color: '#00d9ff', fontWeight: 700, minWidth: '95px' }}>
            {formatHourDecimal(timelineHour)}
          </span>
        </div>

        {/* Right: KPI counters */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontFamily: 'var(--text-mono)', fontSize: '8.5px', color: '#2dc653', fontWeight: 700 }}>
            COLLECTED: {collectedCount}/{totalCount}
          </span>
          <span style={{ fontFamily: 'var(--text-mono)', fontSize: '8.5px', color: '#74c69d' }}>
            INTERSECTED: {intersectedCount}
          </span>
          <span style={{ fontFamily: 'var(--text-mono)', fontSize: '8.5px', color: uncollectedCount > 0 ? '#ef233c' : 'var(--text-dim)' }}>
            NOT COLLECTED: {uncollectedCount}
          </span>
        </div>
      </div>

      {/* Map view area */}
      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        {/* Layer toggle checkboxes */}
        <div
          style={{
            position: 'absolute',
            top: '10px',
            left: '10px',
            zIndex: 1000,
            background: 'rgba(10, 14, 22, 0.92)',
            border: '1px solid var(--border)',
            borderRadius: '3px',
            padding: '5px 8px',
            display: 'flex',
            gap: '8px',
            fontFamily: 'var(--text-mono)',
            fontSize: '8.5px',
          }}
        >
          <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', color: showTrajectory ? '#00d9ff' : 'var(--text-dim)' }}>
            <input
              type="checkbox"
              checked={showTrajectory}
              onChange={(e) => setShowTrajectory(e.target.checked)}
              style={{ accentColor: '#00d9ff' }}
            />
            TRAJECTORY
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', color: showDeviations ? '#f72585' : 'var(--text-dim)' }}>
            <input
              type="checkbox"
              checked={showDeviations}
              onChange={(e) => setShowDeviations(e.target.checked)}
              style={{ accentColor: '#f72585' }}
            />
            DEVIATIONS ({adherenceData?.totalDeviationEventsCount ?? 0})
          </label>
        </div>

        <MapContainer center={mapCenter} zoom={18} style={{ width: '100%', height: '100%' }} zoomControl={true}>
          <TileLayer url={cartoTileUrl(theme)} attribution='&copy; <a href="https://carto.com/">CARTO</a>' maxZoom={20} />

          {/* 1. Safe-zone circles from DB */}
          {safeZones.map((sz) => (
            <Circle
              key={`sz-${sz.safeZoneId || sz.name}`}
              center={[sz.latitude, sz.longitude]}
              radius={sz.radiusMeters || 1000}
              pathOptions={{ color, fillColor: color, fillOpacity: 0.03, dashArray: '6, 6', weight: 1.2 }}
            >
              <Popup>
                <div style={{ fontFamily: 'var(--text-mono)', fontSize: '10px' }}>
                  <strong style={{ color }}>🛡 SAFE ZONE: {sz.name || 'Depot'}</strong>
                  <br />
                  Radius: {sz.radiusMeters || 1000}m
                </div>
              </Popup>
            </Circle>
          ))}

          {/* 2. Assigned Roads colored by coverage status */}
          {roads.map((r) => {
            const coords = r.coordinates || [];
            if (coords.length < 2) return null;
            const roadColor = getRoadColor(r.roadId);
            const assignment = assignmentLookup.get(r.roadId);
            const isCompleted = assignment && assignment.coveragePercentage >= 95.0;
            const isUncovered = !assignment || assignment.coveragePercentage === 0.0;

            return (
              <div key={`road-${r.roadId}`}>
                <Polyline
                  positions={coords}
                  pathOptions={{
                    color: roadColor,
                    weight: isCompleted ? 5 : 4,
                    opacity: isUncovered ? 0.6 : 0.95,
                    dashArray: isUncovered ? '4, 6' : undefined,
                  }}
                />
                <Polyline
                  positions={coords}
                  pathOptions={{
                    color: roadColor,
                    weight: 22,
                    opacity: 0.18,
                    lineCap: 'round',
                  }}
                />
              </div>
            );
          })}

          {/* 3. GIS Houses Footprints with Dual-Color Status */}
          {visibleHouses.map((h) => {
            const houseColor = getHouseColor(h.status);
            const isSelected = selectedHouse?.houseId === h.houseId;

            return (
              <Polygon
                key={`h-${h.houseId}`}
                positions={h.polygon}
                pathOptions={{
                  color: houseColor,
                  fillColor: houseColor,
                  fillOpacity: h.status === 'NOT_COLLECTED' ? 0.45 : (h.status === 'COLLECTED' ? 0.85 : 0.65),
                  weight: isSelected ? 2.5 : 1.5,
                }}
                eventHandlers={{
                  click: () => setSelectedHouse(h),
                }}
              >
                <Tooltip sticky>
                  <div style={{ fontFamily: 'var(--text-mono)', fontSize: '11px', color: '#f8fafc' }}>
                    <div style={{ fontWeight: 700, color: houseColor }}>
                      {h.houseId}: {h.address}
                    </div>
                    <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>
                      Status: <span style={{ color: houseColor, fontWeight: 700 }}>{h.status}</span>
                    </div>
                    {h.collectionEventsCount > 0 && (
                      <div style={{ fontSize: '9px', color: '#00d9ff', marginTop: '2px' }}>
                        Hits: {h.collectionEventsCount} (Dist: {h.minDistanceMeters}m)
                      </div>
                    )}
                    <div style={{ fontSize: '8.5px', color: '#00d9ff', marginTop: '4px' }}>
                      Click to view evidence photo
                    </div>
                  </div>
                </Tooltip>
              </Polygon>
            );
          })}

          {/* 4. 15m Detection Circles for Collection Events */}
          {visibleEvents.map((ev, i) =>
            ev.latitude && ev.longitude ? (
              <Circle
                key={`ev-circ-${ev.collectionEventId || ev.id || i}`}
                center={[ev.latitude, ev.longitude]}
                radius={15}
                pathOptions={{
                  color: '#2dc653',
                  fillColor: 'rgba(45, 198, 83, 0.08)',
                  weight: 1.2,
                  dashArray: '4, 4',
                }}
              />
            ) : null
          )}

          {/* 5. Live Fleet Animated Vehicles */}
          {isLiveDate && liveVehicles.map((v) => (
            <AnimatedVehicleMarker
              key={`veh-${v.vehicleId || v.deviceId}`}
              position={[v.lat, v.lon]}
              heading={v.heading}
              speed={v.speedKmh ?? v.speed ?? 0}
              color={color}
              isSelected={true}
              isLive={v.isLive !== false}
              deviceCode={v.deviceCode}
            />
          ))}
        </MapContainer>

        {/* Road & Building Legend Overlay */}
        <div
          style={{
            position: 'absolute',
            bottom: '16px',
            left: '12px',
            zIndex: 1000,
            background: 'rgba(7,9,13,0.88)',
            border: '1px solid var(--border-mid)',
            padding: '7px 10px',
            fontFamily: 'var(--text-mono)',
            fontSize: '8.5px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
          }}
        >
          <div style={{ color: '#00d9ff', fontWeight: 700, letterSpacing: '0.08em', marginBottom: '2px' }}>
            SIDDHIVINAYAK NAGAR GIS
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '8px', height: '8px', background: '#ef233c', display: 'inline-block' }} />
            <span style={{ color: '#ef233c' }}>NOT COLLECTED</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '8px', height: '8px', background: '#74c69d', display: 'inline-block' }} />
            <span style={{ color: '#74c69d' }}>INTERSECTED (15m ADJACENT)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '8px', height: '8px', background: '#2dc653', display: 'inline-block' }} />
            <span style={{ color: '#2dc653' }}>COLLECTED (PRIMARY / MULTI)</span>
          </div>
        </div>

        {/* Evidence Photo Modal Lightbox */}
        {selectedHouse && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.8)',
              zIndex: 9999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '20px',
            }}
            onClick={() => setSelectedHouse(null)}
          >
            <div
              style={{
                background: 'var(--bg-card, #0f141c)',
                border: '1px solid var(--border-active, #00d9ff)',
                borderRadius: '4px',
                maxWidth: '480px',
                width: '100%',
                overflow: 'hidden',
                boxShadow: '0 8px 32px rgba(0,0,0,0.8)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                style={{
                  padding: '10px 14px',
                  background: 'rgba(0,217,255,0.08)',
                  borderBottom: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
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
                    src={getEvidenceImageUrl(
                      selectedHouse.latestEvidenceImage.imageUrl ||
                        selectedHouse.latestEvidenceImage.url ||
                        selectedHouse.latestEvidenceImage.evidenceImageId
                    )}
                    alt="House Evidence"
                    style={{ width: '100%', maxHeight: '280px', objectFit: 'cover', borderRadius: '3px', border: '1px solid var(--border)' }}
                    onError={(e) => {
                      e.target.style.display = 'none';
                      if (e.target.parentElement && !e.target.parentElement.querySelector('.img-err-fallback')) {
                        const errDiv = document.createElement('div');
                        errDiv.className = 'img-err-fallback';
                        errDiv.style.cssText =
                          'padding:24px 10px;text-align:center;font-family:var(--text-mono);font-size:10px;color:var(--text-dim);background:rgba(0,0,0,0.3);border-radius:3px;';
                        errDiv.innerText = 'Evidence photo unavailable on disk or pending sync.';
                        e.target.parentElement.insertBefore(errDiv, e.target.nextSibling);
                      }
                    }}
                  />
                ) : (
                  <div
                    style={{
                      padding: '30px 10px',
                      textAlign: 'center',
                      fontFamily: 'var(--text-mono)',
                      fontSize: '11px',
                      color: 'var(--text-dim)',
                      background: 'rgba(0,0,0,0.3)',
                      borderRadius: '3px',
                    }}
                  >
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
    </div>
  );
}
