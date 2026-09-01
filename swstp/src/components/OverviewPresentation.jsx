/**
 * OverviewPresentation.jsx — Presentational Component for Overview / Live Debug.
 *
 * SHARED PRESENTATIONAL LAYER:
 * - Used by /debug (via Overview.jsx, fed by Zustand live serial store)
 * - Used by /admin (via LiveDebugPanel, fed by /api/admin/sessions/{id}/live polling)
 *
 * Accepts all telemetry values via props. Contains zero store subscriptions.
 */
import TelemetryChart from './TelemetryChart.jsx';

const SIG_SPEED = { key: 'speed', label: 'Speed', color: '#00b4d8', unit: 'km/h', decimals: 1, yRange: [0, 160] };
const SIG_ALT   = { key: 'alt',   label: 'Alt',   color: '#9d4edd', unit: 'm',    decimals: 1 };
const SIG_AX    = { key: 'ax',    label: 'Ax',    color: '#f72585', unit: 'm/s²', decimals: 2 };
const SIG_MAG   = { key: 'accelMag', label: 'Magnitude', color: '#f15bb5', unit: 'm/s²', decimals: 2 };

export function StatusRow({ label, status }) {
  const map = {
    FIX:     { cls: 'ok',   text: 'FIX 3D' },
    ACTIVE:  { cls: 'ok',   text: 'ACTIVE' },
    SYNCED:  { cls: 'ok',   text: 'SYNCED' },
    LIVE:    { cls: 'ok',   text: 'LIVE'   },
    NO_FIX:  { cls: 'warn', text: 'NO FIX' },
    WARN:    { cls: 'warn', text: 'DEGRADED'},
    STANDBY: { cls: 'warn', text: 'STANDBY'},
    WAITING: { cls: 'off',  text: 'WAITING'},
    OFFLINE: { cls: 'error',text: 'OFFLINE'},
  };
  const s = map[status] ?? { cls: 'off', text: status || '—' };
  return (
    <div className="status-row">
      <span className="status-row__label">{label}</span>
      <span className={`status-row__indicator status-text--${s.cls}`}>
        <span className={`status-dot status-dot--${s.cls}`} />
        {s.text}
      </span>
    </div>
  );
}

export function MetricCell({ label, value, unit, color, size = 'lg' }) {
  return (
    <div className="metric">
      <span className="metric__label">{label}</span>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '3px', marginTop: '2px' }}>
        <span className={`metric__value metric__value--${size}`} style={color ? { color } : {}}>
          {value ?? '—'}
        </span>
        {unit && <span className="metric__unit">{unit}</span>}
      </div>
    </div>
  );
}

