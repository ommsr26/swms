import { useEffect } from 'react';
import { useTelemetryStore, ingestPacket, resetSession, resetSerialDisconnect } from './telemetry/telemetryStore.js';
import { RealSerialTelemetrySource } from './telemetry/RealSerialTelemetrySource.js';
import Navigation from './components/Navigation.jsx';
import Overview from './views/Overview.jsx';
import TelemetryAnalysis from './views/TelemetryAnalysis.jsx';
import WorkspaceView from './views/WorkspaceView.jsx';
import DiagnosticsView from './views/DiagnosticsView.jsx';
import MapView from './views/MapView.jsx';
import GNSSView from './views/GNSSView.jsx';
import IMUView from './views/IMUView.jsx';
import CameraView from './views/CameraView.jsx';
import SessionsView from './views/SessionsView.jsx';
import ReplayView from './views/ReplayView.jsx';
import SystemView from './views/SystemView.jsx';

const realSerialSource = new RealSerialTelemetrySource(115200);
window.__telemetrySource = realSerialSource;

export async function connectRealSerial() {
  if (!RealSerialTelemetrySource.isSupported()) {
    const errorMsg = 'Web Serial API requires Google Chrome or Microsoft Edge.';
    useTelemetryStore.getState().setSerialState(false, errorMsg);
    alert(errorMsg);
    return false;
  }

  try {
    await realSerialSource.connect();
    realSerialSource.onPacket((packet) => {
      ingestPacket(packet);
    });
    realSerialSource.onDisconnect((reason) => {
      console.warn('[App] Real hardware serial disconnected:', reason);
      resetSerialDisconnect(reason);
    });

    useTelemetryStore.getState().setSourceType('REAL_SERIAL');
    useTelemetryStore.getState().setSerialState(true, null);
    return true;
  } catch (err) {
    console.error('[App] Serial connection failed:', err);
    resetSerialDisconnect(err.message);
    useTelemetryStore.getState().setSourceType('REAL_SERIAL');
    return false;
  }
}

export function disconnectRealSerial() {
  realSerialSource.stop();
  resetSession();
  useTelemetryStore.getState().setSerialState(false, 'Hardware Disconnected');
}

export default function App() {
  const { activeView } = useTelemetryStore();

  useEffect(() => {
    resetSession();
    useTelemetryStore.getState().setSourceType('REAL_SERIAL');
    useTelemetryStore.getState().setSerialState(false, 'WAITING FOR HARDWARE SERIAL');

    return () => {
      realSerialSource.stop();
    };
  }, []);

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
      <Navigation onConnectSerial={connectRealSerial} onDisconnectSerial={disconnectRealSerial} />
      <main className="main" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', flex: 1, minWidth: 0 }}>
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {views[activeView] ?? <Overview />}
        </div>
      </main>
    </div>
  );
}
