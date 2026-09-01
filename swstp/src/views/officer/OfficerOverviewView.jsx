/**
 * OfficerOverviewView.jsx — /officer/overview?ulb=:ulbId
 *
 * Operations-first overview: single interactive live fleet map with integrated
 * active sessions list and vehicle drawer.
 * Receives context from OfficerLayout via useOutletContext.
 */
import { useOutletContext } from 'react-router-dom';
import FleetMap from '../../components/fleet/FleetMap.jsx';

export default function OfficerOverviewView() {
  const { ulbId, fleet, loading, ulbs } = useOutletContext();

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
      <FleetMap
        fleet={fleet}
        ulbs={ulbs}
        fixedUlbId={ulbId}
        loading={loading}
        lastRefresh={null}
        onSelectLiveDebug={null} /* Officer has no live debug */
      />
    </div>
  );
}
