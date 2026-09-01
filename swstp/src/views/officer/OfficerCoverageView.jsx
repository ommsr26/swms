/**
 * OfficerCoverageView.jsx — Operational Route Coverage & Route Adherence View.
 *
 * Provides:
 *   - Overall Coverage KPIs: Total Assigned, Covered, Remaining, Overall %
 *   - Route Adherence KPIs: On-Route Distance, Off-Route Distance, Off-Route %, Deviation Events
 *   - Interactive Map with road status colors, GIS houses, live vehicles, and trajectory overlay
 *   - Road Assignment Roster with COMPLETED (>= 95%), PARTIAL, UNCOVERED statuses
 *   - Deviation Events Inspector
 */
import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  fetchAdminSessions,
  fetchOfficerCoverageStatus,
  fetchOfficerRouteAdherence,
  fetchOfficerRoadAssignments,
} from '../../telemetry/backendApiClient.js';
import CoverageMap from '../../components/coverage/CoverageMap.jsx';

export default function OfficerCoverageView() {
  const { ulbId, fleet, ulbs, loading: fleetLoading } = useOutletContext();
  const [sessions, setSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [coverageData, setCoverageData] = useState(null);
  const [adherenceData, setAdherenceData] = useState(null);
  const [coverageLoading, setCoverageLoading] = useState(false);
  const [roadAssignments, setRoadAssignments] = useState([]);
  const [roadsLoading, setRoadsLoading] = useState(false);
  const [activeRightTab, setActiveRightTab] = useState('ROADS'); // 'ROADS' | 'DEVIATIONS'

  const effectiveUlb = ulbId || 'ULB_MH_AMRAVATI';

  // Load active / recent operational sessions
  useEffect(() => {
    fetchAdminSessions(effectiveUlb, 30).then((data) => {
      const sessList = data || [];
      setSessions(sessList);
      if (sessList.length > 0 && !selectedSessionId) {
        setSelectedSessionId(sessList[0].sessionId);
      }
      setSessionsLoading(false);
    });
  }, [effectiveUlb]);

  // Fetch coverage status, route adherence, and road assignments
  useEffect(() => {
    if (!selectedSessionId) {
      setCoverageData(null);
      setAdherenceData(null);
      setRoadAssignments([]);
      return;
    }

    setCoverageLoading(true);
    setRoadsLoading(true);

    const refreshData = () => {
      fetchOfficerCoverageStatus(selectedSessionId, effectiveUlb)
        .then((data) => {
          setCoverageData(data);
          setCoverageLoading(false);
        })
        .catch(() => setCoverageLoading(false));

      fetchOfficerRouteAdherence(selectedSessionId, effectiveUlb)
        .then((data) => {
          setAdherenceData(data);
        })
        .catch(() => {});

      fetchOfficerRoadAssignments(selectedSessionId, effectiveUlb)
        .then((data) => {
          setRoadAssignments(Array.isArray(data) ? data : []);
          setRoadsLoading(false);
        })
        .catch(() => setRoadsLoading(false));
    };

    refreshData();
    const interval = setInterval(refreshData, 3000);
    return () => clearInterval(interval);
  }, [selectedSessionId, effectiveUlb]);

  const selectedSession = sessions.find((s) => s.sessionId === selectedSessionId);

  // Derived Coverage Metrics
  const totalAssignedM = coverageData?.totalAssignedLengthMeters ?? 125.0;
  const totalCoveredM = coverageData?.totalCoveredLengthMeters ?? 0.0;
  const remainingM = Math.max(0.0, totalAssignedM - totalCoveredM);
  const overallCoveragePct = coverageData?.overallCoveragePercentage ?? 0.0;

  // Derived Adherence Metrics
  const onRouteM = adherenceData?.onRouteDistanceMeters ?? 0.0;
  const offRouteM = adherenceData?.offRouteDistanceMeters ?? 0.0;
  const offRoutePct = adherenceData?.offRoutePercentage ?? 0.0;
  const deviationEvents = adherenceData?.deviationEvents ?? [];

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
      {/* ─── TOP KPI SUMMARY BANNER ────────────────────────────────────────── */}
      <div
        style={{
          padding: '8px 16px',
          background: 'var(--bg-panel-2)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: '18px',
          flexShrink: 0,
          overflowX: 'auto',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontFamily: 'var(--text-mono)', fontSize: '8px', color: 'var(--text-dim)', letterSpacing: '0.08em' }}>
            ASSIGNED DISTANCE
          </span>
          <span style={{ fontFamily: 'var(--text-mono)', fontSize: '13px', fontWeight: 800, color: 'var(--text-primary)' }}>
            {(totalAssignedM / 1000).toFixed(2)} km
          </span>
        </div>

        <div style={{ width: '1px', height: '24px', background: 'var(--border)' }} />

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontFamily: 'var(--text-mono)', fontSize: '8px', color: 'var(--text-dim)', letterSpacing: '0.08em' }}>
            COVERED DISTANCE
          </span>
          <span style={{ fontFamily: 'var(--text-mono)', fontSize: '13px', fontWeight: 800, color: 'var(--status-ok)' }}>
            {(totalCoveredM / 1000).toFixed(2)} km
          </span>
        </div>

        <div style={{ width: '1px', height: '24px', background: 'var(--border)' }} />

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontFamily: 'var(--text-mono)', fontSize: '8px', color: 'var(--text-dim)', letterSpacing: '0.08em' }}>
            REMAINING
          </span>
          <span style={{ fontFamily: 'var(--text-mono)', fontSize: '13px', fontWeight: 800, color: remainingM > 0 ? 'var(--status-warn)' : 'var(--status-ok)' }}>
            {(remainingM / 1000).toFixed(2)} km
          </span>
        </div>

        <div style={{ width: '1px', height: '24px', background: 'var(--border)' }} />

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontFamily: 'var(--text-mono)', fontSize: '8px', color: 'var(--text-dim)', letterSpacing: '0.08em' }}>
            COVERAGE
          </span>
          <span style={{ fontFamily: 'var(--text-mono)', fontSize: '13px', fontWeight: 800, color: '#00d9ff' }}>
            {overallCoveragePct.toFixed(1)}%
          </span>
        </div>

        <div style={{ width: '1px', height: '24px', background: 'var(--border)' }} />

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontFamily: 'var(--text-mono)', fontSize: '8px', color: 'var(--text-dim)', letterSpacing: '0.08em' }}>
            ON ROUTE
          </span>
          <span style={{ fontFamily: 'var(--text-mono)', fontSize: '13px', fontWeight: 700, color: '#2dc653' }}>
            {(onRouteM / 1000).toFixed(2)} km
          </span>
        </div>

        <div style={{ width: '1px', height: '24px', background: 'var(--border)' }} />

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontFamily: 'var(--text-mono)', fontSize: '8px', color: 'var(--text-dim)', letterSpacing: '0.08em' }}>
            OFF ROUTE
          </span>
          <span style={{ fontFamily: 'var(--text-mono)', fontSize: '13px', fontWeight: 700, color: offRouteM > 0 ? '#f72585' : 'var(--text-dim)' }}>
            {(offRouteM / 1000).toFixed(2)} km ({offRoutePct.toFixed(1)}%)
          </span>
        </div>

        <div style={{ width: '1px', height: '24px', background: 'var(--border)' }} />

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontFamily: 'var(--text-mono)', fontSize: '8px', color: 'var(--text-dim)', letterSpacing: '0.08em' }}>
            DEVIATIONS
          </span>
          <span style={{ fontFamily: 'var(--text-mono)', fontSize: '13px', fontWeight: 800, color: deviationEvents.length > 0 ? '#f72585' : 'var(--text-secondary)' }}>
            {deviationEvents.length} events
          </span>
        </div>
      </div>

      {/* ─── MAIN CONTENT: MAP + SIDEBAR ───────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        {/* Left: Coverage map */}
        <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
          <CoverageMap
            sessionId={selectedSessionId}
            fleet={fleet}
            ulbId={effectiveUlb}
            ulbs={ulbs}
            loading={fleetLoading}
            coverageData={coverageData}
            adherenceData={adherenceData}
          />
        </div>

        {/* Right: Session selector + road assignment / deviation tabs */}
        <div
          style={{
            width: '320px',
            flexShrink: 0,
            background: 'var(--bg-panel)',
            borderLeft: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Session selector */}
          <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', background: 'var(--bg-panel-2)', flexShrink: 0 }}>
            <div style={{ fontFamily: 'var(--text-mono)', fontSize: '8px', color: 'var(--text-dim)', letterSpacing: '0.1em', marginBottom: '5px' }}>
              OPERATIONAL MISSION
            </div>
            {sessionsLoading ? (
              <div style={{ fontFamily: 'var(--text-mono)', fontSize: '9px', color: 'var(--text-dim)' }}>Loading…</div>
            ) : sessions.length === 0 ? (
              <div style={{ fontFamily: 'var(--text-mono)', fontSize: '9px', color: 'var(--status-warn)' }}>No sessions found.</div>
            ) : (
              <select
                value={selectedSessionId || ''}
                onChange={(e) => setSelectedSessionId(Number(e.target.value))}
                style={{
                  width: '100%',
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--text-mono)',
                  fontSize: '9.5px',
                  padding: '4px 6px',
                  outline: 'none',
                  borderRadius: '2px',
                }}
              >
                {sessions.map((s) => (
                  <option key={s.sessionId} value={s.sessionId}>
                    Session #{s.sessionId} · {s.vehicleRegistration || 'UNASSIGNED'} ({s.status})
                  </option>
                ))}
              </select>
            )}

            {selectedSession && (
              <div style={{ fontFamily: 'var(--text-mono)', fontSize: '8px', color: 'var(--text-secondary)', marginTop: '4px', display: 'flex', justifyContent: 'space-between' }}>
                <span>Vehicle: <strong>{selectedSession.vehicleRegistration || 'MH-27-AM-4001'}</strong></span>
                <span>Status: <strong style={{ color: selectedSession.status === 'ACTIVE' ? '#2dc653' : 'var(--text-primary)' }}>{selectedSession.status}</strong></span>
              </div>
            )}
          </div>

          {/* Tab Switcher: Roads vs Deviations */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--bg-panel)', flexShrink: 0 }}>
            <button
              onClick={() => setActiveRightTab('ROADS')}
              style={{
                flex: 1,
                padding: '6px',
                fontFamily: 'var(--text-mono)',
                fontSize: '8.5px',
                fontWeight: activeRightTab === 'ROADS' ? 700 : 400,
                color: activeRightTab === 'ROADS' ? 'var(--text-primary)' : 'var(--text-dim)',
                background: activeRightTab === 'ROADS' ? 'var(--bg-elevated)' : 'none',
                border: 'none',
                borderBottom: activeRightTab === 'ROADS' ? '2px solid #00d9ff' : 'none',
                cursor: 'pointer',
              }}
            >
              ROADS ({coverageData?.assignments?.length || roadAssignments.length || 0})
            </button>
            <button
              onClick={() => setActiveRightTab('DEVIATIONS')}
              style={{
                flex: 1,
                padding: '6px',
                fontFamily: 'var(--text-mono)',
                fontSize: '8.5px',
                fontWeight: activeRightTab === 'DEVIATIONS' ? 700 : 400,
                color: activeRightTab === 'DEVIATIONS' ? 'var(--text-primary)' : 'var(--text-dim)',
                background: activeRightTab === 'DEVIATIONS' ? 'var(--bg-elevated)' : 'none',
                border: 'none',
                borderBottom: activeRightTab === 'DEVIATIONS' ? '2px solid #f72585' : 'none',
                cursor: 'pointer',
              }}
            >
              DEVIATIONS ({deviationEvents.length})
            </button>
          </div>

          {/* Tab 1: Road Assignments Roster */}
          {activeRightTab === 'ROADS' && (
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {roadsLoading && roadAssignments.length === 0 ? (
                <div style={{ padding: '15px', textAlign: 'center', fontFamily: 'var(--text-mono)', fontSize: '9px', color: 'var(--text-dim)' }}>
                  Loading assigned corridors…
                </div>
              ) : coverageData?.assignments?.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {coverageData.assignments.map((a, idx) => {
                    const status =
                      a.coveragePercentage >= 95.0
                        ? 'COMPLETED'
                        : a.coveragePercentage > 0.0
                        ? 'PARTIAL'
                        : 'UNCOVERED';

                    const badgeColor =
                      status === 'COMPLETED'
                        ? '#2dc653'
                        : status === 'PARTIAL'
                        ? '#f48c06'
                        : '#6c757d';

                    return (
                      <div
                        key={a.sessionRoadAssignmentId || idx}
                        style={{
                          padding: '8px 12px',
                          borderBottom: '1px solid var(--border)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '3px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontFamily: 'var(--text-mono)', fontSize: '9.5px', fontWeight: 700, color: 'var(--text-primary)' }}>
                            {a.roadName || `Road #${a.roadId}`}
                          </span>
                          <span
                            style={{
                              fontFamily: 'var(--text-mono)',
                              fontSize: '7.5px',
                              fontWeight: 700,
                              color: badgeColor,
                              background: status === 'COMPLETED' ? 'rgba(45,198,83,0.12)' : status === 'PARTIAL' ? 'rgba(244,140,6,0.12)' : 'rgba(255,255,255,0.06)',
                              padding: '1px 5px',
                              borderRadius: '2px',
                              border: `1px solid ${badgeColor}33`,
                            }}
                          >
                            {status}
                          </span>
                        </div>

                        <div style={{ fontFamily: 'var(--text-mono)', fontSize: '8px', color: 'var(--text-dim)', display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>
                          <span>Assigned: {a.assignedLengthMeters.toFixed(0)}m</span>
                          <span>Covered: {a.coveredLengthMeters.toFixed(0)}m</span>
                          <span style={{ color: badgeColor, fontWeight: 700 }}>{a.coveragePercentage.toFixed(1)}%</span>
                        </div>

                        {/* Visual mini progress track */}
                        <div style={{ height: '3px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', overflow: 'hidden', marginTop: '3px' }}>
                          <div
                            style={{
                              width: `${Math.min(100, Math.max(0, a.coveragePercentage))}%`,
                              height: '100%',
                              background: badgeColor,
                              transition: 'width 0.3s',
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ padding: '20px', textAlign: 'center', fontFamily: 'var(--text-mono)', fontSize: '9px', color: 'var(--text-dim)', lineHeight: 1.7 }}>
                  No assigned roads in this operational mission.
                </div>
              )}
            </div>
          )}

          {/* Tab 2: Deviation Events List */}
          {activeRightTab === 'DEVIATIONS' && (
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {deviationEvents.length === 0 ? (
                <div style={{ padding: '24px', textAlign: 'center', fontFamily: 'var(--text-mono)', fontSize: '9px', color: 'var(--text-dim)', lineHeight: 1.6 }}>
                  <span style={{ color: '#2dc653', fontSize: '14px' }}>✓</span>
                  <br />
                  No route deviations detected.
                  <br />
                  Vehicle strictly adhered to assigned corridors.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {deviationEvents.map((dev) => (
                    <div
                      key={dev.eventId}
                      style={{
                        padding: '8px 12px',
                        borderBottom: '1px solid var(--border)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '3px',
                        background: 'rgba(247, 37, 133, 0.03)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontFamily: 'var(--text-mono)', fontSize: '9.5px', fontWeight: 700, color: '#f72585' }}>
                          ⚠️ DEVIATION #{dev.eventId}
                        </span>
                        <span style={{ fontFamily: 'var(--text-mono)', fontSize: '8px', color: 'var(--text-dim)' }}>
                          {new Date(dev.startTime).toLocaleTimeString()}
                        </span>
                      </div>

                      <div style={{ fontFamily: 'var(--text-mono)', fontSize: '8px', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>
                        <span>Duration: <strong>{dev.durationSeconds.toFixed(1)}s</strong></span>
                        <span>Samples: <strong>{dev.sampleCount}</strong></span>
                      </div>

                      <div style={{ fontFamily: 'var(--text-mono)', fontSize: '8px', color: 'var(--text-dim)', display: 'flex', justifyContent: 'space-between' }}>
                        <span>Max Off-Route: <strong style={{ color: '#f72585' }}>{dev.maxDeviationDistanceMeters.toFixed(1)}m</strong></span>
                        <span>Track Dist: {dev.approximateDistanceMeters.toFixed(1)}m</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
