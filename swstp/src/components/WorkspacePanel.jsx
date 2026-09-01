import React, { memo } from 'react';
import TelemetryChart from './TelemetryChart.jsx';
import IMUBoard3D from './IMUBoard3D.jsx';
import { SIGNALS } from '../telemetry/signalRegistry.js';
import { useTelemetryStore, eventLog } from '../telemetry/telemetryStore.js';

function fmtVal(v, d = 2) { return v != null ? v.toFixed(d) : '—'; }

const WorkspacePanel = memo(function WorkspacePanel({
  panel,
  onRemovePanel,
  onAddSignalToPanel,
  onRemoveSignalFromPanel,
  syncKey,
  onCursor,
}) {
  const { latest } = useTelemetryStore();

  const signals = (panel.signalIds || [])
    .map((id) => SIGNALS[id])
    .filter(Boolean);

  return (
    <div
      className="panel"
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        border: '1px solid var(--border-mid)',
        background: 'var(--bg-panel)',
      }}
    >
      {/* Panel Header */}
      <div className="panel__header drag-handle" style={{ cursor: 'move', userSelect: 'none', padding: '6px 10px', background: 'var(--bg-panel-2)' }}>
        <span className="panel__title" style={{ fontSize: '10px', color: 'var(--text-primary)' }}>
          {panel.title || 'TELEMETRY PANEL'}
        </span>

        {/* Signal color tags */}
        <div style={{ display: 'flex', gap: '8px', marginLeft: '12px' }}>
          {signals.map((sig) => (
            <span key={sig.id} style={{ fontFamily: 'var(--text-mono)', fontSize: '9px', color: sig.color, display: 'flex', alignItems: 'center', gap: '3px' }}>
              <span style={{ width: '6px', height: '2px', background: sig.color, display: 'inline-block' }} />
              {sig.label}
              {signals.length > 1 && (
                <span
                  style={{ cursor: 'pointer', opacity: 0.7, marginLeft: '2px' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveSignalFromPanel(panel.id, sig.id);
                  }}
                  title="Remove signal"
                >
                  ×
                </span>
              )}
            </span>
          ))}
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px', alignItems: 'center' }}>
          <button
            className="btn btn--sm"
            style={{ fontSize: '9px', padding: '1px 5px' }}
            onClick={(e) => {
              e.stopPropagation();
              onAddSignalToPanel(panel.id);
            }}
          >
            + Signal
          </button>
          <button
            className="btn btn--sm btn--danger"
            style={{ fontSize: '9px', padding: '1px 5px' }}
            onClick={(e) => {
              e.stopPropagation();
              onRemovePanel(panel.id);
            }}
            title="Close Panel"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Panel Body Content according to type */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden' }}>
        {panel.type === 'CHART' && signals.length > 0 && (
          <div style={{ width: '100%', height: '100%', padding: '4px' }}>
            <TelemetryChart
              signals={signals.map((s) => ({
                key: s.bufferKey,
                label: s.label,
                color: s.color,
                unit: s.unit,
                decimals: s.decimals,
                yRange: s.expectedRange,
              }))}
              height={panel.height || 180}
              syncKey={syncKey}
              onCursor={onCursor}
            />
          </div>
        )}

        {panel.type === 'GAUGE' && (
          <div style={{ padding: '16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '12px' }}>
            {signals.map((sig) => {
              const val = latest?.gnss?.[sig.bufferKey] ?? latest?.imu?.accel?.[sig.bufferKey] ?? latest?.imu?.gyro?.[sig.bufferKey] ?? latest?.system?.[sig.bufferKey];
              return (
                <div key={sig.id} className="metric" style={{ background: 'var(--bg-panel-2)', padding: '10px', border: '1px solid var(--border)' }}>
                  <span className="metric__label" style={{ color: sig.color }}>{sig.label}</span>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', marginTop: '4px' }}>
                    <span className="metric__value metric__value--lg" style={{ color: 'var(--text-primary)' }}>
                      {fmtVal(val, sig.decimals)}
                    </span>
                    <span className="metric__unit">{sig.unit}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {panel.type === '3D' && (
          <IMUBoard3D />
        )}

        {panel.type === 'EVENTS' && (
          <div style={{ padding: '8px 12px', height: '100%', overflowY: 'auto' }}>
            {eventLog.length === 0 ? (
              <div style={{ color: 'var(--text-dim)', fontFamily: 'var(--text-mono)', fontSize: '10px', textAlign: 'center', padding: '20px' }}>
                No events recorded
              </div>
            ) : (
              eventLog.slice(-15).reverse().map((ev, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid var(--border)', fontFamily: 'var(--text-mono)', fontSize: '9px' }}>
                  <span style={{ color: ev.type.includes('TURN') ? 'var(--status-warn)' : 'var(--status-ok)' }}>{ev.type}</span>
                  <span style={{ color: 'var(--text-dim)' }}>T+{ev.t.toFixed(1)}s</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
});

export default WorkspacePanel;
