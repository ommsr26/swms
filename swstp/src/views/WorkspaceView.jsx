import React, { useState, useCallback } from 'react';
import RGL from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import uPlot from 'uplot';
import WorkspacePanel from '../components/WorkspacePanel.jsx';
import SignalPicker from '../components/SignalPicker.jsx';
import { SIGNALS } from '../telemetry/signalRegistry.js';
import { useTelemetryStore } from '../telemetry/telemetryStore.js';

const WidthProvider = RGL.WidthProvider || (RGL.default && RGL.default.WidthProvider);
const ResponsiveGridLayout = WidthProvider ? WidthProvider(RGL.default || RGL) : (RGL.default || RGL);
const SYNC_KEY = uPlot.sync('workspace-view').key;

const DEFAULT_LAYOUTS = {
  DEFAULT: [
    { id: 'p1', title: 'GROUND SPEED', type: 'CHART', signalIds: ['gnss.speed'], layout: { x: 0, y: 0, w: 6, h: 5 } },
    { id: 'p2', title: 'ALTITUDE & HEADING', type: 'CHART', signalIds: ['gnss.alt', 'gnss.heading'], layout: { x: 6, y: 0, w: 6, h: 5 } },
    { id: 'p3', title: 'ACCELERATION XYZ', type: 'CHART', signalIds: ['imu.accel.x', 'imu.accel.y', 'imu.accel.z'], layout: { x: 0, y: 5, w: 6, h: 5 } },
    { id: 'p4', title: 'GYROSCOPE XYZ', type: 'CHART', signalIds: ['imu.gyro.x', 'imu.gyro.y', 'imu.gyro.z'], layout: { x: 6, y: 5, w: 6, h: 5 } },
  ],
  QUAD_SPLIT: [
    { id: 'p1', title: 'GROUND SPEED', type: 'CHART', signalIds: ['gnss.speed'], layout: { x: 0, y: 0, w: 6, h: 5 } },
    { id: 'p2', title: 'ALTITUDE', type: 'CHART', signalIds: ['gnss.alt'], layout: { x: 6, y: 0, w: 6, h: 5 } },
    { id: 'p3', title: 'ACCELERATION XYZ', type: 'CHART', signalIds: ['imu.accel.x', 'imu.accel.y', 'imu.accel.z'], layout: { x: 0, y: 5, w: 6, h: 5 } },
    { id: 'p4', title: 'GYROSCOPE XYZ', type: 'CHART', signalIds: ['imu.gyro.x', 'imu.gyro.y', 'imu.gyro.z'], layout: { x: 6, y: 5, w: 6, h: 5 } },
  ],
  IMU_DEBUG: [
    { id: 'p1', title: '3D SENSOR ORIENTATION', type: '3D', signalIds: [], layout: { x: 0, y: 0, w: 6, h: 6 } },
    { id: 'p2', title: 'ACCELERATION XYZ & MAG', type: 'CHART', signalIds: ['imu.accel.x', 'imu.accel.y', 'imu.accel.z', 'imu.accel_magnitude'], layout: { x: 6, y: 0, w: 6, h: 6 } },
    { id: 'p3', title: 'GYROSCOPE XYZ', type: 'CHART', signalIds: ['imu.gyro.x', 'imu.gyro.y', 'imu.gyro.z'], layout: { x: 0, y: 6, w: 6, h: 5 } },
    { id: 'p4', title: 'MAGNETOMETER XYZ', type: 'CHART', signalIds: ['imu.mag.x', 'imu.mag.y', 'imu.mag.z'], layout: { x: 6, y: 6, w: 6, h: 5 } },
  ],
};

function fmtTime(s) {
  if (s == null) return '—';
  if (s < 60) return `${s.toFixed(3)}s`;
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(2).padStart(5, '0');
  return `${m}:${sec}`;
}

function fmtVal(v, d = 2) { return v != null ? v.toFixed(d) : '—'; }

