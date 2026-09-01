import { useState, useCallback } from 'react';
import uPlot from 'uplot';
import TelemetryChart from '../components/TelemetryChart.jsx';
import { useTelemetryStore, eventLog } from '../telemetry/telemetryStore.js';

const SYNC = uPlot.sync('telemetry-analysis');
const SYNC_KEY = SYNC.key;

const SIGNALS = {
  speed: { key: 'speed',   label: 'Speed',    color: '#00b4d8', unit: 'km/h', decimals: 1, yRange: [0, 160] },
  alt:   { key: 'alt',     label: 'Altitude', color: '#9d4edd', unit: 'm',    decimals: 1 },
  ax: { key: 'ax', label: 'Ax', color: '#f72585', unit: 'm/s²', decimals: 2 },
  ay: { key: 'ay', label: 'Ay', color: '#4cc9f0', unit: 'm/s²', decimals: 2 },
  az: { key: 'az', label: 'Az', color: '#7209b7', unit: 'm/s²', decimals: 2 },
  accelMag: { key: 'accelMag', label: 'Magnitude', color: '#f15bb5', unit: 'm/s²', decimals: 2 },
  gx: { key: 'gx', label: 'Gx', color: '#f48c06', unit: '°/s', decimals: 2 },
  gy: { key: 'gy', label: 'Gy', color: '#2dc653', unit: '°/s', decimals: 2 },
  gz: { key: 'gz', label: 'Gz', color: '#4361ee', unit: '°/s', decimals: 2 },
  mx: { key: 'mx', label: 'Mx', color: '#ee9b00', unit: 'µT', decimals: 1 },
  my: { key: 'my', label: 'My', color: '#ca6702', unit: 'µT', decimals: 1 },
  mz: { key: 'mz', label: 'Mz', color: '#bb3e03', unit: 'µT', decimals: 1 },
  roll:  { key: 'roll',  label: 'Roll',  color: '#e76f51', unit: '°', decimals: 1 },
  pitch: { key: 'pitch', label: 'Pitch', color: '#f4a261', unit: '°', decimals: 1 },
  yaw:   { key: 'yaw',   label: 'Yaw',   color: '#2a9d8f', unit: '°', decimals: 1 },
  heading: { key: 'heading', label: 'Heading', color: '#43aa8b', unit: '°', decimals: 1, yRange: [0, 360] },
};

const SIGNAL_GROUPS = [
  { id: 'speed',    label: 'SPEED',       keys: ['speed'] },
  { id: 'alt',      label: 'ALTITUDE',    keys: ['alt'] },
  { id: 'accel',    label: 'ACCELERATION',keys: ['ax', 'ay', 'az', 'accelMag'] },
  { id: 'gyro',     label: 'GYROSCOPE',   keys: ['gx', 'gy', 'gz'] },
  { id: 'mag',      label: 'MAGNETOMETER',keys: ['mx', 'my', 'mz'] },
  { id: 'orient',   label: 'ORIENTATION', keys: ['roll', 'pitch', 'yaw'] },
  { id: 'heading',  label: 'HEADING',     keys: ['heading'] },
];

function fmtTime(s) {
  if (s == null || isNaN(s)) return '—';
  if (s < 60) return `${s.toFixed(3)}s`;
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(2).padStart(5, '0');
  return `${m}:${sec}`;
}

function fmtVal(v, decs = 2) {
  if (v == null || isNaN(v)) return '—';
  return v.toFixed(decs);
}

