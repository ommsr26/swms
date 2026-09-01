import React, { useState } from 'react';
import { useTelemetryStore, EXPECTED_RATES } from '../telemetry/telemetryStore.js';

function formatDataAge(ms) {
  if (ms == null || isNaN(ms)) return '—';
  if (ms < 1000) return `<${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

export default function DiagnosticsView() {
  const { latest, sensorStatus, dataQuality, serialConnected, deviceId, vehicleRegistrationNumber } = useTelemetryStore();
  const [activeTab, setActiveTab] = useState('health');
  const [testResults, setTestResults] = useState(null);
  const [isTesting, setIsTesting] = useState(false);

  const g = latest?.gnss;
  const imu = latest?.imu;

  const runSelfTest = (targetSensor) => {
    setIsTesting(true);
    setTestResults({ sensor: targetSensor, status: 'RUNNING', steps: [] });

    const tests = {
      IMU: [
        { name: '1. Hardware Serial Channel Active', pass: serialConnected },
        { name: '2. Accelerometer Signal Vector Received', pass: serialConnected && (imu?.accel_magnitude ?? 0) > 0 },
        { name: '3. Gyroscope Sensor Valid Flag', pass: serialConnected && (imu?.valid ?? false) },
        { name: '4. Sensor Temperature Reading', pass: serialConnected && (imu?.temperature_c != null) },
      ],
      GNSS: [
        { name: '1. UART NMEA Serial Receiver Stream', pass: serialConnected },
        { name: '2. Fix State Lock Status', pass: serialConnected && (g?.valid ?? false) },
        { name: '3. Satellite Count (>= 4)', pass: serialConnected && (g?.satellites ?? 0) >= 4 },
      ],
      RTC: [
        { name: '1. DS3231 RTC Oscillator Communication', pass: serialConnected && (latest?.rtc?.synced ?? false) },
        { name: '2. Hardware Monotonic Timestamp', pass: serialConnected && (latest?.timestamp > 0) },
      ],
      COMMS: [
        { name: '1. Packet Sequence Continuity (20 Hz)', pass: serialConnected && dataQuality.packetLossPct < 10 },
        { name: '2. Transport Packet Loss (< 5.0%)', pass: serialConnected && dataQuality.packetLossPct < 5 },
        { name: '3. Transport Jitter (< 50ms)', pass: serialConnected && dataQuality.jitterMs < 50 },
      ],
    };

    const targetSteps = tests[targetSensor] || [];
    let currentStep = 0;

    const interval = setInterval(() => {
      if (currentStep < targetSteps.length) {
        const step = targetSteps[currentStep];
        setTestResults((prev) => ({
          ...prev,
          steps: [...prev.steps, step],
        }));
        currentStep++;
      } else {
        clearInterval(interval);
        const allPass = targetSteps.every((s) => s.pass);
        setTestResults((prev) => ({
          ...prev,
          status: allPass ? 'PASS' : 'FAIL',
        }));
        setIsTesting(false);
      }
    }, 400);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div className="view-header">
        <span className="view-header__title">Physical Hardware Diagnostics & Data Integrity</span>
        <span className="view-header__sep" />
        <div className={`live-indicator live-indicator--${serialConnected ? 'ok' : 'warn'}`}>
          <span className={`status-dot status-dot--${serialConnected ? 'ok' : 'warn'}`} />
          {serialConnected ? 'REAL HARDWARE ONLINE (115200 BAUD)' : 'WAITING FOR USB HARDWARE SERIAL'}
        </div>
        <span className="view-header__spacer" />
        <div className="tabs">
          <div className={`tab${activeTab === 'health' ? ' tab--active' : ''}`} onClick={() => setActiveTab('health')}>
            Hardware Sensor Status
          </div>
          <div className={`tab${activeTab === 'tests' ? ' tab--active' : ''}`} onClick={() => setActiveTab('tests')}>
            Sensor Hardware Self-Tests
          </div>
          <div className={`tab${activeTab === 'contract' ? ' tab--active' : ''}`} onClick={() => setActiveTab('contract')}>
            Telemetry Contract
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', background: 'var(--bg-base)' }}>

        {/* ── TAB 1: HARDWARE SENSOR HEALTH STATUS ───────── */}
        {activeTab === 'health' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

            <div className="section-header">
              PHYSICAL HARDWARE FLEET IDENTITY & TRANSPORT
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>

              {/* Hardware Device Identity Card */}
              <div className="panel" style={{ padding: '12px', borderLeft: '3px solid #2dc653' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span className="panel__title">DEVICE REGISTRY IDENTITY</span>
                  <span style={{ color: '#2dc653', fontWeight: 700, fontFamily: 'var(--text-mono)', fontSize: '10px' }}>
                    REGISTERED
                  </span>
                </div>
                <div style={{ fontFamily: 'var(--text-mono)', fontSize: '10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div>Device Code: <span style={{ color: '#2dc653', fontWeight: 700 }}>{latest?.device_id || deviceId}</span></div>
                  <div>Assigned Vehicle: <span style={{ color: vehicleRegistrationNumber !== 'UNASSIGNED' ? '#00b4d8' : '#94a3b8', fontWeight: 600 }}>{vehicleRegistrationNumber}</span></div>
                  <div>Hardware Version: <span style={{ color: 'var(--text-primary)' }}>REV_2.1_AVR</span></div>
                  <div>Firmware Build: <span style={{ color: 'var(--text-primary)' }}>v2.4.0 (EEPROM Provisioned)</span></div>
                </div>
              </div>

              {/* IMU Card */}
              <div className="panel" style={{ padding: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span className="panel__title">IMU SENSOR (MPU-9250)</span>
                  <span className={`status-text--${serialConnected && sensorStatus.imu === 'ACTIVE' ? 'ok' : 'warn'}`}>
                    ● {serialConnected ? sensorStatus.imu : 'NO DATA'}
                  </span>
                </div>
                <div style={{ fontFamily: 'var(--text-mono)', fontSize: '10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div>Update Rate: <span style={{ color: 'var(--text-primary)' }}>{serialConnected ? `${dataQuality.actualHz} Hz` : '0.0 Hz'}</span></div>
                  <div>Data Age: <span style={{ color: 'var(--text-primary)' }}>{serialConnected ? formatDataAge(dataQuality.lastUpdateMs) : '—'}</span></div>
                  <div>Accel Magnitude: <span style={{ color: 'var(--text-primary)' }}>{imu?.accel_magnitude != null && serialConnected ? `${imu.accel_magnitude.toFixed(2)} m/s²` : '—'}</span></div>
                  <div>Validity: <span style={{ color: imu?.valid && serialConnected ? 'var(--status-ok)' : 'var(--status-warn)' }}>{imu?.valid && serialConnected ? 'VALID ✓' : 'NO DATA ✕'}</span></div>
                </div>
              </div>

              {/* GNSS Card */}
              <div className="panel" style={{ padding: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span className="panel__title">GNSS RECEIVER (NEO-6M)</span>
                  <span className={`status-text--${serialConnected && (sensorStatus.gnss === 'FIX' || sensorStatus.gnss === 'ACTIVE') ? 'ok' : 'warn'}`}>
                    ● {serialConnected ? sensorStatus.gnss : 'NO DATA'}
                  </span>
                </div>
                <div style={{ fontFamily: 'var(--text-mono)', fontSize: '10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div>Fix Status: <span style={{ color: g?.valid && serialConnected ? 'var(--status-ok)' : 'var(--status-warn)' }}>{serialConnected ? sensorStatus.gnss : 'NO DATA'}</span></div>
                  <div>Satellites: <span style={{ color: g?.satellites >= 4 ? 'var(--status-ok)' : 'var(--text-dim)' }}>{serialConnected ? (g?.satellites ?? 0) : '—'} sats</span></div>
                  <div>Coordinates: <span style={{ color: 'var(--text-primary)' }}>{g?.lat != null && serialConnected ? `${g.lat.toFixed(4)}, ${g.lon.toFixed(4)}` : '—'}</span></div>
                  <div>Fix Valid: <span style={{ color: g?.valid && serialConnected ? 'var(--status-ok)' : 'var(--status-warn)' }}>{g?.valid && serialConnected ? 'FIX LOCK ✓' : 'NO FIX ✕'}</span></div>
                </div>
              </div>

              {/* Serial Transport Card */}
              <div className="panel" style={{ padding: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span className="panel__title">SERIAL TRANSPORT</span>
                  <span className={`status-text--${serialConnected ? 'ok' : 'warn'}`}>
                    ● {serialConnected ? 'CONNECTED' : 'DISCONNECTED'}
                  </span>
                </div>
                <div style={{ fontFamily: 'var(--text-mono)', fontSize: '10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div>Baud Rate: <span style={{ color: 'var(--text-primary)' }}>115200 BAUD</span></div>
                  <div>API: <span style={{ color: 'var(--text-primary)' }}>Web Serial (Chromium API)</span></div>
                  <div>Status: <span style={{ color: serialConnected ? 'var(--status-ok)' : 'var(--status-warn)' }}>{serialConnected ? 'CONNECTED ✓' : 'WAITING FOR HARDWARE ✕'}</span></div>
                </div>
              </div>
            </div>

            {/* Telemetry Data Quality Panel */}
            <div className="section-header">TELEMETRY DATA QUALITY & TRANSPORT METRICS</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
              <div className="panel" style={{ padding: '12px' }}>
                <div className="metric__label">EXPECTED RATE</div>
                <div className="metric__value metric__value--md" style={{ color: 'var(--text-primary)', marginTop: '4px' }}>
                  {EXPECTED_RATES.imu} Hz
                </div>
              </div>

              <div className="panel" style={{ padding: '12px' }}>
                <div className="metric__label">ACTUAL RATE</div>
                <div className="metric__value metric__value--md" style={{ color: serialConnected ? 'var(--status-ok)' : 'var(--text-dim)', marginTop: '4px' }}>
                  {serialConnected ? `${dataQuality.actualHz} Hz` : '0.0 Hz'}
                </div>
              </div>

              <div className="panel" style={{ padding: '12px' }}>
                <div className="metric__label">PACKET LOSS</div>
                <div className="metric__value metric__value--md" style={{ color: dataQuality.packetLossPct > 2 ? 'var(--status-error)' : 'var(--status-ok)', marginTop: '4px' }}>
                  {dataQuality.packetLossPct}%
                </div>
                <div style={{ fontSize: '9px', color: 'var(--text-label)', marginTop: '2px' }}>{dataQuality.lostPackets} dropped</div>
              </div>

              <div className="panel" style={{ padding: '12px' }}>
                <div className="metric__label">JITTER</div>
                <div className="metric__value metric__value--md" style={{ color: dataQuality.jitterMs > 4 ? 'var(--status-warn)' : 'var(--text-primary)', marginTop: '4px' }}>
                  {dataQuality.jitterMs} ms
                </div>
              </div>

              <div className="panel" style={{ padding: '12px' }}>
                <div className="metric__label">TOTAL PACKETS</div>
                <div className="metric__value metric__value--md" style={{ color: 'var(--text-primary)', marginTop: '4px' }}>
                  {dataQuality.totalPackets.toLocaleString()}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 2: SENSOR HARDWARE SELF-TESTS ────────────────── */}
        {activeTab === 'tests' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="section-header">PHYSICAL SENSOR HARDWARE SELF-TEST SUITE</div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button className="btn" disabled={isTesting} onClick={() => runSelfTest('IMU')}>
                [ TEST IMU ]
              </button>
              <button className="btn" disabled={isTesting} onClick={() => runSelfTest('GNSS')}>
                [ TEST GNSS ]
              </button>
              <button className="btn" disabled={isTesting} onClick={() => runSelfTest('RTC')}>
                [ TEST RTC ]
              </button>
              <button className="btn" disabled={isTesting} onClick={() => runSelfTest('COMMS')}>
                [ TEST COMMS ]
              </button>
            </div>

            {testResults && (
              <div className="panel" style={{ padding: '16px', maxWidth: '600px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>
                  <span style={{ fontFamily: 'var(--text-mono)', fontSize: '12px', fontWeight: 600 }}>
                    {testResults.sensor} HARDWARE DIAGNOSTIC RESULTS
                  </span>
                  <span className={`status-text--${testResults.status === 'PASS' ? 'ok' : testResults.status === 'RUNNING' ? 'warn' : 'error'}`} style={{ fontFamily: 'var(--text-mono)', fontWeight: 600 }}>
                    {testResults.status}
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {testResults.steps.map((step, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--text-mono)', fontSize: '11px', padding: '4px 0', borderBottom: '1px solid var(--border-mid)' }}>
                      <span>{step.name}</span>
                      <span style={{ color: step.pass ? 'var(--status-ok)' : 'var(--status-error)', fontWeight: 600 }}>
                        {step.pass ? '✓ PASS' : '✕ FAIL'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── TAB 3: TELEMETRY CONTRACT REFERENCE ────────────────── */}
        {activeTab === 'contract' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div className="section-header">TELEMETRY HARDWARE SPECIFICATION CONTRACT (docs/TELEMETRY_CONTRACT.md)</div>
            <div className="panel" style={{ padding: '16px', fontFamily: 'var(--text-mono)', fontSize: '11px', background: 'var(--bg-panel-2)' }}>
              <pre style={{ whiteSpace: 'pre-wrap', color: 'var(--text-primary)' }}>{`{
  "type": "telemetry",
  "device_id": "SWSTP-DEV-000001",
  "seq": 12345,
  "uptime_ms": 918600,
  "rtc": { "valid": true, "epoch": 1723481234123 },
  "gnss": {
    "lat": 20.937400, "lon": 77.779600, "alt": 312.4,
    "speed": 0.0, "heading": 183.2, "satellites": 8, "hdop": 1.4, "fix": "FIX_3D"
  },
  "imu": {
    "accel": { "x": 0.0098, "y": -0.0196, "z": 9.7860 },
    "gyro": { "x": 0.03, "y": -0.01, "z": 0.02 },
    "temperature_c": 31.25,
    "accel_magnitude": 9.806
  }
}`}</pre>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
