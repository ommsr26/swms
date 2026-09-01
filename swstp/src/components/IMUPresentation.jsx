/**
 * IMUPresentation.jsx — Presentational Component for 3D IMU & Spatial Orientation.
 *
 * SHARED PRESENTATIONAL LAYER:
 * - Used by /debug (via IMUView.jsx, fed by Zustand live serial store)
 * - Used by /admin (via LiveDebugPanel, fed by /api/admin/sessions/{id}/live polling)
 */
import React, { useState, useCallback } from 'react';
import uPlot from 'uplot';
import IMUBoard3D from './IMUBoard3D.jsx';
import TelemetryChart from './TelemetryChart.jsx';

const SYNC = uPlot.sync('imu-view');
const SYNC_KEY = SYNC.key;

const ACCEL_SIGS = [
  { key: 'ax', label: 'Accel X', color: '#f72585', unit: 'm/s²', decimals: 2 },
  { key: 'ay', label: 'Accel Y', color: '#4cc9f0', unit: 'm/s²', decimals: 2 },
  { key: 'az', label: 'Accel Z', color: '#7209b7', unit: 'm/s²', decimals: 2 },
  { key: 'accelMag', label: 'Magnitude', color: '#f15bb5', unit: 'm/s²', decimals: 2 },
];

const GYRO_SIGS = [
  { key: 'gx', label: 'Gyro X', color: '#f48c06', unit: '°/s', decimals: 2 },
  { key: 'gy', label: 'Gyro Y', color: '#2dc653', unit: '°/s', decimals: 2 },
  { key: 'gz', label: 'Gyro Z', color: '#4361ee', unit: '°/s', decimals: 2 },
];

const MAG_SIGS = [
  { key: 'mx', label: 'Mag X', color: '#ee9b00', unit: 'µT', decimals: 1 },
  { key: 'my', label: 'Mag Y', color: '#ca6702', unit: 'µT', decimals: 1 },
  { key: 'mz', label: 'Mag Z', color: '#bb3e03', unit: 'µT', decimals: 1 },
];

const ORIENT_SIGS = [
  { key: 'roll',  label: 'Roll',  color: '#e76f51', unit: '°', decimals: 1 },
  { key: 'pitch', label: 'Pitch', color: '#f4a261', unit: '°', decimals: 1 },
  { key: 'yaw',   label: 'Yaw',   color: '#2a9d8f', unit: '°', decimals: 1 },
];

function fmtVal(v, d = 2) { return v != null && !isNaN(v) ? Number(v).toFixed(d) : '—'; }

