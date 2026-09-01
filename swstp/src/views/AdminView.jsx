/**
 * AdminView — /admin
 *
 * Cross-ULB admin console. Four tab panels:
 *   Fleet Live · Sessions · Vehicles · Devices
 *
 * All panel components are imported from AdminPanels.jsx and shared
 * with OfficerView.jsx. This file contains only the Admin shell
 * (ULB summary strip, tab routing, data fetching for ULB list).
 *
 * fixedUlbId is null for Admin — all ULB filter dropdowns are visible.
 */
import { useState, useEffect } from 'react';
import { fetchAdminUlbs } from '../telemetry/backendApiClient.js';
import {
  FleetPanel,
  LiveDebugPanel,
  SessionsPanel,
  VehiclesPanel,
  DevicesPanel,
  TabBar,
} from '../components/AdminPanels.jsx';
import ErrorBoundary from '../components/ErrorBoundary.jsx';

const ADMIN_TABS = [
  { id: 'fleet',     label: '🗺  Fleet Live' },
  { id: 'livedebug', label: '⚡  Live Debug' },
  { id: 'sessions',  label: '📋  Sessions'   },
  { id: 'vehicles',  label: '🚛  Vehicles'   },
  { id: 'devices',   label: '🔧  Devices'    },
];

// ─── ULB Summary bar (Admin-only — not shown on Officer screen) ───────────────
function UlbSummaryBar({ ulbs, loading }) {
  if (loading) return null;
  if (ulbs.length === 0) return (
    <div style={{ padding: '8px 14px', background: 'var(--bg-panel)', borderBottom: '1px solid var(--border)', fontFamily: 'var(--text-mono)', fontSize: '9px', color: 'var(--text-dim)' }}>
      No ULBs found — add vehicles to VehicleRegistry to populate.
    </div>
  );
  return (
    <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', flexShrink: 0, overflowX: 'auto' }}>
      {ulbs.map(u => (
        <div key={u.ulbId} style={{ padding: '7px 16px', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '3px', minWidth: '150px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
            <span style={{ fontFamily: 'var(--text-mono)', fontSize: '9px', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '0.04em' }}>
              {u.ulbName}
            </span>
            {u.safeZoneRadiusMeters != null && (
              <span style={{ fontFamily: 'var(--text-mono)', fontSize: '7.5px', color: 'var(--status-ok)', background: 'rgba(45,198,83,0.1)', padding: '1px 3px', borderRadius: '2px' }}>
                🛡 {u.safeZoneRadiusMeters}m
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <span style={{ fontFamily: 'var(--text-mono)', fontSize: '8.5px', color: 'var(--text-dim)' }}>🚛 {u.vehicleCount}</span>
            <span style={{ fontFamily: 'var(--text-mono)', fontSize: '8.5px', color: 'var(--text-dim)' }}>🔧 {u.deviceCount}</span>
            <span style={{ fontFamily: 'var(--text-mono)', fontSize: '8.5px', color: u.activeSessionsToday > 0 ? 'var(--status-ok)' : 'var(--text-dim)' }}>
              ● {u.activeSessionsToday} LIVE
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Admin root ───────────────────────────────────────────────────────────────
export default function AdminView() {
  const [tab, setTab]                       = useState('fleet');
  const [debugSessionId, setDebugSessionId] = useState(null);
  const [ulbs, setUlbs]                     = useState([]);
  const [ulbsLoading, setUlbsLoading]       = useState(true);

  useEffect(() => {
    fetchAdminUlbs().then(data => {
      setUlbs(data || []);
      setUlbsLoading(false);
    });
  }, []);

  const handleOpenLiveDebug = (sessionId) => {
    setDebugSessionId(sessionId);
    setTab('livedebug');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-base)', overflow: 'hidden' }}>
      {/* Header */}
      <div className="view-header">
        <span className="view-header__title">Admin Console</span>
        <span className="view-header__sep" />
        <span className="view-header__meta">CROSS-ULB · MSSQL 192.168.1.8</span>
        <span className="view-header__spacer" />
        <span className="rate-badge">
          {ulbsLoading ? '…' : `${ulbs.length} ULB${ulbs.length !== 1 ? 's' : ''}`}
        </span>
      </div>

      {/* ULB summary strip — Admin-only, no Officer equivalent */}
      <UlbSummaryBar ulbs={ulbs} loading={ulbsLoading} />

      {/* Tab bar */}
      <TabBar tabs={ADMIN_TABS} active={tab} onSelect={setTab} idPrefix="admin-tab" />

      {/* Tab content — fixedUlbId is null: Admin sees all ULBs */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
        {tab === 'fleet'     && <ErrorBoundary name="Fleet Live"><FleetPanel    ulbs={ulbs} fixedUlbId={null} onSelectLiveDebug={handleOpenLiveDebug} /></ErrorBoundary>}
        {tab === 'livedebug' && <ErrorBoundary name="Live Debug"><LiveDebugPanel initialSessionId={debugSessionId} onSelectSession={setDebugSessionId} /></ErrorBoundary>}
        {tab === 'sessions'  && <ErrorBoundary name="Sessions"><SessionsPanel ulbs={ulbs} fixedUlbId={null} /></ErrorBoundary>}
        {tab === 'vehicles'  && <ErrorBoundary name="Vehicles"><VehiclesPanel ulbs={ulbs} fixedUlbId={null} /></ErrorBoundary>}
        {tab === 'devices'   && <ErrorBoundary name="Devices"><DevicesPanel  fixedUlbId={null} /></ErrorBoundary>}
      </div>
    </div>
  );
}