export function DetailCell({ label, value, unit, color }) {
  return (
    <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
      <div style={{ fontFamily: 'var(--text-mono)', fontSize: '9px', color: 'var(--text-label)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
        {label}
      </div>
      <div style={{ fontFamily: 'var(--text-mono)', fontSize: '11px', fontWeight: 500, color: color || 'var(--text-primary)', marginTop: '2px' }}>
        {value ?? '—'} {unit && <span style={{ fontSize: '9px', color: 'var(--text-label)' }}>{unit}</span>}
      </div>
    </div>
  );
}

export default function OverviewPresentation({
  latest = null,
  sensorStatus = { gnss: 'NO_FIX', imu: 'WAITING', rtc: 'WAITING', camera: 'STANDBY', serial: 'WAITING' },
  sessionElapsed = 0,
  runCount = 1,
  sessionId = '—',
  sessionCode = null,
  mode = 'REAL_HARDWARE',
  activeFaults = [],
  sourceType = 'REAL_SERIAL',
  serialConnected = false,
  vehicleRegistration = null,
  ulbName = null,
  isCloudPolled = false,
  traces = null,
}) {
  const g = latest?.gnss;
  const imu = latest?.imu;
  const accel = imu?.accel;
  const gyro = imu?.gyro;
  const orient = imu?.orientation;
  const sys = latest?.system;

  const fmtElapsed = (s) => {
    if (s == null || isNaN(s)) return '00:00';
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60).toString().padStart(2, '0');
    const sec = (s % 60).toFixed(0).padStart(2, '0');
    return h > 0 ? `${h}:${m}:${sec}` : `${m}:${sec}`;
  };

  const fmtCoord = (v, decs = 5) => (v != null && !isNaN(v) ? Number(v).toFixed(decs) : '—');
  const fmtNum   = (v, decs = 1) => (v != null && !isNaN(v) ? Number(v).toFixed(decs) : '—');

  const isReal = sourceType === 'REAL_SERIAL';

  // Construct chart data for cloud-polled mode if traces are provided
  const speedChartData = traces && traces.times?.length > 0
    ? [traces.times, traces.speeds]
    : null;

  const magChartData = traces && traces.times?.length > 0
    ? [traces.times, traces.accelMag]
    : null;

  const axChartData = traces && traces.times?.length > 0
    ? [traces.times, traces.accelX]
    : null;

  const altChartData = traces && traces.times?.length > 0
    ? [traces.times, traces.alts]
    : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header Bar */}
      <div className="view-header">
        <span className="view-header__title">
          {isCloudPolled ? 'Cloud Live Telemetry Inspector' : 'Engineering Control Overview'}
        </span>
        <span className="view-header__sep" />
        <div className="live-indicator live-indicator--ok">
          <span className="status-dot status-dot--ok" style={{ animation: 'pulse-dot 2s ease-in-out infinite' }} />
          {mode}
        </div>
        <span className="view-header__sep" />
        <span className="view-header__meta" style={{ fontFamily: 'var(--text-mono)' }}>
          SESSION {sessionId} {sessionCode ? `(${sessionCode})` : ''} · RUN {String(runCount).padStart(3, '0')}
        </span>
        {vehicleRegistration && (
          <>
            <span className="view-header__sep" />
            <span className="view-header__meta" style={{ fontFamily: 'var(--text-mono)', color: '#00d9ff' }}>
              🚛 {vehicleRegistration} {ulbName ? `· ${ulbName}` : ''}
            </span>
          </>
        )}
        <span className="view-header__sep" />
        <span className="view-header__meta" style={{ fontFamily: 'var(--text-mono)', color: 'var(--text-primary)' }}>
          ELAPSED {fmtElapsed(sessionElapsed)}
        </span>
        {activeFaults.length > 0 && (
          <>
            <span className="view-header__sep" />
            <span className="rate-badge" style={{ borderColor: 'var(--status-warn)', color: 'var(--status-warn)' }}>
              ⚠ {activeFaults.length} FAULT(S) INJECTED
            </span>
          </>
        )}
        <span className="view-header__spacer" />
        <span
          className="rate-badge"
          style={
            isCloudPolled
              ? { borderColor: '#9d4edd', color: '#9d4edd' }
              : isReal && serialConnected
              ? { borderColor: 'var(--status-ok)', color: 'var(--status-ok)' }
              : isReal
              ? { borderColor: 'var(--status-warn)', color: 'var(--status-warn)' }
              : {}
          }
        >
          {isCloudPolled
            ? '[CLOUD POLLED — 1.5s CADENCE]'
            : isReal
            ? (serialConnected ? '[REAL HARDWARE — 115200 BAUD]' : '[REAL HARDWARE — DISCONNECTED]')
            : '[SIMULATED SOURCE]'}
        </span>
      </div>

      {/* Non-scrolling 3-Column Engineering Viewport */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '260px 1fr 340px',
        flex: 1,
        overflow: 'hidden',
        background: 'var(--bg-base)',
      }}>

        {/* ── COLUMN 1: Sensor Status & Health ──────────────────────── */}
        <div style={{ borderRight: '1px solid var(--border)', background: 'var(--bg-panel)', display: 'flex', flexDirection: 'column' }}>
          <div className="section-header">SENSOR HEALTH</div>
          <div style={{ padding: '8px 12px' }}>
            <StatusRow label="GNSS"     status={sensorStatus.gnss}   />
            <StatusRow label="IMU"      status={sensorStatus.imu}    />
            <StatusRow label="RTC"      status={sensorStatus.rtc}    />
            <StatusRow label="CAMERA"   status={sensorStatus.camera} />
            <StatusRow label="COMMS"    status={sensorStatus.serial} />
          </div>

          <div className="section-header">SYSTEM STATE</div>
          <DetailCell label="BATTERY CHARGE"   value={fmtNum(sys?.battery, 0)} unit="%" color="#06d6a0" />
          <DetailCell label="MCU TEMPERATURE"  value={fmtNum(sys?.temperature, 1)} unit="°C" color={sys?.temperature > 55 ? 'var(--status-warn)' : 'var(--text-primary)'} />
          <DetailCell label="IMU DIE TEMP"     value={fmtNum(imu?.temperature_c, 1)} unit="°C" />
          <DetailCell label="DEVICE UPTIME"    value={fmtNum(sys?.uptime, 0)} unit="s" />

          <div className="section-header">RTC TIMING</div>
          <DetailCell label="RTC SYNCHRONIZED" value={latest?.rtc?.synced ? 'YES (GPS LOCK)' : 'DRIFTING'} color={latest?.rtc?.synced ? 'var(--status-ok)' : 'var(--status-warn)'} />
          <DetailCell label="TIMESTAMP"        value={latest?.rtc?.iso ? latest.rtc.iso.slice(11, 23) : '—'} />
        </div>

        {/* ── COLUMN 2: Primary Values & GNSS Trajectory ──────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)', overflow: 'hidden' }}>
          {/* Primary Metrics Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', borderBottom: '1px solid var(--border)', background: 'var(--bg-panel-2)' }}>
            <div style={{ padding: '16px', borderRight: '1px solid var(--border)' }}>
              <MetricCell label="GROUND SPEED" value={fmtNum(g?.speed)} unit="km/h" color="#00b4d8" size="xl" />
            </div>
            <div style={{ padding: '16px', borderRight: '1px solid var(--border)' }}>
              <MetricCell label="ALTITUDE" value={fmtNum(g?.alt)} unit="m" color="#9d4edd" size="xl" />
            </div>
            <div style={{ padding: '16px' }}>
              <MetricCell label="HEADING" value={fmtNum(g?.heading, 1)} unit="°" color="#43aa8b" size="xl" />
            </div>
          </div>

          {/* GNSS Grid */}
          <div className="section-header">GNSS POSITION & FIX</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', borderBottom: '1px solid var(--border)' }}>
            <DetailCell label="LATITUDE"   value={fmtCoord(g?.lat)} />
            <DetailCell label="LONGITUDE"  value={fmtCoord(g?.lon)} />
            <DetailCell label="SATELLITES" value={g?.satellites ?? '—'} color={g?.satellites >= 7 ? 'var(--status-ok)' : 'var(--status-warn)'} />
            <DetailCell label="HDOP"       value={fmtNum(g?.hdop, 2)} />
          </div>

          {/* Acceleration Overview Grid */}
          <div className="section-header">ACCELERATION & DYNAMICS SUMMARY</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', borderBottom: '1px solid var(--border)' }}>
            <DetailCell label="ACCEL X"     value={fmtNum(accel?.x, 2)} unit="m/s²" color="#f72585" />
            <DetailCell label="ACCEL Y"     value={fmtNum(accel?.y, 2)} unit="m/s²" color="#4cc9f0" />
            <DetailCell label="ACCEL Z"     value={fmtNum(accel?.z, 2)} unit="m/s²" color="#7209b7" />
            <DetailCell label="OVERALL MAG" value={fmtNum(imu?.accel_magnitude, 2)} unit="m/s²" color="#f15bb5" />
          </div>

          {/* Main Speed Trace */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>LIVE SPEED TRACE</span>
              <span style={{ color: '#00b4d8' }}>{fmtNum(g?.speed)} km/h</span>
            </div>
            <div style={{ flex: 1, minHeight: 0, padding: '4px' }}>
              <TelemetryChart signals={[SIG_SPEED]} height={160} externalData={speedChartData} />
            </div>
          </div>
        </div>

        {/* ── COLUMN 3: IMU Summary & Mini Traces ──────────────────── */}
        <div style={{ background: 'var(--bg-panel)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div className="section-header">IMU SUMMARY (MPU-9250)</div>

          {/* Gyro Summary */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', borderBottom: '1px solid var(--border)' }}>
            <DetailCell label="GYRO X" value={fmtNum(gyro?.x, 2)} unit="°/s" color="#f48c06" />
            <DetailCell label="GYRO Y" value={fmtNum(gyro?.y, 2)} unit="°/s" color="#2dc653" />
            <DetailCell label="GYRO Z" value={fmtNum(gyro?.z, 2)} unit="°/s" color="#4361ee" />
          </div>

          {/* Orientation Summary */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', borderBottom: '1px solid var(--border)' }}>
            <DetailCell label="ROLL"  value={fmtNum(orient?.roll, 1)}  unit="°" color="#e76f51" />
            <DetailCell label="PITCH" value={fmtNum(orient?.pitch, 1)} unit="°" color="#f4a261" />
            <DetailCell label="YAW"   value={fmtNum(orient?.yaw, 1)}   unit="°" color="#2a9d8f" />
          </div>

          {/* Mini Traces */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
            <div className="section-header">ACCEL MAGNITUDE TRACE</div>
            <div style={{ height: '110px' }}>
              <TelemetryChart signals={[SIG_MAG]} height={100} externalData={magChartData} />
            </div>

            <div className="section-header">LONGITUDINAL ACCEL TRACE</div>
            <div style={{ height: '110px' }}>
              <TelemetryChart signals={[SIG_AX]} height={100} externalData={axChartData} />
            </div>

            <div className="section-header">ALTITUDE TRACE</div>
            <div style={{ flex: 1, minHeight: '90px' }}>
              <TelemetryChart signals={[SIG_ALT]} height={90} externalData={altChartData} />
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
