/**
 * OfficerView — /officer?ulb=<ULB_CODE>
 *
 * Single-ULB operational console for municipal field officers.
 * Features:
 *   1. Operational KPI Ribbon (Total Fleet, Active Field Units, Depot Offline, Safe Zone Status).
 *   2. Live Operations Map (scoped fleet, safe-zone perimeter, offline last-known markers).
 *   3. Vehicle Fleet & Camera Inspection (per-vehicle camera toggles).
 *   4. Session Logs & Field Devices (strictly scoped).
 *
 * HARD SCOPING RULES:
 *   1. No ulbId in URL → show "No ULB selected" error. Never fall back to all-ULBs.
 *   2. Officer NEVER sees cross-ULB summary, cross-ULB switcher, or Live Debug tab.
 *   3. All data queries use fixedUlbId=ulbId from useSearchParams().
 */
import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  FleetPanel,
  SessionsPanel,
  VehiclesPanel,
  DevicesPanel,
  TabBar,
} from '../components/AdminPanels.jsx';
import ErrorBoundary from '../components/ErrorBoundary.jsx';
import { fetchAdminVehicles, fetchAdminFleetLive } from '../telemetry/backendApiClient.js';
import UlbSelectorView from '../components/officer/UlbSelectorView.jsx';

const OFFICER_TABS = [
  { id: 'fleet',    label: '🗺  Fleet Map'          },
  { id: 'vehicles', label: '🚛  Vehicles & Cameras' },
  { id: 'sessions', label: '📋  Session Logs'       },
  { id: 'devices',  label: '🔧  Assigned Devices'   },
];

// ─── Officer root ─────────────────────────────────────────────────────────────
export default function OfficerView() {
  const [searchParams] = useSearchParams();
  const ulbId = searchParams.get('ulb');

  if (!ulbId) return <UlbSelectorView />;

  return <OfficerConsole ulbId={ulbId} />;
}

function OfficerConsole({ ulbId }) {
  const [tab, setTab] = useState('fleet');
  const [vehicles, setVehicles] = useState([]);
  const [fleet, setFleet] = useState([]);
  const [loading, setLoading] = useState(true);

  // Scoped data load for operational summary and safe-zone data
  const loadScopedData = () => {
    Promise.all([
      fetchAdminVehicles(ulbId),
      fetchAdminFleetLive(ulbId),
    ]).then(([vList, fList]) => {
      setVehicles(vList || []);
      setFleet(fList || []);
      setLoading(false);
    }).catch((err) => {
      console.warn('[OfficerView] Failed to load scoped data:', err);
      setLoading(false);
    });
  };

  useEffect(() => {
    loadScopedData();
    const interval = setInterval(loadScopedData, 15000);
    return () => clearInterval(interval);
  }, [ulbId]);

  const firstVehicle = vehicles[0];
  const ulbName = firstVehicle?.ulbName || ulbId;
  const safeZoneLat = firstVehicle?.safeZoneLatitude;
  const safeZoneLon = firstVehicle?.safeZoneLongitude;
  const safeZoneRadius = firstVehicle?.safeZoneRadiusMeters;

  const ulbsForPanel = [{
    ulbId,
    ulbName,
    safeZoneLatitude: safeZoneLat,
    safeZoneLongitude: safeZoneLon,
    safeZoneRadiusMeters: safeZoneRadius,
  }];

  const activeCount = fleet.filter(f => f.isLive !== false).length;
  const offlineCount = Math.max(0, vehicles.length - activeCount);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-base)', overflow: 'hidden' }}>
      {/* Officer Header — Operational tone */}
      <div className="view-header">
        <span className="view-header__title">Fleet Operations</span>
        <span className="view-header__sep" />
        <span className="view-header__meta" style={{ color: '#00d9ff' }}>
          {ulbName}
        </span>
        <span className="view-header__spacer" />
        <span className="rate-badge" style={{ color: 'var(--status-ok)', borderColor: 'var(--status-ok)' }}>
          ● OPERATIONAL
        </span>
      </div>

      {/* Operational KPI Ribbon */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        padding: '8px 14px',
        background: 'var(--bg-panel)',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
        overflowX: 'auto',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '12px' }}>🚛</span>
          <div>
            <div style={{ fontFamily: 'var(--text-mono)', fontSize: '8px', color: 'var(--text-dim)' }}>TOTAL FLEET</div>
            <div style={{ fontFamily: 'var(--text-mono)', fontSize: '11px', fontWeight: 700, color: 'var(--text-primary)' }}>
              {loading ? '…' : vehicles.length}
            </div>
          </div>
        </div>

        <div style={{ width: '1px', height: '18px', background: 'var(--border)' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '12px' }}>🟢</span>
          <div>
            <div style={{ fontFamily: 'var(--text-mono)', fontSize: '8px', color: 'var(--text-dim)' }}>ACTIVE IN FIELD</div>
            <div style={{ fontFamily: 'var(--text-mono)', fontSize: '11px', fontWeight: 700, color: 'var(--status-ok)' }}>
              {loading ? '…' : activeCount}
            </div>
          </div>
        </div>

        <div style={{ width: '1px', height: '18px', background: 'var(--border)' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '12px' }}>💤</span>
          <div>
            <div style={{ fontFamily: 'var(--text-mono)', fontSize: '8px', color: 'var(--text-dim)' }}>DEPOT / OFFLINE</div>
            <div style={{ fontFamily: 'var(--text-mono)', fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)' }}>
              {loading ? '…' : offlineCount}
            </div>
          </div>
        </div>

        <div style={{ width: '1px', height: '18px', background: 'var(--border)' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '12px' }}>🛡</span>
          <div>
            <div style={{ fontFamily: 'var(--text-mono)', fontSize: '8px', color: 'var(--text-dim)' }}>SAFE ZONE PERIMETER</div>
            <div style={{ fontFamily: 'var(--text-mono)', fontSize: '9.5px', fontWeight: 600, color: safeZoneRadius ? 'var(--status-ok)' : 'var(--text-dim)' }}>
              {safeZoneRadius ? `${safeZoneRadius} m radius` : 'Not Configured'}
            </div>
          </div>
        </div>
      </div>

      {/* Tab bar — 4 operational tabs */}
      <TabBar tabs={OFFICER_TABS} active={tab} onSelect={setTab} idPrefix="officer-tab" />

      {/* Tab content — fixedUlbId always set to ulbId */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
        {tab === 'fleet'    && <ErrorBoundary name="Fleet Live"><FleetPanel    ulbs={ulbsForPanel} fixedUlbId={ulbId} /></ErrorBoundary>}
        {tab === 'vehicles' && <ErrorBoundary name="Vehicles"><VehiclesPanel ulbs={ulbsForPanel} fixedUlbId={ulbId} /></ErrorBoundary>}
        {tab === 'sessions' && <ErrorBoundary name="Sessions"><SessionsPanel ulbs={ulbsForPanel} fixedUlbId={ulbId} /></ErrorBoundary>}
        {tab === 'devices'  && <ErrorBoundary name="Devices"><DevicesPanel  fixedUlbId={ulbId} /></ErrorBoundary>}
      </div>
    </div>
  );
}
