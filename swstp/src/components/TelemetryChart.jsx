import { useEffect, useRef, useCallback } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { buffers } from '../telemetry/telemetryStore.js';
import { useTelemetryStore } from '../telemetry/telemetryStore.js';

/**
 * TelemetryChart — uPlot wrapper for engineering telemetry traces.
 *
 * DESIGN PRINCIPLES:
 * - Never stores telemetry in React state.
 * - Subscribes to raw buffers and calls plot.setData() imperatively.
 * - Participates in cursor synchronization via shared sync key.
 * - Updates at ~10Hz max, decoupled from telemetry source rate.
 *
 * Props:
 *   signals     [{key, label, color, unit, yRange}]
 *   height      chart pixel height (default 140)
 *   syncKey     uPlot sync key string (for cursor synchronization)
 *   onCursor    (idx, t, values) => void — cursor position callback
 *   showGrid    show gridlines (default true)
 *   liveWindow  number of samples to show in live mode (default 1200)
 */
export default function TelemetryChart({
  signals,
  height = 140,
  syncKey,
  onCursor,
  showGrid = true,
  title,
  yAxisLabel,
  yRange,
  liveWindow = 600,  // show last 30s @ 20Hz
  externalData = null, // [times, ...signalValues] for cloud-polled / static data
}) {
  const containerRef = useRef(null);
  const plotRef = useRef(null);
  const unsubRef = useRef(null);
  const updateTimerRef = useRef(null);
  const pendingUpdateRef = useRef(false);

  const buildOptions = useCallback((width) => {
    const axisGridColor = showGrid ? '#1e293b' : 'transparent';
    const axisTickColor = '#475569';
    const axisStroke = '#94a3b8';

    const yAxes = signals.map((sig, i) => ({
      scale: sig.scale || `y${i}`,
      stroke: axisStroke,
      grid: { stroke: axisGridColor, width: 1 },
      ticks: { stroke: axisTickColor, width: 1 },
      font: '10px JetBrains Mono, monospace',
      labelFont: '10px JetBrains Mono, monospace',
      labelSize: 12,
      size: 52,
      side: 3,
      values: (u, vals) => vals.map(v => v == null ? '' : formatAxisVal(v)),
      ...(sig.yAxis || {}),
    }));

    // De-duplicate y axes by scale key
    const seenScales = new Set();
    const dedupedAxes = yAxes.filter(ax => {
      if (seenScales.has(ax.scale)) return false;
      seenScales.add(ax.scale);
      return true;
    });

    const series = [
      {
        // x series
        label: 'T',
        value: (u, v) => v == null ? '' : fmtTime(v),
      },
      ...signals.map(sig => ({
        label: sig.label,
        stroke: sig.color,
        width: 1.5,
        fill: sig.fill || `${sig.color}08`,
        scale: sig.scale || `y${signals.indexOf(sig)}`,
        value: (u, v) => v == null ? '—' : `${fmtVal(v, sig.decimals ?? 2)} ${sig.unit ?? ''}`,
        points: { show: false },
      })),
    ];

    const scales = {
      x: { time: false, auto: true },
    };

    signals.forEach((sig, i) => {
      const scaleKey = sig.scale || `y${i}`;
      if (!scales[scaleKey]) {
        scales[scaleKey] = {
          auto: sig.yRange ? false : true,
          range: sig.yRange ?? undefined,
        };
      }
    });

    const opts = {
      width,
      height,
      padding: [6, 12, 0, 0],
      cursor: {
        show: true,
        x: true,
        y: false,
        drag: { x: true, y: false, uni: 50 },
        ...(syncKey ? {
          sync: {
            key: syncKey,
            match: [(a, b) => a === b, (a, b) => a === b],
          },
        } : {}),
      },
      legend: { show: false },
      select: { show: true, left: 0, top: 0, width: 0, height: 0 },
      axes: [
        {
          // X axis (elapsed time)
          stroke: axisStroke,
          grid: { stroke: axisGridColor, width: 1 },
          ticks: { stroke: axisTickColor, width: 1, size: 4 },
          font: '10px JetBrains Mono, monospace',
          values: (u, vals) => vals.map(v => v == null ? '' : fmtTime(v)),
          space: 50,
          incrs: [0.05, 0.1, 0.5, 1, 2, 5, 10, 30, 60],
        },
        ...dedupedAxes,
      ],
      scales,
      series,
      hooks: {
        setCursor: [
          (u) => {
            if (onCursor && u.cursor.idx != null) {
              const idx = u.cursor.idx;
              const t = u.data[0][idx];
              const values = {};
              signals.forEach((sig, i) => {
                values[sig.key] = u.data[i + 1]?.[idx];
              });
              onCursor(idx, t, values);
            }
          },
        ],
      },
    };

    return opts;
  }, [signals, height, syncKey, onCursor, showGrid]);

  // Initialize uPlot
  useEffect(() => {
    if (!containerRef.current) return;

    const width = containerRef.current.offsetWidth || 800;
    const opts = buildOptions(width);
    const emptyData = [[], ...signals.map(() => [])];

    plotRef.current = new uPlot(opts, emptyData, containerRef.current);

    // Only subscribe to live buffers if no external data source is provided
    if (!externalData) {
      unsubRef.current = buffers.subscribe(() => {
        if (!pendingUpdateRef.current) {
          pendingUpdateRef.current = true;
          // Throttle to ~10Hz max
          clearTimeout(updateTimerRef.current);
          updateTimerRef.current = setTimeout(() => {
            pendingUpdateRef.current = false;
            if (plotRef.current) {
              const data = buffers.getChartData(...signals.map(s => s.key));
              // Apply live window: show only last N samples
              const len = data[0].length;
              if (len > liveWindow) {
                const sliced = data.map(arr => arr.slice(len - liveWindow));
                plotRef.current.setData(sliced, true);
              } else {
                plotRef.current.setData(data, true);
              }
            }
          }, 80);  // 80ms ≈ 12fps update rate — smooth but not excessive
        }
      });
    }

    // Resize observer
    const ro = new ResizeObserver(() => {
      if (plotRef.current && containerRef.current) {
        const w = containerRef.current.offsetWidth;
        if (w > 50) plotRef.current.setSize({ width: w, height });
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      if (unsubRef.current) unsubRef.current();
      clearTimeout(updateTimerRef.current);
      plotRef.current?.destroy();
      plotRef.current = null;
    };
  }, []); // Only init once

  // React to externalData updates if provided
  useEffect(() => {
    if (externalData && plotRef.current && Array.isArray(externalData) && externalData.length > 0) {
      try {
        plotRef.current.setData(externalData, true);
      } catch (err) {
        console.warn('[TelemetryChart] Error setting externalData:', err);
      }
    }
  }, [externalData]);

  return (
    <div
      ref={containerRef}
      className="chart-wrap"
      style={{ height: `${height}px`, width: '100%' }}
    />
  );
}

// ── Formatting helpers ────────────────────────────────────────────────────────

function fmtTime(s) {
  if (s == null) return '';
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(0).padStart(2, '0');
  return `${m}:${sec}`;
}

function fmtVal(v, decimals = 2) {
  if (v == null || isNaN(v)) return '—';
  return v.toFixed(decimals);
}

function formatAxisVal(v) {
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(1)}k`;
  if (Math.abs(v) >= 100)  return v.toFixed(0);
  if (Math.abs(v) >= 10)   return v.toFixed(1);
  return v.toFixed(2);
}

export { fmtTime, fmtVal };
