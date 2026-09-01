/**
 * AdminFleetView.jsx — /admin/fleet
 *
 * Cross-ULB fleet map with vehicle inspection and live debug navigation.
 */
import { useState, useEffect } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { fetchAdminFleetLive } from '../../telemetry/backendApiClient.js';
import FleetMap from '../../components/fleet/FleetMap.jsx';

export default function AdminFleetView() {
  const { ulbs } = useOutletContext();
  const navigate = useNavigate();
  const [fleet, setFleet] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);

  const load = () => {
    fetchAdminFleetLive(null).then(data => {
      setFleet(data || []);
      setLastRefresh(new Date());
      setLoading(false);
    });
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, []);

  // Navigate to Telemetry view pre-selecting the session
  const handleOpenLiveDebug = (sessionId) => {
    navigate(`/admin/telemetry?session=${sessionId}`);
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
      <FleetMap
        fleet={fleet}
        ulbs={ulbs}
        fixedUlbId={null}
        loading={loading}
        lastRefresh={lastRefresh}
        onSelectLiveDebug={handleOpenLiveDebug}
      />
    </div>
  );
}
