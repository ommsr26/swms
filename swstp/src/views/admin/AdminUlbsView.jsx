/**
 * AdminUlbsView.jsx — /admin/ulbs
 *
 * Cross-ULB registry inspection. Shows all ULBs with their operational stats.
 * Admin inspection only — no ULB create/edit/delete controls.
 */
import { useOutletContext } from 'react-router-dom';
import { THead, TRow, TD, LoadingRow, EmptyRow } from '../../components/common/TablePrimitives.jsx';

export default function AdminUlbsView() {
  const { ulbs, ulbsLoading } = useOutletContext();

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Info bar */}
      <div style={{ padding: '6px 14px', background: 'var(--bg-panel)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
        <span style={{ fontFamily: 'var(--text-mono)', fontSize: '8.5px', color: 'var(--text-dim)' }}>
          {ulbs.length} ULBs registered · read-only inspection
        </span>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <THead cols={['ULB ID', 'NAME', 'VEHICLES', 'DEVICES', 'LIVE SESSIONS', 'SAFE ZONE CENTER', 'SAFE ZONE RADIUS']} />
          <tbody>
            {ulbsLoading ? <LoadingRow cols={7} /> :
             ulbs.length === 0 ? <EmptyRow cols={7} msg="No ULBs found. Seed vehicle data to populate." /> :
             ulbs.map(u => (
               <TRow key={u.ulbId} accent="var(--border-mid)">
                 <TD mono dim>{u.ulbId}</TD>
                 <TD mono color="var(--text-primary)">{u.ulbName}</TD>
                 <TD mono>{u.vehicleCount ?? '—'}</TD>
                 <TD mono>{u.deviceCount ?? '—'}</TD>
                 <TD mono color={u.activeSessionsToday > 0 ? 'var(--status-ok)' : 'var(--text-dim)'}>
                   {u.activeSessionsToday > 0 ? `● ${u.activeSessionsToday} LIVE` : '○ NONE'}
                 </TD>
                 <TD mono dim>
                   {u.safeZoneLatitude != null && u.safeZoneLongitude != null
                     ? `${u.safeZoneLatitude.toFixed(5)}, ${u.safeZoneLongitude.toFixed(5)}`
                     : '—'}
                 </TD>
                 <TD mono color={u.safeZoneRadiusMeters ? 'var(--status-ok)' : 'var(--text-dim)'}>
                   {u.safeZoneRadiusMeters ? `${u.safeZoneRadiusMeters} m` : 'Not configured'}
                 </TD>
               </TRow>
             ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
