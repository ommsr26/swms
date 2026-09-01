import { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import {
  fetchAdminVehicles,
  fetchAdminFleetLive,
  fetchOfficerAlerts,
} from '../telemetry/backendApiClient.js';
import KpiRibbon from '../components/common/KpiRibbon.jsx';
import ErrorBoundary from '../components/ErrorBoundary.jsx';
import UlbSelectorView from '../components/officer/UlbSelectorView.jsx';
import AlertDrawer from '../components/alerts/AlertDrawer.jsx';
import { useSimulationStore } from '../telemetry/simulationStore.js';

const SIMULATION_TABS = [
  { id: 'overview', label: 'OVERVIEW' },
  { id: 'drive', label: '🕹️ DRIVE & JOYSTICK' },
  { id: 'timeline', label: '📅 DAILY TIMELINE' },
  { id: 'coverage', label: 'COVERAGE' },
  { id: 'fleet', label: 'FLEET' },
  { id: 'evidence', label: 'EVIDENCE' },
  { id: 'cameras', label: 'CAMERAS' },
  { id: 'sessions', label: 'SESSIONS' },
];

function SimulationTabBar({ active, onSelect }) {
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
      {SIMULATION_TABS.map((t) => (
        <button
          key={t.id}
          id={`simulation-nav-${t.id}`}
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

export default function SimulationLayout() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();

  const ulbId = searchParams.get('ulb') || 'ULB_MH_AMRAVATI';

  return <SimulationConsoleShell ulbId={ulbId} location={location} navigate={navigate} />;
}

function SimulationConsoleShell({ ulbId, location, navigate }) {
  const [vehicles, setVehicles] = useState([]);
  const [fleet, setFleet] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [isAlertDrawerOpen, setIsAlertDrawerOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const { houses } = useSimulationStore();
  const collectedCount = houses.filter((h) => h.status === 'COLLECTED').length;
  const collectionPct = Math.round((collectedCount / (houses.length || 1)) * 100);

  const pathSegments = location.pathname.split('/');
  const activeTab = pathSegments[2] || 'overview'; // /simulation/:tab

  useEffect(() => {
    Promise.all([
      fetchAdminVehicles(ulbId),
      fetchAdminFleetLive(ulbId),
      fetchOfficerAlerts(ulbId),
    ])
      .then(([vList, fList, aList]) => {
        setVehicles(vList || []);
        setFleet(fList || []);
        setAlerts(aList || []);
        setLoading(false);
      })
      .catch((err) => {
        console.warn('[SimulationLayout] Failed to load scoped data:', err);
        setLoading(false);
      });
  }, [ulbId]);

  const firstVehicle = vehicles[0];
  const ulbName = firstVehicle?.ulbName || 'Amravati Municipal Corporation';
  const safeZoneRadius = firstVehicle?.safeZoneRadiusMeters || 1000;

  const handleTabSelect = (tabId) => {
    navigate(`/simulation/${tabId}?ulb=${encodeURIComponent(ulbId)}`);
  };

  const kpiMetrics = [
    { label: 'SIMULATED FLEET', value: '1 TRUCK (ACTIVE)', icon: '🚛', color: '#00d9ff' },
    {
      label: 'TRASH COLLECTED',
      value: `${collectedCount}/${houses.length} (${collectionPct}%)`,
      color: collectionPct > 50 ? '#2dc653' : '#f48c06',
      icon: '🗑️',
    },
    {
      label: 'SIMULATION RATE',
      value: '20 HZ (50ms)',
      color: '#2dc653',
      icon: '⚡',
    },
    {
      label: 'OPERATIONAL ALERTS',
      value: `${alerts.filter((a) => a.status === 'ACTIVE').length} ACTIVE`,
      color: '#2dc653',
      icon: '🚨',
      onClick: () => setIsAlertDrawerOpen(true),
    },
    {
      label: 'SAFE ZONE',
      value: `${safeZoneRadius} m`,
      color: '#00d9ff',
      icon: '🛡',
    },
  ];

  const { lat, lon, heading, speed, vehicleReg } = useSimulationStore();

  const effectiveFleet = [
    {
      sessionId: 9999,
      vehicleId: 9999,
      deviceCode: 'SWSTP_SIM_01',
      vehicleRegistration: vehicleReg || 'MH-27-AM-4001',
      ulbId,
      ulbName,
      hasPosition: true,
      isLive: true,
      isLastKnown: false,
      lat,
      lon,
      rawLat: lat,
      rawLon: lon,
      displayLat: lat,
      displayLon: lon,
      speed,
      heading,
      lastPositionAt: new Date().toISOString(),
      operationalStatus: 'LIVE',
    },
    ...(fleet || []),
  ];

  const outletContext = {
    ulbId,
    ulbName,
    vehicles: vehicles.length > 0 ? vehicles : [
      {
        vehicleId: 9999,
        registrationNumber: vehicleReg || 'MH-27-AM-4001',
        assignedDeviceCode: 'SWSTP_SIM_01',
        ulbId,
        ulbName,
        safeZoneLatitude: 20.956112,
        safeZoneLongitude: 77.763861,
        safeZoneRadiusMeters: safeZoneRadius,
      }
    ],
    fleet: effectiveFleet,
    alerts,
    loading,
    safeZoneRadius,
    firstVehicle,
    ulbs: [
      {
        ulbId,
        ulbName,
        safeZoneLatitude: firstVehicle?.safeZoneLatitude || 20.956112,
        safeZoneLongitude: firstVehicle?.safeZoneLongitude || 77.763861,
        safeZoneRadiusMeters: safeZoneRadius,
      },
    ],
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-base)', overflow: 'hidden' }}>
      {/* View Header */}
      <div className="view-header">
        <span className="view-header__title">Operations Simulator</span>
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
          title="Switch to Real Officer Console"
        >
          ⇄ SWITCH TO OFFICER
        </button>

        <span className="view-header__spacer" />

        <button
          onClick={() => setIsAlertDrawerOpen(true)}
          style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            color: 'var(--text-secondary)',
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
        </button>

        <span className="rate-badge" style={{ color: '#00d9ff', borderColor: '#00d9ff' }}>
          ● SIMULATION ACTIVE
        </span>
      </div>

      {/* KPI Ribbon */}
      <KpiRibbon metrics={kpiMetrics} loading={loading} />

      {/* Tab Navigation */}
      <SimulationTabBar active={activeTab} onSelect={handleTabSelect} />

      {/* Route Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
        <ErrorBoundary name={`Simulation/${activeTab}`}>
          <Outlet context={outletContext} />
        </ErrorBoundary>
      </div>

      {/* Operational Alerts Drawer */}
      <AlertDrawer
        isOpen={isAlertDrawerOpen}
        onClose={() => setIsAlertDrawerOpen(false)}
        alerts={alerts}
        onSelectVehicle={() => {}}
        onAlertAcknowledged={() => {}}
      />
    </div>
  );
}
