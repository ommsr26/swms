/**
 * SessionList.jsx — Compact session list component.
 *
 * Renders a table of operational sessions with status pills, duration,
 * device/vehicle info, camera side-pane toggle, and live mission management.
 * Used by OfficerSessionsView and AdminSessionsView.
 */
import { useState } from 'react';
import { THead, TRow, TD, LoadingRow, EmptyRow } from '../common/TablePrimitives.jsx';
import { SessionStatusPill } from '../common/StatusBadge.jsx';
import CameraViewer from '../CameraViewer.jsx';

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

function fmtDur(startedAt, completedAt) {
  if (!startedAt) return '—';
  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const sec = Math.max(0, Math.floor((end - start) / 1000));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60).toString().padStart(2, '0');
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
}

export default function SessionList({
  sessions = [],
  loading = false,
  ulbs = [],
  fixedUlbId = null,
  filterUlb = '',
  onUlbChange = null,
  showCamera = true,
  ulbId = null,
  onSelectSession = null,
}) {
  const [cameraDeviceId, setCameraDeviceId] = useState(null);

  const cols = showCamera
    ? ['#', 'SESSION CODE', 'VEHICLE', 'ULB', 'ROADS', 'STATUS', 'SCHEDULED', 'STARTED', 'DURATION', 'ACTIONS', '📷']
    : ['#', 'SESSION CODE', 'VEHICLE', 'ULB', 'ROADS', 'STATUS', 'SCHEDULED', 'STARTED', 'DURATION', 'ACTIONS'];

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Filter / info bar */}
      <div style={{
        padding: '6px 14px',
        background: 'var(--bg-panel)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        flexShrink: 0,
      }}>
        {!fixedUlbId && onUlbChange && (
          <>
            <span style={{ fontFamily: 'var(--text-mono)', fontSize: '9px', color: 'var(--text-dim)' }}>ULB FILTER:</span>
            <select
              value={filterUlb}
              onChange={e => onUlbChange(e.target.value)}
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-mid)', color: 'var(--text-primary)', fontFamily: 'var(--text-mono)', fontSize: '10px', padding: '2px 6px', outline: 'none' }}
            >
              <option value="">ALL ULBs</option>
              {ulbs.map(u => <option key={u.ulbId} value={u.ulbId}>{u.ulbName}</option>)}
            </select>
          </>
        )}
        {fixedUlbId && (
          <span style={{ fontFamily: 'var(--text-mono)', fontSize: '9px', color: 'var(--text-label)' }}>
            SCOPED TO: <strong style={{ color: 'var(--text-primary)' }}>{ulbs.find(u => u.ulbId === fixedUlbId)?.ulbName ?? fixedUlbId}</strong>
          </span>
        )}
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--text-mono)', fontSize: '8.5px', color: 'var(--text-dim)' }}>
          {sessions.length} sessions
        </span>
        {cameraDeviceId && (
          <button
            onClick={() => setCameraDeviceId(null)}
            style={{ padding: '2px 8px', fontFamily: 'var(--text-mono)', fontSize: '8.5px', background: 'none', border: '1px solid var(--border)', color: 'var(--text-dim)', cursor: 'pointer' }}
          >
            📷 {cameraDeviceId} &nbsp;✕
          </button>
        )}
      </div>

      {/* Table + camera pane */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        <div style={{ flex: 1, overflowY: 'auto', minWidth: 0 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <THead cols={cols} />
            <tbody>
              {loading ? <LoadingRow cols={cols.length} /> :
               sessions.length === 0 ? <EmptyRow cols={cols.length} msg="No sessions found." /> :
               sessions.map(s => {
                 const id = s.operationalSessionId || s.sessionId;
                 const reg = s.vehicleRegistrationNumber || s.vehicleRegistration || `Vehicle #${s.vehicleId}`;
                 const roadCount = s.roadAssignmentCount ?? s.roadAssignments?.length ?? 0;
                 return (
                   <TRow key={id} accent={s.status === 'ACTIVE' ? 'var(--status-ok)' : s.status === 'PAUSED' ? 'var(--status-warn)' : 'var(--border)'}>
                     <TD mono dim>{id}</TD>
                     <TD mono color="var(--text-primary)">
                       <span
                         onClick={() => onSelectSession?.(s)}
                         style={{ cursor: onSelectSession ? 'pointer' : 'default', textDecoration: onSelectSession ? 'underline' : 'none' }}
                       >
                         {s.sessionCode}
                       </span>
                     </TD>
                     <TD mono color="var(--accent)">{reg}</TD>
                     <TD mono color={s.ulbId ? 'var(--text-secondary)' : 'var(--text-dim)'}>{s.ulbName || s.ulbId || '—'}</TD>
                     <TD mono dim>{roadCount > 0 ? `${roadCount} road(s)` : '—'}</TD>
                     <TD mono>
                       <SessionStatusPill status={s.status} />
                     </TD>
                     <TD mono dim>{formatLocalTime(s.scheduledStartAt)}</TD>
                     <TD mono dim>{formatLocalTime(s.actualStartAt, true)}</TD>
                     <TD mono dim>{fmtDur(s.actualStartAt || s.startedAt, s.completedAt)}</TD>
                     <TD mono>
                       {onSelectSession && (
                         <button
                           onClick={() => onSelectSession(s)}
                           style={{
                             padding: '2px 8px',
                             fontFamily: 'var(--text-mono)',
                             fontSize: '8px',
                             fontWeight: 700,
                             background: s.status === 'ACTIVE' ? 'rgba(45,198,83,0.15)' : 'var(--bg-elevated)',
                             border: `1px solid ${s.status === 'ACTIVE' ? 'var(--status-ok)' : 'var(--border)'}`,
                             color: s.status === 'ACTIVE' ? 'var(--status-ok)' : 'var(--text-primary)',
                             cursor: 'pointer',
                             borderRadius: '2px',
                           }}
                         >
                           {s.status === 'ACTIVE' ? '● LIVE OPS' : s.status === 'PAUSED' ? '⏸ PAUSED' : s.status === 'SCHEDULED' ? '⏱ SCHEDULED' : 'VIEW DETAILS'}
                         </button>
                       )}
                     </TD>
                     {showCamera && (
                       <td style={{ padding: '3px 6px', borderBottom: '1px solid var(--border)' }}>
                         {s.deviceCode && (
                           <button
                             onClick={() => setCameraDeviceId(cameraDeviceId === s.deviceCode ? null : s.deviceCode)}
                             title={`Camera: ${s.deviceCode}`}
                             style={{
                               background: cameraDeviceId === s.deviceCode ? 'rgba(0,180,216,0.2)' : 'none',
                               border: `1px solid ${cameraDeviceId === s.deviceCode ? '#00b4d8' : 'var(--border)'}`,
                               color: cameraDeviceId === s.deviceCode ? '#00b4d8' : 'var(--text-dim)',
                               fontFamily: 'var(--text-mono)',
                               fontSize: '9px',
                               padding: '2px 5px',
                               cursor: 'pointer',
                               borderRadius: '2px',
                             }}
                           >📷</button>
                         )}
                       </td>
                     )}
                   </TRow>
                 );
               })}
            </tbody>
          </table>
        </div>

        {/* Camera side pane */}
        {cameraDeviceId && showCamera && (
          <div style={{ width: '260px', flexShrink: 0, borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', background: 'var(--bg-panel)' }}>
            <div style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)', fontFamily: 'var(--text-mono)', fontSize: '9px', fontWeight: 700, color: 'var(--text-dim)', letterSpacing: '0.1em' }}>
              LIVE CAMERA · {cameraDeviceId}
            </div>
            <CameraViewer deviceId={cameraDeviceId} ulbId={ulbId} intervalMs={1500} style={{ flex: 1, minHeight: 0 }} />
          </div>
        )}
      </div>
    </div>
  );
}
