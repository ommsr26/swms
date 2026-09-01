/**
 * HardwareConnectView — /hardware-connect
 *
 * Minimal commissioning screen showing:
 *   - Device ID, Vehicle Registration Number, ULB Name
 *   - Serial connection control (Connect / Disconnect)
 *   - Auto-reconnect via navigator.serial.getPorts() on mount
 *   - Live streaming status indicator (green = actively posting batches)
 *
 * Uses the SAME pipeline as DebugLayout via useHardwareConnection():
 *   RealSerialTelemetrySource → ingestPacket() → startHardwareSession()
 *   → sendTelemetryBatch() (scheduled in telemetryStore.js)
 *
 * Visual style: uses index.css tokens exclusively, styled as a stripped-down
 * sibling of the HARDWARE IDENTITY & TRANSPORT card in Navigation.jsx.
 */
import { useEffect, useState, useRef } from 'react';
import { useTelemetryStore, resetSession } from '../telemetry/telemetryStore.js';
import { useHardwareConnection } from '../telemetry/useHardwareConnection.js';
import { useCameraCapture } from '../telemetry/useCameraCapture.js';
import ThemeToggle from '../components/ThemeToggle.jsx';

// ─── Streaming heartbeat tracker ─────────────────────────────────────────────
// We track batch-post activity by watching Zustand dataQuality.totalPackets.
// Green = packets received in the last 2 seconds (stream is active).
function useStreamingStatus() {
  const [isStreaming, setIsStreaming] = useState(false);
  const lastPacketCountRef = useRef(0);
  const lastActivityRef = useRef(0);

  useEffect(() => {
    const unsub = useTelemetryStore.subscribe((state) => {
      const count = state.dataQuality.totalPackets;
      if (count !== lastPacketCountRef.current) {
        lastPacketCountRef.current = count;
        lastActivityRef.current = Date.now();
        setIsStreaming(true);
      }
    });

    const timer = setInterval(() => {
      if (Date.now() - lastActivityRef.current > 2000) {
        setIsStreaming(false);
      }
    }, 500);

    return () => {
      unsub();
      clearInterval(timer);
    };
  }, []);

  return isStreaming;
}

