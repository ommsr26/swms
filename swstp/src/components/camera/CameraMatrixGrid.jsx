/**
 * CameraMatrixGrid.jsx — Multi-vehicle camera tile grid.
 *
 * Renders a responsive grid of CameraViewer tiles for all vehicles
 * with assigned devices in the current ULB scope.
 *
 * Each tile shows the live JPEG stream with a stream control:
 *   STREAM OFF → [START LIVE FEED] → LIVE STREAM → [STOP STREAM]
 *
 * Current milestone:
 *   - Grid layout and tile architecture implemented.
 *   - CameraViewer (polling mode) reused — 1.5s snapshot refresh.
 *   - On-demand continuous streaming (RTSP/WebRTC) will be added in a future
 *     streaming milestone when Raspberry Pi edge app publishes streams.
 *
 * FUTURE STREAMING INTEGRATION POINT:
 *   When the RPi edge app implements on-demand streaming:
 *   1. POST /api/camera/{deviceId}/stream/start → begins stream session
 *   2. GET  /api/camera/{deviceId}/stream        → MJPEG multipart stream
 *   3. POST /api/camera/{deviceId}/stream/stop   → ends stream session
 *   Replace CameraViewer polling with <img src={streamUrl}> for MJPEG,
 *   or a WebRTC <video> element for WebRTC relay.
 *
 * Props:
 *   vehicles:   Array  — from fleet/vehicles API, each with assignedDeviceCode
 *   ulbId:      string|null — ULB scope for CameraViewer
 *   loading:    boolean
 */
import { useState } from 'react';
import CameraViewer from '../CameraViewer.jsx';
import { startRemoteCameraStream, stopRemoteCameraStream } from '../../telemetry/backendApiClient.js';

export default function CameraMatrixGrid({ vehicles = [], ulbId = null, loading = false }) {
  // Per-device streaming state: 'off' | 'live'
  const [streamStates, setStreamStates] = useState({});

  const vehiclesWithDevices = vehicles.filter(v => v.assignedDeviceCode);

  const toggleStream = async (deviceCode) => {
    const willBeLive = streamStates[deviceCode] !== 'live';
    setStreamStates(prev => ({
      ...prev,
      [deviceCode]: willBeLive ? 'live' : 'off',
    }));
    if (willBeLive) {
      await startRemoteCameraStream(deviceCode);
    } else {
      await stopRemoteCameraStream(deviceCode);
    }
  };

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--text-mono)', fontSize: '10px', color: 'var(--text-dim)' }}>
        Loading fleet devices…
      </div>
    );
  }

  if (vehiclesWithDevices.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', padding: '40px' }}>
        <div style={{ fontSize: '28px', opacity: 0.3 }}>📷</div>
        <div style={{ fontFamily: 'var(--text-mono)', fontSize: '11px', color: 'var(--text-dim)', textAlign: 'center' }}>
          No vehicles with assigned devices in this ULB.
        </div>
        <div style={{ fontFamily: 'var(--text-mono)', fontSize: '9px', color: 'var(--text-dim)', textAlign: 'center', maxWidth: '280px', lineHeight: 1.6 }}>
          Assign a device to a vehicle via the Fleet or Devices admin panel to enable camera streaming.
        </div>
      </div>
    );
  }

  // Responsive grid: 1 col on narrow, 2 cols when wider, 3 cols at large
  const gridStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: '10px',
    padding: '12px',
    flex: 1,
    overflowY: 'auto',
    alignContent: 'start',
  };

  return (
    <div style={gridStyle}>
      {vehiclesWithDevices.map(v => {
        const deviceCode = v.assignedDeviceCode;
        const isLive = streamStates[deviceCode] === 'live';

        return (
          <div key={deviceCode} style={{
            display: 'flex',
            flexDirection: 'column',
            border: `1px solid ${isLive ? 'var(--status-ok)' : 'var(--border)'}`,
            background: 'var(--bg-panel)',
            overflow: 'hidden',
            transition: 'border-color 0.2s',
          }}>
            {/* Tile header */}
            <div style={{
              padding: '5px 10px',
              borderBottom: '1px solid var(--border)',
              background: 'var(--bg-panel-2)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              flexShrink: 0,
            }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: isLive ? 'var(--status-ok)' : 'var(--status-off)', boxShadow: isLive ? '0 0 5px var(--status-ok)' : 'none', flexShrink: 0 }} />
              <span style={{ fontFamily: 'var(--text-mono)', fontSize: '9px', fontWeight: 700, color: 'var(--text-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {v.registrationNumber || v.vehicleRegistration || '—'}
              </span>
              <span style={{ fontFamily: 'var(--text-mono)', fontSize: '7.5px', color: 'var(--text-dim)' }}>{deviceCode}</span>
            </div>

            {/* Camera viewer or off state */}
            {isLive ? (
              <div style={{ flex: 1, minHeight: '190px' }}>
                <CameraViewer
                  deviceId={deviceCode}
                  ulbId={ulbId}
                  intervalMs={0}
                  label={v.registrationNumber || v.vehicleRegistration}
                  allowExpand={true}
                  style={{ height: '100%' }}
                />
              </div>
            ) : (
              <div style={{
                height: '190px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#050709',
                gap: '10px',
              }}>
                <span style={{ fontSize: '24px', opacity: 0.15 }}>📷</span>
                <span style={{ fontFamily: 'var(--text-mono)', fontSize: '9px', color: 'var(--text-dim)', letterSpacing: '0.06em' }}>STREAM OFF</span>
              </div>
            )}

            {/* Stream control */}
            <div style={{ padding: '7px 10px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
              <button
                onClick={() => toggleStream(deviceCode)}
                style={{
                  width: '100%',
                  padding: '5px 10px',
                  fontFamily: 'var(--text-mono)',
                  fontSize: '9px',
                  fontWeight: 700,
                  letterSpacing: '0.07em',
                  color: isLive ? 'var(--status-error)' : 'var(--status-ok)',
                  background: 'none',
                  border: `1px solid ${isLive ? 'var(--status-error)' : 'var(--status-ok)'}`,
                  cursor: 'pointer',
                  borderRadius: '2px',
                  transition: 'all 0.15s',
                  // Note: future milestone will POST to /api/camera/{deviceId}/stream/start
                }}
              >
                {isLive ? '⏹ STOP STREAM' : '▶ START LIVE FEED'}
              </button>
              {isLive && (
                <div style={{ marginTop: '4px', fontFamily: 'var(--text-mono)', fontSize: '7.5px', color: 'var(--text-dim)', textAlign: 'center' }}>
                  Snapshot polling · 1.5s · On-demand streaming in a future milestone
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
