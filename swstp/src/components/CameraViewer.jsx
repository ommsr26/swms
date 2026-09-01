/**
 * CameraViewer.jsx — Compact & expandable live camera snapshot tile.
 *
 * Polls GET /api/camera/{deviceId}/latest at a configurable interval (default 1.5 s)
 * and renders the JPEG as a live thumbnail or high-definition expanded modal.
 * Shows a staleness indicator using --status-ok / --status-warn / --status-error tokens.
 *
 * ULB SCOPING:
 *   Pass ulbId (string) to enforce server-side ULB scope on every frame fetch.
 *   The server responds with 403 if the device is outside the caller's ULB.
 *   Officer views must always pass ulbId. Admin views pass null (unrestricted).
 *
 * EXPANDABLE MODAL:
 *   Full lightbox / expanded modal overlay with HUD metadata, resolution info,
 *   configurable refresh rate (500ms - 3000ms), and browser fullscreen support.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { getCameraFrameUrl, getCameraStreamUrl, fetchCameraFrameMeta } from '../telemetry/backendApiClient.js';

const STALE_WARN_S  = 3.0;
const STALE_ERROR_S = 8.0;
const MAX_RECONNECT_ATTEMPTS = 5;

const fmtAge = (sec) => {
  if (sec == null) return '0.0s';
  return `${Number(sec).toFixed(1)}s`;
};

export default function CameraViewer({
  deviceId,
  ulbId = null,
  intervalMs = 0, // Default 0 = Continuous 10-15 FPS MJPEG Stream
  label = null,
  allowExpand = true,
  style = {},
}) {
  const [streamState, setStreamState] = useState('CONNECTING'); // CONNECTING | LIVE | STALLED | RECONNECTING | OFFLINE | UNAUTHORIZED
  const [frameUrl, setFrameUrl] = useState(null);
  const [capturedAt, setCapturedAt] = useState(null);
  const [ageSeconds, setAgeSeconds] = useState(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [currentInterval, setCurrentInterval] = useState(intervalMs);
  const [imgDimensions, setImgDimensions] = useState(null);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);

  const imgRef = useRef(null);
  const pollRef = useRef(null);
  const healthCheckRef = useRef(null);
  const modalRef = useRef(null);
  const lastFrameReceivedAtRef = useRef(Date.now());
  const reconnectTimeoutRef = useRef(null);

  // Trigger bounded stream reconnect with exponential backoff
  const triggerReconnect = useCallback(() => {
    if (reconnectAttempt >= MAX_RECONNECT_ATTEMPTS) {
      setStreamState('OFFLINE');
      return;
    }

    const nextAttempt = reconnectAttempt + 1;
    setReconnectAttempt(nextAttempt);
    setStreamState('RECONNECTING');

    const backoffMs = Math.min(8000, 1000 * Math.pow(1.8, nextAttempt - 1));
    clearTimeout(reconnectTimeoutRef.current);
    reconnectTimeoutRef.current = setTimeout(() => {
      // Re-establish stream URL with unique timestamp token to bypass browser image cache
      const rawUrl = getCameraStreamUrl(deviceId, ulbId);
      const sep = rawUrl.includes('?') ? '&' : '?';
      setFrameUrl(`${rawUrl}${sep}_t=${Date.now()}`);
      lastFrameReceivedAtRef.current = Date.now();
      setStreamState('CONNECTING');
    }, backoffMs);
  }, [deviceId, ulbId, reconnectAttempt]);

  // Handle successful frame boundary arrival (fired by native browser MJPEG decoder)
  const handleFrameLoad = useCallback((e) => {
    lastFrameReceivedAtRef.current = Date.now();
    setReconnectAttempt(0);
    setStreamState('LIVE');
    if (e.target.naturalWidth) {
      setImgDimensions({ w: e.target.naturalWidth, h: e.target.naturalHeight });
    }
  }, []);

  // Handle stream error / abort
  const handleStreamError = useCallback((e) => {
    if (streamState === 'UNAUTHORIZED') return;
    triggerReconnect();
  }, [streamState, triggerReconnect]);

  useEffect(() => {
    if (!deviceId) return;
    setStreamState('CONNECTING');
    setReconnectAttempt(0);
    lastFrameReceivedAtRef.current = Date.now();

    // Verify initial metadata and authorization
    fetchCameraFrameMeta(deviceId).then((meta) => {
      if (meta && meta.capturedAt) {
        setCapturedAt(meta.capturedAt);
      }
    }).catch((err) => {
      if (err?.status === 403 || err?.message?.includes('403')) {
        setStreamState('UNAUTHORIZED');
      }
    });

    if (currentInterval === 0) {
      setFrameUrl(getCameraStreamUrl(deviceId, ulbId));
    } else {
      setFrameUrl(getCameraFrameUrl(deviceId, ulbId));
      pollRef.current = setInterval(() => {
        setFrameUrl(getCameraFrameUrl(deviceId, ulbId));
      }, currentInterval);
    }

    // Health checker: checks true frame arrival age every 1000ms without React frame state overhead
    healthCheckRef.current = setInterval(() => {
      const elapsed = (Date.now() - lastFrameReceivedAtRef.current) / 1000.0;
      setAgeSeconds(elapsed);

      setStreamState((prevState) => {
        if (prevState === 'UNAUTHORIZED' || prevState === 'RECONNECTING' || prevState === 'OFFLINE') {
          return prevState;
        }
        if (elapsed < STALE_WARN_S) {
          return 'LIVE';
        }
        if (elapsed >= STALE_WARN_S && elapsed < STALE_ERROR_S) {
          return 'STALLED';
        }
        if (elapsed >= STALE_ERROR_S && prevState === 'STALLED') {
          triggerReconnect();
          return 'RECONNECTING';
        }
        return prevState;
      });
    }, 1000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (healthCheckRef.current) clearInterval(healthCheckRef.current);
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    };
  }, [deviceId, ulbId, currentInterval, triggerReconnect]);

  // Handle ESC key to exit expanded modal
  useEffect(() => {
    if (!isExpanded) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsExpanded(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isExpanded]);

  const getStateBadgeStyle = () => {
    switch (streamState) {
      case 'LIVE':
        return { color: 'var(--status-ok)', label: 'LIVE 🟢', border: 'var(--status-ok)' };
      case 'STALLED':
        return { color: 'var(--status-warn)', label: `STALLED (${Math.round(ageSeconds ?? 0)}s) 🟡`, border: 'var(--status-warn)' };
      case 'RECONNECTING':
        return { color: '#f48c06', label: `RECONNECTING (${reconnectAttempt}/${MAX_RECONNECT_ATTEMPTS}) 🟠`, border: '#f48c06' };
      case 'OFFLINE':
        return { color: 'var(--status-error)', label: 'CAMERA OFFLINE 🔴', border: 'var(--status-error)' };
      case 'UNAUTHORIZED':
        return { color: 'var(--status-error)', label: 'UNAUTHORIZED ⛔', border: 'var(--status-error)' };
      default:
        return { color: 'var(--text-dim)', label: 'CONNECTING… ⚪', border: 'var(--border)' };
    }
  };

  const badge = getStateBadgeStyle();
  const isStale = streamState === 'STALLED';
  const staleColor = badge.color;

  const toggleFullscreen = () => {
    if (!modalRef.current) return;
    if (!document.fullscreenElement) {
      modalRef.current.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  return (
    <>
      <div style={{
        background: 'var(--bg-panel)',
        border: `1px solid ${badge.border}`,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        position: 'relative',
        ...style,
      }}>
        {/* Header bar */}
        <div style={{
          padding: '5px 10px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          background: 'var(--bg-panel-2)',
          flexShrink: 0,
        }}>
          {/* State indicator dot */}
          <span style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: badge.color,
            boxShadow: streamState === 'LIVE' ? `0 0 5px ${badge.color}` : 'none',
            flexShrink: 0,
          }} />
          <span style={{ fontFamily: 'var(--text-mono)', fontSize: '9px', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '0.05em' }}>
            {label ? `${label} · ${deviceId}` : deviceId}
          </span>

          <span style={{ marginLeft: 'auto', fontFamily: 'var(--text-mono)', fontSize: '8.5px', color: badge.color, fontWeight: 700 }}>
            {badge.label}
          </span>

          {/* Expand icon button */}
          {allowExpand && (
            <button
              onClick={() => setIsExpanded(true)}
              style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-mid)',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                fontFamily: 'var(--text-mono)',
                fontSize: '10px',
                padding: '2px 5px',
                borderRadius: '2px',
                lineHeight: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                outline: 'none',
                transition: 'background 0.15s, color 0.15s',
              }}
              title="Expand live camera feed (Full View)"
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#00d9ff22';
                e.currentTarget.style.color = '#00d9ff';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--bg-elevated)';
                e.currentTarget.style.color = 'var(--text-secondary)';
              }}
            >
              ⛶
            </button>
          )}
        </div>

        {/* Image area */}
        <div
          onClick={() => { if (allowExpand && streamState === 'LIVE') setIsExpanded(true); }}
          style={{
            flex: 1,
            position: 'relative',
            background: '#050709',
            minHeight: '120px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: allowExpand && streamState === 'LIVE' ? 'pointer' : 'default',
          }}
          title={allowExpand && streamState === 'LIVE' ? 'Click to expand camera feed' : undefined}
        >
          {streamState === 'UNAUTHORIZED' ? (
            <div style={{ fontFamily: 'var(--text-mono)', fontSize: '9px', color: 'var(--status-error)', textAlign: 'center', padding: '10px' }}>
              ⛔ ULB scope violation<br />
              <span style={{ color: 'var(--text-dim)', fontSize: '8.5px' }}>Server denied access to this device camera.</span>
            </div>
          ) : streamState === 'OFFLINE' ? (
            <div style={{ fontFamily: 'var(--text-mono)', fontSize: '9px', color: 'var(--status-error)', textAlign: 'center', padding: '10px' }}>
              🔴 CAMERA OFFLINE<br />
              <span style={{ color: 'var(--text-dim)', fontSize: '8px' }}>No active frames received from edge device.</span>
            </div>
          ) : !frameUrl ? (
            <div style={{ fontFamily: 'var(--text-mono)', fontSize: '9px', color: 'var(--text-dim)', textAlign: 'center' }}>
              📷 Initializing camera stream…<br />
              <span style={{ fontSize: '8px' }}>Connecting to device gateway.</span>
            </div>
          ) : (
            <img
              ref={imgRef}
              src={frameUrl}
              alt={`Camera — ${deviceId}`}
              onError={handleStreamError}
              onLoad={handleFrameLoad}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                display: 'block',
                opacity: streamState === 'LIVE' ? 1 : 0.65,
                transition: 'opacity 0.3s',
              }}
            />
          )}

          {/* Stalled / Reconnecting overlay badge */}
          {streamState === 'STALLED' && (
            <div style={{
              position: 'absolute',
              bottom: '6px',
              right: '8px',
              background: 'rgba(0,0,0,0.85)',
              border: '1px solid var(--status-warn)',
              color: 'var(--status-warn)',
              fontFamily: 'var(--text-mono)',
              fontSize: '8px',
              padding: '2px 6px',
              letterSpacing: '0.06em',
              fontWeight: 700,
            }}>
              ⚠ STREAM STALLED ({Math.round(ageSeconds ?? 0)}s)
            </div>
          )}

          {streamState === 'RECONNECTING' && (
            <div style={{
              position: 'absolute',
              bottom: '6px',
              right: '8px',
              background: 'rgba(0,0,0,0.85)',
              border: '1px solid #f48c06',
              color: '#f48c06',
              fontFamily: 'var(--text-mono)',
              fontSize: '8px',
              padding: '2px 6px',
              letterSpacing: '0.06em',
              fontWeight: 700,
            }}>
              🔄 RECONNECTING ({reconnectAttempt}/{MAX_RECONNECT_ATTEMPTS})
            </div>
          )}

          {/* Hover hint */}
          {streamState === 'LIVE' && allowExpand && (
            <div className="camera-expand-hint" style={{
              position: 'absolute',
              top: '6px',
              right: '6px',
              background: 'rgba(0, 0, 0, 0.65)',
              padding: '2px 6px',
              borderRadius: '2px',
              fontFamily: 'var(--text-mono)',
              fontSize: '7.5px',
              color: 'var(--text-secondary)',
              pointerEvents: 'none',
            }}>
              ⛶ CLICK TO EXPAND
            </div>
          )}
        </div>

        {/* Footer: captured timestamp */}
        {capturedAt && (
          <div style={{
            padding: '3px 10px',
            fontFamily: 'var(--text-mono)',
            fontSize: '7.5px',
            color: 'var(--text-dim)',
            borderTop: '1px solid var(--border)',
            flexShrink: 0,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <span>{new Date(capturedAt).toLocaleTimeString()} · {currentInterval}ms poll</span>
            {imgDimensions && (
              <span>{imgDimensions.w}×{imgDimensions.h} px</span>
            )}
          </div>
        )}
      </div>

      {/* ─── EXPANDED MODAL LIGHTBOX ────────────────────────────────────────── */}
      {isExpanded && (
        <div
          ref={modalRef}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(5, 7, 9, 0.94)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsExpanded(false);
          }}
        >
          {/* Expanded Top Header */}
          <div style={{
            padding: '10px 20px',
            background: 'var(--bg-panel)',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            flexShrink: 0,
          }}>
            {/* Live Indicator */}
            <span style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: staleColor,
              boxShadow: `0 0 8px ${staleColor}`,
            }} />
            <div style={{
              fontFamily: 'var(--text-mono)',
              fontSize: '12px',
              fontWeight: 700,
              color: 'var(--text-primary)',
              letterSpacing: '0.08em',
            }}>
              {label ? `${label} · ${deviceId}` : `CAMERA MONITOR · ${deviceId}`}
            </div>
            {ulbId && (
              <span style={{
                fontFamily: 'var(--text-mono)',
                fontSize: '8.5px',
                color: '#00d9ff',
                border: '1px solid #00d9ff',
                padding: '2px 6px',
                borderRadius: '2px',
              }}>
                {ulbId}
              </span>
            )}

            {/* Refresh Cadence Selector */}
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontFamily: 'var(--text-mono)', fontSize: '9px', color: 'var(--text-dim)' }}>
                REFRESH:
              </span>
              <select
                value={currentInterval}
                onChange={(e) => setCurrentInterval(Number(e.target.value))}
                style={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-mid)',
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--text-mono)',
                  fontSize: '9px',
                  padding: '3px 8px',
                  borderRadius: '2px',
                  outline: 'none',
                }}
              >
                <option value={0}>⚡ 15-30 FPS (Live Stream)</option>
                <option value={200}>200 ms (5 FPS Fast)</option>
                <option value={500}>500 ms (2 FPS)</option>
                <option value={1000}>1000 ms (1 FPS)</option>
                <option value={1500}>1500 ms (Low Bandwidth)</option>
              </select>

              {/* Fullscreen API Button */}
              <button
                onClick={toggleFullscreen}
                style={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-mid)',
                  color: 'var(--text-secondary)',
                  fontFamily: 'var(--text-mono)',
                  fontSize: '9px',
                  padding: '4px 10px',
                  borderRadius: '2px',
                  cursor: 'pointer',
                  outline: 'none',
                }}
                title="Toggle Fullscreen"
              >
                ⛶ FULLSCREEN
              </button>

              {/* Close Button */}
              <button
                onClick={() => setIsExpanded(false)}
                style={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--status-error)',
                  color: 'var(--status-error)',
                  fontFamily: 'var(--text-mono)',
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '3px 10px',
                  borderRadius: '2px',
                  cursor: 'pointer',
                  outline: 'none',
                }}
                title="Close (Esc)"
              >
                ✕ CLOSE
              </button>
            </div>
          </div>

          {/* Expanded Video Body */}
          <div style={{
            flex: 1,
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            overflow: 'hidden',
          }}>
            {streamState === 'UNAUTHORIZED' ? (
              <div style={{ fontFamily: 'var(--text-mono)', fontSize: '13px', color: 'var(--status-error)', textAlign: 'center' }}>
                ⛔ ULB scope violation — Server denied camera access.
              </div>
            ) : streamState === 'OFFLINE' ? (
              <div style={{ fontFamily: 'var(--text-mono)', fontSize: '13px', color: 'var(--status-error)', textAlign: 'center' }}>
                🔴 CAMERA OFFLINE — No active frames received from edge device.
              </div>
            ) : !frameUrl ? (
              <div style={{ fontFamily: 'var(--text-mono)', fontSize: '13px', color: 'var(--text-dim)', textAlign: 'center' }}>
                📷 Waiting for camera stream frames…
              </div>
            ) : (
              <div style={{
                position: 'relative',
                maxWidth: '92vw',
                maxHeight: '82vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 0 30px rgba(0,0,0,0.8)',
                border: '1px solid var(--border-mid)',
                background: '#000',
              }}>
                <img
                  src={frameUrl}
                  alt={`Expanded Camera ${deviceId}`}
                  style={{
                    maxWidth: '92vw',
                    maxHeight: '82vh',
                    objectFit: 'contain',
                    display: 'block',
                  }}
                  onLoad={(e) => {
                    if (e.target.naturalWidth) {
                      setImgDimensions({ w: e.target.naturalWidth, h: e.target.naturalHeight });
                    }
                  }}
                />

                {/* Top-Left HUD Overlay */}
                <div style={{
                  position: 'absolute',
                  top: '12px',
                  left: '12px',
                  background: 'rgba(0, 0, 0, 0.75)',
                  border: '1px solid var(--border)',
                  padding: '6px 12px',
                  borderRadius: '2px',
                  fontFamily: 'var(--text-mono)',
                  fontSize: '9px',
                  color: 'var(--text-primary)',
                  pointerEvents: 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px',
                }}>
                  <span style={{ color: '#00d9ff', fontWeight: 700 }}>{label || deviceId}</span>
                  <span style={{ color: 'var(--text-dim)', fontSize: '8px' }}>DEVICE: {deviceId}</span>
                </div>

                {/* Top-Right HUD Overlay */}
                <div style={{
                  position: 'absolute',
                  top: '12px',
                  right: '12px',
                  background: 'rgba(0, 0, 0, 0.75)',
                  border: `1px solid ${staleColor}`,
                  padding: '6px 12px',
                  borderRadius: '2px',
                  fontFamily: 'var(--text-mono)',
                  fontSize: '9px',
                  color: staleColor,
                  pointerEvents: 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px',
                  textAlign: 'right',
                }}>
                  <span style={{ fontWeight: 700 }}>● {isStale ? 'STREAM STALE' : 'LIVE MONITOR'}</span>
                  <span style={{ fontSize: '8px' }}>{fmtAge(ageSeconds)}</span>
                </div>

                {/* Bottom-Left HUD Overlay */}
                <div style={{
                  position: 'absolute',
                  bottom: '12px',
                  left: '12px',
                  background: 'rgba(0, 0, 0, 0.75)',
                  border: '1px solid var(--border)',
                  padding: '6px 12px',
                  borderRadius: '2px',
                  fontFamily: 'var(--text-mono)',
                  fontSize: '8.5px',
                  color: 'var(--text-secondary)',
                  pointerEvents: 'none',
                }}>
                  {capturedAt ? `FRAME TIMESTAMP: ${new Date(capturedAt).toISOString()}` : 'LIVE STREAM'}
                </div>

                {/* Bottom-Right HUD Overlay */}
                {imgDimensions && (
                  <div style={{
                    position: 'absolute',
                    bottom: '12px',
                    right: '12px',
                    background: 'rgba(0, 0, 0, 0.75)',
                    border: '1px solid var(--border)',
                    padding: '6px 12px',
                    borderRadius: '2px',
                    fontFamily: 'var(--text-mono)',
                    fontSize: '8.5px',
                    color: 'var(--text-dim)',
                    pointerEvents: 'none',
                  }}>
                    RESOLUTION: {imgDimensions.w} × {imgDimensions.h} PX · JPEG
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Expanded Bottom Status Bar */}
          <div style={{
            padding: '8px 20px',
            background: 'var(--bg-panel)',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontFamily: 'var(--text-mono)',
            fontSize: '8.5px',
            color: 'var(--text-label)',
            flexShrink: 0,
          }}>
            <span>PRESS ESC TO CLOSE</span>
            <span>EPHEMERAL MONITORING STREAM · NO PERSISTENCE DEGRADATION</span>
            <span>SWSTP HIGH-DEFINITION TELEMETRY WORKSTATION</span>
          </div>
        </div>
      )}
    </>
  );
}
