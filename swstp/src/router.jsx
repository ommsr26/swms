/**
 * router.jsx — SWSTP Top-Level React Router
 *
 * ARCHITECTURE NOTE — Three Navigation Layers
 * ─────────────────────────────────────────────────────
 *
 * OUTER LAYER (this file): react-router-dom Routes
 *   URL-level browser-history-aware routing.
 *   Routes: /, /debug, /hardware-connect, /admin/*, /officer/*
 *
 * ADMIN LAYER (/admin/*):
 *   AdminLayout provides the shell (header, ULB strip, horizontal tab nav).
 *   9 nested routes: overview, ulbs, fleet, devices, sessions,
 *                    telemetry, cameras, audit, system.
 *   Tab state = URL path. Browser refresh retains active view.
 *   Direct URLs work: /admin/fleet, /admin/telemetry?session=42
 *
 * OFFICER LAYER (/officer/*):
 *   OfficerLayout provides the shell (header, KPI ribbon, horizontal tab nav).
 *   6 nested routes: overview, sessions, fleet, coverage, evidence, cameras.
 *   ULB scoping via ?ulb= query param (preserved across navigation).
 *   /officer?ulb= → redirects to /officer/overview?ulb= for backward compatibility.
 *   Direct URLs work: /officer/coverage?ulb=ULB_MH_AMRAVATI
 *
 * DEBUG LAYER (/debug):
 *   DebugLayout is unchanged — inner Zustand activeView state machine.
 *   Completely isolated from all outer router changes.
 *
 * PRESERVED ROUTES (unchanged behavior):
 *   /                → HomeView
 *   /debug           → DebugLayout (engineering workstation)
 *   /hardware-connect → HardwareConnectView (commissioning)
 */
import { BrowserRouter, Routes, Route, Navigate, useSearchParams } from 'react-router-dom';
import DebugLayout from './layouts/DebugLayout.jsx';
import AdminLayout from './layouts/AdminLayout.jsx';
import OfficerLayout from './layouts/OfficerLayout.jsx';
import HomeView from './views/HomeView.jsx';
import HardwareConnectView from './views/HardwareConnectView.jsx';
import MotionDetectionView from './views/MotionDetectionView.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';

// ─── Admin Views ──────────────────────────────────────────────────────────────
import AdminOverviewView  from './views/admin/AdminOverviewView.jsx';
import AdminUlbsView      from './views/admin/AdminUlbsView.jsx';
import AdminFleetView     from './views/admin/AdminFleetView.jsx';
import AdminDevicesView   from './views/admin/AdminDevicesView.jsx';
import AdminSessionsView  from './views/admin/AdminSessionsView.jsx';
import AdminTelemetryView from './views/admin/AdminTelemetryView.jsx';
import AdminCamerasView   from './views/admin/AdminCamerasView.jsx';
import AdminAuditView     from './views/admin/AdminAuditView.jsx';
import AdminSystemView    from './views/admin/AdminSystemView.jsx';
import DailyTimelineView  from './views/common/DailyTimelineView.jsx';

// ─── Officer Views ────────────────────────────────────────────────────────────
import OfficerOverviewView  from './views/officer/OfficerOverviewView.jsx';
import OfficerTimelineView  from './views/officer/OfficerTimelineView.jsx';
import OfficerSessionsView  from './views/officer/OfficerSessionsView.jsx';
import OfficerFleetView     from './views/officer/OfficerFleetView.jsx';
import OfficerCoverageView  from './views/officer/OfficerCoverageView.jsx';
import OfficerEvidenceView  from './views/officer/OfficerEvidenceView.jsx';
import OfficerCamerasView   from './views/officer/OfficerCamerasView.jsx';

// ─── Simulation Views ─────────────────────────────────────────────────────────
import SimulationLayout       from './layouts/SimulationLayout.jsx';
import SimulationOverviewView from './views/simulation/SimulationOverviewView.jsx';
import SimulationDriveView    from './views/simulation/SimulationDriveView.jsx';
import SimulationTimelineView from './views/simulation/SimulationTimelineView.jsx';
import SimulationCoverageView from './views/simulation/SimulationCoverageView.jsx';
import SimulationFleetView    from './views/simulation/SimulationFleetView.jsx';
import SimulationEvidenceView from './views/simulation/SimulationEvidenceView.jsx';
import SimulationCamerasView  from './views/simulation/SimulationCamerasView.jsx';
import SimulationSessionsView from './views/simulation/SimulationSessionsView.jsx';

