/**
 * AdminCamerasView.jsx — /admin/cameras
 *
 * Cross-ULB camera inspection matrix.
 * Admin can view camera feeds for any device (no ULB scope restriction).
 * Grid shows all vehicles with assigned devices across all ULBs.
 */
import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { fetchAdminVehicles } from '../../telemetry/backendApiClient.js';
import CameraMatrixGrid from '../../components/camera/CameraMatrixGrid.jsx';

export default function AdminCamerasView() {
  const { ulbs } = useOutletContext();
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterUlb, setFilterUlb] = useState('');

  useEffect(() => {
    setLoading(true);
    fetchAdminVehicles(filterUlb || null).then(data => {
      setVehicles(data || []);
      setLoading(false);
    });
  }, [filterUlb]);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Filter bar */}
      <div style={{ padding: '6px 14px', background: 'var(--bg-panel)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
        <span style={{ fontFamily: 'var(--text-mono)', fontSize: '8.5px', color: 'var(--text-dim)' }}>ULB:</span>
        <select
          value={filterUlb}
          onChange={e => setFilterUlb(e.target.value)}
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-mid)', color: 'var(--text-primary)', fontFamily: 'var(--text-mono)', fontSize: '9px', padding: '2px 6px', outline: 'none' }}
        >
          <option value="">ALL ULBs</option>
          {ulbs.map(u => <option key={u.ulbId} value={u.ulbId}>{u.ulbName}</option>)}
        </select>
        <span style={{ fontFamily: 'var(--text-mono)', fontSize: '8px', color: 'var(--text-dim)' }}>
          {vehicles.filter(v => v.assignedDeviceCode).length} devices · snapshot polling 1.5s · Admin = unrestricted
        </span>
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--text-mono)', fontSize: '7.5px', color: 'var(--status-warn)' }}>
          ⓘ On-demand continuous streaming planned for future milestone
        </span>
      </div>

      {/* Camera grid (ulbId=null → Admin unrestricted) */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
        <CameraMatrixGrid
          vehicles={vehicles}
          ulbId={null}
          loading={loading}
        />
      </div>
    </div>
  );
}
