import React, { useState, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Polygon, Polyline, Circle, Marker, Tooltip, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { useTheme, cartoTileUrl } from '../../ThemeContext.jsx';
import { useSimulationStore, calculateDistanceMeters, computeHouseFootprint, DEFAULT_ROAD_NODES } from '../../telemetry/simulationStore.js';
import { AnimatedVehicleMarker } from '../../components/fleet/VehicleMarker.jsx';

// Generate mock historical daily data for past dates (deterministic based on date)
function generateDailyHistoryData(dateStr, liveHouses, liveEvents) {
  const isToday = dateStr === new Date().toISOString().split('T')[0];
  if (isToday) {
    return {
      houses: liveHouses,
      events: liveEvents,
      distanceKm: 4.8,
      activeTrucks: 1,
    };
  }

  // Generate deterministic past day pattern based on date string hash
  let seed = 0;
  for (let i = 0; i < dateStr.length; i++) {
    seed = (seed * 31 + dateStr.charCodeAt(i)) % 1000;
  }

  const pastHouses = liveHouses.map((h, idx) => {
    // Determine if house was collected on this historical date
    const val = (seed + idx * 7) % 10;
    const wasCollected = val > 3; // ~60% collected
    const wasIntersected = !wasCollected && val === 3; // ~10% intersected
    const hour = 7 + (idx % 6);
    const minute = (idx * 13) % 60;
    const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00`;

    return {
      ...h,
      status: wasCollected ? 'COLLECTED' : wasIntersected ? 'INTERSECTED' : 'NOT_COLLECTED',
      collectedAt: wasCollected || wasIntersected ? timeStr : null,
      evidencePhoto: wasCollected ? h.evidencePhoto : null,
    };
  });

  const collectedCount = pastHouses.filter((h) => h.status === 'COLLECTED').length;

  return {
    houses: pastHouses,
    events: [],
    distanceKm: (3.5 + (seed % 30) / 10).toFixed(1),
    activeTrucks: 1 + (seed % 2),
  };
}

export default function DailyTimelineView({ ulbId = 'ULB_MH_AMRAVATI', ulbName = 'AMRAVATI MUNICIPAL CORP' }) {
  const { theme } = useTheme();
  const { houses: liveHouses, collectionEvents: liveEvents, selectedTimelineDate, setTimelineDate } = useSimulationStore();

  const [dateSelection, setDateSelection] = useState(selectedTimelineDate || new Date().toISOString().split('T')[0]);
  const [selectedHouse, setSelectedHouse] = useState(null);
  const [timelineHour, setTimelineHour] = useState(12.0); // 12:00 PM
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState('MAP'); // 'MAP' | 'GALLERY' | 'LIST'

  const todayStr = new Date().toISOString().split('T')[0];
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  const twoDaysAgo = new Date();
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
  const twoDaysAgoStr = twoDaysAgo.toISOString().split('T')[0];

  // Daily resolved dataset
  const dayData = useMemo(() => {
    return generateDailyHistoryData(dateSelection, liveHouses, liveEvents);
  }, [dateSelection, liveHouses, liveEvents]);

  // Handle timeline scrubber animation
  useEffect(() => {
    let interval = null;
    if (isPlaying) {
      interval = setInterval(() => {
        setTimelineHour((h) => {
          if (h >= 18.0) {
            setIsPlaying(false);
            return 6.0;
          }
          return parseFloat((h + 0.2).toFixed(1));
        });
      }, 300);
    }
    return () => clearInterval(interval);
  }, [isPlaying]);

  // Houses filtered by timeline hour scrubber
  const visibleHouses = useMemo(() => {
    return dayData.houses.map((h) => {
      if ((h.status === 'COLLECTED' || h.status === 'INTERSECTED') && h.collectedAt) {
        const [hh, mm] = h.collectedAt.split(':').map(Number);
        const houseTimeDecimal = hh + mm / 60;
        if (houseTimeDecimal > timelineHour) {
          return { ...h, status: 'NOT_COLLECTED' };
        }
      }
      return h;
    });
  }, [dayData.houses, timelineHour]);

  const collectedCount = visibleHouses.filter((h) => h.status === 'COLLECTED').length;
  const intersectedCount = visibleHouses.filter((h) => h.status === 'INTERSECTED').length;
  const uncollectedCount = visibleHouses.filter((h) => h.status === 'NOT_COLLECTED' || h.status === 'UNCOLLECTED').length;
  const collectionRate = Math.round(((collectedCount + intersectedCount) / (visibleHouses.length || 1)) * 100);

  const mapCenter = [20.956112, 77.763861];

  const getHouseColor = (status) => {
    if (status === 'COLLECTED') return '#2dc653';     // Solid Green
    if (status === 'INTERSECTED') return '#74c69d';   // Light Green
    return '#ef233c';                                 // Red
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0, background: 'var(--bg-base)' }}>
      {/* ─── TOP DATE SELECTOR & TIMELINE CONTROLS BAR ───────────────────────── */}
      <div
        style={{
          padding: '10px 16px',
          background: 'var(--bg-panel-2)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          flexShrink: 0,
        }}
      >
        {/* Left: Quick Date Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontFamily: 'var(--text-mono)', fontSize: '9px', fontWeight: 800, color: 'var(--text-dim)', marginRight: '4px' }}>
            DATE:
          </span>
          <button
            onClick={() => { setDateSelection(todayStr); setTimelineDate(todayStr); }}
            style={{
              padding: '4px 10px',
              fontFamily: 'var(--text-mono)',
              fontSize: '9px',
              fontWeight: dateSelection === todayStr ? 800 : 500,
              color: dateSelection === todayStr ? '#000000' : 'var(--text-primary)',
              background: dateSelection === todayStr ? '#00d9ff' : 'var(--bg-elevated)',
              border: dateSelection === todayStr ? '1px solid #00d9ff' : '1px solid var(--border)',
              borderRadius: '2px',
              cursor: 'pointer',
            }}
          >
            ● TODAY (LIVE)
          </button>
          <button
            onClick={() => { setDateSelection(yesterdayStr); setTimelineDate(yesterdayStr); }}
            style={{
              padding: '4px 10px',
              fontFamily: 'var(--text-mono)',
              fontSize: '9px',
              fontWeight: dateSelection === yesterdayStr ? 800 : 500,
              color: dateSelection === yesterdayStr ? '#000000' : 'var(--text-primary)',
              background: dateSelection === yesterdayStr ? '#00d9ff' : 'var(--bg-elevated)',
              border: dateSelection === yesterdayStr ? '1px solid #00d9ff' : '1px solid var(--border)',
              borderRadius: '2px',
              cursor: 'pointer',
            }}
          >
            YESTERDAY
          </button>
          <button
            onClick={() => { setDateSelection(twoDaysAgoStr); setTimelineDate(twoDaysAgoStr); }}
            style={{
              padding: '4px 10px',
              fontFamily: 'var(--text-mono)',
              fontSize: '9px',
              fontWeight: dateSelection === twoDaysAgoStr ? 800 : 500,
              color: dateSelection === twoDaysAgoStr ? '#000000' : 'var(--text-primary)',
              background: dateSelection === twoDaysAgoStr ? '#00d9ff' : 'var(--bg-elevated)',
              border: dateSelection === twoDaysAgoStr ? '1px solid #00d9ff' : '1px solid var(--border)',
              borderRadius: '2px',
              cursor: 'pointer',
            }}
          >
            2 DAYS AGO
          </button>

          {/* Custom Date Input */}
          <input
            type="date"
            value={dateSelection}
            onChange={(e) => {
              if (e.target.value) {
                setDateSelection(e.target.value);
                setTimelineDate(e.target.value);
              }
            }}
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
              fontFamily: 'var(--text-mono)',
              fontSize: '9px',
              padding: '3px 6px',
              borderRadius: '2px',
              outline: 'none',
              marginLeft: '4px',
            }}
          />
        </div>

        {/* Center: Daily KPI Summary */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontFamily: 'var(--text-mono)', fontSize: '8px', color: 'var(--text-dim)' }}>COLLECTED</span>
            <span style={{ fontFamily: 'var(--text-mono)', fontSize: '13px', fontWeight: 800, color: '#2dc653' }}>
              {collectedCount} / {visibleHouses.length}
            </span>
          </div>

          <div style={{ width: '1px', height: '20px', background: 'var(--border)' }} />

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontFamily: 'var(--text-mono)', fontSize: '8px', color: 'var(--text-dim)' }}>UNCOLLECTED</span>
            <span style={{ fontFamily: 'var(--text-mono)', fontSize: '13px', fontWeight: 800, color: uncollectedCount > 0 ? '#ef233c' : 'var(--text-dim)' }}>
              {uncollectedCount}
            </span>
          </div>

          <div style={{ width: '1px', height: '20px', background: 'var(--border)' }} />

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontFamily: 'var(--text-mono)', fontSize: '8px', color: 'var(--text-dim)' }}>SUCCESS RATE</span>
            <span style={{ fontFamily: 'var(--text-mono)', fontSize: '13px', fontWeight: 800, color: '#00d9ff' }}>
              {collectionRate}%
            </span>
          </div>
        </div>

        {/* Right: Sub-tab switcher (Map vs Gallery vs List) */}
        <div style={{ display: 'flex', gap: '4px' }}>
          {['MAP', 'GALLERY', 'LIST'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveSubTab(tab)}
              style={{
                padding: '4px 8px',
                fontFamily: 'var(--text-mono)',
                fontSize: '8.5px',
                fontWeight: activeSubTab === tab ? 700 : 400,
                color: activeSubTab === tab ? '#00d9ff' : 'var(--text-dim)',
                background: activeSubTab === tab ? 'var(--bg-elevated)' : 'none',
                border: '1px solid var(--border)',
                borderRadius: '2px',
                cursor: 'pointer',
              }}
            >
              {tab === 'MAP' ? '🗺 MAP VIEW' : tab === 'GALLERY' ? '📷 EVIDENCE PHOTOS' : '📋 ROSTER LIST'}
            </button>
          ))}
        </div>
      </div>

      {/* ─── TIME SCRUBBER CONTROLS (06:00 to 18:00) ────────────────────────── */}
      <div
        style={{
          padding: '6px 16px',
          background: 'var(--bg-panel)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
          flexShrink: 0,
        }}
      >
        <button
          onClick={() => setIsPlaying(!isPlaying)}
          style={{
            padding: '3px 8px',
            fontFamily: 'var(--text-mono)',
            fontSize: '9px',
            fontWeight: 800,
            color: isPlaying ? '#000000' : '#ffffff',
            background: isPlaying ? '#00d9ff' : 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: '2px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          <span>{isPlaying ? '⏸ PAUSE' : '▶ PLAY DAY'}</span>
        </button>

        <span style={{ fontFamily: 'var(--text-mono)', fontSize: '11px', fontWeight: 800, color: '#00d9ff', minWidth: '70px' }}>
          {Math.floor(timelineHour).toString().padStart(2, '0')}:
          {Math.round((timelineHour % 1) * 60).toString().padStart(2, '0')} HRS
        </span>

        <input
          type="range"
          min="6.0"
          max="18.0"
          step="0.1"
          value={timelineHour}
          onChange={(e) => {
            setTimelineHour(Number(e.target.value));
            setIsPlaying(false);
          }}
          style={{ flex: 1, accentColor: '#00d9ff', cursor: 'pointer' }}
        />

        <span style={{ fontFamily: 'var(--text-mono)', fontSize: '8.5px', color: 'var(--text-dim)' }}>
          SHIFT: 06:00 AM – 06:00 PM
        </span>
      </div>

      {/* ─── MAIN CONTENT AREA ──────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        {/* VIEW 1: MAP VIEW */}
        {activeSubTab === 'MAP' && (
          <div style={{ flex: 1, position: 'relative' }}>
            <MapContainer center={mapCenter} zoom={18} style={{ width: '100%', height: '100%' }}>
              <TileLayer url={cartoTileUrl(theme)} attribution='&copy; CARTO' maxZoom={20} />

              {/* Road Corridors */}
              <Polyline
                positions={DEFAULT_ROAD_NODES.map((n) => [n.lat, n.lon])}
                pathOptions={{ color: '#00d9ff', weight: 4, opacity: 0.8 }}
              />
              <Polyline
                positions={DEFAULT_ROAD_NODES.map((n) => [n.lat, n.lon])}
                pathOptions={{ color: '#00d9ff', weight: 20, opacity: 0.15 }}
              />

              {/* Houses (Polygons with Rotated Footprints and Collected vs Intersected vs Uncollected status) */}
              {visibleHouses.map((h, i) => {
                const color = getHouseColor(h.status);
                const isSelected = selectedHouse?.id === h.id;
                const poly = computeHouseFootprint(h);

                return (
                  <Polygon
                    key={`th-${h.id}-${i}`}
                    positions={poly}
                    pathOptions={{
                      color: color,
                      fillColor: color,
                      fillOpacity: isSelected ? 0.95 : (h.status === 'NOT_COLLECTED' || h.status === 'UNCOLLECTED' ? 0.45 : 0.8),
                      weight: isSelected ? 2.5 : 1.2,
                    }}
                    eventHandlers={{
                      click: () => setSelectedHouse(h),
                    }}
                  >
                    <Tooltip sticky>
                      <div style={{ fontFamily: 'var(--text-mono)', fontSize: '11px', color: '#ffffff' }}>
                        <strong style={{ color }}>{h.id}: {h.address}</strong>
                        <div style={{ fontSize: '9.5px', marginTop: '2px' }}>
                          Status: <strong style={{ color }}>{h.status}</strong>
                          {h.collectedAt && <span> (at {h.collectedAt})</span>}
                        </div>
                      </div>
                    </Tooltip>
                  </Polygon>
                );
              })}

              {/* 15m Collection Circles for collected properties (Main Algorithm approach) */}
              {visibleHouses
                .filter((h) => h.status === 'COLLECTED')
                .map((h, i) => (
                  <Circle
                    key={`th-circ-${h.id}-${i}`}
                    center={[h.lat, h.lon]}
                    radius={15}
                    pathOptions={{
                      color: 'rgba(45, 198, 83, 0.5)',
                      fillColor: '#2dc653',
                      fillOpacity: 0.1,
                      weight: 1.2,
                      dashArray: '3, 4',
                    }}
                  />
                ))}
            </MapContainer>

            {/* ─── FLOATING GIS LEGEND ───────────────────────────────────────── */}
            <div
              style={{
                position: 'absolute',
                bottom: '16px',
                left: '12px',
                zIndex: 1000,
                background: 'rgba(7, 9, 13, 0.92)',
                border: '1px solid var(--border-mid)',
                borderRadius: '3px',
                padding: '8px 12px',
                fontFamily: 'var(--text-mono)',
                fontSize: '9px',
                display: 'flex',
                flexDirection: 'column',
                gap: '5px',
                boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
              }}
            >
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

            {/* Selected House Floating Card */}
            {selectedHouse && (
              <div
                style={{
                  position: 'absolute',
                  bottom: '16px',
                  right: '16px',
                  zIndex: 1000,
                  width: '300px',
                  background: 'var(--bg-panel)',
                  border: '1px solid var(--border)',
                  borderRadius: '4px',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
                  overflow: 'hidden',
                }}
              >
                <div style={{ padding: '8px 12px', background: 'var(--bg-panel-2)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontFamily: 'var(--text-mono)', fontSize: '10px', fontWeight: 700, color: '#00d9ff' }}>
                    {selectedHouse.id} · {dateSelection}
                  </span>
                  <button onClick={() => setSelectedHouse(null)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>✕</button>
                </div>
                <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {selectedHouse.evidencePhoto ? (
                    <img
                      src={selectedHouse.evidencePhoto}
                      alt="Collection Evidence"
                      style={{ width: '100%', maxHeight: '180px', objectFit: 'cover', borderRadius: '3px', border: '1px solid var(--border)' }}
                    />
                  ) : (
                    <div style={{ padding: '16px', textAlign: 'center', fontFamily: 'var(--text-mono)', fontSize: '9.5px', color: 'var(--text-dim)', background: 'rgba(0,0,0,0.3)', borderRadius: '3px' }}>
                      {selectedHouse.status === 'COLLECTED' ? 'Photo logged in system archives.' : 'Trash not yet collected for this property on selected day.'}
                    </div>
                  )}
                  <div style={{ fontFamily: 'var(--text-mono)', fontSize: '9.5px', color: 'var(--text-secondary)' }}>
                    <div><strong>Address:</strong> {selectedHouse.address}</div>
                    <div><strong>Status:</strong> <span style={{ color: getHouseColor(selectedHouse.status), fontWeight: 700 }}>{selectedHouse.status}</span></div>
                    {selectedHouse.collectedAt && <div><strong>Time:</strong> {selectedHouse.collectedAt}</div>}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* VIEW 2: EVIDENCE GALLERY VIEW */}
        {activeSubTab === 'GALLERY' && (
          <div style={{ flex: 1, padding: '16px', overflowY: 'auto' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '14px' }}>
              {visibleHouses.map((h) => (
                <div
                  key={`gal-${h.id}`}
                  style={{
                    background: 'var(--bg-panel)',
                    border: `1px solid ${h.status === 'COLLECTED' ? 'rgba(45,198,83,0.3)' : 'var(--border)'}`,
                    borderRadius: '4px',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  <div style={{ height: '160px', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {h.evidencePhoto ? (
                      <img src={h.evidencePhoto} alt="Evidence" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ fontFamily: 'var(--text-mono)', fontSize: '9px', color: 'var(--text-dim)', textAlign: 'center' }}>
                        {h.status === 'COLLECTED' ? '📷 PHOTO ARCHIVED' : '⚠️ MISSED / UNCOLLECTED'}
                      </div>
                    )}
                  </div>
                  <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontFamily: 'var(--text-mono)', fontSize: '10px', fontWeight: 700, color: 'var(--text-primary)' }}>{h.id}</span>
                      <span style={{ fontFamily: 'var(--text-mono)', fontSize: '8px', fontWeight: 800, color: getHouseColor(h.status) }}>{h.status}</span>
                    </div>
                    <span style={{ fontFamily: 'var(--text-mono)', fontSize: '8.5px', color: 'var(--text-secondary)' }}>{h.address}</span>
                    {h.collectedAt && (
                      <span style={{ fontFamily: 'var(--text-mono)', fontSize: '8px', color: '#00d9ff' }}>Logged at {h.collectedAt}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* VIEW 3: ROSTER LIST VIEW */}
        {activeSubTab === 'LIST' && (
          <div style={{ flex: 1, padding: '16px', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--text-mono)', fontSize: '9.5px' }}>
              <thead>
                <tr style={{ background: 'var(--bg-panel-2)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                  <th style={{ padding: '8px 12px' }}>HOUSE ID</th>
                  <th style={{ padding: '8px 12px' }}>ADDRESS / PROPERTY</th>
                  <th style={{ padding: '8px 12px' }}>COORDINATES</th>
                  <th style={{ padding: '8px 12px' }}>COLLECTION STATUS</th>
                  <th style={{ padding: '8px 12px' }}>TIMESTAMP</th>
                </tr>
              </thead>
              <tbody>
                {visibleHouses.map((h) => (
                  <tr key={`lst-${h.id}`} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 12px', fontWeight: 700, color: '#00d9ff' }}>{h.id}</td>
                    <td style={{ padding: '8px 12px', color: 'var(--text-primary)' }}>{h.address}</td>
                    <td style={{ padding: '8px 12px', color: 'var(--text-dim)' }}>{h.lat.toFixed(6)}, {h.lon.toFixed(6)}</td>
                    <td style={{ padding: '8px 12px' }}>
                      <span
                        style={{
                          color: getHouseColor(h.status),
                          fontWeight: 700,
                          background: h.status === 'COLLECTED' ? 'rgba(45,198,83,0.1)' : 'rgba(239,35,60,0.1)',
                          padding: '2px 6px',
                          borderRadius: '2px',
                        }}
                      >
                        {h.status}
                      </span>
                    </td>
                    <td style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>{h.collectedAt || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