// ─── Backward compatibility: /officer?ulb= → /officer/overview?ulb= ──────────
// Used as the index route inside the /officer layout.
// OfficerLayout renders first, detects ulbId, then this index redirects.
function OfficerIndexRedirect() {
  const [searchParams] = useSearchParams();
  const ulbId = searchParams.get('ulb');
  if (ulbId) {
    return <Navigate to={`/officer/overview?ulb=${encodeURIComponent(ulbId)}`} replace />;
  }
  // No ulbId — OfficerLayout will show NoUlbSelected; render nothing from index
  return null;
}

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        {/* ── Home ─────────────────────────────────────────────────────── */}
        <Route path="/" element={<ErrorBoundary name="Home"><HomeView /></ErrorBoundary>} />

        {/* ── Engineering debug workstation (unchanged) ─────────────────── */}
        <Route path="/debug" element={<ErrorBoundary name="Debug"><DebugLayout /></ErrorBoundary>} />

        {/* ── Hardware commissioning (unchanged) ───────────────────────── */}
        <Route path="/hardware-connect" element={<ErrorBoundary name="Hardware Connect"><HardwareConnectView /></ErrorBoundary>} />

        {/* ── In-Browser Motion Detection & Gateway ──────────────────────── */}
        <Route path="/motion-detection" element={<ErrorBoundary name="Motion Detection"><MotionDetectionView /></ErrorBoundary>} />

        {/* ── Admin console (/admin → /admin/overview) ──────────────────── */}
        <Route path="/admin" element={<ErrorBoundary name="Admin Console"><AdminLayout /></ErrorBoundary>}>
          <Route index element={<Navigate to="overview" replace />} />
          <Route path="overview"  element={<AdminOverviewView />}  />
          <Route path="timeline"  element={<DailyTimelineView />}  />
          <Route path="ulbs"      element={<AdminUlbsView />}      />
          <Route path="fleet"     element={<AdminFleetView />}     />
          <Route path="devices"   element={<AdminDevicesView />}   />
          <Route path="sessions"  element={<AdminSessionsView />}  />
          <Route path="telemetry" element={<AdminTelemetryView />} />
          <Route path="cameras"   element={<AdminCamerasView />}   />
          <Route path="audit"     element={<AdminAuditView />}     />
          <Route path="system"    element={<AdminSystemView />}    />
          {/* Catch-all within admin → redirect to overview */}
          <Route path="*" element={<Navigate to="overview" replace />} />
        </Route>

        {/* ── Officer console ──────────────────────────────────────────── */}
        <Route path="/officer" element={<ErrorBoundary name="Officer Console"><OfficerLayout /></ErrorBoundary>}>
          <Route index element={<OfficerIndexRedirect />} />
          <Route path="overview"  element={<OfficerOverviewView />}  />
          <Route path="timeline"  element={<OfficerTimelineView />}  />
          <Route path="sessions"  element={<OfficerSessionsView />}  />
          <Route path="fleet"     element={<OfficerFleetView />}     />
          <Route path="coverage"  element={<OfficerCoverageView />}  />
          <Route path="evidence"  element={<OfficerEvidenceView />}  />
          <Route path="cameras"   element={<OfficerCamerasView />}   />
          <Route path="*" element={<Navigate to="overview" replace />} />
        </Route>

        {/* ── Operations Simulator Console ──────────────────────────────── */}
        <Route path="/simulation" element={<ErrorBoundary name="Simulation Console"><SimulationLayout /></ErrorBoundary>}>
          <Route index element={<Navigate to="drive" replace />} />
          <Route path="overview"  element={<SimulationOverviewView />} />
          <Route path="drive"     element={<SimulationDriveView />}    />
          <Route path="timeline"  element={<SimulationTimelineView />} />
          <Route path="coverage"  element={<SimulationCoverageView />} />
          <Route path="fleet"     element={<SimulationFleetView />}    />
          <Route path="evidence"  element={<SimulationEvidenceView />} />
          <Route path="cameras"   element={<SimulationCamerasView />}  />
          <Route path="sessions"  element={<SimulationSessionsView />} />
          <Route path="*" element={<Navigate to="drive" replace />} />
        </Route>

        {/* ── Catch-all ───────────────────────────────────────────────── */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
