/**
 * GNSSPresentation.jsx — Presentational Component for GNSS Satellites & Sky View.
 *
 * SHARED PRESENTATIONAL LAYER:
 * - Used by /debug (via GNSSView.jsx, fed by Zustand live serial store & gnssHistoryStore)
 * - Used by /admin (via LiveDebugPanel, fed by /api/admin/sessions/{id}/live polling)
 */
import { useState } from 'react';
import GNSSGlobe3D from './GNSSGlobe3D.jsx';

export function MetricCell({ label, value, unit, statusColor }) {
  return (
    <div style={{
      padding: '8px 14px',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
    }}>
      <div style={{
        fontFamily: 'var(--text-mono)',
        fontSize: '9px',
        color: '#94a3b8',
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
        marginBottom: '2px',
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: 'var(--text-mono)',
        fontSize: '13px',
        fontWeight: 600,
        color: statusColor || '#f1f5f9',
        display: 'flex',
        alignItems: 'baseline',
        gap: '4px',
      }}>
        {value ?? '—'}
        {unit && <span style={{ fontSize: '9px', color: '#94a3b8', fontWeight: 400 }}>{unit}</span>}
      </div>
    </div>
  );
}

function snrColor(snr) {
  if (snr == null || isNaN(snr) || snr <= 0) return '#94a3b8';
  if (snr >= 35) return '#2dc653'; // Strong Signal (Green)
  if (snr >= 25) return '#00b4d8'; // Moderate Signal (Cyan)
  return '#f48c06';                // Weak Signal (Amber)
}

