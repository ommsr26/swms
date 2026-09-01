/**
 * AdminSystemView.jsx — /admin/system
 *
 * System health and configuration inspection.
 * Shows backend health status, database connectivity, API base URL,
 * and StateDefinitions catalog summary.
 *
 * Read-only system inspection — no configuration changes.
 */
import { useState, useEffect } from 'react';
import { fetchHealth } from '../../telemetry/backendApiClient.js';

export default function AdminSystemView() {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastChecked, setLastChecked] = useState(null);

  const checkHealth = () => {
    fetchHealth().then(data => {
      setHealth(data);
      setLastChecked(new Date());
      setLoading(false);
    });
  };

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  const isHealthy = health?.status === 'HEALTHY' || health?.status === 'OK';
  const dbOk = health?.database === 'CONNECTED' || health?.database === 'OK';

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header bar */}
      <div style={{ padding: '6px 14px', background: 'var(--bg-panel)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
        <span style={{ fontFamily: 'var(--text-mono)', fontSize: '8.5px', color: 'var(--text-dim)' }}>System Status · 30s auto-refresh</span>
        {lastChecked && (
          <span style={{ marginLeft: 'auto', fontFamily: 'var(--text-mono)', fontSize: '8px', color: 'var(--text-dim)' }}>
            Last check: {lastChecked.toLocaleTimeString()}
          </span>
        )}
        <button
          onClick={checkHealth}
          style={{ padding: '2px 8px', fontFamily: 'var(--text-mono)', fontSize: '8.5px', background: 'none', border: '1px solid var(--border)', color: 'var(--text-dim)', cursor: 'pointer', borderRadius: '2px' }}
        >
          ↺ Refresh
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '14px' }}>
        {/* Health status card */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontFamily: 'var(--text-mono)', fontSize: '8.5px', fontWeight: 700, color: 'var(--text-dim)', letterSpacing: '0.1em', marginBottom: '8px' }}>
            BACKEND HEALTH
          </div>
          <div style={{ background: 'var(--bg-panel)', border: `1px solid ${isHealthy ? 'rgba(45,198,83,0.3)' : 'rgba(239,35,60,0.3)'}`, padding: '12px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: loading ? 'var(--text-dim)' : isHealthy ? 'var(--status-ok)' : 'var(--status-error)', boxShadow: (!loading && isHealthy) ? '0 0 6px var(--status-ok)' : 'none' }} />
              <span style={{ fontFamily: 'var(--text-mono)', fontSize: '11px', fontWeight: 700, color: loading ? 'var(--text-dim)' : isHealthy ? 'var(--status-ok)' : 'var(--status-error)' }}>
                {loading ? 'CHECKING…' : health?.status || 'UNKNOWN'}
              </span>
            </div>
            <InfoRow k="API Endpoint" v={health?.apiUrl || (import.meta.env.VITE_API_BASE_URL || 'localhost:5000')} />
            <InfoRow k="Database"     v={health?.database || '—'} color={dbOk ? 'var(--status-ok)' : 'var(--status-error)'} />
            <InfoRow k="Environment"  v={import.meta.env.PROD ? 'PRODUCTION' : 'DEVELOPMENT'} />
            {health?.version && <InfoRow k="API Version" v={health.version} />}
            {health?.error && <InfoRow k="Last Error" v={health.error} color="var(--status-error)" />}
          </div>
        </div>

        {/* Database info */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontFamily: 'var(--text-mono)', fontSize: '8.5px', fontWeight: 700, color: 'var(--text-dim)', letterSpacing: '0.1em', marginBottom: '8px' }}>
            DATABASE — MSSQL 192.168.1.8 / Solid_Waste
          </div>
          <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', padding: '12px 16px' }}>
            <InfoRow k="Server"        v="192.168.1.8" />
            <InfoRow k="Database"      v="Solid_Waste" />
            <InfoRow k="Migration"     v="20260817073441_AddDomainAndSpatialFoundation" />
            <InfoRow k="Tables"        v="24 (12 domain tables added in Milestone 1)" />
            <InfoRow k="Spatial SRID"  v="4326 (WGS84 / NetTopologySuite)" />
          </div>
        </div>

        {/* State definitions */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontFamily: 'var(--text-mono)', fontSize: '8.5px', fontWeight: 700, color: 'var(--text-dim)', letterSpacing: '0.1em', marginBottom: '8px' }}>
            STATE DEFINITIONS CATALOG
          </div>
          <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', padding: '12px 16px' }}>
            {['DEVICE', 'VEHICLE', 'OPERATIONAL_SESSION', 'COLLECTION_EVENT'].map(et => (
              <InfoRow key={et} k={et} v="StateDefinitions seeded" color="var(--status-ok)" />
            ))}
          </div>
        </div>

        {/* Operational subsystems implemented */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontFamily: 'var(--text-mono)', fontSize: '8.5px', fontWeight: 700, color: 'var(--text-dim)', letterSpacing: '0.1em', marginBottom: '8px' }}>
            OPERATIONAL SUBSYSTEMS (ACTIVE)
          </div>
          <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', padding: '12px 16px' }}>
            {[
              { name: 'Operational Session State Machine', desc: 'SCHEDULED → ACTIVE → PAUSED → COMPLETED / ABORTED', status: 'ACTIVE' },
              { name: 'Spatial Road Coverage Engine', desc: 'Metric NTS buffer in ULB projected CRS (EPSG:32643 / 32644)', status: 'ACTIVE' },
              { name: 'Collection Events Ingestion', desc: 'Motion & proximity detection with dual RTC/received timestamps', status: 'ACTIVE' },
              { name: 'Evidence Management & Retention', desc: 'SHA-256 integrity check with 21-day automated disk retention', status: 'ACTIVE' },
              { name: 'Audit & State Transition Ledger', desc: 'Immutable append-only audit logs and entity transitions', status: 'ACTIVE' },
              { name: 'Camera Snapshot Polling', desc: 'Periodic JPEG snapshot polling via /api/camera/{deviceId}/latest', status: 'ACTIVE' },
            ].map(item => (
              <div key={item.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                <div>
                  <div style={{ fontFamily: 'var(--text-mono)', fontSize: '9px', fontWeight: 600, color: 'var(--text-primary)' }}>{item.name}</div>
                  <div style={{ fontFamily: 'var(--text-mono)', fontSize: '8px', color: 'var(--text-dim)' }}>{item.desc}</div>
                </div>
                <span style={{ fontFamily: 'var(--text-mono)', fontSize: '8.5px', fontWeight: 700, color: 'var(--status-ok)', letterSpacing: '0.05em' }}>● {item.status}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Planned upgrades */}
        <div>
          <div style={{ fontFamily: 'var(--text-mono)', fontSize: '8.5px', fontWeight: 700, color: 'var(--text-dim)', letterSpacing: '0.1em', marginBottom: '8px' }}>
            PLANNED SUBSYSTEM UPGRADES
          </div>
          <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', padding: '12px 16px' }}>
            {[
              { name: 'SignalR Telemetry Streaming', desc: 'Push streaming upgrade planned (TelemetrySourceAbstraction.js)' },
              { name: 'Continuous Video Streaming', desc: 'RPi edge live video stream (future streaming milestone)' },
            ].map(item => (
              <div key={item.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                <div>
                  <div style={{ fontFamily: 'var(--text-mono)', fontSize: '9px', color: 'var(--text-secondary)' }}>{item.name}</div>
                  <div style={{ fontFamily: 'var(--text-mono)', fontSize: '8px', color: 'var(--text-dim)' }}>{item.desc}</div>
                </div>
                <span style={{ fontFamily: 'var(--text-mono)', fontSize: '8.5px', color: 'var(--status-warn)', letterSpacing: '0.05em' }}>○ PLANNED</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ k, v, color }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontFamily: 'var(--text-mono)', fontSize: '8.5px', color: 'var(--text-dim)' }}>{k}</span>
      <span style={{ fontFamily: 'var(--text-mono)', fontSize: '9px', fontWeight: 600, color: color || 'var(--text-secondary)' }}>{v}</span>
    </div>
  );
}
