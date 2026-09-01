/**
 * AdminSessionsView.jsx — /admin/sessions
 *
 * Cross-ULB session registry inspection.
 * All sessions with ULB filter, status, duration, camera side-pane.
 */
import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { fetchAdminSessions } from '../../telemetry/backendApiClient.js';
import SessionList from '../../components/session/SessionList.jsx';

const STATUS_FILTERS = ['ALL', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'ABORTED'];

export default function AdminSessionsView() {
  const { ulbs } = useOutletContext();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterUlb, setFilterUlb] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  useEffect(() => {
    setLoading(true);
    fetchAdminSessions(filterUlb || null, 200).then(data => {
      setSessions(data || []);
      setLoading(false);
    });
  }, [filterUlb]);

  const filtered = statusFilter === 'ALL'
    ? sessions
    : sessions.filter(s => s.status === statusFilter);

  const counts = {};
  STATUS_FILTERS.slice(1).forEach(s => {
    counts[s] = sessions.filter(x => x.status === s).length;
  });

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Status filter */}
      <div style={{ padding: '5px 14px', background: 'var(--bg-panel)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0, overflowX: 'auto' }}>
        <span style={{ fontFamily: 'var(--text-mono)', fontSize: '8.5px', color: 'var(--text-dim)', letterSpacing: '0.08em', marginRight: '4px' }}>STATUS:</span>
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
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--text-mono)', fontSize: '8px', color: 'var(--text-dim)' }}>
          {filtered.length} / {sessions.length}
        </span>
      </div>

      {/* Session list with ULB filter */}
      <SessionList
        sessions={filtered}
        loading={loading}
        ulbs={ulbs}
        fixedUlbId={null}
        filterUlb={filterUlb}
        onUlbChange={setFilterUlb}
        showCamera={true}
        ulbId={null}
      />
    </div>
  );
}
