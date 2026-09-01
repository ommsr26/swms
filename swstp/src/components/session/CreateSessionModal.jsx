/**
 * CreateSessionModal.jsx — Officer Session Creation Wizard.
 *
 * Flow:
 *   1. SELECT VEHICLE (only unreserved vehicles in the current ULB)
 *   2. SELECT ROADS (one or more roads/segments in current ULB)
 *   3. TRIM ASSIGNMENTS (interactive map-based segment trimming, preserves master geometry)
 *   4. SET START TIME (ScheduledStartAt — NO scheduled end time)
 *   5. REVIEW & CREATE (summary & submission with error handling)
 */
import { useState, useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Polyline, Polygon, CircleMarker, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { useTheme, cartoTileUrl } from '../../ThemeContext.jsx';
import { fetchOfficerFleet, fetchOfficerRoads, createOfficerSession } from '../../telemetry/backendApiClient.js';

function MapAutoFit({ coordinates = [] }) {
  const map = useMap();
  useEffect(() => {
    if (coordinates && coordinates.length > 0) {
      try {
        const bounds = coordinates.map(c => [c[0], c[1]]);
        map.fitBounds(bounds, { padding: [30, 30] });
      } catch {}
    }
  }, [coordinates, map]);
  return null;
}

// Trims a coordinate array [lat, lon] by startPct (0-100) and endPct (0-100)
function trimCoordinates(coords, startPct, endPct) {
  if (!coords || coords.length < 2) return coords || [];
  if (startPct === 0 && endPct === 100) return coords;

  const n = coords.length - 1;
  const startIndex = Math.min(n - 1, Math.floor((startPct / 100) * n));
  const endIndex = Math.max(startIndex + 1, Math.ceil((endPct / 100) * n));

  return coords.slice(startIndex, endIndex + 1);
}

// Converts [lat, lon] array to WKT LineString: "LINESTRING (lon lat, lon lat, ...)"
function coordsToWkt(coords) {
  if (!coords || coords.length === 0) return '';
  const pts = coords.map(c => `${c[1]} ${c[0]}`).join(', ');
  return `LINESTRING (${pts})`;
}

export default function CreateSessionModal({ ulbId, ulbName, isOpen, onClose, onCreated }) {
  const { theme } = useTheme();
  const dateInputRef = useRef(null);

  // Wizard step: 1: Vehicle, 2: Roads, 3: Trim, 4: Time, 5: Review
  const [step, setStep] = useState(1);

  // Data
  const [fleet, setFleet] = useState([]);
  const [roads, setRoads] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  // Selections
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [selectedRoads, setSelectedRoads] = useState([]); // [{ roadId, roadName, roadGeometryVersionId, segments: [...] }]
  const [trimmedAssignments, setTrimmedAssignments] = useState({}); // key = roadId -> { startPct: 0, endPct: 100, bufferMeters: 100 }
  const [scheduledStartAt, setScheduledStartAt] = useState(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() + 1); // 1 minute in future default
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  });

  // Load fleet and roads for this ULB
  useEffect(() => {
    if (isOpen && ulbId) {
      setLoading(true);
      setErrorMessage(null);
      setStep(1);
      setSelectedVehicle(null);
      setSelectedRoads([]);
      setTrimmedAssignments({});

      Promise.all([fetchOfficerFleet(ulbId), fetchOfficerRoads(ulbId)]).then(([fleetData, roadData]) => {
        setFleet(fleetData || []);
        setRoads(roadData || []);
        setLoading(false);
      });
    }
  }, [isOpen, ulbId]);

  // Compute road coordinates for map view in step 3 (defined before any early return)
  const activeRoadForTrimming = selectedRoads[0] || null;
  const activeTrimConfig = activeRoadForTrimming ? (trimmedAssignments[activeRoadForTrimming.roadId] || { startPct: 0, endPct: 100, bufferMeters: 100 }) : { startPct: 0, endPct: 100, bufferMeters: 100 };
  const rawCoords = activeRoadForTrimming?.coordinates || [];
  const displayCoords = useMemo(() => {
    return trimCoordinates(rawCoords, activeTrimConfig.startPct, activeTrimConfig.endPct);
  }, [rawCoords, activeTrimConfig.startPct, activeTrimConfig.endPct]);

  if (!isOpen) return null;

  // Validation
  const canProceed = () => {
    if (step === 1) return selectedVehicle != null && !selectedVehicle.hasActiveReservation;
    if (step === 2) return selectedRoads.length > 0;
    if (step === 3) return true;
    if (step === 4) return Boolean(scheduledStartAt);
    if (step === 5) return !submitting;
    return false;
  };

  const handleToggleRoad = (road) => {
    const exists = selectedRoads.find(r => r.roadId === road.roadId);
    if (exists) {
      setSelectedRoads(selectedRoads.filter(r => r.roadId !== road.roadId));
    } else {
      setSelectedRoads([...selectedRoads, road]);
      if (!trimmedAssignments[road.roadId]) {
        setTrimmedAssignments(prev => ({
          ...prev,
          [road.roadId]: { startPct: 0, endPct: 100, bufferMeters: 100 }
        }));
      }
    }
  };

  const handleTrimChange = (roadId, key, value) => {
    setTrimmedAssignments(prev => ({
      ...prev,
      [roadId]: {
        ...(prev[roadId] || { startPct: 0, endPct: 100, bufferMeters: 100 }),
        [key]: Number(value)
      }
    }));
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setErrorMessage(null);

    const roadAssignmentsDto = selectedRoads.map((r, idx) => {
      const trim = trimmedAssignments[r.roadId] || { startPct: 0, endPct: 100, bufferMeters: 100 };
      const isTrimmed = (trim.startPct > 0) || (trim.endPct < 100);
      const rawCoords = r.coordinates && r.coordinates.length >= 2
        ? r.coordinates
        : [[20.955845, 77.764415], [20.956396, 77.763289]];
      const finalCoords = isTrimmed ? trimCoordinates(rawCoords, trim.startPct, trim.endPct) : rawCoords;
      const customWkt = coordsToWkt(finalCoords);

      return {
        roadId: r.roadId,
        roadGeometryVersionId: r.roadGeometryVersionId || 1,
        roadSegmentId: r.segments?.[0]?.roadSegmentId || null,
        bufferMeters: trim.bufferMeters || 100.0,
        assignmentType: isTrimmed ? "CUSTOM_SUBSEGMENT" : "DEFAULT_SEGMENT",
        assignedOrder: idx + 1,
        customGeometryWkt: customWkt
      };
    });

    const payload = {
      ulbId,
      vehicleId: selectedVehicle.vehicleId,
      name: `Inspection Mission (${selectedVehicle?.vehicleRegistrationNumber || ulbId})`,
      scheduledStartAt: new Date(scheduledStartAt).toISOString(),
      roadAssignments: roadAssignmentsDto
    };

    const res = await createOfficerSession(payload);
    setSubmitting(false);

    if (res.ok) {
      onCreated?.(res.data);
      onClose();
    } else {
      setErrorMessage(res.data?.message || res.data?.error || "Failed to create operational session.");
    }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.75)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      backdropFilter: 'blur(3px)',
    }}>
      <div style={{
        width: '880px',
        maxWidth: '95vw',
        height: '620px',
        maxHeight: '92vh',
        background: 'var(--bg-panel)',
        border: '1px solid var(--border-active)',
        borderRadius: '4px',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 12px 36px rgba(0,0,0,0.6)',
        overflow: 'hidden',
      }}>
        {/* Modal Header */}
        <div style={{
          padding: '10px 16px',
          background: 'var(--bg-elevated)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '14px' }}>🚦</span>
            <span style={{ fontFamily: 'var(--text-mono)', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-primary)' }}>
              NEW OPERATIONAL MISSION — {ulbName || ulbId}
            </span>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: '14px', cursor: 'pointer', padding: '2px 6px' }}
          >
            ✕
          </button>
        </div>

        {/* Step Indicator Ribbon */}
        <div style={{
          display: 'flex',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-base)',
        }}>
          {[
            { n: 1, label: '1. VEHICLE' },
            { n: 2, label: '2. ROADS' },
            { n: 3, label: '3. TRIM & BUFFER' },
            { n: 4, label: '4. SCHEDULE' },
            { n: 5, label: '5. REVIEW' },
          ].map(s => (
            <div
              key={s.n}
              style={{
                flex: 1,
                padding: '7px 4px',
                textAlign: 'center',
                fontFamily: 'var(--text-mono)',
                fontSize: '9px',
                fontWeight: step === s.n ? 700 : 400,
                color: step === s.n ? 'var(--accent)' : step > s.n ? 'var(--status-ok)' : 'var(--text-dim)',
                borderBottom: `2px solid ${step === s.n ? 'var(--accent)' : step > s.n ? 'var(--status-ok)' : 'transparent'}`,
                background: step === s.n ? 'var(--bg-elevated)' : 'none',
              }}
            >
              {s.label}
            </div>
          ))}
        </div>

        {/* Error Message Banner */}
        {errorMessage && (
          <div style={{
            padding: '8px 16px',
            background: 'rgba(239,35,60,0.15)',
            borderBottom: '1px solid var(--status-err)',
            color: 'var(--status-err)',
            fontFamily: 'var(--text-mono)',
            fontSize: '9.5px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}>
            <span>⚠</span>
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Content Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column' }}>
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', fontFamily: 'var(--text-mono)', fontSize: '11px', color: 'var(--text-dim)' }}>
              Loading ULB fleet and road registry...
            </div>
          ) : (
            <>
              {/* STEP 1: SELECT VEHICLE */}
              {step === 1 && (
                <div>
                  <div style={{ fontFamily: 'var(--text-mono)', fontSize: '9px', fontWeight: 700, color: 'var(--text-dim)', letterSpacing: '0.08em', marginBottom: '10px' }}>
                    SELECT VEHICLE FOR THIS MISSION ({fleet.length} AVAILABLE IN {ulbId})
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '8px' }}>
                    {fleet.map(v => {
                      const isSelected = selectedVehicle?.vehicleId === v.vehicleId;
                      const isReserved = v.hasActiveReservation;
                      return (
                        <div
                          key={v.vehicleId}
                          onClick={() => { if (!isReserved) setSelectedVehicle(v); }}
                          style={{
                            padding: '10px 12px',
                            background: isSelected ? 'var(--bg-elevated)' : 'var(--bg-base)',
                            border: `1px solid ${isSelected ? 'var(--accent)' : isReserved ? 'var(--border)' : 'var(--border-mid)'}`,
                            borderRadius: '3px',
                            cursor: isReserved ? 'not-allowed' : 'pointer',
                            opacity: isReserved ? 0.5 : 1,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontFamily: 'var(--text-mono)', fontSize: '11px', fontWeight: 700, color: isSelected ? 'var(--accent)' : 'var(--text-primary)' }}>
                              {v.vehicleRegistrationNumber}
                            </span>
                            {isReserved ? (
                              <span style={{ fontFamily: 'var(--text-mono)', fontSize: '7.5px', color: 'var(--status-warn)', background: 'rgba(255,183,3,0.1)', padding: '1px 4px', borderRadius: '2px' }}>
                                RESERVED ({v.activeReservationSessionCode || 'ACTIVE'})
                              </span>
                            ) : (
                              <span style={{ fontFamily: 'var(--text-mono)', fontSize: '7.5px', color: 'var(--status-ok)', background: 'rgba(45,198,83,0.1)', padding: '1px 4px', borderRadius: '2px' }}>
                                READY
                              </span>
                            )}
                          </div>
                          <div style={{ fontFamily: 'var(--text-mono)', fontSize: '8.5px', color: 'var(--text-dim)' }}>
                            Type: {v.vehicleType} · Capacity: {v.capacityTons || 5}T
                          </div>
                          <div style={{ fontFamily: 'var(--text-mono)', fontSize: '8px', color: 'var(--text-dim)', display: 'flex', justifyContent: 'space-between' }}>
                            <span>Device: {v.assignedDeviceCode || 'N/A'}</span>
                            <span style={{ color: v.isOnline ? 'var(--status-ok)' : 'var(--text-dim)' }}>
                              {v.isOnline ? '● Online' : '○ Offline'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* STEP 2: SELECT ROADS */}
              {step === 2 && (
                <div>
                  <div style={{ fontFamily: 'var(--text-mono)', fontSize: '9px', fontWeight: 700, color: 'var(--text-dim)', letterSpacing: '0.08em', marginBottom: '10px' }}>
                    SELECT ROADS FOR MUNICIPAL COVERAGE ({selectedRoads.length} SELECTED)
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {roads.map(r => {
                      const isSelected = selectedRoads.some(x => x.roadId === r.roadId);
                      return (
                        <div
                          key={r.roadId}
                          onClick={() => handleToggleRoad(r)}
                          style={{
                            padding: '8px 12px',
                            background: isSelected ? 'var(--bg-elevated)' : 'var(--bg-base)',
                            border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                            borderRadius: '3px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {}}
                              style={{ cursor: 'pointer' }}
                            />
                            <div>
                              <span style={{ fontFamily: 'var(--text-mono)', fontSize: '10.5px', fontWeight: 700, color: 'var(--text-primary)' }}>
                                {r.roadName}
                              </span>
                              <span style={{ fontFamily: 'var(--text-mono)', fontSize: '8.5px', color: 'var(--text-dim)', marginLeft: '8px' }}>
                                [{r.roadCode}] · {r.roadType || 'PRIMARY'}
                              </span>
                            </div>
                          </div>
                          <div style={{ fontFamily: 'var(--text-mono)', fontSize: '9px', color: 'var(--text-secondary)' }}>
                            Length: <strong>{r.calculatedLengthMeters ? `${r.calculatedLengthMeters.toFixed(0)}m` : '1.2km'}</strong>
                            {r.segments?.length > 0 && ` (${r.segments.length} segments)`}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* STEP 3: TRIM ASSIGNMENTS & BUFFER */}
              {step === 3 && (
                <div style={{ flex: 1, display: 'flex', gap: '14px', minHeight: 0 }}>
                  {/* Left: Controls */}
                  <div style={{ width: '320px', display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto' }}>
                    <div style={{ fontFamily: 'var(--text-mono)', fontSize: '9px', fontWeight: 700, color: 'var(--text-dim)', letterSpacing: '0.08em' }}>
                      TRIM GEOMETRY & CONFIGURE BUFFER
                    </div>
                    <div style={{ fontFamily: 'var(--text-mono)', fontSize: '8px', color: 'var(--text-dim)', lineHeight: 1.5 }}>
                      Shorten start/end of the road assignment where necessary. Master road geometry remains completely immutable.
                    </div>

                    {selectedRoads.map(r => {
                      const trim = trimmedAssignments[r.roadId] || { startPct: 0, endPct: 100, bufferMeters: 100 };
                      return (
                        <div
                          key={r.roadId}
                          style={{
                            padding: '10px',
                            background: 'var(--bg-base)',
                            border: '1px solid var(--border)',
                            borderRadius: '3px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px',
                          }}
                        >
                          <div style={{ fontFamily: 'var(--text-mono)', fontSize: '10px', fontWeight: 700, color: 'var(--text-primary)' }}>
                            {r.roadName}
                          </div>
                          <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--text-mono)', fontSize: '8px', color: 'var(--text-dim)' }}>
                              <span>Trim Start: {trim.startPct}%</span>
                              <span>Trim End: {trim.endPct}%</span>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max="40"
                              value={trim.startPct}
                              onChange={e => handleTrimChange(r.roadId, 'startPct', e.target.value)}
                              style={{ width: '100%' }}
                            />
                            <input
                              type="range"
                              min="60"
                              max="100"
                              value={trim.endPct}
                              onChange={e => handleTrimChange(r.roadId, 'endPct', e.target.value)}
                              style={{ width: '100%' }}
                            />
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontFamily: 'var(--text-mono)', fontSize: '8.5px', color: 'var(--text-dim)' }}>
                              Buffer: {trim.bufferMeters}m
                            </span>
                            <select
                              value={trim.bufferMeters}
                              onChange={e => handleTrimChange(r.roadId, 'bufferMeters', e.target.value)}
                              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontFamily: 'var(--text-mono)', fontSize: '8.5px', padding: '2px 4px' }}
                            >
                              <option value="50">50m</option>
                              <option value="100">100m (Standard)</option>
                              <option value="150">150m</option>
                              <option value="200">200m</option>
                            </select>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Right: Leaflet Map Preview */}
                  <div style={{ flex: 1, border: '1px solid var(--border)', borderRadius: '3px', overflow: 'hidden', minHeight: '300px' }}>
                    {displayCoords.length > 0 ? (
                      <MapContainer
                        center={[displayCoords[0][0], displayCoords[0][1]]}
                        zoom={14}
                        style={{ width: '100%', height: '100%', background: 'var(--bg-base)' }}
                        attributionControl={false}
                      >
                        <TileLayer url={cartoTileUrl(theme)} />
                        <MapAutoFit coordinates={displayCoords} />
                        {/* Buffer preview (approximate outer line) */}
                        <Polyline
                          positions={displayCoords}
                          pathOptions={{ color: '#00b4d8', weight: 14, opacity: 0.25, lineCap: 'round' }}
                        />
                        {/* Trimmed road centerline */}
                        <Polyline
                          positions={displayCoords}
                          pathOptions={{ color: '#00b4d8', weight: 4, opacity: 0.9 }}
                        />
                        <CircleMarker
                          center={[displayCoords[0][0], displayCoords[0][1]]}
                          radius={5}
                          pathOptions={{ color: '#2dc653', fillColor: '#2dc653', fillOpacity: 1 }}
                        />
                        <CircleMarker
                          center={[displayCoords[displayCoords.length - 1][0], displayCoords[displayCoords.length - 1][1]]}
                          radius={5}
                          pathOptions={{ color: '#ef233c', fillColor: '#ef233c', fillOpacity: 1 }}
                        />
                      </MapContainer>
                    ) : (
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--text-mono)', fontSize: '9px', color: 'var(--text-dim)' }}>
                        Select a road to preview geometry on map
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* STEP 4: SET START TIME */}
              {step === 4 && (
                <div style={{ maxWidth: '420px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ fontFamily: 'var(--text-mono)', fontSize: '10px', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '0.08em' }}>
                    MISSION START SCHEDULE
                  </div>
                  <div>
                    <label style={{ fontFamily: 'var(--text-mono)', fontSize: '8.5px', color: 'var(--text-dim)', display: 'block', marginBottom: '4px' }}>
                      SCHEDULED START TIME (LOCAL):
                    </label>
                    <input
                      type="datetime-local"
                      value={scheduledStartAt}
                      onChange={e => setScheduledStartAt(e.target.value)}
                      onClick={e => e.target.showPicker?.()}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        background: 'var(--bg-base)',
                        border: '1px solid var(--border-active)',
                        color: 'var(--text-primary)',
                        fontFamily: 'var(--text-mono)',
                        fontSize: '11px',
                        borderRadius: '3px',
                        outline: 'none',
                        colorScheme: 'dark',
                        cursor: 'pointer',
                      }}
                    />
                  </div>
                  <div style={{
                    padding: '10px 12px',
                    background: 'rgba(0,180,216,0.08)',
                    border: '1px solid rgba(0,180,216,0.25)',
                    borderRadius: '3px',
                    fontFamily: 'var(--text-mono)',
                    fontSize: '8.5px',
                    color: 'var(--text-secondary)',
                    lineHeight: 1.6,
                  }}>
                    <strong style={{ color: 'var(--accent)' }}>ℹ LOCKED DOMAIN RULE:</strong>
                    <br />
                    There is NO scheduled end time. The session begins automatically when <strong>ScheduledStartAt</strong> is reached, and finishes automatically when all assigned roads reach <strong>100% evidence-backed coverage</strong> (or via explicit officer completion).
                  </div>
                </div>
              )}

              {/* STEP 5: REVIEW & CONFIRM */}
              {step === 5 && (
                <div style={{ maxWidth: '520px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ fontFamily: 'var(--text-mono)', fontSize: '10px', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '0.08em' }}>
                    CONFIRM OPERATIONAL MISSION
                  </div>
                  <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: '3px', padding: '12px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', rowGap: '6px', fontFamily: 'var(--text-mono)', fontSize: '9px' }}>
                      <span style={{ color: 'var(--text-dim)' }}>MUNICIPALITY:</span>
                      <strong style={{ color: 'var(--text-primary)' }}>{ulbName || ulbId}</strong>

                      <span style={{ color: 'var(--text-dim)' }}>VEHICLE:</span>
                      <strong style={{ color: 'var(--text-primary)' }}>{selectedVehicle?.vehicleRegistrationNumber} ({selectedVehicle?.vehicleType})</strong>

                      <span style={{ color: 'var(--text-dim)' }}>DEVICE:</span>
                      <span style={{ color: 'var(--text-secondary)' }}>{selectedVehicle?.assignedDeviceCode || 'Assigned via Vehicle'}</span>

                      <span style={{ color: 'var(--text-dim)' }}>SCHEDULED START:</span>
                      <strong style={{ color: 'var(--status-ok)' }}>{new Date(scheduledStartAt).toLocaleString()}</strong>

                      <span style={{ color: 'var(--text-dim)' }}>TOTAL ROADS:</span>
                      <span style={{ color: 'var(--text-primary)' }}>{selectedRoads.length} assigned road segment(s)</span>
                    </div>
                  </div>

                  <div style={{ fontFamily: 'var(--text-mono)', fontSize: '8.5px', color: 'var(--text-dim)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {selectedRoads.map((r, idx) => {
                      const trim = trimmedAssignments[r.roadId] || { startPct: 0, endPct: 100, bufferMeters: 100 };
                      const isTrimmed = trim.startPct > 0 || trim.endPct < 100;
                      return (
                        <div key={r.roadId} style={{ padding: '6px 8px', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: '2px', display: 'flex', justifyContent: 'space-between' }}>
                          <span>#{idx + 1} {r.roadName} {isTrimmed && `(Trimmed: ${trim.startPct}%–${trim.endPct}%)`}</span>
                          <span>Buffer: {trim.bufferMeters}m</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Footer Controls */}
        <div style={{
          padding: '10px 16px',
          background: 'var(--bg-elevated)',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          {step > 1 ? (
            <button
              onClick={() => setStep(step - 1)}
              style={{
                padding: '5px 14px',
                fontFamily: 'var(--text-mono)',
                fontSize: '9.5px',
                background: 'var(--bg-base)',
                border: '1px solid var(--border)',
                color: 'var(--text-dim)',
                cursor: 'pointer',
                borderRadius: '2px',
              }}
            >
              ← Back
            </button>
          ) : <div />}

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={onClose}
              style={{
                padding: '5px 14px',
                fontFamily: 'var(--text-mono)',
                fontSize: '9.5px',
                background: 'none',
                border: '1px solid var(--border)',
                color: 'var(--text-dim)',
                cursor: 'pointer',
                borderRadius: '2px',
              }}
            >
              Cancel
            </button>

            {step < 5 ? (
              <button
                disabled={!canProceed()}
                onClick={() => setStep(step + 1)}
                style={{
                  padding: '5px 18px',
                  fontFamily: 'var(--text-mono)',
                  fontSize: '9.5px',
                  fontWeight: 700,
                  background: canProceed() ? 'var(--accent)' : 'var(--bg-base)',
                  border: `1px solid ${canProceed() ? 'var(--accent)' : 'var(--border)'}`,
                  color: canProceed() ? '#fff' : 'var(--text-dim)',
                  cursor: canProceed() ? 'pointer' : 'not-allowed',
                  borderRadius: '2px',
                }}
              >
                Next →
              </button>
            ) : (
              <button
                disabled={submitting}
                onClick={handleSubmit}
                style={{
                  padding: '5px 22px',
                  fontFamily: 'var(--text-mono)',
                  fontSize: '9.5px',
                  fontWeight: 700,
                  background: submitting ? 'var(--bg-base)' : 'var(--status-ok)',
                  border: `1px solid ${submitting ? 'var(--border)' : 'var(--status-ok)'}`,
                  color: '#fff',
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  borderRadius: '2px',
                }}
              >
                {submitting ? 'CREATING MISSION...' : '✓ CREATE OPERATIONAL SESSION'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
