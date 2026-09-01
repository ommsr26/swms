/**
 * SessionControlDrawer.jsx — Active/Scheduled/Paused Session Live Operations Panel.
 *
 * Provides:
 *   - Status bar & operational actions: PAUSE, RESUME, COMPLETE, ABORT, CANCEL
 *   - Mandatory abort reason modal
 *   - Live telemetry & speed fusion monitoring (auto-refreshing every 2s)
 *   - Proximity evaluation (distance in real meters, buffer check, 5 km/h threshold, arming readiness)
 *   - Road-by-road coverage progress
 *   - Leaflet map with assigned straight road geometry, 14 building polygons, and vehicle marker
 */
import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Polyline, Polygon, CircleMarker, Marker, Popup, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { useTheme, cartoTileUrl } from '../../ThemeContext.jsx';
import { SessionStatusPill } from '../common/StatusBadge.jsx';
import {
  fetchOfficerSessionLiveStatus,
  fetchGisHouses,
  pauseOfficerSession,
  resumeOfficerSession,
  completeOfficerSession,
  abortOfficerSession,
  cancelOfficerSession,
} from '../../telemetry/backendApiClient.js';
import { createFleetIcon, createOfflineFleetIcon } from '../fleet/VehicleMarker.jsx';

const DEFAULT_STRAIGHT_ROAD = [
  [20.955845, 77.764415],
  [20.956396, 77.763289]
];

function formatLocalTime(dateStr, includeSeconds = false) {
  if (!dateStr) return '—';
  const iso = dateStr.endsWith('Z') || dateStr.includes('+') ? dateStr : `${dateStr}Z`;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    ...(includeSeconds ? { second: '2-digit' } : {}),
    hour12: true
  });
}

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

