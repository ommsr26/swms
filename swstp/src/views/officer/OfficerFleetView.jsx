/**
 * OfficerFleetView.jsx — /officer/fleet?ulb=:ulbId
 *
 * Dedicated fleet map for the officer's ULB.
 * Clicking a vehicle opens a VehicleDrawer with full telemetry snapshot.
 * Camera shortcut opens a camera side-pane.
 */
import { useOutletContext } from 'react-router-dom';
import FleetMap from '../../components/fleet/FleetMap.jsx';

export default function OfficerFleetView() {
  const { ulbId, fleet, ulbs, loading } = useOutletContext();

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
      <FleetMap
        fleet={fleet}
        ulbs={ulbs}
        fixedUlbId={ulbId}
        loading={loading}
        lastRefresh={null}
        onSelectLiveDebug={null} /* Officer role: no live debug access */
      />
    </div>
  );
}
