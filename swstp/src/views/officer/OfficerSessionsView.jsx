/**
 * OfficerSessionsView.jsx — /officer/sessions?ulb=:ulbId
 *
 * Operational Mission Control for Municipal Officers.
 * Features:
 *   - Status filtering (ALL, SCHEDULED, ACTIVE, PAUSED, COMPLETED, CANCELLED, ABORTED)
 *   - "+ NEW OPERATIONAL MISSION" wizard modal (Vehicle -> Roads -> Trim -> Schedule -> Create)
 *   - Live Session Control & Monitoring drawer (Pause, Resume, Complete, Abort with reason, Proximity, Coverage)
 *   - Automatic background polling (3s cadence) to react to backend scheduler activation and 100% completion
 */
import { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { fetchOfficerSessions } from '../../telemetry/backendApiClient.js';
import SessionList from '../../components/session/SessionList.jsx';
import CreateSessionModal from '../../components/session/CreateSessionModal.jsx';
import SessionControlDrawer from '../../components/session/SessionControlDrawer.jsx';

const STATUS_FILTERS = ['ALL', 'SCHEDULED', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED', 'ABORTED'];

export default function OfficerSessionsView() {
  const { ulbId, ulbs } = useOutletContext();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Modals & Drawers
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState(null);

  const currentUlbObj = ulbs?.find(u => u.ulbId === ulbId);
  const ulbName = currentUlbObj?.ulbName || ulbId;

  const loadSessions = useCallback(() => {
    fetchOfficerSessions(ulbId, statusFilter, 200).then(data => {
      setSessions(data || []);
      setLoading(false);
    });
  }, [ulbId, statusFilter]);

  useEffect(() => {
    setLoading(true);
    loadSessions();

    // 3-second auto-refresh to reflect automated background activations & completions
    const interval = setInterval(loadSessions, 3000);
    return () => clearInterval(interval);
  }, [loadSessions]);

  const filtered = statusFilter === 'ALL'
    ? sessions
    : sessions.filter(s => s.status === statusFilter);

  const counts = {};
  STATUS_FILTERS.slice(1).forEach(s => {
    counts[s] = sessions.filter(x => x.status === s).length;
  });

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
      {/* Top action & status filter bar */}
      <div style={{
        padding: '6px 14px',
        background: 'var(--bg-panel)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        flexShrink: 0,
        overflowX: 'auto',
      }}>
        <span style={{ fontFamily: 'var(--text-mono)', fontSize: '8.5px', color: 'var(--text-dim)', letterSpacing: '0.08em', marginRight: '4px' }}>
          STATUS:
        </span>
        {STATUS_FILTERS.map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            style={{
              padding: '3px 10px',
              fontFamily: 'var(--text-mono)',
              fontSize: '8.5px',
              fontWeight: statusFilter === s ? 700 : 400,
              color: statusFilter === s ? 'var(--text-primary)' : 'var(--text-dim)',
              background: statusFilter === s ? 'var(--bg-elevated)' : 'none',
              border: `1px solid ${statusFilter === s ? 'var(--border-active)' : 'var(--border)'}`,
              cursor: 'pointer',
              borderRadius: '2px',
              whiteSpace: 'nowrap',
            }}
          >
            {s} {s !== 'ALL' && counts[s] != null ? `(${counts[s]})` : ''}
          </button>
        ))}

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontFamily: 'var(--text-mono)', fontSize: '8px', color: 'var(--text-dim)' }}>
            {filtered.length} / {sessions.length} missions
          </span>

          <button
            onClick={() => setIsCreateOpen(true)}
            style={{
              padding: '4px 12px',
              fontFamily: 'var(--text-mono)',
              fontSize: '8.5px',
              fontWeight: 700,
              background: 'var(--accent)',
              border: '1px solid var(--accent)',
              color: '#fff',
              cursor: 'pointer',
              borderRadius: '2px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              whiteSpace: 'nowrap',
            }}
          >
            <span>+</span>
            <span>NEW OPERATIONAL MISSION</span>
          </button>
        </div>
      </div>

      {/* Session list table */}
      <SessionList
        sessions={filtered}
        loading={loading}
        ulbs={ulbs}
        fixedUlbId={ulbId}
        filterUlb={ulbId}
        showCamera={true}
        ulbId={ulbId}
        onSelectSession={(s) => setSelectedSessionId(s.operationalSessionId || s.sessionId)}
      />

      {/* Wizard Modal for Session Creation */}
      <CreateSessionModal
        ulbId={ulbId}
        ulbName={ulbName}
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreated={(newSession) => {
          loadSessions();
          if (newSession?.operationalSessionId) {
            setSelectedSessionId(newSession.operationalSessionId);
          }
        }}
      />

      {/* Live Operations & Monitoring Drawer */}
      <SessionControlDrawer
        sessionId={selectedSessionId}
        ulbId={ulbId}
        isOpen={Boolean(selectedSessionId)}
        onClose={() => setSelectedSessionId(null)}
        onStateChanged={loadSessions}
      />
    </div>
  );
}
