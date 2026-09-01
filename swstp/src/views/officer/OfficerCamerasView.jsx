/**
 * OfficerCamerasView.jsx — /officer/cameras?ulb=:ulbId
 *
 * Multi-vehicle camera grid for the officer's ULB.
 * Each tile supports: STREAM OFF → [START LIVE FEED] → LIVE → [STOP]
 *
 * Current milestone: snapshot polling via CameraViewer (1.5s intervals).
 * On-demand continuous streaming will be added in streaming milestone.
 *
 * Camera ULB scope enforced: ulbId always passed to CameraViewer.
 * Server returns 403 if device is outside caller's ULB.
 */
import { useOutletContext } from 'react-router-dom';
import CameraMatrixGrid from '../../components/camera/CameraMatrixGrid.jsx';

export default function OfficerCamerasView() {
  const { ulbId, vehicles, loading } = useOutletContext();

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Info bar */}
      <div style={{
        padding: '5px 14px',
        background: 'var(--bg-panel)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        flexShrink: 0,
      }}>
        <span style={{ fontFamily: 'var(--text-mono)', fontSize: '8.5px', color: 'var(--text-dim)' }}>
          {vehicles.filter(v => v.assignedDeviceCode).length} devices · snapshot polling 1.5s · ULB scope enforced
        </span>
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--text-mono)', fontSize: '7.5px', color: 'var(--status-warn)' }}>
          ⓘ On-demand continuous streaming will be enabled in a future milestone
        </span>
      </div>

      {/* Camera grid */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
        <CameraMatrixGrid
          vehicles={vehicles}
          ulbId={ulbId}
          loading={loading}
        />
      </div>
    </div>
  );
}