function formatDuration(ms) {
  if (ms == null || isNaN(ms)) return '0.0 s';
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

export default function GNSSPresentation({
  latest = null,
  sensorStatus = {},
  sourceType = 'REAL_SERIAL',
  satellitesMap = {},
  isCloudPolled = false,
}) {
  const [tableTab, setTableTab] = useState('current'); // Default to 'current' for cloud, or 'history'
  const [selectedSatKey, setSelectedSatKey] = useState(null);

  const g = latest?.gnss || {};
  const isReal = sourceType === 'REAL_SERIAL';
  const hasFix = Boolean(g.valid && g.lat != null && g.lon != null);

  const currentSatellites = Array.isArray(g.satellites_detail) ? g.satellites_detail : [];
  
  // If satellitesMap is empty (like in cloud mode), build synthetic records from currentSatellites
  let historyRecords = Object.values(satellitesMap);
  if (historyRecords.length === 0 && currentSatellites.length > 0) {
    historyRecords = currentSatellites.map((s, idx) => ({
      key: `${(s.constellation || 'GPS').toUpperCase()}_${s.prn}`,
      prn: s.prn,
      constellation: s.constellation || 'GPS',
      status: s.used_in_fix || s.usedInFix ? 'USED IN FIX' : 'TRACKED',
      currentlyVisible: true,
      currentlyUsedInFix: Boolean(s.used_in_fix || s.usedInFix),
      firstSeenTimestamp: 'Live Stream',
      lastSeenTimestamp: 'Now',
      trackedDurationMs: 60000,
      observationCount: 1,
      lastSNR: s.snr,
      peakSNR: s.snr,
      minimumSNR: s.snr,
      lastElevation: s.elevation,
      lastAzimuth: s.azimuth,
      firstElevation: s.elevation,
      firstAzimuth: s.azimuth,
      episodes: [{ episodeId: 1, firstSeen: 'Live Stream', lastSeen: 'Now', durationMs: 60000 }],
    }));
  }

  // Summary Metrics calculation
  const currentCount = currentSatellites.length > 0 ? currentSatellites.length : historyRecords.filter((r) => r.currentlyVisible).length;
  const totalObserved = historyRecords.length;
  const usedInFixCount = currentSatellites.filter(s => s.used_in_fix || s.usedInFix).length || historyRecords.filter((r) => r.currentlyVisible && r.currentlyUsedInFix).length;
  const lostCount = historyRecords.filter((r) => !r.currentlyVisible).length;
  const totalEpisodes = historyRecords.reduce((sum, r) => sum + (r.episodes?.length || 0), 0);

  // Sorted History Records for table
  const sortedHistoryRecords = [...historyRecords].sort((a, b) => {
    if (a.currentlyVisible !== b.currentlyVisible) return b.currentlyVisible ? 1 : -1;
    if (a.currentlyUsedInFix !== b.currentlyUsedInFix) return b.currentlyUsedInFix ? 1 : -1;
    const snrA = a.lastSNR ?? -1;
    const snrB = b.lastSNR ?? -1;
    if (snrA !== snrB) return snrB - snrA;
    return a.prn - b.prn;
  });

  // Active selected satellite record
  const activeRecord = selectedSatKey 
    ? (satellitesMap[selectedSatKey] || historyRecords.find(r => r.key === selectedSatKey))
    : (sortedHistoryRecords.length > 0 ? sortedHistoryRecords[0] : null);

  const fmtCoord = (v, d = 6) => (v != null && !isNaN(v) ? Number(v).toFixed(d) : '—');
  const fmtNum   = (v, d = 1) => (v != null && !isNaN(v) ? Number(v).toFixed(d) : '—');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div className="view-header">
        <span className="view-header__title">GNSS Satellite Workstation & Sky View</span>
        <span className="view-header__sep" />
        <div className={`live-indicator live-indicator--${hasFix ? 'ok' : 'warn'}`}>
          <span className={`status-dot status-dot--${hasFix ? 'ok' : 'warn'}`} />
          {hasFix ? 'GNSS FIX LOCK' : sensorStatus.gnss || 'NO FIX'}
        </div>
        <span className="view-header__spacer" />
        <span className="rate-badge" style={{ color: '#f1f5f9', borderColor: '#334155' }}>
          {isCloudPolled ? 'CLOUD STREAM (POLLED)' : isReal ? 'REAL HARDWARE (NEO-6M)' : 'SIMULATION MODE'}
        </span>
      </div>

      {/* Top Metrics Strip */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(12, 1fr)',
        borderBottom: '1px solid var(--border)',
        background: '#0f172a',
        flexShrink: 0,
      }}>
        <MetricCell label="GNSS Status" value={sensorStatus.gnss || (hasFix ? 'FIX' : 'NO FIX')} statusColor={hasFix ? '#2dc653' : '#f48c06'} />
        <MetricCell label="Fix Type" value={g.fix || (hasFix ? 'FIX_3D' : 'NO_FIX')} statusColor={hasFix ? '#2dc653' : '#f48c06'} />
        <MetricCell label="Current Sats" value={currentCount} statusColor="#00b4d8" />
        <MetricCell label="Observed Sats" value={totalObserved} statusColor="#f1f5f9" />
        <MetricCell label="Used In Fix" value={usedInFixCount} statusColor="#2dc653" />
        <MetricCell label="Lost Sats" value={lostCount} statusColor={lostCount > 0 ? '#f48c06' : '#94a3b8'} />
        <MetricCell label="Episodes" value={totalEpisodes} />
        <MetricCell label="HDOP" value={fmtNum(g.hdop, 2)} />
        <MetricCell label="Latitude" value={hasFix ? fmtCoord(g.lat) : '—'} />
        <MetricCell label="Longitude" value={hasFix ? fmtCoord(g.lon) : '—'} />
        <MetricCell label="Altitude" value={hasFix ? fmtNum(g.alt) : '—'} unit="m" />
        <MetricCell label="Speed" value={hasFix ? fmtNum(g.speed) : '—'} unit="km/h" />
      </div>

      {/* Main Grid Body */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 310px', gridTemplateRows: '1fr 240px', overflow: 'hidden' }}>

        {/* Top-Left: 3D Receiver-Centric Globe */}
        <div style={{ gridColumn: 1, gridRow: 1, position: 'relative', borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>

          {currentSatellites.length === 0 && (
            <div style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 20,
              background: 'rgba(9, 13, 22, 0.95)',
              border: '1px solid #334155',
              borderLeft: '4px solid #f48c06',
              padding: '18px 24px',
              fontFamily: 'var(--text-mono)',
              fontSize: '11px',
              color: '#f1f5f9',
              textAlign: 'center',
              maxWidth: '420px',
              lineHeight: '1.6',
              boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
            }}>
              <div style={{ color: '#f48c06', fontWeight: 700, fontSize: '12px', marginBottom: '4px', letterSpacing: '0.08em' }}>
                ⚠️ NO GSV SATELLITE TELEMETRY RECEIVED
              </div>
              <div style={{ color: '#94a3b8', fontSize: '10px' }}>
                {isCloudPolled
                  ? 'No detailed GSV satellite observations recorded for this session yet.'
                  : 'Satellite-detail telemetry (NMEA GSV/GSA) has not been received from the Arduino.'}
              </div>
            </div>
          )}

          {!hasFix && currentSatellites.length > 0 && (
            <div style={{
              position: 'absolute',
              top: '12px',
              right: '12px',
              zIndex: 10,
              background: 'rgba(239, 35, 60, 0.9)',
              color: '#ffffff',
              padding: '6px 14px',
              fontFamily: 'var(--text-mono)',
              fontSize: '10px',
              fontWeight: 700,
              letterSpacing: '0.08em',
              borderRadius: '2px',
              boxShadow: '0 2px 10px rgba(0,0,0,0.5)',
            }}>
              GNSS NO FIX — WAITING FOR NAVIGATION LOCK
            </div>
          )}

          <GNSSGlobe3D
            satellites={currentSatellites}
            selectedSat={activeRecord}
            gnssFix={g}
            onSelectSatellite={(sat) => {
              if (sat?.prn != null) {
                const constellation = String(sat.constellation || 'UNKNOWN').toUpperCase();
                setSelectedSatKey(`${constellation}_${sat.prn}`);
              }
            }}
          />
        </div>

        {/* Top-Right: Selected Satellite Inspection */}
        <div style={{ gridColumn: 2, gridRow: 1, borderBottom: '1px solid var(--border)', background: 'var(--bg-panel)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
          <div className="section-header">SATELLITE INSPECTION</div>

          {activeRecord ? (
            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <div style={{ fontFamily: 'var(--text-mono)', fontSize: '20px', fontWeight: 700, color: '#f1f5f9' }}>
                  PRN {String(activeRecord.prn).padStart(2, '0')}
                </div>
                <span style={{
                  fontFamily: 'var(--text-mono)',
                  fontSize: '9px',
                  fontWeight: 700,
                  padding: '3px 8px',
                  borderRadius: '2px',
                  background: activeRecord.status === 'USED IN FIX' ? 'rgba(45, 198, 83, 0.2)' : activeRecord.status === 'TRACKED' ? 'rgba(0, 180, 216, 0.2)' : 'rgba(244, 140, 6, 0.2)',
                  color: activeRecord.status === 'USED IN FIX' ? '#2dc653' : activeRecord.status === 'TRACKED' ? '#00b4d8' : '#f48c06',
                  border: `1px solid ${activeRecord.status === 'USED IN FIX' ? '#2dc653' : activeRecord.status === 'TRACKED' ? '#00b4d8' : '#f48c06'}`,
                }}>
                  {activeRecord.status}
                </span>
              </div>

              {[
                { label: 'Constellation', value: activeRecord.constellation },
                { label: 'First Seen', value: activeRecord.firstSeenTimestamp },
                { label: 'Last Seen', value: activeRecord.lastSeenTimestamp },
                { label: 'Tracked Duration', value: formatDuration(activeRecord.trackedDurationMs) },
                { label: 'Total Observations', value: activeRecord.observationCount },
                { label: 'Last SNR', value: activeRecord.lastSNR != null ? `${activeRecord.lastSNR} dB-Hz` : 'SNR —', color: snrColor(activeRecord.lastSNR) },
                { label: 'Peak / Min SNR', value: activeRecord.peakSNR != null ? `${activeRecord.peakSNR} / ${activeRecord.minimumSNR ?? activeRecord.peakSNR} dB` : '—' },
                { label: 'Last Elevation / Azimuth', value: activeRecord.lastElevation != null ? `${activeRecord.lastElevation}° / ${activeRecord.lastAzimuth}°` : '—' },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--border)', fontFamily: 'var(--text-mono)', fontSize: '10px' }}>
                  <span style={{ color: '#94a3b8' }}>{label}</span>
                  <span style={{ color: color || '#f1f5f9', fontWeight: 600 }}>{value}</span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: '20px 16px', fontFamily: 'var(--text-mono)', fontSize: '10px', color: '#64748b', textAlign: 'center', lineHeight: '1.5' }}>
              Select a satellite from 3D sky view or table to inspect telemetry event log.
            </div>
          )}
        </div>

        {/* Bottom Section: Current vs History Tabbed Telemetry Table */}
        <div style={{ gridColumn: '1 / -1', gridRow: 2, background: 'var(--bg-panel)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--border)', background: '#0f172a', padding: '0 12px' }}>
            <button
              onClick={() => setTableTab('current')}
              style={{
                fontFamily: 'var(--text-mono)',
                fontSize: '10px',
                fontWeight: 700,
                color: tableTab === 'current' ? '#00d9ff' : '#94a3b8',
                background: 'transparent',
                border: 'none',
                borderBottom: tableTab === 'current' ? '2px solid #00d9ff' : '2px solid transparent',
                padding: '8px 16px',
                cursor: 'pointer',
                letterSpacing: '0.08em',
              }}
            >
              CURRENT SATELLITES ({currentSatellites.length})
            </button>
            <button
              onClick={() => setTableTab('history')}
              style={{
                fontFamily: 'var(--text-mono)',
                fontSize: '10px',
                fontWeight: 700,
                color: tableTab === 'history' ? '#00d9ff' : '#94a3b8',
                background: 'transparent',
                border: 'none',
                borderBottom: tableTab === 'history' ? '2px solid #00d9ff' : '2px solid transparent',
                padding: '8px 16px',
                cursor: 'pointer',
                letterSpacing: '0.08em',
              }}
            >
              SATELLITE HISTORY & EVENT LOG ({historyRecords.length})
            </button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {tableTab === 'current' ? (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--text-mono)', fontSize: '10px', textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: '#0f172a', color: '#94a3b8', borderBottom: '1px solid #334155' }}>
                    <th style={{ padding: '6px 8px' }}>PRN</th>
                    <th style={{ padding: '6px 8px' }}>SYS</th>
                    <th style={{ padding: '6px 8px' }}>EL</th>
                    <th style={{ padding: '6px 8px' }}>AZ</th>
                    <th style={{ padding: '6px 8px' }}>SNR</th>
                    <th style={{ padding: '6px 8px' }}>FIX</th>
                  </tr>
                </thead>
                <tbody>
                  {currentSatellites.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ padding: '30px 10px', textAlign: 'center', color: '#64748b' }}>
                        No satellite observations recorded in latest GSV snapshot.
                      </td>
                    </tr>
                  ) : (
                    currentSatellites.map((sat) => {
                      const constellation = String(sat.constellation || 'UNKNOWN').toUpperCase();
                      const key = `${constellation}_${sat.prn}`;
                      const isSelected = activeRecord && activeRecord.key === key;
                      const isUsed = Boolean(sat.used_in_fix || sat.usedInFix);

                      return (
                        <tr
                          key={key}
                          onClick={() => setSelectedSatKey(key)}
                          style={{
                            borderBottom: '1px solid var(--border)',
                            cursor: 'pointer',
                            background: isSelected ? '#1e293b' : 'transparent',
                            borderLeft: isSelected ? '3px solid #00d9ff' : (isUsed ? '3px solid #2dc653' : '3px solid transparent'),
                          }}
                        >
                          <td style={{ padding: '5px 8px', fontWeight: 600, color: isUsed ? '#2dc653' : '#f1f5f9' }}>
                            {String(sat.prn).padStart(2, '0')}
                          </td>
                          <td style={{ padding: '5px 8px', color: '#94a3b8' }}>
                            {sat.constellation || 'UNK'}
                          </td>
                          <td style={{ padding: '5px 8px', color: '#f1f5f9' }}>
                            {sat.elevation != null ? `${sat.elevation}°` : '—'}
                          </td>
                          <td style={{ padding: '5px 8px', color: '#f1f5f9' }}>
                            {sat.azimuth != null ? `${sat.azimuth}°` : '—'}
                          </td>
                          <td style={{ padding: '5px 8px', color: snrColor(sat.snr), fontWeight: 600 }}>
                            {sat.snr != null ? `${sat.snr}` : '—'}
                          </td>
                          <td style={{ padding: '5px 8px', color: isUsed ? '#2dc653' : '#64748b', fontWeight: 600 }}>
                            {isUsed ? 'YES' : 'NO'}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--text-mono)', fontSize: '10px', textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: '#0f172a', color: '#94a3b8', borderBottom: '1px solid #334155' }}>
                    <th style={{ padding: '6px 8px' }}>PRN</th>
                    <th style={{ padding: '6px 8px' }}>SYS</th>
                    <th style={{ padding: '6px 8px' }}>STATUS</th>
                    <th style={{ padding: '6px 8px' }}>FIRST SEEN</th>
                    <th style={{ padding: '6px 8px' }}>LAST SEEN</th>
                    <th style={{ padding: '6px 8px' }}>DURATION</th>
                    <th style={{ padding: '6px 8px' }}>LAST SNR</th>
                    <th style={{ padding: '6px 8px' }}>LAST EL</th>
                    <th style={{ padding: '6px 8px' }}>LAST AZ</th>
                    <th style={{ padding: '6px 8px' }}>FIX</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedHistoryRecords.length === 0 ? (
                    <tr>
                      <td colSpan={10} style={{ padding: '30px 10px', textAlign: 'center', color: '#64748b' }}>
                        No satellite history observed in this session.
                      </td>
                    </tr>
                  ) : (
                    sortedHistoryRecords.map((rec) => {
                      const isSelected = activeRecord && activeRecord.key === rec.key;

                      return (
                        <tr
                          key={rec.key}
                          onClick={() => setSelectedSatKey(rec.key)}
                          style={{
                            borderBottom: '1px solid var(--border)',
                            cursor: 'pointer',
                            background: isSelected ? '#1e293b' : 'transparent',
                            borderLeft: isSelected ? '3px solid #00d9ff' : (rec.currentlyUsedInFix ? '3px solid #2dc653' : '3px solid #00b4d8'),
                          }}
                        >
                          <td style={{ padding: '5px 8px', fontWeight: 700, color: rec.currentlyUsedInFix ? '#2dc653' : '#f1f5f9' }}>
                            {String(rec.prn).padStart(2, '0')}
                          </td>
                          <td style={{ padding: '5px 8px', color: '#94a3b8' }}>
                            {rec.constellation}
                          </td>
                          <td style={{ padding: '5px 8px', fontWeight: 600, color: rec.status === 'USED IN FIX' ? '#2dc653' : '#00b4d8' }}>
                            ● {rec.status}
                          </td>
                          <td style={{ padding: '5px 8px', color: '#f1f5f9' }}>
                            {rec.firstSeenTimestamp}
                          </td>
                          <td style={{ padding: '5px 8px', color: '#f1f5f9' }}>
                            {rec.lastSeenTimestamp}
                          </td>
                          <td style={{ padding: '5px 8px', color: '#00b4d8', fontWeight: 600 }}>
                            {formatDuration(rec.trackedDurationMs)}
                          </td>
                          <td style={{ padding: '5px 8px', color: snrColor(rec.lastSNR), fontWeight: 600 }}>
                            {rec.lastSNR != null ? `${rec.lastSNR} dB` : '—'}
                          </td>
                          <td style={{ padding: '5px 8px', color: '#f1f5f9' }}>
                            {rec.lastElevation != null ? `${rec.lastElevation}°` : '—'}
                          </td>
                          <td style={{ padding: '5px 8px', color: '#f1f5f9' }}>
                            {rec.lastAzimuth != null ? `${rec.lastAzimuth}°` : '—'}
                          </td>
                          <td style={{ padding: '5px 8px', color: rec.currentlyUsedInFix ? '#2dc653' : '#64748b', fontWeight: 600 }}>
                            {rec.currentlyUsedInFix ? 'YES' : 'NO'}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