function CursorSidebar({ cursorT, cursorValues, visibleGroups }) {
  if (cursorT == null) {
    return (
      <div className="cursor-panel">
        <div className="cursor-panel__no-cursor">
          Hover a chart<br />to sync cursor
        </div>
      </div>
    );
  }

  return (
    <div className="cursor-panel">
      <div className="cursor-panel__time">
        <div className="cursor-panel__time-label">TIME</div>
        {fmtTime(cursorT)}
      </div>

      {visibleGroups.map(grp => (
        <div key={grp.id} style={{ marginBottom: '12px' }}>
          <div className="cursor-panel__group-header">{grp.label}</div>
          {grp.keys.map(key => {
            const sig = SIGNALS[key];
            if (!sig) return null;
            const val = cursorValues[key];
            return (
              <div key={key} className="cursor-panel__row">
                <span className="cursor-panel__signal">
                  <span className="cursor-panel__signal-dot" style={{ background: sig.color }} />
                  {sig.label}
                </span>
                <span>
                  <span className="cursor-panel__val">{fmtVal(val, sig.decimals)}</span>
                  <span className="cursor-panel__unit">{sig.unit}</span>
                </span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export default function TelemetryAnalysis() {
  const { sessionElapsed, mode, setMode, runCount, sessionId } = useTelemetryStore();
  const [cursorT, setCursorT] = useState(null);
  const [cursorValues, setCursorValues] = useState({});
  const [visibleGroups, setVisibleGroups] = useState({
    speed: true,
    alt: true,
    accel: true,
    gyro: true,
    mag: false,
    orient: true,
    heading: false,
  });

  const handleCursor = useCallback((idx, t, values) => {
    setCursorT(t);
    setCursorValues(prev => ({ ...prev, ...values }));
  }, []);

  const toggleGroup = (id) => {
    setVisibleGroups(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const activeGroups = SIGNAL_GROUPS.filter(g => visibleGroups[g.id]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div className="view-header">
        <span className="view-header__title">Telemetry Analysis</span>
        <span className="view-header__sep" />
        <span className="view-header__meta" style={{ fontFamily: 'var(--text-mono)' }}>
          SESSION {sessionId} · RUN {runCount.toString().padStart(3, '0')}
        </span>
        <span className="view-header__sep" />
        <span className="view-header__meta" style={{ fontFamily: 'var(--text-mono)', color: 'var(--text-primary)' }}>
          ELAPSED {fmtTime(sessionElapsed)}
        </span>
        <span className="view-header__spacer" />
        <button
          className={`btn btn--sm${mode === 'PAUSED' ? ' btn--active' : ''}`}
          onClick={() => setMode(mode === 'LIVE' ? 'PAUSED' : 'LIVE')}
        >
          {mode === 'LIVE' ? '⏸ Pause' : '▶ Resume'}
        </button>
      </div>

      {/* Technical Signal Selector Chips Bar */}
      <div className="signal-selector">
        <span className="signal-selector__label">SIGNALS</span>
        {SIGNAL_GROUPS.map(grp => {
          const isActive = visibleGroups[grp.id];
          const color = SIGNALS[grp.keys[0]]?.color || '#00b4d8';
          return (
            <button
              key={grp.id}
              className={`signal-toggle${isActive ? ' signal-toggle--active' : ''}`}
              onClick={() => toggleGroup(grp.id)}
            >
              <span className="signal-toggle__swatch" style={{
                background: isActive ? color : 'var(--text-dim)',
                boxShadow: isActive ? `0 0 6px ${color}` : 'none',
              }} />
              {grp.label}
            </button>
          );
        })}
      </div>

      {/* Main Workspace */}
      <div className="telemetry-workspace" style={{ flex: 1 }}>
        {/* Stacked Charts */}
        <div className="telemetry-charts">
          {activeGroups.map(grp => {
            const sigs = grp.keys.map(k => SIGNALS[k]).filter(Boolean);
            const primarySig = sigs[0];

            return (
              <div key={grp.id} className="chart-row">
                <div className="chart-row__header">
                  <span className="chart-row__title" style={{ color: primarySig?.color }}>
                    {grp.label}
                  </span>
                  <div style={{ display: 'flex', gap: '12px', marginLeft: '12px' }}>
                    {sigs.map(sig => (
                      <span key={sig.key} style={{
                        fontFamily: 'var(--text-mono)', fontSize: '10px', color: sig.color,
                        display: 'flex', alignItems: 'center', gap: '4px',
                      }}>
                        <span style={{ width: '8px', height: '2px', background: sig.color, display: 'inline-block' }} />
                        {sig.label}
                        <span style={{ color: 'var(--text-primary)', marginLeft: '2px', fontWeight: 500 }}>
                          {fmtVal(cursorValues[sig.key], sig.decimals)}
                        </span>
                        <span style={{ color: 'var(--text-label)', fontSize: '9px' }}>{sig.unit}</span>
                      </span>
                    ))}
                  </div>
                </div>

                <TelemetryChart
                  signals={sigs}
                  height={150}
                  syncKey={SYNC_KEY}
                  onCursor={handleCursor}
                />
              </div>
            );
          })}
        </div>

        {/* Cursor Sidebar */}
        <div className="telemetry-sidebar">
          <div className="section-header">CURSOR READINGS</div>
          <CursorSidebar
            cursorT={cursorT}
            cursorValues={cursorValues}
            visibleGroups={activeGroups}
          />

          <div className="section-header">EVENT LOG</div>
          <div style={{ padding: '8px 12px', overflowY: 'auto', flex: 1 }}>
            {eventLog.length === 0 ? (
              <div style={{ fontFamily: 'var(--text-mono)', fontSize: '10px', color: 'var(--text-dim)' }}>
                No events recorded
              </div>
            ) : (
              eventLog.slice(-12).reverse().map((ev, i) => (
                <div key={i} style={{
                  display: 'flex', justifyContent: 'space-between',
                  padding: '3px 0', borderBottom: '1px solid var(--border)',
                  fontFamily: 'var(--text-mono)', fontSize: '9px',
                }}>
                  <span style={{ color: ev.type.includes('HEADING') ? 'var(--status-warn)' : 'var(--status-ok)' }}>
                    {ev.type}
                  </span>
                  <span style={{ color: 'var(--text-dim)' }}>T+{ev.t.toFixed(1)}s</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
