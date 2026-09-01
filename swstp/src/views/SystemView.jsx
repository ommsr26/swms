import { useState, useEffect } from 'react';
import { useTelemetryStore } from '../telemetry/telemetryStore.js';
import { buffers, eventLog } from '../telemetry/telemetryStore.js';
import { fetchHealth } from '../telemetry/backendApiClient.js';

function StatRow({ label, value, status }) {
  return (
    <div className="system-stat-row">
      <span className="system-stat-label">{label}</span>
      <span className={`system-stat-value${status === 'ok' ? ' system-stat-value--ok' : status === 'warn' ? ' system-stat-value--warn' : ''}`}>
        {value}
      </span>
    </div>
  );
}


function SensorBlock({ label, status, lastUpdate, detail }) {
  const cls = status === 'FIX' || status === 'ACTIVE' || status === 'SYNCED' || status === 'LIVE' ? 'ok'
            : status === 'NO_FIX' || status === 'STANDBY' || status === 'WARN' ? 'warn'
            : status === 'OFFLINE' ? 'error' : 'off';

  return (
    <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}>
        <span className={`status-dot status-dot--${cls}`} />
        <span style={{ fontFamily: 'var(--text-mono)', fontSize: '11px', fontWeight: 500, color: 'var(--text-primary)' }}>
          {label}
        </span>
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--text-mono)', fontSize: '10px' }}
              className={`status-text--${cls}`}>
          {status}
        </span>
      </div>
      {detail && (
        <div style={{ fontFamily: 'var(--text-mono)', fontSize: '9px', color: 'var(--text-secondary)', paddingLeft: '14px' }}>
          {detail}
        </div>
      )}
      {lastUpdate != null && (
        <div style={{ fontFamily: 'var(--text-mono)', fontSize: '9px', color: 'var(--text-label)', paddingLeft: '14px', marginTop: '2px' }}>
          Last update: {lastUpdate}ms ago
        </div>
      )}
    </div>
  );
}