export function IMUGauge({ label, value, max, color, unit }) {
  const pct = Math.min(1, Math.abs(value ?? 0) / max);
  const isNeg = (value ?? 0) < 0;
  return (
    <div style={{ padding: '6px 12px', borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
        <span style={{ fontFamily: 'var(--text-mono)', fontSize: '9px', color: 'var(--text-label)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          {label}
        </span>
        <span style={{ fontFamily: 'var(--text-mono)', fontSize: '11px', fontWeight: 500, color }}>
          {fmtVal(value)} <span style={{ fontSize: '9px', color: 'var(--text-label)' }}>{unit}</span>
        </span>
      </div>
      <div style={{ height: '3px', background: 'var(--bg-elevated)', position: 'relative' }}>
        <div style={{
          position: 'absolute',
          height: '3px',
          width: `${pct * 50}%`,
          background: color,
          ...(isNeg ? { right: '50%' } : { left: '50%' }),
          opacity: 0.8,
        }} />
        <div style={{ position: 'absolute', left: '50%', top: '-2px', width: '1px', height: '7px', background: 'var(--border-active)' }} />
      </div>
    </div>
  );
}

export default function IMUPresentation({
  latest = null,
  activeFaults = [],
  isCloudPolled = false,
  traces = null,
}) {
  const [axisConfig, setAxisConfig] = useState({ xSign: 1, ySign: 1, zSign: 1 });
  const [mountingTransformKey, setMountingTransformKey] = useState('IDENTITY');
  const [activeTab, setActiveTab] = useState('3d'); // '3d' | 'charts'

  const imu = latest?.imu;
  const accel = imu?.accel;
  const gyro = imu?.gyro;
  const mag = imu?.mag;
  const orient = imu?.orientation;
  const quat = imu?.quaternion;

  const toggleSign = (axis) => {
    setAxisConfig(prev => ({ ...prev, [`${axis}Sign`]: prev[`${axis}Sign`] * -1 }));
  };

  const isDisconnected = activeFaults.includes('IMU_DISCONNECT') || (!isCloudPolled && !imu?.valid);

  // Cloud trace data if available
  const accelChartData = traces && traces.times?.length > 0
    ? [traces.times, traces.accelX, traces.accelX, traces.accelX, traces.accelMag]
    : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div className="view-header">
        <span className="view-header__title">3D IMU & Spatial Orientation</span>
        <span className="view-header__sep" />
        <div className={`live-indicator live-indicator--${isDisconnected ? 'warn' : 'ok'}`}>
          <span className={`status-dot status-dot--${isDisconnected ? 'error' : 'ok'}`} />
          {isDisconnected ? 'DISCONNECTED' : 'ACTIVE'}
        </div>
        <span className="view-header__sep" />
        <span className="view-header__meta">MPU-9250 / AK8963</span>
        <span className="view-header__spacer" />
        <div className="tabs">
          <div className={`tab${activeTab === '3d' ? ' tab--active' : ''}`} onClick={() => setActiveTab('3d')}>
            3D View & Gauges
          </div>
          <div className={`tab${activeTab === 'charts' ? ' tab--active' : ''}`} onClick={() => setActiveTab('charts')}>
            Synchronized Traces
          </div>
        </div>
      </div>

      {/* Main Body */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── LEFT: 3D Visualization Area or Stacked Traces ────── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {activeTab === '3d' ? (
            <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column' }}>
              <div style={{ flex: 1 }}>
                <IMUBoard3D
                  axisConfig={axisConfig}
                  mountingTransformKey={mountingTransformKey}
                  imuData={imu}
                />
              </div>

              {/* Sensor Mounting Frame & Axis Transformation Toolbar */}
              <div style={{
                padding: '8px 16px',
                background: 'var(--bg-panel)',
                borderTop: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                fontFamily: 'var(--text-mono)',
                fontSize: '10px',
              }}>
                <span style={{ color: 'var(--text-label)', letterSpacing: '0.1em' }}>MOUNTING FRAME:</span>
                <select
                  value={mountingTransformKey}
                  onChange={(e) => setMountingTransformKey(e.target.value)}
                  style={{
                    fontFamily: 'var(--text-mono)',
                    fontSize: '10px',
                    background: 'var(--bg-base)',
                    color: '#00d9ff',
                    border: '1px solid var(--border-mid)',
                    padding: '3px 8px',
                    borderRadius: '2px',
                  }}
                >
                  <option value="YAW_180">YAW 180° (X'=-X, Y'=-Y, Z'=Z)</option>
                  <option value="IDENTITY">IDENTITY (No Rotation)</option>
                  <option value="FLIP_X_180">FLIP X 180° (Inverted Pitch)</option>
                  <option value="FLIP_Y_180">FLIP Y 180° (Inverted Roll)</option>
                </select>

                <span style={{ color: 'var(--text-label)', letterSpacing: '0.1em', marginLeft: '12px' }}>AXIS CONFIG:</span>
                <button className="btn btn--sm" onClick={() => toggleSign('x')}>
                  X: {axisConfig.xSign > 0 ? '+1' : '-1'}
                </button>
                <button className="btn btn--sm" onClick={() => toggleSign('y')}>
                  Y: {axisConfig.ySign > 0 ? '+1' : '-1'}
                </button>
                <button className="btn btn--sm" onClick={() => toggleSign('z')}>
                  Z: {axisConfig.zSign > 0 ? '+1' : '-1'}
                </button>
                <span style={{ marginLeft: 'auto', color: 'var(--text-dim)', fontSize: '9px' }}>
                  Architecture: SENSOR FRAME ➔ MOUNTING TRANSFORM ➔ VEHICLE FRAME
                </span>
              </div>
            </div>
          ) : (
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <div className="chart-row">
                <div className="chart-row__header">
                  <span className="chart-row__title">ACCELEROMETER XYZ & MAGNITUDE</span>
                </div>
                <TelemetryChart signals={ACCEL_SIGS} height={170} syncKey={SYNC_KEY} externalData={accelChartData} />
              </div>

              <div className="chart-row">
                <div className="chart-row__header">
                  <span className="chart-row__title">GYROSCOPE XYZ</span>
                </div>
                <TelemetryChart signals={GYRO_SIGS} height={160} syncKey={SYNC_KEY} />
              </div>

              <div className="chart-row">
                <div className="chart-row__header">
                  <span className="chart-row__title">MAGNETOMETER XYZ</span>
                </div>
                <TelemetryChart signals={MAG_SIGS} height={150} syncKey={SYNC_KEY} />
              </div>

              <div className="chart-row">
                <div className="chart-row__header">
                  <span className="chart-row__title">ORIENTATION ROLL / PITCH / YAW</span>
                </div>
                <TelemetryChart signals={ORIENT_SIGS} height={150} syncKey={SYNC_KEY} />
              </div>
            </div>
          )}
        </div>

        {/* ── RIGHT: Current Values Sidebar & Diagnostics ──────── */}
        <div style={{ width: '280px', borderLeft: '1px solid var(--border)', background: 'var(--bg-panel)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
          <div className="section-header">ACCELEROMETER</div>
          <IMUGauge label="Accel X" value={accel?.x} max={12} color="#f72585" unit="m/s²" />
          <IMUGauge label="Accel Y" value={accel?.y} max={12} color="#4cc9f0" unit="m/s²" />
          <IMUGauge label="Accel Z" value={accel?.z} max={12} color="#7209b7" unit="m/s²" />
          <IMUGauge label="Overall Magnitude" value={imu?.accel_magnitude} max={25} color="#f15bb5" unit="m/s²" />

          <div style={{ padding: '8px 12px', background: 'var(--bg-panel-2)', borderBottom: '1px solid var(--border)', fontSize: '9px', color: 'var(--text-secondary)', fontFamily: 'var(--text-mono)' }}>
            ℹ <strong>Magnitude Note:</strong> Raw magnitude includes ~9.81 m/s² gravity vector at rest. Linear acceleration requires orientation-based gravity compensation.
          </div>

          <div className="section-header">GYROSCOPE</div>
          <IMUGauge label="Gyro X (Roll Rate)"  value={gyro?.x} max={50} color="#f48c06" unit="°/s" />
          <IMUGauge label="Gyro Y (Pitch Rate)" value={gyro?.y} max={50} color="#2dc653" unit="°/s" />
          <IMUGauge label="Gyro Z (Yaw Rate)"   value={gyro?.z} max={50} color="#4361ee" unit="°/s" />

          <div className="section-header">MAGNETOMETER</div>
          {mag ? (
            <>
              <IMUGauge label="Mag X" value={mag?.x} max={60} color="#ee9b00" unit="µT" />
              <IMUGauge label="Mag Y" value={mag?.y} max={60} color="#ca6702" unit="µT" />
              <IMUGauge label="Mag Z" value={mag?.z} max={60} color="#bb3e03" unit="µT" />
            </>
          ) : (
            <div style={{ padding: '8px 12px', background: 'var(--bg-panel-2)', borderBottom: '1px solid var(--border)', fontSize: '9px', color: 'var(--text-label)', fontFamily: 'var(--text-mono)' }}>
              ⚠️ <strong>N/A:</strong> MPU6500 is a 6-axis IMU (Accel + Gyro). No magnetometer hardware present.
            </div>
          )}

          <div className="section-header">SPATIAL ORIENTATION</div>
          <IMUGauge label="Roll Angle"  value={orient?.roll}  max={180} color="#e76f51" unit="°" />
          <IMUGauge label="Pitch Angle" value={orient?.pitch} max={90}  color="#f4a261" unit="°" />
          <IMUGauge label="Yaw Angle"   value={orient?.yaw}   max={360} color="#2a9d8f" unit="°" />
          <div style={{ padding: '4px 12px 8px 12px', borderBottom: '1px solid var(--border)', fontSize: '9px', color: 'var(--status-warn)', fontFamily: 'var(--text-mono)' }}>
            YAW SOURCE: <span style={{ color: 'var(--text-primary)' }}>{orient?.yaw_source || 'GYRO INTEGRATED'}</span> (SUBJECT TO DRIFT)
          </div>

          <div className="section-header">QUATERNION STREAM</div>
          <div style={{ padding: '8px 12px', fontFamily: 'var(--text-mono)', fontSize: '10px', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>
            <div>W: <span style={{ color: 'var(--text-primary)' }}>{fmtVal(quat?.w, 4)}</span></div>
            <div>X: <span style={{ color: '#f72585' }}>{fmtVal(quat?.x, 4)}</span></div>
            <div>Y: <span style={{ color: '#4cc9f0' }}>{fmtVal(quat?.y, 4)}</span></div>
            <div>Z: <span style={{ color: '#7209b7' }}>{fmtVal(quat?.z, 4)}</span></div>
          </div>
        </div>

      </div>
    </div>
  );
}
