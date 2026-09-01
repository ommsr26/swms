import { useEffect, useRef, useState, useCallback } from 'react';
import { useTelemetryStore } from '../telemetry/telemetryStore.js';

export default function CameraView() {
  const { latest, sensorStatus } = useTelemetryStore();
  const videoRef = useRef(null);

  const [stream, setStream] = useState(null);
  const [devices, setDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [cameraState, setCameraState] = useState('DISCONNECTED'); // 'DISCONNECTED' | 'REQUESTING' | 'CONNECTED' | 'ERROR'
  const [errorMessage, setErrorMessage] = useState('');

  // Enumerate video input devices
  const refreshDevices = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
      return;
    }
    try {
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = allDevices.filter(d => d.kind === 'videoinput');
      setDevices(videoInputs);
      if (videoInputs.length > 0 && !selectedDeviceId) {
        setSelectedDeviceId(videoInputs[0].deviceId);
      }
    } catch (err) {
      console.warn('[CameraView] Error enumerating devices:', err);
    }
  }, [selectedDeviceId]);

  useEffect(() => {
    refreshDevices();
  }, [refreshDevices]);

  // Connect to selected USB camera via getUserMedia
  const connectCamera = async (deviceIdToUse = selectedDeviceId) => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setCameraState('ERROR');
      setErrorMessage('Browser does not support navigator.mediaDevices.getUserMedia API.');
      return;
    }

    try {
      setCameraState('REQUESTING');
      setErrorMessage('');

      // Stop existing stream if playing
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }

      const constraints = {
        video: deviceIdToUse ? { deviceId: { exact: deviceIdToUse } } : true,
        audio: false,
      };

      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);

      setStream(mediaStream);
      setCameraState('CONNECTED');

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }

      // Re-enumerate devices to get human-readable labels after permission grant
      await refreshDevices();
    } catch (err) {
      console.error('[CameraView] getUserMedia error:', err);
      setCameraState('ERROR');
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setErrorMessage('Camera access permission was denied by user or browser setting.');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setErrorMessage('No USB camera hardware found connected to host system.');
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        setErrorMessage('Camera is currently in use by another application or OS process.');
      } else {
        setErrorMessage(err.message || 'Failed to initialize USB camera stream.');
      }
    }
  };

  // Stop camera stream & release MediaStream tracks cleanly
  const disconnectCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraState('DISCONNECTED');
  }, [stream]);

  // Cleanup on component unmount
  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [stream]);

  // Handle camera selection change
  const handleDeviceChange = (e) => {
    const id = e.target.value;
    setSelectedDeviceId(id);
    if (cameraState === 'CONNECTED') {
      connectCamera(id);
    }
  };

  // Telemetry Overlay Data
  const g = latest?.gnss;
  const speed = g?.speed != null ? g.speed.toFixed(1) : '—';
  const heading = g?.heading != null ? g.heading.toFixed(1) : '—';
  const lat = g?.lat != null ? g.lat.toFixed(6) : '—';
  const lon = g?.lon != null ? g.lon.toFixed(6) : '—';
  const timestamp = latest?.rtc?.iso || new Date().toISOString();

  // Active track information
  const activeVideoTrack = stream ? stream.getVideoTracks()[0] : null;
  const trackSettings = activeVideoTrack ? activeVideoTrack.getSettings() : {};

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* View Header */}
      <div className="view-header">
        <span className="view-header__title">Live Camera Feed</span>
        <span className="view-header__sep" />
        <div className={`live-indicator live-indicator--${cameraState === 'CONNECTED' ? 'ok' : cameraState === 'REQUESTING' ? 'warn' : 'off'}`}>
          <span className={`status-dot status-dot--${cameraState === 'CONNECTED' ? 'ok' : cameraState === 'REQUESTING' ? 'warn' : 'off'}`} />
          {cameraState === 'CONNECTED' ? 'LIVE' : cameraState}
        </div>
        <span className="view-header__spacer" />

        {/* Camera Selector Dropdown */}
        {devices.length > 0 && (
          <select
            value={selectedDeviceId}
            onChange={handleDeviceChange}
            disabled={cameraState === 'REQUESTING'}
            style={{
              background: 'var(--bg-panel-2)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-mid)',
              padding: '3px 8px',
              fontFamily: 'var(--text-mono)',
              fontSize: '10px',
              borderRadius: '2px',
              maxWidth: '220px',
            }}
          >
            {devices.map((dev, idx) => (
              <option key={dev.deviceId || idx} value={dev.deviceId}>
                {dev.label || `USB Camera ${idx + 1}`}
              </option>
            ))}
          </select>
        )}

        {/* Connect / Disconnect Buttons */}
        {cameraState !== 'CONNECTED' ? (
          <button
            className="btn btn--sm"
            onClick={() => connectCamera()}
            disabled={cameraState === 'REQUESTING'}
            style={{ background: 'var(--status-ok)', color: '#000', fontWeight: 600, border: 'none' }}
          >
            📷 CONNECT CAMERA
          </button>
        ) : (
          <button
            className="btn btn--sm btn--danger"
            onClick={disconnectCamera}
          >
            ⏹ DISCONNECT
          </button>
        )}
      </div>

      <div className="camera-layout" style={{ flex: 1 }}>
        {/* Main Feed Display Area */}
        <div className="camera-feed-area" style={{ position: 'relative', width: '100%', height: '100%', background: '#030508' }}>
          {/* Video Stream Element */}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              display: cameraState === 'CONNECTED' ? 'block' : 'none',
            }}
          />

          {/* Placeholder / Requesting / Error State Display */}
          {cameraState !== 'CONNECTED' && (
            <div className="camera-placeholder">
              <div className="camera-placeholder__frame">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" strokeWidth="1.5" className="camera-placeholder__icon"
                     style={{ color: cameraState === 'ERROR' ? 'var(--status-error)' : cameraState === 'REQUESTING' ? 'var(--status-warn)' : 'var(--text-dim)' }}>
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                  <circle cx="12" cy="13" r="4"/>
                </svg>
                <div className="camera-placeholder__text" style={{ color: cameraState === 'ERROR' ? 'var(--status-error)' : 'var(--text-primary)' }}>
                  {cameraState === 'REQUESTING' ? 'REQUESTING CAMERA ACCESS...' : cameraState === 'ERROR' ? 'CAMERA ERROR' : 'USB CAMERA FEED'}
                </div>
                <div className="camera-placeholder__sub">
                  {cameraState === 'REQUESTING' ? 'ALLOW PERMISSION PROMPT IN BROWSER' : cameraState === 'ERROR' ? 'FAILED TO INITIALIZE' : 'STANDBY MODE'}
                </div>
              </div>

              {cameraState === 'ERROR' && errorMessage && (
                <div style={{
                  fontFamily: 'var(--text-mono)',
                  fontSize: '11px',
                  color: 'var(--status-error)',
                  background: 'rgba(239, 35, 60, 0.1)',
                  border: '1px solid rgba(239, 35, 60, 0.3)',
                  padding: '8px 14px',
                  maxWidth: '420px',
                  lineHeight: '1.5',
                  textAlign: 'center',
                }}>
                  ⚠️ {errorMessage}
                </div>
              )}

              <div style={{
                fontFamily: 'var(--text-mono)',
                fontSize: '10px',
                color: 'var(--text-secondary)',
                textAlign: 'center',
                maxWidth: '400px',
                lineHeight: '1.6',
              }}>
                Connect a USB webcam directly to this PC and click <strong>[ 📷 CONNECT CAMERA ]</strong>.
                The feed will stream live over browser Web MediaDevices API.
              </div>

              <button
                className="btn"
                onClick={() => connectCamera()}
                disabled={cameraState === 'REQUESTING'}
                style={{ background: 'var(--status-ok)', color: '#000', fontWeight: 600, border: 'none', padding: '6px 14px' }}
              >
                {cameraState === 'REQUESTING' ? 'REQUESTING...' : '📷 CONNECT USB CAMERA'}
              </button>
            </div>
          )}

          {/* Telemetry Overlay (Top-Left overlay over video feed) */}
          <div style={{
            position: 'absolute',
            top: '16px',
            left: '16px',
            zIndex: 10,
            background: 'rgba(7,9,13,0.85)',
            border: '1px solid var(--border-mid)',
            padding: '10px 14px',
            fontFamily: 'var(--text-mono)',
            fontSize: '10px',
            color: 'var(--text-primary)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            minWidth: '220px',
          }}>
            <div style={{ fontSize: '9px', letterSpacing: '0.12em', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: 600 }}>
              TELEMETRY OVERLAY
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
              <span style={{ color: 'var(--text-secondary)' }}>TIME:</span>
              <span style={{ color: 'var(--text-primary)' }}>{timestamp.substring(11, 19)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
              <span style={{ color: 'var(--text-secondary)' }}>SPEED:</span>
              <span style={{ color: '#00b4d8', fontWeight: 600 }}>{speed} km/h</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
              <span style={{ color: 'var(--text-secondary)' }}>COURSE:</span>
              <span style={{ color: '#43aa8b' }}>{heading}°</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>POSITION:</span>
              <span style={{ color: 'var(--text-primary)' }}>{lat !== '—' ? `${lat}, ${lon}` : 'NO FIX'}</span>
            </div>
          </div>

          {/* Live REC Indicator (Top-Right overlay) */}
          <div style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            zIndex: 10,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontFamily: 'var(--text-mono)',
            fontSize: '10px',
            color: cameraState === 'CONNECTED' ? 'var(--status-ok)' : 'var(--text-secondary)',
            background: 'rgba(7,9,13,0.85)',
            border: '1px solid var(--border-mid)',
            padding: '6px 10px',
          }}>
            <span style={{
              width: '8px', height: '8px', borderRadius: '50%',
              background: cameraState === 'CONNECTED' ? 'var(--status-ok)' : 'var(--status-off)',
              boxShadow: cameraState === 'CONNECTED' ? '0 0 6px var(--status-ok)' : 'none',
            }} />
            {cameraState === 'CONNECTED' ? 'LIVE STREAMING' : 'STANDBY'}
          </div>
        </div>

        {/* Sidebar Status Info */}
        <div style={{ borderLeft: '1px solid var(--border)', background: 'var(--bg-panel)', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          <div className="section-header">CAMERA DIAGNOSTICS</div>

          {[
            { label: 'Status',      value: cameraState, warn: cameraState !== 'CONNECTED' },
            { label: 'Source',      value: activeVideoTrack?.label || (devices.find(d => d.deviceId === selectedDeviceId)?.label) || 'USB WEBCAM' },
            { label: 'Resolution',  value: trackSettings.width ? `${trackSettings.width} × ${trackSettings.height}` : 'DYNAMIC' },
            { label: 'Frame Rate',  value: trackSettings.frameRate ? `${Math.round(trackSettings.frameRate)} FPS` : 'AUTOMATIC' },
            { label: 'Interface',   value: 'BROWSER MediaDevices' },
            { label: 'Serial Mode', value: sensorStatus.serial === 'CONNECTED' ? 'HARDWARE (115200)' : 'SIMULATION' },
          ].map(({ label, value, warn }) => (
            <div key={label} style={{
              display: 'flex',
              flexDirection: 'column',
              padding: '8px 14px',
              borderBottom: '1px solid var(--border)',
            }}>
              <span style={{ fontFamily: 'var(--text-mono)', fontSize: '9px',
                             color: 'var(--text-secondary)', textTransform: 'uppercase',
                             letterSpacing: '0.1em', marginBottom: '3px' }}>
                {label}
              </span>
              <span style={{ fontFamily: 'var(--text-mono)', fontSize: '11px', fontWeight: 500,
                             color: warn ? 'var(--status-warn)' : 'var(--text-primary)',
                             whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {value}
              </span>
            </div>
          ))}

          <div style={{ padding: '12px 14px', marginTop: 'auto' }}>
            <div style={{
              fontFamily: 'var(--text-mono)',
              fontSize: '9px',
              color: 'var(--text-secondary)',
              lineHeight: '1.7',
            }}>
              ℹ <strong>Architecture Note:</strong>
              <br />
              Normal USB webcams connect directly to host browser via HTML5 MediaDevices API. Telemetry serial connection remains completely independent.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
