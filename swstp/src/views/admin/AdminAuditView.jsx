/**
 * AdminAuditView.jsx — /admin/audit
 *
 * Live Audit Log inspection view querying GET /api/admin/audit.
 * Displays domain event ledger and state transition history with filtering.
 */
import { useState, useEffect } from 'react';
import { fetchAdminAuditLogs } from '../../telemetry/backendApiClient.js';

const ENTITY_FILTERS = ['ALL', 'OPERATIONAL_SESSION', 'ROAD_ASSIGNMENT', 'COLLECTION_EVENT', 'EVIDENCE_IMAGE'];

export default function AdminAuditView() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [entityFilter, setEntityFilter] = useState('ALL');

  useEffect(() => {
    setLoading(true);
    fetchAdminAuditLogs(null, entityFilter === 'ALL' ? null : entityFilter, null, 100).then(data => {
      setLogs(data || []);
      setLoading(false);
    });
  }, [entityFilter]);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Filter bar */}
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
          ENTITY:
        </span>
        {ENTITY_FILTERS.map(e => (
          <button
            key={e}
            onClick={() => setEntityFilter(e)}
            style={{
              padding: '3px 10px',
              fontFamily: 'var(--text-mono)',
              fontSize: '8.5px',
              fontWeight: entityFilter === e ? 700 : 400,
              color: entityFilter === e ? 'var(--text-primary)' : 'var(--text-dim)',
              background: entityFilter === e ? 'var(--bg-elevated)' : 'none',
              border: `1px solid ${entityFilter === e ? 'var(--border-active)' : 'var(--border)'}`,
              cursor: 'pointer',
              borderRadius: '2px',
              whiteSpace: 'nowrap',
            }}
          >
            {e}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--text-mono)', fontSize: '8px', color: 'var(--text-dim)' }}>
          {logs.length} audit records
        </span>
      </div>

      {/* Log list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px' }}>
        {loading ? (
          <div style={{ padding: '20px', textAlign: 'center', fontFamily: 'var(--text-mono)', fontSize: '10px', color: 'var(--text-dim)' }}>
            Loading audit ledger...
          </div>
        ) : logs.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', fontFamily: 'var(--text-mono)', fontSize: '10px', color: 'var(--text-dim)' }}>
            No audit logs found for the selected filter.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {logs.map(log => (
              <div
                key={log.auditLogId}
                style={{
                  background: 'var(--bg-panel)',
                  border: '1px solid var(--border)',
                  borderRadius: '3px',
                  padding: '8px 12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{
                      fontFamily: 'var(--text-mono)',
                      fontSize: '9px',
                      fontWeight: 700,
                      color: 'var(--accent)',
                      background: 'var(--bg-elevated)',
                      padding: '2px 6px',
                      borderRadius: '2px',
                    }}>
                      {log.action}
                    </span>
                    <span style={{ fontFamily: 'var(--text-mono)', fontSize: '8.5px', color: 'var(--text-dim)' }}>
                      {log.entityType} #{log.entityId}
                    </span>
                    {log.ulbId && (
                      <span style={{ fontFamily: 'var(--text-mono)', fontSize: '8px', color: 'var(--text-dim)', borderLeft: '1px solid var(--border)', paddingLeft: '6px' }}>
                        {log.ulbId}
                      </span>
                    )}
                  </div>
                  <span style={{ fontFamily: 'var(--text-mono)', fontSize: '8px', color: 'var(--text-dim)' }}>
                    {new Date(log.performedAt).toLocaleString()}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '2px' }}>
                  <span style={{ fontFamily: 'var(--text-mono)', fontSize: '8px', color: 'var(--text-dim)' }}>
                    By: <strong style={{ color: 'var(--text-primary)' }}>{log.performedBy}</strong>
                  </span>
                  {log.detailsJson && (
                    <span style={{ fontFamily: 'var(--text-mono)', fontSize: '7.5px', color: 'var(--text-dim)', maxWidth: '600px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {log.detailsJson}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
