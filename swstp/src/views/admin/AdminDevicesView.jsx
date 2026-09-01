/**
 * AdminDevicesView.jsx — /admin/devices
 *
 * Cross-ULB IoT device registry inspection.
 * Shows all registered devices with online status, last seen, and vehicle assignments.
 */
import { useState, useEffect } from 'react';
import { fetchAdminDevices } from '../../telemetry/backendApiClient.js';
import { THead, TRow, TD, LoadingRow, EmptyRow, StatusDot } from '../../components/common/TablePrimitives.jsx';

function fmtAge(sec) {
  if (sec == null) return 'NEVER';
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  return `${Math.floor(sec / 3600)}h ago`;
}

export default function AdminDevicesView() {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    fetchAdminDevices().then(data => {
      setDevices(data || []);
      setLoading(false);
    });
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, []);

  const onlineCount = devices.filter(d => d.isOnline).length;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '6px 14px', background: 'var(--bg-panel)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', flexShrink: 0, gap: '12px' }}>
        <span style={{ fontFamily: 'var(--text-mono)', fontSize: '8.5px', color: 'var(--text-dim)' }}>
          {devices.length} devices · {onlineCount} online · heartbeat 15s · online = seen &lt; 30s ago
        </span>
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <THead cols={['DEVICE CODE', 'HW VER.', 'FW VER.', 'ONLINE', 'LAST SEEN', 'VEHICLE', 'ULB', 'ACTIVE ASSIGN.']} />
          <tbody>
            {loading ? <LoadingRow cols={8} /> :
             devices.length === 0 ? <EmptyRow cols={8} msg="No devices found." /> :
             devices.map(d => (
               <TRow key={d.deviceId} accent={d.isOnline ? 'var(--status-ok)' : 'var(--status-off)'}>
                 <TD mono color="var(--text-primary)">{d.deviceCode}</TD>
                 <TD mono dim>{d.hardwareVersion || '—'}</TD>
                 <TD mono dim>{d.firmwareVersion || '—'}</TD>
                 <TD mono>
                   <StatusDot ok={d.isOnline} />
                   <span style={{ color: d.isOnline ? 'var(--status-ok)' : 'var(--text-dim)' }}>
                     {d.isOnline ? 'ONLINE' : 'OFFLINE'}
                   </span>
                 </TD>
                 <TD mono dim>{fmtAge(d.secondsSinceLastSeen)}</TD>
                 <TD mono color={d.assignedVehicleReg ? 'var(--text-secondary)' : 'var(--text-dim)'}>
                   {d.assignedVehicleReg || 'UNASSIGNED'}
                 </TD>
                 <TD mono dim>{d.assignedVehicleUlbName || d.assignedVehicleUlbId || '—'}</TD>
                 <TD mono color={d.isActive ? 'var(--status-ok)' : 'var(--status-error)'}>
                   {d.isActive ? 'YES' : 'NO'}
                 </TD>
               </TRow>
             ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
