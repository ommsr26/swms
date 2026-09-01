/**
 * AdminOverviewView.jsx — /admin/overview
 *
 * Cross-ULB administrative overview.
 * Shows: ULB count, vehicle count, device count, active sessions,
 *         live vehicles, offline vehicles, plus fleet map.
 *
 * Receives ULB context from AdminLayout via useOutletContext.
 * No operational controls — inspection only.
 */
import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { fetchAdminFleetLive, fetchAdminDevices } from '../../telemetry/backendApiClient.js';
import KpiRibbon from '../../components/common/KpiRibbon.jsx';
import FleetMap from '../../components/fleet/FleetMap.jsx';

export default function AdminOverviewView() {
  const { ulbs, ulbsLoading } = useOutletContext();
  const [fleet, setFleet]       = useState([]);
  const [devices, setDevices]   = useState([]);
  const [fleetLoading, setFleetLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetchAdminFleetLive(null),
      fetchAdminDevices(),
    ]).then(([f, d]) => {
      setFleet(f || []);
      setDevices(d || []);
      setFleetLoading(false);
    });
    const interval = setInterval(() => {
      fetchAdminFleetLive(null).then(f => setFleet(f || []));
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const liveCount    = fleet.filter(v => v.isLive === true).length;
  const offlineCount = fleet.filter(v => v.isLive !== true).length;
  const onlineDevices = devices.filter(d => d.isOnline === true).length;

  const totalVehicles = ulbs.reduce((sum, u) => sum + (u.vehicleCount ?? 0), 0);

  const kpiMetrics = [
    { label: 'ULBs',          value: ulbsLoading ? '…' : ulbs.length,          icon: '🏛' },
    { label: 'VEHICLES',       value: ulbsLoading ? '…' : totalVehicles,         icon: '🚛' },
    { label: 'DEVICES',        value: fleetLoading ? '…' : devices.length,       icon: '🔧' },
    { label: 'LIVE NOW',       value: fleetLoading ? '…' : liveCount,            color: liveCount > 0 ? 'var(--status-ok)' : 'var(--text-primary)', icon: '●' },
    { label: 'OFFLINE',        value: fleetLoading ? '…' : offlineCount,         color: 'var(--text-dim)', icon: '○' },
    { label: 'DEVICES ONLINE', value: fleetLoading ? '…' : onlineDevices,        color: onlineDevices > 0 ? 'var(--status-ok)' : 'var(--text-dim)', icon: '📡' },
  ];

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
      {/* KPI strip */}
      <KpiRibbon metrics={kpiMetrics} loading={ulbsLoading && fleetLoading} />

      {/* Cross-ULB fleet map */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <FleetMap
          fleet={fleet}
          ulbs={ulbs}
          fixedUlbId={null} /* Admin: all ULBs */
          loading={fleetLoading}
          lastRefresh={null}
          onSelectLiveDebug={null} /* Overview: inspection only, telemetry via /admin/telemetry */
        />
      </div>
    </div>
  );
}
