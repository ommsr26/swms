import { useEffect } from 'react';
import { useTelemetryStore } from '../telemetry/telemetryStore.js';
import { useTheme } from '../ThemeContext.jsx';

const NAV_ITEMS = [
  { id: 'overview',    label: 'Overview',           icon: '⊞', badge: 'LIVE' },
  { id: 'telemetry',   label: 'Telemetry Analysis', icon: '📈', badge: 'TRACES' },
  { id: 'workspace',   label: 'Custom Workspace',   icon: '⊡', badge: 'CUSTOM' },
  { id: 'diagnostics', label: 'Diagnostics',        icon: '⚡', badge: 'DIAG' },
  { id: 'imu',         label: '3D IMU View',        icon: '⊕' },
  { id: 'map',         label: 'Map Trajectory',     icon: '🗺', badge: 'MAP' },
  { id: 'gnss',        label: 'GNSS Satellites',    icon: '🛰', badge: '3D SKY' },
  { id: 'camera',      label: 'Camera',             icon: '⊙', badge: 'STANDBY' },
  { id: 'sessions',    label: 'Sessions',           icon: '≡' },
  { id: 'replay',      label: 'Replay',             icon: '▷' },
  { id: 'system',      label: 'System',             icon: '⊛' },
];

export default function Navigation({ onConnectSerial, onDisconnectSerial }) {
  const {
    activeView,
    setActiveView,
    sensorStatus,
    latest,
    sessionElapsed,
    mode,
    sessionId,
    runCount,
    activeFaults,
    serialConnected,
    serialError,
    deviceId,
    vehicleRegistrationNumber,
    ulbName,
  } = useTelemetryStore();

  // Theme consumed from global ThemeContext — no local state.
  // ThemeProvider (main.jsx) owns the data-theme DOM write and localStorage sync.
  const { theme, toggleTheme } = useTheme();

  const fmtElapsed = (s) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60).toString().padStart(2, '0');
    const sec = (s % 60).toFixed(0).padStart(2, '0');
    return h > 0 ? `${h}:${m}:${sec}` : `${m}:${sec}`;
  };

  const isLive = mode === 'LIVE' && serialConnected;

  return (
    <nav className="nav">
      <div className="nav__header">
        <div className="nav__project">SWSTP Telemetry Workstation</div>
        <div className="nav__title">Garbage Fleet Monitoring</div>
        <div className="nav__mode">
          <span className="nav__mode-dot" style={{
            background: serialConnected ? 'var(--status-ok)' : 'var(--status-off)',
            boxShadow: `0 0 6px ${serialConnected ? 'var(--status-ok)' : 'transparent'}`,
          }} />
          {serialConnected ? 'HARDWARE ONLINE' : 'WAITING FOR HARDWARE'}
        </div>
        <button
          onClick={toggleTheme}
          style={{
            marginTop: '8px',
            width: '100%',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            color: 'var(--text-primary)',
            fontFamily: 'var(--text-mono)',
            fontSize: '10px',
            fontWeight: 600,
            padding: '4px 8px',
            borderRadius: '2px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
          }}
        >
          {theme === 'dark' ? '☾ Dark Mode' : '☀ Light Mode'}
        </button>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: '6px',
          fontFamily: 'var(--text-mono)',
          fontSize: '9px',
          color: 'var(--text-label)',
          borderTop: '1px solid var(--border)',
          paddingTop: '6px',
        }}>
          <span>SES #{sessionId ?? '—'}</span>
          <span>RUN {runCount.toString().padStart(3, '0')}</span>
          <span style={{ color: 'var(--text-primary)' }}>{fmtElapsed(sessionElapsed)}</span>
        </div>

        {/* 🔌 Web Serial Hardware Control Card */}
        <div style={{
          marginTop: '10px',
          padding: '8px',
          background: 'var(--bg-panel-2)',
          border: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
        }}>
          <div style={{ fontFamily: 'var(--text-mono)', fontSize: '9px', color: '#00d9ff', fontWeight: 700, letterSpacing: '0.08em' }}>
            HARDWARE IDENTITY & TRANSPORT
          </div>

          <div style={{ fontFamily: 'var(--text-mono)', fontSize: '9.5px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>DEVICE ID:</span>
              <span style={{ color: deviceId ? '#2dc653' : 'var(--text-dim)', fontWeight: 700 }}>
                {deviceId || '—'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>VEHICLE:</span>
              <span style={{ color: vehicleRegistrationNumber ? '#00b4d8' : 'var(--text-dim)', fontWeight: 600 }}>
                {vehicleRegistrationNumber || '—'}
              </span>
            </div>
            {ulbName && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>ULB:</span>
                <span style={{ color: '#ffb703', fontWeight: 600, fontSize: '8.5px', maxWidth: '140px', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                  {ulbName}
                </span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>SERIAL:</span>
              <span style={{ color: serialConnected ? 'var(--status-ok)' : 'var(--text-dim)', fontWeight: 600 }}>
                {serialConnected ? 'CONNECTED' : 'DISCONNECTED'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>BAUD:</span>
              <span style={{ color: 'var(--text-primary)' }}>115200</span>
            </div>
          </div>


          {!serialConnected ? (
            <button
              className="btn btn--sm"
              style={{
                marginTop: '4px',
                background: '#2dc653',
                color: '#000',
                fontWeight: 700,
                border: 'none',
                cursor: 'pointer',
              }}
              onClick={onConnectSerial}
            >
              🔌 CONNECT HARDWARE
            </button>
          ) : (
            <button
              className="btn btn--sm"
              style={{
                marginTop: '4px',
                background: 'var(--bg-elevated)',
                color: '#ef4444',
                border: '1px solid #ef4444',
                cursor: 'pointer',
                fontWeight: 600,
              }}
              onClick={onDisconnectSerial}
            >
              🛑 DISCONNECT SERIAL
            </button>
          )}

          {serialError && (
            <div style={{ fontFamily: 'var(--text-mono)', fontSize: '8.5px', color: 'var(--status-error)', lineHeight: '1.3', marginTop: '2px' }}>
              ⚠️ {serialError}
            </div>
          )}
        </div>
      </div>

      <div className="nav__items">
        <div className="nav__section-label">Engineering Views</div>
        {NAV_ITEMS.map(item => {
          const badge = item.id === 'diagnostics' && activeFaults.length > 0 ? `${activeFaults.length} FAULT`
                      : item.id === 'camera' ? sensorStatus.camera
                      : item.id === 'overview' && isLive ? 'LIVE'
                      : item.badge;
          return (
            <div
              key={item.id}
              className={`nav__item${activeView === item.id ? ' nav__item--active' : ''}`}
              onClick={() => setActiveView(item.id)}
            >
              <span style={{ fontSize: '13px', minWidth: '16px', textAlign: 'center' }}>
                {item.icon}
              </span>
              <span>{item.label}</span>
              {badge && (
                <span className="nav__item-badge" style={
                  item.id === 'diagnostics' && activeFaults.length > 0
                    ? { background: 'var(--status-warn)', color: '#000', fontWeight: 600 }
                    : {}
                }>
                  {badge}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="nav__footer">
        <div className="nav__footer-row">
          <StatusDot status={sensorStatus.gnss} />
          <span>GNSS</span>
          <span style={{ marginLeft: 'auto', color: sensorStatus.gnss === 'FIX' ? 'var(--status-ok)' : 'var(--status-warn)' }}>
            {sensorStatus.gnss}
          </span>
        </div>
        <div className="nav__footer-row">
          <StatusDot status={sensorStatus.imu} />
          <span>IMU</span>
          <span style={{ marginLeft: 'auto', color: sensorStatus.imu === 'ACTIVE' ? 'var(--status-ok)' : 'var(--status-warn)' }}>
            {sensorStatus.imu}
          </span>
        </div>
        <div className="nav__footer-row">
          <StatusDot status={sensorStatus.rtc} />
          <span>RTC</span>
          <span style={{ marginLeft: 'auto', color: sensorStatus.rtc === 'ACTIVE' || sensorStatus.rtc === 'SYNCED' ? 'var(--status-ok)' : 'var(--status-warn)' }}>
            {sensorStatus.rtc}
          </span>
        </div>
        <div className="nav__footer-row">
          <StatusDot status={sensorStatus.serial} />
          <span>SERIAL</span>
          <span style={{ marginLeft: 'auto', color: sensorStatus.serial === 'CONNECTED' ? 'var(--status-ok)' : 'var(--text-dim)' }}>
            {sensorStatus.serial}
          </span>
        </div>
      </div>
    </nav>
  );
}

function StatusDot({ status }) {
  const cls = status === 'FIX' || status === 'ACTIVE' || status === 'SYNCED' || status === 'CONNECTED' ? 'ok'
            : status === 'NO_FIX' || status === 'NO DATA' || status === 'STANDBY' || status === 'WARN' ? 'warn'
            : status === 'OFFLINE' ? 'error'
            : 'off';
  return <span className={`status-dot status-dot--${cls}`} />;
}
