/**
 * DebugLayout.jsx — SWSTP Full Engineering Debug Workstation
 *
 * Mounted exclusively at the /debug route.
 *
 * LAYERING NOTE:
 *   - Outer layer: react-router-dom decides which top-level screen is mounted.
 *   - Inner layer: Zustand activeView state-machine (Overview / Telemetry /
 *     GNSS / Map / IMU / Camera / Sessions / Replay / System / Diagnostics)
 *     lives entirely inside this layout. No router involvement.
 *   - These two systems are COMPLETELY ISOLATED. Navigation.jsx setActiveView()
 *     calls are unchanged. The router never touches activeView.
 *
 * CONNECTION NOTE:
 *   Hardware connection logic is now provided by useHardwareConnection() hook,
 *   shared with HardwareConnectView. This layout's behavior is byte-for-byte
 *   identical to the original App.jsx — the hook is a structural extraction,
 *   not a behavioral change.
 */
import { useEffect } from 'react';
import { useTelemetryStore, resetSession } from '../telemetry/telemetryStore.js';
import { useHardwareConnection } from '../telemetry/useHardwareConnection.js';
import Navigation from '../components/Navigation.jsx';
import Overview from '../views/Overview.jsx';
import TelemetryAnalysis from '../views/TelemetryAnalysis.jsx';
import WorkspaceView from '../views/WorkspaceView.jsx';
import DiagnosticsView from '../views/DiagnosticsView.jsx';
import MapView from '../views/MapView.jsx';
import GNSSView from '../views/GNSSView.jsx';
import IMUView from '../views/IMUView.jsx';
import CameraView from '../views/CameraView.jsx';
import SessionsView from '../views/SessionsView.jsx';
import ReplayView from '../views/ReplayView.jsx';
import SystemView from '../views/SystemView.jsx';

export default function DebugLayout() {
  const { activeView } = useTelemetryStore();
  const { connect, disconnect, tryAutoConnect, serialSource } = useHardwareConnection();

  useEffect(() => {
    resetSession();
    useTelemetryStore.getState().setSourceType('REAL_SERIAL');
    useTelemetryStore.getState().setSerialState(false, 'WAITING FOR HARDWARE SERIAL');

    // Attempt silent auto-reconnect only if a physical USB serial port was previously authorized
    tryAutoConnect().catch(() => {});

    // Expose source on window for debug introspection
    window.__telemetrySource = serialSource;

    return () => {
      disconnect();
    };
  }, []);

  // Sub-views controlled entirely by Zustand activeView — zero router involvement
  const views = {
    overview:    <Overview />,
    telemetry:   <TelemetryAnalysis />,
    workspace:   <WorkspaceView />,
    diagnostics: <DiagnosticsView />,
    map:         <MapView />,
    gnss:        <GNSSView />,
    imu:         <IMUView />,
    camera:      <CameraView />,
    sessions:    <SessionsView />,
    replay:      <ReplayView />,
    system:      <SystemView />,
  };

  return (
    <div className="app">
      <Navigation onConnectSerial={connect} onDisconnectSerial={disconnect} />
      <main className="main" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', flex: 1, minWidth: 0 }}>
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {views[activeView] ?? <Overview />}
        </div>
      </main>
    </div>
  );
}
