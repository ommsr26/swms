import { useState, useEffect } from 'react';
import { useTelemetryStore, eventLog } from '../telemetry/telemetryStore.js';
import { fetchSessions } from '../telemetry/backendApiClient.js';

export default function SessionsView() {
  const { sessionElapsed, runCount, sessionId } = useTelemetryStore();
  const [dbSessions, setDbSessions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchSessions()
      .then((data) => {
        setDbSessions(data || []);
        setIsLoading(false);
      })
      .catch(() => setIsLoading(false));
  }, []);

  const fmtDuration = (s) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60).toString().padStart(2, '0');
    const sec = Math.floor(s % 60).toString().padStart(2, '0');
    return h > 0 ? `${h}:${m}:${sec}` : `${m}:${sec}`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div className="view-header">
        <span className="view-header__title">Device Sessions & MSSQL Telemetry Persistence</span>
        <span className="view-header__sep" />
        <span className="view-header__meta">Database: Solid_Waste @ 192.168.1.8</span>
        <span className="view-header__spacer" />
        <span className="rate-badge">MSSQL PERSISTED</span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {/* Active Session */}
        {sessionElapsed > 0 && (
          <>
            <div className="section-header">ACTIVE DEVICE SESSION</div>
            <div className="session-item" style={{
              borderLeft: '3px solid var(--status-ok)',
              background: 'var(--bg-elevated)',
            }}>
              <span className="session-item__num" style={{ color: 'var(--status-ok)' }}>
                #{sessionId}
              </span>
              <div className="session-item__info">
                <div className="session-item__date">LIVE SESSION — MSSQL BULK INGESTION ACTIVE</div>
                <div className="session-item__meta">
                  Runs: {runCount} · Local Events: {eventLog.length} · Sampling: 20 Hz (Async Decoupled Batching)
                </div>
              </div>
              <span className="session-item__duration" style={{ color: 'var(--status-ok)' }}>
                {fmtDuration(sessionElapsed)}
              </span>
              <div style={{
                display: 'flex', alignItems: 'center', gap: '5px',
                fontFamily: 'var(--text-mono)', fontSize: '9px', color: 'var(--status-ok)',
              }}>
                <span className="status-dot status-dot--ok" style={{ animation: 'pulse-dot 2s ease-in-out infinite' }} />
                PERSISTING TO MSSQL
              </div>
            </div>
          </>
        )}

        {/* Historical sessions from MSSQL */}
        <div className="section-header">HISTORICAL MSSQL RECORDED SESSIONS ({dbSessions.length})</div>
        <div className="sessions-list">
          {isLoading ? (
            <div style={{ padding: '24px', fontFamily: 'var(--text-mono)', fontSize: '11px', color: '#94a3b8', textAlign: 'center' }}>
              Loading persisted sessions from MSSQL database...
            </div>
          ) : dbSessions.length === 0 ? (
            <div style={{ padding: '24px', fontFamily: 'var(--text-mono)', fontSize: '11px', color: '#64748b', textAlign: 'center' }}>
              No historical sessions recorded in MSSQL database yet. Connect hardware or run simulation to ingest telemetry.
            </div>
          ) : (
            dbSessions.map(sess => (
              <div key={sess.sessionId} className="session-item" style={{ borderLeft: sess.mode === 'REAL_HARDWARE' ? '3px solid #2dc653' : '3px solid #00b4d8' }}>
                <span className="session-item__num">#{sess.sessionId}</span>
                <div className="session-item__info">
                  <div className="session-item__date" style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                    {sess.sessionCode} [{sess.mode}]
                  </div>
                  <div className="session-item__meta">
                    Device: {sess.deviceId} · Baud: {sess.serialBaud} · Started: {new Date(sess.startedAt).toLocaleString()}
                  </div>
                </div>
                <span className="session-item__duration" style={{ color: sess.status === 'ACTIVE' ? 'var(--status-ok)' : 'var(--text-secondary)' }}>
                  {sess.status}
                </span>
                <button
                  onClick={() => {
                    useTelemetryStore.getState().setSelectedReplaySessionId(sess.sessionId);
                    useTelemetryStore.getState().setActiveView('replay');
                  }}
                  style={{
                    background: 'rgba(0, 180, 216, 0.15)',
                    border: '1px solid #00b4d8',
                    color: '#00b4d8',
                    fontFamily: 'var(--text-mono)',
                    fontSize: '10px',
                    fontWeight: 700,
                    padding: '4px 10px',
                    borderRadius: '2px',
                    cursor: 'pointer',
                    letterSpacing: '0.05em',
                  }}
                >
                  ▶ PLAY
                </button>
              </div>
            ))
          )}
        </div>

        <div style={{
          padding: '16px 20px',
          fontFamily: 'var(--text-mono)',
          fontSize: '10px',
          color: 'var(--text-label)',
          lineHeight: '1.7',
          borderTop: '1px solid var(--border)',
        }}>
          All telemetry sessions are stored in Microsoft SQL Server (192.168.1.8 / Solid_Waste). Real hardware and simulation sessions are strictly isolated via session mode tags.
        </div>
      </div>
    </div>
  );
}
