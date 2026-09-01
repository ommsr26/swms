/**
 * OfficerLayout.jsx — ULB Officer console shell layout.
 *
 * Provides:
 *   - Compact view-header with ULB name, operational status, and Alert Notification bell
 *   - KPI ribbon: Total Fleet, Active in Field, Depot/Offline, Alerts, Safe Zone
 *   - Operational Alerts slide-out drawer (Real-time SignalR backed)
 *   - Horizontal tab navigation: 6 sections (URL-driven)
 *   - Outlet for nested route content
 */
import { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import {
  fetchAdminVehicles,
  fetchAdminFleetLive,
  fetchOfficerAlerts,
} from '../telemetry/backendApiClient.js';
import {
  subscribeToFleetRealtime,
  subscribeToAlertsRealtime,
} from '../telemetry/SignalRTelemetrySource.js';
import KpiRibbon from '../components/common/KpiRibbon.jsx';
import ErrorBoundary from '../components/ErrorBoundary.jsx';
import UlbSelectorView from '../components/officer/UlbSelectorView.jsx';
import AlertDrawer from '../components/alerts/AlertDrawer.jsx';

const OFFICER_TABS = [
  { id: 'overview', label: 'OVERVIEW' },
  { id: 'timeline', label: '📅 TIMELINE' },
  { id: 'sessions', label: 'SESSIONS' },
  { id: 'fleet', label: 'FLEET' },
  { id: 'coverage', label: 'COVERAGE' },
  { id: 'evidence', label: 'EVIDENCE' },
  { id: 'cameras', label: 'CAMERAS' },
];

// ─── Horizontal tab nav (URL-driven, preserves ?ulb=) ─────────────────────────
function OfficerTabBar({ active, onSelect }) {
  return (
    <div
      style={{
        display: 'flex',
        background: 'var(--bg-panel)',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
        overflowX: 'auto',
      }}
    >
      {OFFICER_TABS.map((t) => (
        <button
          key={t.id}
          id={`officer-nav-${t.id}`}
          onClick={() => onSelect(t.id)}
          style={{
            padding: '8px 16px',
            fontFamily: 'var(--text-mono)',
            fontSize: '9.5px',
            fontWeight: active === t.id ? 700 : 400,
            color: active === t.id ? 'var(--text-primary)' : 'var(--text-dim)',
            background: 'none',
            border: 'none',
            borderBottom: active === t.id ? '2px solid #00d9ff' : '2px solid transparent',
            cursor: 'pointer',
            letterSpacing: '0.07em',
            transition: 'color 0.12s',
            whiteSpace: 'nowrap',
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ─── Officer Layout root ──────────────────────────────────────────────────────
export default function OfficerLayout() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();

  const ulbId = searchParams.get('ulb');

  if (!ulbId) {
    return <UlbSelectorView />;
  }

  return <OfficerConsoleShell ulbId={ulbId} location={location} navigate={navigate} />;
}

function OfficerConsoleShell({ ulbId, location, navigate }) {
  const [vehicles, setVehicles] = useState([]);
  const [fleet, setFleet] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [isAlertDrawerOpen, setIsAlertDrawerOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  // Derive active tab from current URL path
  const pathSegments = location.pathname.split('/');
  const activeTab = pathSegments[2] || 'overview'; // /officer/:tab

  const loadScopedData = () => {
    Promise.all([
      fetchAdminVehicles(ulbId),
      fetchAdminFleetLive(ulbId),
      fetchOfficerAlerts(ulbId),
    ]).then(([vList, fList, aList]) => {
      setVehicles(vList || []);
      setFleet(fList || []);
      setAlerts(aList || []);
      setLoading(false);
    }).catch((err) => {
      console.warn('[OfficerLayout] Failed to load scoped data:', err);
      setLoading(false);
    });
  };

  useEffect(() => {
    setLoading(true);
    loadScopedData();

    let unsubFleet = () => {};
    let unsubAlerts = () => {};

    // Subscribe to fleet updates
    subscribeToFleetRealtime(
      ulbId,
      (truck) => {
        if (!truck) return;
        setFleet((prevFleet) => {
          const reg = truck.registration;
          const devId = truck.vehicleId;
          const devCode = truck.deviceCode;

          const idx = prevFleet.findIndex(
            (f) =>
              (reg && f.vehicleRegistration === reg) ||
              (devId && f.deviceId === devId) ||
              (devCode && f.deviceCode === devCode)
          );

          const updatedTruck = {
            sessionId: truck.sessionId,
            deviceId: truck.vehicleId,
            deviceCode: truck.deviceCode || 'UNASSIGNED',
            vehicleRegistration: truck.registration,
            ulbId: truck.ulbId,
            ulbName: truck.ulbName,
            hasPosition: (truck.displayLat != null && truck.displayLon != null) || (truck.rawLat != null && truck.rawLon != null),
            isLive: truck.isLive,
            isLastKnown: !truck.isLive,
            lat: truck.displayLat ?? truck.rawLat,
            lon: truck.displayLon ?? truck.rawLon,
            rawLat: truck.rawLat,
            rawLon: truck.rawLon,
            displayLat: truck.displayLat,
            displayLon: truck.displayLon,
            isInsideSafeZone: truck.isInsideSafeZone,
            isSnapped: truck.isSnapped,
            speed: truck.speed,
            heading: truck.heading,
            lastPositionAt: truck.lastSeen,
          };

          if (idx >= 0) {
            const next = [...prevFleet];
            next[idx] = { ...next[idx], ...updatedTruck };
            return next;
          }
          return [...prevFleet, updatedTruck];
        });
      },
      () => {
        console.log('[OfficerLayout] SignalR reconnected -> Reconciling snapshot');
        loadScopedData();
      }
    ).then((fn) => {
      unsubFleet = fn;
    });

    // Subscribe to operational alerts
    subscribeToAlertsRealtime(
      ulbId,
      (newAlert) => {
        if (!newAlert) return;
        setAlerts((prev) => {
          const existingIdx = prev.findIndex((a) => a.alertId === newAlert.alertId);
          if (existingIdx >= 0) {
            const updated = [...prev];
            updated[existingIdx] = { ...updated[existingIdx], ...newAlert };
            return updated;
          }
          return [newAlert, ...prev];
        });
      },
      (resolved) => {
        if (!resolved) return;
        setAlerts((prev) =>
          prev.map((a) =>
            a.alertId === resolved.alertId
              ? { ...a, status: 'RESOLVED', resolvedAt: resolved.resolvedAt }
              : a
          )
        );
      }
    ).then((fn) => {
      unsubAlerts = fn;
    });

    // Browser tab sleep/foregrounding handler: immediately refresh snapshot when returning to tab
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('[OfficerLayout] Tab became visible -> Reconciling snapshot');
        loadScopedData();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Background reconciliation heartbeat every 30s
    const interval = setInterval(loadScopedData, 30000);

    return () => {
      unsubFleet();
      unsubAlerts();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(interval);
    };
  }, [ulbId]);

  // Derive safe-zone and ULB display name from vehicle data
  const firstVehicle = vehicles[0];
  const ulbName = firstVehicle?.ulbName || ulbId;
  const safeZoneRadius = firstVehicle?.safeZoneRadiusMeters;

  const activeCount = fleet.filter((f) => f.isLive === true).length;
  const offlineCount = Math.max(0, vehicles.length - activeCount);
  const activeAlertsCount = alerts.filter((a) => a.status === 'ACTIVE').length;

  const handleTabSelect = (tabId) => {
    navigate(`/officer/${tabId}?ulb=${encodeURIComponent(ulbId)}`);
  };

  const handleSelectVehicleFromAlert = (vehicleId) => {
    navigate(`/officer/fleet?ulb=${encodeURIComponent(ulbId)}&vehicle=${vehicleId}`);
  };

  const handleAlertAcknowledged = (alertId) => {
    setAlerts((prev) =>
      prev.map((a) => (a.alertId === alertId ? { ...a, isAcknowledged: true } : a))
    );
  };

  const kpiMetrics = [
    { label: 'TOTAL FLEET', value: loading ? '…' : vehicles.length, icon: '🚛' },
    {
      label: 'ACTIVE IN FIELD',
      value: loading ? '…' : activeCount,
      color: activeCount > 0 ? 'var(--status-ok)' : 'var(--text-primary)',
      icon: '●',
    },
    {
      label: 'DEPOT / OFFLINE',
      value: loading ? '…' : offlineCount,
      color: offlineCount > 0 ? 'var(--status-warn)' : 'var(--text-dim)',
      icon: '○',
    },
    {
      label: 'OPERATIONAL ALERTS',
      value: loading ? '…' : `${activeAlertsCount} ACTIVE`,
      color: activeAlertsCount > 0 ? '#ef233c' : 'var(--status-ok)',
      icon: '🚨',
      onClick: () => setIsAlertDrawerOpen(true),
    },
    {
      label: 'SAFE ZONE',
      value: safeZoneRadius ? `${safeZoneRadius} m` : 'N/A',
      color: safeZoneRadius ? 'var(--status-ok)' : 'var(--text-dim)',
      icon: '🛡',
    },
  ];

  // Context passed to all officer sub-views via Outlet
  const outletContext = {
    ulbId,
    ulbName,
    vehicles,
    fleet,
    alerts,
    loading,
    safeZoneRadius,
    firstVehicle,
    ulbs: [
      {
        ulbId,
        ulbName,
        safeZoneLatitude: firstVehicle?.safeZoneLatitude,
        safeZoneLongitude: firstVehicle?.safeZoneLongitude,
        safeZoneRadiusMeters: safeZoneRadius,
      },
    ],
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-base)', overflow: 'hidden' }}>
      {/* View header */}
      <div className="view-header">
        <span className="view-header__title">Fleet Operations</span>
        <span className="view-header__sep" />
        <span className="view-header__meta" style={{ color: '#00d9ff' }}>
          {ulbName}
        </span>
        <button
          onClick={() => navigate('/officer')}
          style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-mid)',
            color: 'var(--text-secondary)',
            fontFamily: 'var(--text-mono)',
            fontSize: '9px',
            padding: '2px 8px',
            borderRadius: '2px',
            cursor: 'pointer',
            marginLeft: '8px',
            outline: 'none',
          }}
          title="Switch to a different municipal ULB"
        >
          ⇄ SWITCH ULB
        </button>

        <span className="view-header__spacer" />

        {/* Real-time Alerts Notification Bell Button */}
        <button
          onClick={() => setIsAlertDrawerOpen(true)}
          style={{
            background: activeAlertsCount > 0 ? 'rgba(239,35,60,0.15)' : 'var(--bg-elevated)',
            border: activeAlertsCount > 0 ? '1px solid rgba(239,35,60,0.4)' : '1px solid var(--border)',
            color: activeAlertsCount > 0 ? '#ef233c' : 'var(--text-secondary)',
            fontFamily: 'var(--text-mono)',
            fontSize: '9.5px',
            fontWeight: 700,
            padding: '3px 10px',
            borderRadius: '3px',
            cursor: 'pointer',
            marginRight: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
          }}
        >
          <span>🔔</span>
          <span>ALERTS</span>
          {activeAlertsCount > 0 && (
            <span
              style={{
                background: '#ef233c',
                color: '#fff',
                borderRadius: '8px',
                padding: '0 5px',
                fontSize: '8px',
                fontWeight: 800,
              }}
            >
              {activeAlertsCount}
            </span>
          )}
        </button>

        <span className="rate-badge" style={{ color: 'var(--status-ok)', borderColor: 'var(--status-ok)' }}>
          ● OPERATIONAL
        </span>
      </div>

      {/* KPI Ribbon */}
      <KpiRibbon metrics={kpiMetrics} loading={loading} />

      {/* Tab navigation */}
      <OfficerTabBar active={activeTab} onSelect={handleTabSelect} />

      {/* Route content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
        <ErrorBoundary name={`Officer/${activeTab}`}>
          <Outlet context={outletContext} />
        </ErrorBoundary>
      </div>

      {/* Operational Alerts Drawer */}
      <AlertDrawer
        isOpen={isAlertDrawerOpen}
        onClose={() => setIsAlertDrawerOpen(false)}
        alerts={alerts}
        onSelectVehicle={handleSelectVehicleFromAlert}
        onAlertAcknowledged={handleAlertAcknowledged}
      />
    </div>
  );
}