export default function SystemView() {
  const { latest, sensorStatus, sessionElapsed, mode, runCount, dataQuality, sourceType } = useTelemetryStore();
  const [packetRate, setPacketRate] = useState(0);
  const [lastPacketAge, setLastPacketAge] = useState(0);
  const [healthStatus, setHealthStatus] = useState({ status: 'CHECKING...', database: 'CHECKING...' });

  const isReal = sourceType === 'REAL_SERIAL';

  useEffect(() => {
    let count = 0;
    const unsub = buffers.subscribe(() => { count++; });
    const interval = setInterval(() => {
      setPacketRate(count);
      count = 0;
      if (latest && latest.timestamp) {
        setLastPacketAge(Math.round(Date.now() - latest.timestamp));
      }
    }, 1000);

    fetchHealth().then((res) => {
      setHealthStatus(res || { status: 'UNHEALTHY', database: 'DISCONNECTED' });
    }).catch(() => {
      setHealthStatus({ status: 'UNHEALTHY', database: 'DISCONNECTED' });
    });

    return () => { unsub(); clearInterval(interval); };
  }, [latest]);


  const g = latest?.gnss;
  const sys = latest?.system;

  const fmtUptime = (s) => {
    if (s == null) return '—';
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    return h > 0 ? `${h}h ${m}m ${sec}s` : `${m}m ${sec}s`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div className="view-header">
        <span className="view-header__title">System Software & Transport Diagnostics</span>
        <span className="view-header__sep" />
        <div className="live-indicator live-indicator--ok">
          <span className="status-dot status-dot--ok" />
          {mode}
        </div>
        <span className="view-header__spacer" />
        <span className="rate-badge">{isReal ? 'REAL HARDWARE (115200 BAUD)' : 'WAITING FOR HARDWARE'}</span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, minHeight: '100%' }}>

          {/* ── Telemetry data rates ── */}
          <div className="system-card" style={{ borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontFamily: 'var(--text-mono)', fontSize: '10px', fontWeight: 600,
                          letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-secondary)',
                          marginBottom: '14px' }}>
              Telemetry Transport
            </div>
            <StatRow label="Mode"          value={mode || 'IDLE'} status={isReal ? 'ok' : 'warn'} />
            <StatRow label="Source"        value={isReal ? 'RealSerialTelemetrySource' : 'RealSerialTelemetrySource (Disconnected)'} />
            <StatRow label="Baud Rate"     value={isReal ? '115200 BAUD' : '115200 BAUD (Standby)'} />
            <StatRow label="API Health"    value={healthStatus.status} status={healthStatus.status === 'HEALTHY' ? 'ok' : 'warn'} />
            <StatRow label="MSSQL DB"      value={healthStatus.database} status={healthStatus.database === 'CONNECTED' ? 'ok' : 'warn'} />
            <StatRow label="Packets / s"   value={`${packetRate} pps`} status={packetRate > 0 ? 'ok' : 'warn'} />
            <StatRow label="Last packet"   value={lastPacketAge > 0 ? `${lastPacketAge} ms ago` : '—'} status={lastPacketAge < 3000 && lastPacketAge > 0 ? 'ok' : 'warn'} />
            <StatRow label="Total packets" value={dataQuality.totalPackets.toLocaleString()} />
            <StatRow label="Session time"  value={`${sessionElapsed.toFixed(0)} s`} />
            <StatRow label="Ring Buffer"   value="1200 samples / signal" />
          </div>


          {/* ── Sensor status ── */}
          <div className="system-card" style={{ borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontFamily: 'var(--text-mono)', fontSize: '10px', fontWeight: 600,
                          letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-secondary)',
                          marginBottom: '14px' }}>
              Sensor Modules
            </div>
            <SensorBlock
              label="GNSS"
              status={sensorStatus.gnss}
              lastUpdate={lastPacketAge > 0 ? lastPacketAge : null}
              detail={g?.valid ? `${g.satellites ?? 0} sats · HDOP ${g.hdop ?? '—'} · ${g.fix}` : 'NO DATA / NO FIX'}
            />
            <SensorBlock
              label="IMU"
              status={sensorStatus.imu}
              lastUpdate={lastPacketAge > 0 ? lastPacketAge : null}
              detail={isReal ? 'Arduino Real Serial Output (Accel + Gyro)' : 'MPU-9250 AHRS · Waiting for telemetry'}
            />
            <SensorBlock
              label="RTC"
              status={sensorStatus.rtc}
              lastUpdate={lastPacketAge > 0 ? lastPacketAge : null}
              detail={latest?.rtc?.iso ?? 'No data'}
            />
            <SensorBlock
              label="Camera"
              status={sensorStatus.camera}
              detail="Snapshot polling active via /api/camera"
            />
            <SensorBlock
              label="Serial Transport"
              status={sensorStatus.serial}
              detail={isReal ? 'Web Serial connected @ 115200 Baud' : 'Disconnected · Standby'}
            />
          </div>

          {/* ── Device state ── */}
          <div className="system-card" style={{ borderRight: '1px solid var(--border)' }}>
            <div style={{ fontFamily: 'var(--text-mono)', fontSize: '10px', fontWeight: 600,
                          letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-secondary)',
                          marginBottom: '14px' }}>
              Device State
            </div>
            <StatRow label="Uptime"      value={fmtUptime(sys?.uptime)} status="ok" />
            <StatRow label="Battery"     value={sys?.battery != null ? `${sys.battery.toFixed(1)} %` : '—'}
                     status={sys?.battery > 20 ? 'ok' : 'warn'} />
            <StatRow label="Temperature" value={sys?.temperature != null ? `${sys.temperature.toFixed(1)} °C` : '—'}
                     status={sys?.temperature < 60 ? 'ok' : 'warn'} />
            <StatRow label="Current Run"  value={`RUN ${runCount}`} />
            <StatRow label="Speed"       value={g?.speed != null ? `${g.speed.toFixed(1)} km/h` : '—'} />
            <StatRow label="Altitude"    value={g?.alt != null ? `${g.alt.toFixed(1)} m` : '—'} />
            <StatRow label="Heading"     value={g?.heading != null ? `${g.heading.toFixed(1)} °` : '—'} />
            <StatRow label="Lat/Lon"     value={g?.lat != null && g?.lon != null ? `${g.lat.toFixed(5)}, ${g.lon.toFixed(5)}` : '—'} />
          </div>

          {/* ── Events ── */}
          <div className="system-card">
            <div style={{ fontFamily: 'var(--text-mono)', fontSize: '10px', fontWeight: 600,
                          letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-secondary)',
                          marginBottom: '14px' }}>
              Recent Event History ({eventLog.length} total)
            </div>
            {eventLog.length === 0 ? (
              <div style={{ fontFamily: 'var(--text-mono)', fontSize: '10px', color: 'var(--text-dim)' }}>
                No events yet
              </div>
            ) : (
              eventLog.slice(-15).reverse().map((ev, i) => (
                <div key={i} style={{
                  display: 'flex', justifyContent: 'space-between',
                  padding: '5px 0',
                  borderBottom: '1px solid var(--border)',
                  fontFamily: 'var(--text-mono)', fontSize: '10px',
                }}>
                  <span style={{
                    color: ev.type.includes('TURN') ? 'var(--status-warn)'
                         : ev.type === 'ACCEL_PEAK' ? 'var(--status-ok)'
                         : 'var(--text-secondary)',
                  }}>
                    {ev.type}
                  </span>
                  <span style={{ color: 'var(--text-dim)' }}>T + {ev.t.toFixed(2)}s</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