export default function SessionControlDrawer({ sessionId, ulbId, isOpen, onClose, onStateChanged }) {
  const { theme } = useTheme();

  const [data, setData] = useState(null);
  const [houses, setHouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  // Modals for complete & abort
  const [showAbortModal, setShowAbortModal] = useState(false);
  const [abortReasonPreset, setAbortReasonPreset] = useState('VEHICLE_BREAKDOWN');
  const [abortCustomText, setAbortCustomText] = useState('');

  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [completeReason, setCompleteReason] = useState('OFFICER_NORMAL');

  // Load session status & houses
  const refreshStatus = () => {
    if (!sessionId || !isOpen) return;
    fetchOfficerSessionLiveStatus(sessionId, ulbId).then(res => {
      setData(res);
      setLoading(false);
    });
    fetchGisHouses(ulbId || 'ULB_MH_AMRAVATI', sessionId).then(h => {
      setHouses(h || []);
    });
  };

  useEffect(() => {
    if (isOpen && sessionId) {
      setLoading(true);
      setErrorMessage(null);
      refreshStatus();

      // High-precision 2-second polling for active sessions
      const interval = setInterval(refreshStatus, 2000);
      return () => clearInterval(interval);
    }
  }, [isOpen, sessionId, ulbId]);

  if (!isOpen) return null;

  const status = data?.status || 'SCHEDULED';
  const vehicle = data?.vehicle;
  const proximity = data?.proximity;
  const coverage = data?.coverage;
  const rawRoads = data?.assignedRoads || [];

  // Guarantee straight road linestring geometry
  const roads = rawRoads.map(r => {
    const coords = r.coordinates && r.coordinates.length === 2 ? r.coordinates : DEFAULT_STRAIGHT_ROAD;
    return { ...r, coordinates: coords };
  });

  const allRoadCoords = roads.flatMap(r => r.coordinates || []).length > 0
    ? roads.flatMap(r => r.coordinates || [])
    : DEFAULT_STRAIGHT_ROAD;

  // Action Handlers
  const handlePause = async () => {
    setActionLoading(true);
    setErrorMessage(null);
    const res = await pauseOfficerSession(sessionId, ulbId);
    setActionLoading(false);
    if (res.success) {
      refreshStatus();
      onStateChanged?.();
    } else {
      setErrorMessage(res.message || "Failed to pause session.");
    }
  };

  const handleResume = async () => {
    setActionLoading(true);
    setErrorMessage(null);
    const res = await resumeOfficerSession(sessionId, ulbId);
    setActionLoading(false);
    if (res.success) {
      refreshStatus();
      onStateChanged?.();
    } else {
      setErrorMessage(res.message || "Failed to resume session.");
    }
  };

  const handleCancel = async () => {
    if (!window.confirm("Are you sure you want to cancel this scheduled session?")) return;
    setActionLoading(true);
    setErrorMessage(null);
    const res = await cancelOfficerSession(sessionId, ulbId);
    setActionLoading(false);
    if (res.success) {
      refreshStatus();
      onStateChanged?.();
    } else {
      setErrorMessage(res.message || "Failed to cancel session.");
    }
  };

  const handleCompleteSubmit = async () => {
    setActionLoading(true);
    setErrorMessage(null);
    const res = await completeOfficerSession(sessionId, ulbId, completeReason);
    setActionLoading(false);
    setShowCompleteModal(false);
    if (res.success) {
      refreshStatus();
      onStateChanged?.();
    } else {
      setErrorMessage(res.message || "Failed to complete session.");
    }
  };

  const handleAbortSubmit = async () => {
    const finalReason = abortReasonPreset === 'CUSTOM' ? abortCustomText.trim() : `${abortReasonPreset}: ${abortCustomText.trim()}`;
    if (!finalReason) {
      setErrorMessage("Abort reason is mandatory.");
      return;
    }

    setActionLoading(true);
    setErrorMessage(null);
    const res = await abortOfficerSession(sessionId, ulbId, finalReason);
    setActionLoading(false);
    setShowAbortModal(false);
    if (res.success) {
      refreshStatus();
      onStateChanged?.();
    } else {
      setErrorMessage(res.message || "Failed to abort session.");
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      right: 0,
      bottom: 0,
      width: '540px',
      maxWidth: '92vw',
      background: 'var(--bg-panel)',
      borderLeft: '1px solid var(--border-active)',
      boxShadow: '-8px 0 32px rgba(0,0,0,0.5)',
      zIndex: 9998,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 14px',
        background: 'var(--bg-elevated)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <SessionStatusPill status={status} />
          <div>
            <div style={{ fontFamily: 'var(--text-mono)', fontSize: '11px', fontWeight: 700, color: 'var(--text-primary)' }}>
              {data?.sessionCode || `Session #${sessionId}`}
            </div>
            <div style={{ fontFamily: 'var(--text-mono)', fontSize: '8px', color: 'var(--text-dim)' }}>
              Vehicle: {vehicle?.vehicleRegistrationNumber || 'N/A'} · ULB: {ulbId}
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: '16px', cursor: 'pointer', padding: '2px 6px' }}
        >
          ✕
        </button>
      </div>

      {/* Action Command Bar */}
      <div style={{
        padding: '8px 14px',
        background: 'var(--bg-base)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        flexShrink: 0,
      }}>
        {status === 'SCHEDULED' && (
          <button
            disabled={actionLoading}
            onClick={handleCancel}
            style={{
              padding: '4px 12px',
              fontFamily: 'var(--text-mono)',
              fontSize: '8.5px',
              fontWeight: 700,
              background: 'none',
              border: '1px solid var(--status-err)',
              color: 'var(--status-err)',
              cursor: 'pointer',
              borderRadius: '2px',
            }}
          >
            ✕ CANCEL SCHEDULED MISSION
          </button>
        )}

        {status === 'ACTIVE' && (
          <>
            <button
              disabled={actionLoading}
              onClick={handlePause}
              style={{
                padding: '4px 12px',
                fontFamily: 'var(--text-mono)',
                fontSize: '8.5px',
                fontWeight: 700,
                background: 'rgba(255,183,3,0.15)',
                border: '1px solid var(--status-warn)',
                color: 'var(--status-warn)',
                cursor: 'pointer',
                borderRadius: '2px',
              }}
            >
              ⏸ PAUSE
            </button>
            <button
              disabled={actionLoading}
              onClick={() => setShowCompleteModal(true)}
              style={{
                padding: '4px 12px',
                fontFamily: 'var(--text-mono)',
                fontSize: '8.5px',
                fontWeight: 700,
                background: 'rgba(45,198,83,0.15)',
                border: '1px solid var(--status-ok)',
                color: 'var(--status-ok)',
                cursor: 'pointer',
                borderRadius: '2px',
              }}
            >
              ✓ COMPLETE
            </button>
            <button
              disabled={actionLoading}
              onClick={() => setShowAbortModal(true)}
              style={{
                padding: '4px 12px',
                fontFamily: 'var(--text-mono)',
                fontSize: '8.5px',
                fontWeight: 700,
                background: 'rgba(239,35,60,0.15)',
                border: '1px solid var(--status-err)',
                color: 'var(--status-err)',
                cursor: 'pointer',
                borderRadius: '2px',
              }}
            >
              ⏹ ABORT
            </button>
          </>
        )}

        {status === 'PAUSED' && (
          <>
            <button
              disabled={actionLoading}
              onClick={handleResume}
              style={{
                padding: '4px 12px',
                fontFamily: 'var(--text-mono)',
                fontSize: '8.5px',
                fontWeight: 700,
                background: 'rgba(0,180,216,0.15)',
                border: '1px solid var(--accent)',
                color: 'var(--accent)',
                cursor: 'pointer',
                borderRadius: '2px',
              }}
            >
              ▶ RESUME
            </button>
            <button
              disabled={actionLoading}
              onClick={() => setShowAbortModal(true)}
              style={{
                padding: '4px 12px',
                fontFamily: 'var(--text-mono)',
                fontSize: '8.5px',
                fontWeight: 700,
                background: 'rgba(239,35,60,0.15)',
                border: '1px solid var(--status-err)',
                color: 'var(--status-err)',
                cursor: 'pointer',
                borderRadius: '2px',
              }}
            >
              ⏹ ABORT
            </button>
          </>
        )}

        {(status === 'COMPLETED' || status === 'ABORTED' || status === 'CANCELLED') && (
          <div style={{ fontFamily: 'var(--text-mono)', fontSize: '8.5px', color: 'var(--text-dim)' }}>
            Session is in terminal state ({status})
            {data?.completionReason && ` · Reason: ${data.completionReason}`}
            {data?.abortReason && ` · Reason: ${data.abortReason}`}
          </div>
        )}
      </div>

      {/* Error Alert */}
      {errorMessage && (
        <div style={{
          padding: '6px 14px',
          background: 'rgba(239,35,60,0.2)',
          borderBottom: '1px solid var(--status-err)',
          color: 'var(--status-err)',
          fontFamily: 'var(--text-mono)',
          fontSize: '9px',
        }}>
          ⚠ {errorMessage}
        </div>
      )}

      {/* Main Drawer Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', fontFamily: 'var(--text-mono)', fontSize: '10px', color: 'var(--text-dim)' }}>
            Connecting to operational session telemetry...
          </div>
        ) : (
          <>
            {/* Live Operational Diagnostics Card */}
            <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: '3px', padding: '10px 12px' }}>
              <div style={{ fontFamily: 'var(--text-mono)', fontSize: '8.5px', fontWeight: 700, color: 'var(--text-dim)', letterSpacing: '0.08em', marginBottom: '8px' }}>
                OPERATIONAL TELEMETRY & PROXIMITY
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontFamily: 'var(--text-mono)', fontSize: '9px' }}>
                <div style={{ background: 'var(--bg-elevated)', padding: '6px 8px', borderRadius: '2px' }}>
                  <span style={{ color: 'var(--text-dim)', display: 'block', fontSize: '7.5px' }}>VEHICLE SPEED</span>
                  <strong style={{ fontSize: '13px', color: proximity?.isBelowArmingSpeed ? 'var(--status-ok)' : 'var(--status-warn)' }}>
                    {vehicle?.lastKnownSpeedKmh != null ? `${vehicle.lastKnownSpeedKmh.toFixed(1)} km/h` : '0.0 km/h'}
                  </strong>
                  <span style={{ fontSize: '7.5px', color: 'var(--text-dim)', marginLeft: '4px' }}>
                    ({proximity?.isBelowArmingSpeed ? '≤ 5 km/h OK' : '> 5 km/h FAST'})
                  </span>
                </div>

                <div style={{ background: 'var(--bg-elevated)', padding: '6px 8px', borderRadius: '2px' }}>
                  <span style={{ color: 'var(--text-dim)', display: 'block', fontSize: '7.5px' }}>ROAD DISTANCE</span>
                  <strong style={{ fontSize: '13px', color: proximity?.isWithinOperationalBoundary ? 'var(--status-ok)' : 'var(--status-err)' }}>
                    {proximity?.distanceMeters != null ? `${proximity.distanceMeters.toFixed(1)} m` : '—'}
                  </strong>
                  <span style={{ fontSize: '7.5px', color: 'var(--text-dim)', marginLeft: '4px' }}>
                    ({proximity?.isWithinOperationalBoundary ? '≤ 100m BOUNDARY' : 'OUTSIDE'})
                  </span>
                </div>
              </div>

              {/* Arming Readiness Indicator */}
              <div style={{
                marginTop: '8px',
                padding: '6px 8px',
                background: proximity?.isEligibleForArming ? 'rgba(45,198,83,0.1)' : 'rgba(255,183,3,0.08)',
                border: `1px solid ${proximity?.isEligibleForArming ? 'var(--status-ok)' : 'var(--border)'}`,
                borderRadius: '2px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontFamily: 'var(--text-mono)',
                fontSize: '8.5px',
              }}>
                <span>CAMERA MOTION ARMING:</span>
                <strong style={{ color: proximity?.isEligibleForArming ? 'var(--status-ok)' : 'var(--text-dim)' }}>
                  {proximity?.isEligibleForArming ? '● ARMED & READY' : '○ DISARMED'}
                </strong>
              </div>
            </div>

            {/* Coverage Progress Card */}
            <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: '3px', padding: '10px 12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <span style={{ fontFamily: 'var(--text-mono)', fontSize: '8.5px', fontWeight: 700, color: 'var(--text-dim)', letterSpacing: '0.08em' }}>
                  OVERALL ROAD COVERAGE
                </span>
                <span style={{ fontFamily: 'var(--text-mono)', fontSize: '11px', fontWeight: 700, color: coverage?.overallCoveragePercentage >= 100 ? 'var(--status-ok)' : 'var(--accent)' }}>
                  {coverage?.overallCoveragePercentage != null ? `${coverage.overallCoveragePercentage.toFixed(1)}%` : '0.0%'}
                </span>
              </div>

              {/* Progress Bar */}
              <div style={{ height: '6px', background: 'var(--bg-elevated)', borderRadius: '2px', overflow: 'hidden', marginBottom: '10px' }}>
                <div style={{
                  height: '100%',
                  width: `${Math.min(100, coverage?.overallCoveragePercentage || 0)}%`,
                  background: coverage?.overallCoveragePercentage >= 100 ? 'var(--status-ok)' : 'var(--accent)',
                  transition: 'width 0.3s ease',
                }} />
              </div>

              {/* Individual Road Breakdown */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {coverage?.assignments?.map((a, idx) => (
                  <div
                    key={a.sessionRoadAssignmentId}
                    style={{
                      padding: '6px 8px',
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border)',
                      borderRadius: '2px',
                      fontFamily: 'var(--text-mono)',
                      fontSize: '8.5px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                      <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                        #{idx + 1} {a.roadName} {a.segmentName && `(${a.segmentName})`}
                      </span>
                      <strong style={{ color: a.isCompleted ? 'var(--status-ok)' : 'var(--accent)' }}>
                        {a.coveragePercentage.toFixed(1)}%
                      </strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-dim)', fontSize: '7.5px' }}>
                      <span>Covered: {a.coveredLengthMeters.toFixed(0)}m / {a.assignedLengthMeters.toFixed(0)}m</span>
                      <span>{a.isCompleted ? '✓ COMPLETED' : 'IN PROGRESS'}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Leaflet Map Mini-View */}
            <div style={{ height: '240px', border: '1px solid var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
              {allRoadCoords.length > 0 ? (
                <MapContainer
                  center={[allRoadCoords[0][0], allRoadCoords[0][1]]}
                  zoom={14}
                  style={{ width: '100%', height: '100%', background: 'var(--bg-base)' }}
                  attributionControl={false}
                >
                  <TileLayer url={cartoTileUrl(theme)} />
                  <MapAutoFit coordinates={allRoadCoords} />

                  {/* Render 14 GIS Houses Footprints */}
                  {houses.map(h => {
                    const houseColor = h.status === 'COLLECTED'
                      ? '#2dc653'
                      : h.status === 'INTERSECTED'
                      ? '#74c69d'
                      : '#ef233c';

                    return (
                      <Polygon
                        key={h.houseId}
                        positions={h.polygon}
                        pathOptions={{
                          color: houseColor,
                          fillColor: houseColor,
                          fillOpacity: h.status === 'NOT_COLLECTED' ? 0.35 : 0.65,
                          weight: 1.5,
                        }}
                      >
                        <Tooltip sticky direction="top">
                          <div style={{ fontFamily: 'var(--text-mono)', fontSize: '8.5px' }}>
                            <strong>{h.address}</strong>
                            <br />Status: <span style={{ color: houseColor, fontWeight: 700 }}>{h.status}</span>
                            {h.collectionEventsCount > 0 && ` (${h.collectionEventsCount} events)`}
                          </div>
                        </Tooltip>
                      </Polygon>
                    );
                  })}

                  {/* Render Assigned Road Segments */}
                  {roads.map(r => (
                    <div key={r.sessionRoadAssignmentId || Math.random()}>
                      {/* Operational Buffer preview */}
                      <Polyline
                        positions={r.coordinates}
                        pathOptions={{ color: '#00b4d8', weight: 16, opacity: 0.22, lineCap: 'round' }}
                      />
                      {/* Road centerline */}
                      <Polyline
                        positions={r.coordinates}
                        pathOptions={{ color: '#00b4d8', weight: 4, opacity: 0.95 }}
                      />
                    </div>
                  ))}

                  {/* Render Live Vehicle Marker if position available */}
                  {vehicle?.lastKnownLatitude != null && vehicle?.lastKnownLongitude != null && (
                    <Marker
                      position={[vehicle.lastKnownLatitude, vehicle.lastKnownLongitude]}
                      icon={createFleetIcon(vehicle.lastKnownHeadingDeg || 0, '#2dc653')}
                    >
                      <Popup>
                        <div style={{ fontFamily: 'var(--text-mono)', fontSize: '9px' }}>
                          <strong>{vehicle.vehicleRegistrationNumber}</strong>
                          <br />Speed: {vehicle.lastKnownSpeedKmh?.toFixed(1) || 0} km/h
                        </div>
                      </Popup>
                    </Marker>
                  )}
                </MapContainer>
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--text-mono)', fontSize: '9px', color: 'var(--text-dim)' }}>
                  No road geometry available
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Mandatory Abort Modal */}
      {showAbortModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
        }}>
          <div style={{ width: '420px', background: 'var(--bg-panel)', border: '1px solid var(--status-err)', borderRadius: '3px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ fontFamily: 'var(--text-mono)', fontSize: '11px', fontWeight: 700, color: 'var(--status-err)' }}>
              ABORT OPERATIONAL MISSION
            </div>
            <div style={{ fontFamily: 'var(--text-mono)', fontSize: '8.5px', color: 'var(--text-dim)', lineHeight: 1.5 }}>
              Aborting terminates the session prematurely and releases the vehicle reservation. A mandatory reason must be recorded in the audit ledger.
            </div>

            <div>
              <label style={{ fontFamily: 'var(--text-mono)', fontSize: '8px', color: 'var(--text-dim)', display: 'block', marginBottom: '4px' }}>
                PRIMARY REASON:
              </label>
              <select
                value={abortReasonPreset}
                onChange={e => setAbortReasonPreset(e.target.value)}
                style={{ width: '100%', padding: '6px', background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontFamily: 'var(--text-mono)', fontSize: '9px' }}
              >
                <option value="VEHICLE_BREAKDOWN">VEHICLE BREAKDOWN (Mechanical/Tyre)</option>
                <option value="SEVERE_WEATHER">SEVERE WEATHER / HEAVY RAIN</option>
                <option value="ROAD_OBSTRUCTION">ROAD BLOCKED / UNDER CONSTRUCTION</option>
                <option value="STAFF_EMERGENCY">STAFF / MEDICAL EMERGENCY</option>
                <option value="CUSTOM">CUSTOM EXPLANATION</option>
              </select>
            </div>

            <div>
              <label style={{ fontFamily: 'var(--text-mono)', fontSize: '8px', color: 'var(--text-dim)', display: 'block', marginBottom: '4px' }}>
                EXPLANATION / NOTES (REQUIRED):
              </label>
              <textarea
                value={abortCustomText}
                onChange={e => setAbortCustomText(e.target.value)}
                rows={3}
                placeholder="Provide specific operational details..."
                style={{ width: '100%', padding: '6px', background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontFamily: 'var(--text-mono)', fontSize: '9px', resize: 'vertical' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
              <button
                onClick={() => setShowAbortModal(false)}
                style={{ padding: '4px 12px', background: 'none', border: '1px solid var(--border)', color: 'var(--text-dim)', fontFamily: 'var(--text-mono)', fontSize: '8.5px', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                disabled={actionLoading || (!abortCustomText.trim() && abortReasonPreset === 'CUSTOM')}
                onClick={handleAbortSubmit}
                style={{ padding: '4px 14px', background: 'var(--status-err)', border: 'none', color: '#fff', fontFamily: 'var(--text-mono)', fontSize: '8.5px', fontWeight: 700, cursor: 'pointer' }}
              >
                {actionLoading ? 'ABORTING...' : 'CONFIRM ABORT'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Normal Completion Modal */}
      {showCompleteModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
        }}>
          <div style={{ width: '380px', background: 'var(--bg-panel)', border: '1px solid var(--status-ok)', borderRadius: '3px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ fontFamily: 'var(--text-mono)', fontSize: '11px', fontWeight: 700, color: 'var(--status-ok)' }}>
              COMPLETE OPERATIONAL MISSION
            </div>
            <div style={{ fontFamily: 'var(--text-mono)', fontSize: '8.5px', color: 'var(--text-dim)', lineHeight: 1.5 }}>
              Mark this session as normally completed and release vehicle reservation.
            </div>

            <div>
              <label style={{ fontFamily: 'var(--text-mono)', fontSize: '8px', color: 'var(--text-dim)', display: 'block', marginBottom: '4px' }}>
                COMPLETION TYPE:
              </label>
              <select
                value={completeReason}
                onChange={e => setCompleteReason(e.target.value)}
                style={{ width: '100%', padding: '6px', background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontFamily: 'var(--text-mono)', fontSize: '9px' }}
              >
                <option value="OFFICER_NORMAL">OFFICER NORMAL COMPLETION</option>
                <option value="OFFICER_EARLY">OFFICER EARLY COMPLETION (Partial Route)</option>
              </select>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
              <button
                onClick={() => setShowCompleteModal(false)}
                style={{ padding: '4px 12px', background: 'none', border: '1px solid var(--border)', color: 'var(--text-dim)', fontFamily: 'var(--text-mono)', fontSize: '8.5px', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                disabled={actionLoading}
                onClick={handleCompleteSubmit}
                style={{ padding: '4px 14px', background: 'var(--status-ok)', border: 'none', color: '#fff', fontFamily: 'var(--text-mono)', fontSize: '8.5px', fontWeight: 700, cursor: 'pointer' }}
              >
                {actionLoading ? 'COMPLETING...' : 'CONFIRM COMPLETION'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
