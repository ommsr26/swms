/**
 * AdminTelemetryView.jsx — /admin/telemetry
 *
 * Wraps the existing LiveDebugPanel (from AdminPanels.jsx) which provides
 * the current HTTP-polled cloud telemetry inspector.
 *
 * CURRENT STATE:
 *   HTTP polling every 1.5s — snapshot view only.
 *   Not smooth for IMU motion (inherent limitation of the polling approach).
 *
 * FUTURE UPGRADE PATH:
 *   Replace polling with SignalR streaming via SignalRTelemetrySource.
 *   See: src/telemetry/TelemetrySourceAbstraction.js for integration point.
 *   The LiveDebugPanel's OverviewPresentation, IMUPresentation, MapPresentation,
 *   and GNSSPresentation components will render smoothly at 60 FPS when fed
 *   from a SignalR source that writes directly into TelemetryBuffers.
 *
 * URL param:
 *   ?session=<sessionId> — preselects a session when navigated from Fleet map.
 */
import { useSearchParams } from 'react-router-dom';
import { LiveDebugPanel } from '../../components/AdminPanels.jsx';

export default function AdminTelemetryView() {
  const [searchParams] = useSearchParams();
  const sessionParam = searchParams.get('session');
  const initialSessionId = sessionParam ? Number(sessionParam) : null;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
      {/* Telemetry note banner */}
      <div style={{
        padding: '4px 14px',
        background: 'rgba(157,78,221,0.06)',
        borderBottom: '1px solid rgba(157,78,221,0.2)',
        fontFamily: 'var(--text-mono)',
        fontSize: '8px',
        color: '#9d4edd',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
      }}>
        <span>⚡ CLOUD TELEMETRY · 1.5s HTTP POLL</span>
        <span style={{ color: 'var(--text-dim)' }}>·</span>
        <span style={{ color: 'var(--text-dim)' }}>SignalR streaming upgrade planned — see TelemetrySourceAbstraction.js</span>
      </div>

      {/* Existing LiveDebugPanel — preserved exactly */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <LiveDebugPanel
          initialSessionId={initialSessionId}
          onSelectSession={null}
        />
      </div>
    </div>
  );
}