// ─── Identity Card Cell ───────────────────────────────────────────────────────
function IdentityRow({ label, value, valueColor }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      padding: '8px 14px',
      borderBottom: '1px solid var(--border)',
    }}>
      <span style={{
        fontFamily: 'var(--text-mono)',
        fontSize: '9px',
        color: 'var(--text-dim)',
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        flexShrink: 0,
        marginRight: '16px',
      }}>
        {label}
      </span>
      <span style={{
        fontFamily: 'var(--text-mono)',
        fontSize: '11px',
        fontWeight: 600,
        color: valueColor || 'var(--text-primary)',
        textAlign: 'right',
        wordBreak: 'break-all',
      }}>
        {value}
      </span>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function HardwareConnectView() {
  const {
    serialConnected,
    serialError,
    deviceId,
    vehicleRegistrationNumber,
    ulbName,
    hardwareVersion,
    firmwareVersion,
    dataQuality,
  } = useTelemetryStore();

  const { connect, disconnect, tryAutoConnect } = useHardwareConnection();
  const isStreaming = useStreamingStatus();
  const { isCapturing: isCameraStreaming } = useCameraCapture({ enabled: serialConnected, deviceId, autoRemoteControl: true });
  const [autoConnectAttempted, setAutoConnectAttempted] = useState(false);
  const [autoConnectStatus, setAutoConnectStatus] = useState(null); // null | 'found' | 'not-found'
  const [connecting, setConnecting] = useState(false);

  // On mount: reset state, then attempt auto-reconnect to previously-authorized ports
  useEffect(() => {
    resetSession();
    useTelemetryStore.getState().setSourceType('REAL_SERIAL');
    useTelemetryStore.getState().setSerialState(false, null);

    (async () => {
      const success = await tryAutoConnect();
      setAutoConnectAttempted(true);
      setAutoConnectStatus(success ? 'found' : 'not-found');
    })();

    return () => {
      disconnect();
    };
  }, []);

  const handleConnect = async () => {
    setConnecting(true);
    await connect();
    setConnecting(false);
  };

  const handleDisconnect = () => {
    disconnect();
  };

  const isWebSerialSupported = typeof navigator !== 'undefined' && 'serial' in navigator;

  // Resolved identity — populated by startHardwareSession() via ingestPacket() in telemetryStore
  const isIdentityResolved = serialConnected && deviceId && deviceId !== 'UNCONNECTED';
  const isVehicleAssigned = vehicleRegistrationNumber && vehicleRegistrationNumber !== 'UNASSIGNED';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-base)' }}>
      {/* Header */}
      <div className="view-header">
        <span className="view-header__title">Hardware Connect</span>
        <span className="view-header__sep" />
        <span className="view-header__meta">COMMISSIONING · WEB SERIAL</span>
        <span className="view-header__spacer" />
        {/* Live streaming badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{
            width: '7px',
            height: '7px',
            borderRadius: '50%',
            background: serialConnected
              ? (isStreaming ? 'var(--status-ok)' : 'var(--status-warn)')
              : 'var(--status-off)',
            boxShadow: serialConnected && isStreaming ? '0 0 6px var(--status-ok)' : 'none',
            transition: 'background 0.3s',
          }} />
          <span className="rate-badge" style={{
            color: serialConnected
              ? (isStreaming ? 'var(--status-ok)' : 'var(--status-warn)')
              : 'var(--text-dim)',
            borderColor: serialConnected
              ? (isStreaming ? 'var(--status-ok)' : 'var(--status-warn)')
              : 'var(--border)',
          }}>
            {!serialConnected ? 'DISCONNECTED'
              : isStreaming ? 'STREAMING'
              : 'CONNECTED · IDLE'}
          </span>
        </div>
        {/* Theme toggle — same visual convention as Debug sidebar */}
        <span style={{ width: '1px', height: '14px', background: 'var(--border-mid)', margin: '0 4px' }} />
        <ThemeToggle />
      </div>

      {/* Main content — centered commissioning card */}
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        overflow: 'auto',
      }}>
        <div style={{
          width: '100%',
          maxWidth: '440px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}>
          {/* Auto-connect status banner */}
          {!autoConnectAttempted && (
            <div style={{
              padding: '8px 12px',
              background: 'var(--bg-panel)',
              border: '1px solid var(--border)',
              fontFamily: 'var(--text-mono)',
              fontSize: '9.5px',
              color: 'var(--text-dim)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}>
              <span style={{ animation: 'none' }}>⟳</span>
              Checking for previously authorized serial ports…
            </div>
          )}

          {autoConnectAttempted && autoConnectStatus === 'not-found' && !serialConnected && (
            <div style={{
              padding: '8px 12px',
              background: 'var(--bg-panel)',
              border: '1px solid var(--border)',
              fontFamily: 'var(--text-mono)',
              fontSize: '9.5px',
              color: 'var(--text-dim)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}>
              <span style={{ color: 'var(--status-warn)' }}>◌</span>
              No previously authorized port found. Use the button below to connect.
            </div>
          )}

          {autoConnectAttempted && autoConnectStatus === 'found' && serialConnected && (
            <div style={{
              padding: '8px 12px',
              background: 'rgba(45, 198, 83, 0.08)',
              border: '1px solid var(--status-ok)',
              fontFamily: 'var(--text-mono)',
              fontSize: '9.5px',
              color: 'var(--status-ok)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}>
              <span>●</span>
              Auto-reconnected to previously authorized device.
            </div>
          )}

          {/* HARDWARE IDENTITY & TRANSPORT card — mirrors Navigation.jsx style */}
          <div style={{
            background: 'var(--bg-panel)',
            border: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
          }}>
            <div style={{
              padding: '8px 14px',
              borderBottom: '1px solid var(--border)',
              fontFamily: 'var(--text-mono)',
              fontSize: '9px',
              fontWeight: 700,
              color: '#00d9ff',
              letterSpacing: '0.08em',
              background: 'var(--bg-panel-2)',
            }}>
              HARDWARE IDENTITY &amp; TRANSPORT
            </div>

            <IdentityRow
              label="DEVICE ID"
              value={deviceId || 'UNCONNECTED'}
              valueColor={isIdentityResolved ? 'var(--status-ok)' : 'var(--text-dim)'}
            />
            <IdentityRow
              label="VEHICLE REG."
              value={vehicleRegistrationNumber || 'UNASSIGNED'}
              valueColor={isVehicleAssigned ? '#00b4d8' : 'var(--text-dim)'}
            />
            <IdentityRow
              label="ULB"
              value={ulbName || '—'}
              valueColor={ulbName ? '#ffb703' : 'var(--text-dim)'}
            />
            <IdentityRow
              label="HARDWARE VER."
              value={hardwareVersion || '—'}
              valueColor="var(--text-secondary)"
            />
            <IdentityRow
              label="FIRMWARE VER."
              value={firmwareVersion || '—'}
              valueColor="var(--text-secondary)"
            />
            <IdentityRow
              label="SERIAL BAUD"
              value="115200"
              valueColor="var(--text-primary)"
            />
          </div>

          {/* Streaming telemetry stats — only when connected */}
          {serialConnected && (
            <div style={{
              background: 'var(--bg-panel)',
              border: '1px solid var(--border)',
              display: 'flex',
              flexDirection: 'column',
            }}>
              <div style={{
                padding: '8px 14px',
                borderBottom: '1px solid var(--border)',
                fontFamily: 'var(--text-mono)',
                fontSize: '9px',
                fontWeight: 700,
                color: isStreaming ? 'var(--status-ok)' : 'var(--status-warn)',
                letterSpacing: '0.08em',
                background: 'var(--bg-panel-2)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}>
                <span style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: isStreaming ? 'var(--status-ok)' : 'var(--status-warn)',
                  boxShadow: isStreaming ? '0 0 6px var(--status-ok)' : 'none',
                  flexShrink: 0,
                }} />
                {isStreaming ? 'TELEMETRY STREAMING — ACTIVE' : 'TELEMETRY STREAMING — IDLE'}
              </div>
              <IdentityRow
                label="PACKETS RX"
                value={dataQuality.totalPackets?.toLocaleString() ?? '0'}
                valueColor="var(--text-primary)"
              />
              <IdentityRow
                label="ACTUAL RATE"
                value={`${dataQuality.actualHz?.toFixed(1) ?? '0.0'} Hz`}
                valueColor={dataQuality.actualHz > 0 ? 'var(--status-ok)' : 'var(--text-dim)'}
              />
              <IdentityRow
                label="PACKET LOSS"
                value={`${dataQuality.packetLossPct?.toFixed(1) ?? '0.0'} %`}
                valueColor={
                  dataQuality.packetLossPct > 5 ? 'var(--status-error)'
                  : dataQuality.packetLossPct > 1 ? 'var(--status-warn)'
                  : 'var(--status-ok)'
                }
              />
            </div>
          )}

          {/* Error display */}
          {serialError && (
            <div style={{
              padding: '8px 12px',
              background: 'rgba(239, 35, 60, 0.08)',
              border: '1px solid var(--status-error)',
              fontFamily: 'var(--text-mono)',
              fontSize: '9px',
              color: 'var(--status-error)',
              lineHeight: '1.4',
            }}>
              ⚠ {serialError}
            </div>
          )}

          {/* Connection button */}
          {!isWebSerialSupported ? (
            <div style={{
              padding: '10px 14px',
              background: 'rgba(239, 35, 60, 0.08)',
              border: '1px solid var(--status-error)',
              fontFamily: 'var(--text-mono)',
              fontSize: '10px',
              color: 'var(--status-error)',
              textAlign: 'center',
            }}>
              Web Serial API not supported.<br />
              <span style={{ fontSize: '9px', color: 'var(--text-dim)' }}>Use Google Chrome or Microsoft Edge.</span>
            </div>
          ) : !serialConnected ? (
            <button
              id="hw-connect-btn"
              onClick={handleConnect}
              disabled={connecting}
              style={{
                padding: '10px',
                background: connecting ? 'var(--bg-elevated)' : 'rgba(45, 198, 83, 0.15)',
                border: `1px solid ${connecting ? 'var(--border)' : 'var(--status-ok)'}`,
                color: connecting ? 'var(--text-dim)' : 'var(--status-ok)',
                fontFamily: 'var(--text-mono)',
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.06em',
                cursor: connecting ? 'not-allowed' : 'pointer',
                width: '100%',
                borderRadius: '2px',
              }}
            >
              {connecting ? '⟳ CONNECTING…' : '🔌 CONNECT DEVICE'}
            </button>
          ) : (
            <button
              id="hw-disconnect-btn"
              onClick={handleDisconnect}
              style={{
                padding: '10px',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--status-error)',
                color: 'var(--status-error)',
                fontFamily: 'var(--text-mono)',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
                width: '100%',
                borderRadius: '2px',
              }}
            >
              🛑 DISCONNECT SERIAL
            </button>
          )}

          {/* Footer note */}
          <div style={{
            fontFamily: 'var(--text-mono)',
            fontSize: '8.5px',
            color: 'var(--text-label)',
            textAlign: 'center',
            lineHeight: '1.5',
          }}>
            Telemetry pipeline: Web Serial → ingestPacket() → startHardwareSession() → ingest-batch
          </div>
        </div>
      </div>
    </div>
  );
}