export default function WorkspaceView() {
  const { mode, setMode } = useTelemetryStore();
  const [panels, setPanels] = useState(() => {
    try {
      const saved = localStorage.getItem('telemetry_workspace_panels_v2');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // Fallback
    }
    return DEFAULT_LAYOUTS.DEFAULT;
  });

  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [targetPanelIdForSignal, setTargetPanelIdForSignal] = useState(null);
  const [cursorT, setCursorT] = useState(null);
  const [cursorValues, setCursorValues] = useState({});

  const handleCursor = useCallback((idx, t, values) => {
    setCursorT(t);
    setCursorValues((prev) => ({ ...prev, ...values }));
  }, []);

  const handleAddPanelWithSignal = (sig) => {
    if (targetPanelIdForSignal) {
      setPanels((prev) =>
        prev.map((p) => {
          if (p.id === targetPanelIdForSignal) {
            if (p.signalIds.includes(sig.id)) return p;
            return { ...p, signalIds: [...p.signalIds, sig.id] };
          }
          return p;
        })
      );
      setTargetPanelIdForSignal(null);
    } else {
      const newId = `p_${Date.now()}`;
      const newPanel = {
        id: newId,
        title: sig.label.toUpperCase(),
        type: 'CHART',
        signalIds: [sig.id],
        layout: { x: 0, y: Infinity, w: 6, h: 5 },
      };
      setPanels((prev) => [...prev, newPanel]);
    }
  };

  const handleRemovePanel = (panelId) => {
    setPanels((prev) => prev.filter((p) => p.id !== panelId));
  };

  const handleRemoveSignalFromPanel = (panelId, signalId) => {
    setPanels((prev) =>
      prev.map((p) => {
        if (p.id === panelId) {
          const updated = p.signalIds.filter((id) => id !== signalId);
          return { ...p, signalIds: updated };
        }
        return p;
      })
    );
  };

  const handleLayoutChange = (newRglLayout) => {
    setPanels((prev) =>
      prev.map((panel) => {
        const match = newRglLayout.find((l) => l.i === panel.id);
        if (match) {
          return {
            ...panel,
            layout: { x: match.x, y: match.y, w: match.w, h: match.h },
          };
        }
        return panel;
      })
    );
  };

  const saveView = () => {
    localStorage.setItem('telemetry_workspace_panels_v2', JSON.stringify(panels));
    alert('Workspace layout saved!');
  };

  const loadPreset = (presetKey) => {
    const layout = DEFAULT_LAYOUTS[presetKey] || DEFAULT_LAYOUTS.DEFAULT;
    setPanels(layout);
    localStorage.setItem('telemetry_workspace_panels_v2', JSON.stringify(layout));
  };

  const gridLayoutSpec = panels.map((p) => ({
    i: p.id,
    x: p.layout.x,
    y: p.layout.y,
    w: p.layout.w,
    h: p.layout.h,
    minW: 4,
    minH: 4,
  }));

  const allActiveSignalIds = Array.from(
    new Set(panels.flatMap((p) => p.signalIds || []))
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header Bar */}
      <div className="view-header">
        <span className="view-header__title">Custom Telemetry Workspace</span>
        <span className="view-header__sep" />
        <button
          className="btn btn--sm"
          onClick={() => {
            setTargetPanelIdForSignal(null);
            setIsPickerOpen(true);
          }}
        >
          + ADD PANEL
        </button>
        <div style={{ display: 'flex', gap: '4px', marginLeft: '6px' }}>
          <button className="btn btn--sm" onClick={() => loadPreset('DEFAULT')}>
            2x2 Grid
          </button>
          <button className="btn btn--sm" onClick={() => loadPreset('QUAD_SPLIT')}>
            Quad Split
          </button>
          <button className="btn btn--sm" onClick={() => loadPreset('IMU_DEBUG')}>
            IMU 3D Layout
          </button>
        </div>
        <span className="view-header__sep" />
        <button className="btn btn--sm" onClick={saveView}>
          💾 SAVE VIEW
        </button>
        <button className="btn btn--sm" onClick={() => loadPreset('DEFAULT')}>
          ↺ RESET VIEW
        </button>
        <span className="view-header__spacer" />
        <button
          className={`btn btn--sm${mode === 'PAUSED' ? ' btn--active' : ''}`}
          onClick={() => setMode(mode === 'LIVE' ? 'PAUSED' : 'LIVE')}
        >
          {mode === 'LIVE' ? '⏸ Pause' : '▶ Resume'}
        </button>
      </div>

      {/* Main Workspace Area & Cursor Sidebar */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Draggable/Resizable Grid Workspace */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px', minWidth: 0 }}>
          {panels.length === 0 ? (
            <div style={{ padding: '64px', textAlign: 'center', fontFamily: 'var(--text-mono)', color: 'var(--text-dim)' }}>
              <div>NO ACTIVE TELEMETRY PANELS</div>
              <button
                className="btn"
                style={{ marginTop: '16px' }}
                onClick={() => {
                  setTargetPanelIdForSignal(null);
                  setIsPickerOpen(true);
                }}
              >
                + ADD YOUR FIRST TELEMETRY PANEL
              </button>
            </div>
          ) : (
            <ResponsiveGridLayout
              className="layout"
              layout={gridLayoutSpec}
              cols={12}
              rowHeight={42}
              draggableHandle=".drag-handle"
              onLayoutChange={handleLayoutChange}
              margin={[12, 12]}
              containerPadding={[12, 12]}
              compactType="vertical"
              preventCollision={false}
            >
              {panels.map((panel) => (
                <div key={panel.id}>
                  <WorkspacePanel
                    panel={{ ...panel, height: Math.max(160, panel.layout.h * 42 - 40) }}
                    onRemovePanel={handleRemovePanel}
                    onAddSignalToPanel={(panelId) => {
                      setTargetPanelIdForSignal(panelId);
                      setIsPickerOpen(true);
                    }}
                    onRemoveSignalFromPanel={handleRemoveSignalFromPanel}
                    syncKey={SYNC_KEY}
                    onCursor={handleCursor}
                  />
                </div>
              ))}
            </ResponsiveGridLayout>
          )}
        </div>

        {/* Synchronized Cursor Values Sidebar */}
        <div className="telemetry-sidebar" style={{ width: '220px', borderLeft: '1px solid var(--border)', background: 'var(--bg-panel)' }}>
          <div className="section-header">CURSOR READINGS</div>
          <div className="cursor-panel">
            {cursorT == null ? (
              <div className="cursor-panel__no-cursor">
                Hover over any telemetry trace to inspect values
              </div>
            ) : (
              <>
                <div className="cursor-panel__time">
                  <div className="cursor-panel__time-label">ELAPSED TIME</div>
                  {fmtTime(cursorT)}
                </div>

                {allActiveSignalIds.map((sigId) => {
                  const sig = SIGNALS[sigId];
                  if (!sig) return null;
                  const val = cursorValues[sig.bufferKey];
                  return (
                    <div key={sigId} className="cursor-panel__row">
                      <span className="cursor-panel__signal">
                        <span className="cursor-panel__signal-dot" style={{ background: sig.color }} />
                        {sig.label}
                      </span>
                      <span>
                        <span className="cursor-panel__val">{fmtVal(val, sig.decimals)}</span>
                        {sig.unit && <span className="cursor-panel__unit">{sig.unit}</span>}
                      </span>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Signal Picker Modal */}
      <SignalPicker
        isOpen={isPickerOpen}
        onClose={() => {
          setIsPickerOpen(false);
          setTargetPanelIdForSignal(null);
        }}
        onSelectSignal={handleAddPanelWithSignal}
      />
    </div>
  );
}
