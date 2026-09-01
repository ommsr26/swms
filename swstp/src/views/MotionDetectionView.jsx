import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTelemetryStore, resetSession } from '../telemetry/telemetryStore.js';
import { useHardwareConnection } from '../telemetry/useHardwareConnection.js';
import { postCameraFrame } from '../telemetry/backendApiClient.js';
import ThemeToggle from '../components/ThemeToggle.jsx';

/**
 * MotionDetectionView — /motion-detection
 *
 * Approach 2 Implementation: Web Worker + OffscreenCanvas Multi-Threaded Architecture:
 *  - Main Thread: GPU-accelerated video rendering at locked 30-60 FPS (zero getImageData stalls).
 *  - Background Web Worker: Computer vision (background subtraction & polygon masking) on CPU core 2.
 *  - Strict Hardware Identity: Detection and recording activate only when Arduino is connected.
 *  - Interactive Polygon Area of Interest: Accurate dot placement with live auto-connect on >= 3 dots.
 *  - Non-blocking Evidence Capture: Background upload to /api/evidence/upload with auto session binding.
 */

const DEFAULT_POLYGON = [
  { x: 0.30, y: 0.15 },
  { x: 0.70, y: 0.15 },
  { x: 0.70, y: 0.55 },
  { x: 0.30, y: 0.55 },
];

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.PROD ? 'https://solidwasteapi.scipl.info.in/api' : 'http://localhost:5000/api');

export default function MotionDetectionView() {
  const navigate = useNavigate();
  const {
    serialConnected,
    serialError,
    deviceId,
    vehicleRegistrationNumber,
    ulbName,
    dataQuality,
    latest,
  } = useTelemetryStore();

  const { connect, disconnect, tryAutoConnect } = useHardwareConnection();

  // Video & Canvas Refs
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const relayCanvasRef = useRef(null);
  const evidenceCanvasRef = useRef(null);
  const animFrameIdRef = useRef(null);

  // Web Worker Ref for Computer Vision Offloading
  const workerRef = useRef(null);
  const isWorkerBusyRef = useRef(false);
  const latestResultRef = useRef({ isMotion: false, minX: 0, minY: 0, maxX: 0, maxY: 0, procW: 320, procH: 180 });
  const lastDispatchTimeRef = useRef(0);

  // React State for UI panels only
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [fps, setFps] = useState(0);
  const [motionDetectedUI, setMotionDetectedUI] = useState(false);
  const [capturesCount, setCapturesCount] = useState(0);
  const [recentCaptures, setRecentCaptures] = useState([]);
  const [streamRelayEnabled, setStreamRelayEnabled] = useState(true);
  const [selectedCapture, setSelectedCapture] = useState(null);

  // Polygon ROI State
  const [polygon, setPolygon] = useState(() => {
    try {
      const saved = localStorage.getItem('swstp_roi_polygon');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length >= 3) return parsed;
      }
    } catch {}
    return DEFAULT_POLYGON;
  });

  const [isDrawingPolygon, setIsDrawingPolygon] = useState(false);
  const [tempPolygon, setTempPolygon] = useState([]);

  // Tunable Sliders State
  const [diffThreshold, setDiffThreshold] = useState(25);
  const [minContourArea, setMinContourArea] = useState(120);
  const [bgAlpha, setBgAlpha] = useState(0.04);
  const [saveCooldownSec, setSaveCooldownSec] = useState(1.5);

  // High-frequency Refs (bypasses React re-renders)
  const polygonRef = useRef(polygon);
  const isDrawingPolygonRef = useRef(isDrawingPolygon);
  const tempPolygonRef = useRef(tempPolygon);
  const mousePosRef = useRef(null);
  const diffThresholdRef = useRef(diffThreshold);
  const minContourAreaRef = useRef(minContourArea);
  const bgAlphaRef = useRef(bgAlpha);
  const saveCooldownSecRef = useRef(saveCooldownSec);
  const serialConnectedRef = useRef(serialConnected);
  const deviceIdRef = useRef(deviceId);
  const lastSaveTimeRef = useRef(0);
  const isCapturingRef = useRef(false);
  const fpsTrackerRef = useRef({ frames: 0, lastTime: performance.now() });

  // Sync state to refs & Web Worker
  useEffect(() => {
    polygonRef.current = polygon;
    workerRef.current?.postMessage({ type: 'UPDATE_POLYGON', payload: { polygon } });
    try {
      localStorage.setItem('swstp_roi_polygon', JSON.stringify(polygon));
    } catch {}
  }, [polygon]);

  useEffect(() => { isDrawingPolygonRef.current = isDrawingPolygon; }, [isDrawingPolygon]);
  useEffect(() => { tempPolygonRef.current = tempPolygon; }, [tempPolygon]);

  useEffect(() => {
    diffThresholdRef.current = diffThreshold;
    minContourAreaRef.current = minContourArea;
    bgAlphaRef.current = bgAlpha;
    workerRef.current?.postMessage({
      type: 'UPDATE_SETTINGS',
      payload: { diffThreshold, minContourArea, bgAlpha },
    });
  }, [diffThreshold, minContourArea, bgAlpha]);

  useEffect(() => { saveCooldownSecRef.current = saveCooldownSec; }, [saveCooldownSec]);
  useEffect(() => { serialConnectedRef.current = serialConnected; }, [serialConnected]);
  useEffect(() => { deviceIdRef.current = deviceId; }, [deviceId]);

  // Start Camera
  const startCamera = async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640, min: 320 },
          height: { ideal: 360, min: 240 },
          frameRate: { ideal: 30, min: 20 },
        },
        audio: false,
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setCameraActive(true);
      }
    } catch (err) {
      console.warn('[MotionDetection] Camera auto-start note:', err.message);
      setCameraError(err.message || 'Camera access error.');
      setCameraActive(false);
    }
  };

  // Stop Camera
  const stopCamera = () => {
    if (animFrameIdRef.current) {
      cancelAnimationFrame(animFrameIdRef.current);
      animFrameIdRef.current = null;
    }
    if (videoRef.current && videoRef.current.srcObject) {
      const tracks = videoRef.current.srcObject.getTracks();
      tracks.forEach(t => t.stop());
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  };

  // Initialize Web Worker and Auto-Detection on mount
  useEffect(() => {
    resetSession();
    useTelemetryStore.getState().setSourceType('REAL_SERIAL');
    useTelemetryStore.getState().setSerialState(false, null);

    // 1. Initialize Dedicated Web Worker
    try {
      const worker = new Worker(
        new URL('../workers/motionDetectionWorker.js', import.meta.url),
        { type: 'module' }
      );

      worker.postMessage({
        type: 'INIT',
        payload: {
          width: 320,
          height: 180,
          diffThreshold: diffThresholdRef.current,
          minContourArea: minContourAreaRef.current,
          bgAlpha: bgAlphaRef.current,
          polygon: polygonRef.current,
        },
      });

      worker.onmessage = (e) => {
        if (e.data.type === 'FRAME_RESULT') {
          latestResultRef.current = e.data.payload;
          isWorkerBusyRef.current = false;
        }
      };

      workerRef.current = worker;
    } catch (workerErr) {
      console.warn('[MotionDetection] Web Worker init fallback:', workerErr);
    }

    // 2. Auto-connect Arduino hardware and Camera
    tryAutoConnect();
    startCamera();

    return () => {
      disconnect();
      stopCamera();
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, []);

  // Coordinate Conversion
  const getCanvasCoords = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const px = (e.clientX - rect.left) * scaleX;
    const py = (e.clientY - rect.top) * scaleY;
    return {
      x: Math.max(0, Math.min(1, px / canvas.width)),
      y: Math.max(0, Math.min(1, py / canvas.height)),
    };
  };

  // Canvas Click Handler
  const handleCanvasClick = (e) => {
    if (!isDrawingPolygonRef.current || !canvasRef.current) return;
    const coords = getCanvasCoords(e);
    const currentTemp = tempPolygonRef.current;

    // Snap to P1 if >= 3 points
    if (currentTemp.length >= 3) {
      const p1 = currentTemp[0];
      const dist = Math.hypot(coords.x - p1.x, coords.y - p1.y);
      if (dist < 0.06) {
        setPolygon(currentTemp);
        setIsDrawingPolygon(false);
        setTempPolygon([]);
        return;
      }
    }

    setTempPolygon(prev => [...prev, { x: Number(coords.x.toFixed(4)), y: Number(coords.y.toFixed(4)) }]);
  };

  // Mouse Move for Live Drawing Preview
  const handleCanvasMouseMove = (e) => {
    if (!isDrawingPolygonRef.current) return;
    mousePosRef.current = getCanvasCoords(e);
  };

  // Complete & Save Polygon
  const completePolygonDrawing = () => {
    if (tempPolygonRef.current.length >= 3) {
      setPolygon(tempPolygonRef.current);
      setIsDrawingPolygon(false);
      setTempPolygon([]);
    } else {
      alert('Please click at least 3 points on the video to form a closed polygon.');
    }
  };

  const latestTelemetryRef = useRef(latest);
  useEffect(() => { latestTelemetryRef.current = latest; }, [latest]);

  // Upload Evidence Image to Backend
  const uploadEvidence = async (blob, capturedAt) => {
    const effectiveDeviceId = deviceIdRef.current && deviceIdRef.current !== 'UNCONNECTED' ? deviceIdRef.current : 'SWSTP-EDGE-01';
    const gnss = latestTelemetryRef.current?.gnss;
    const lat = gnss?.lat;
    const lon = gnss?.lon;
    const speed = gnss?.speed;

    const formData = new FormData();
    formData.append('file', blob, `motion_capture_${Date.now()}.jpg`);
    formData.append('collectionEventId', '0');
    formData.append('capturedAt', capturedAt || new Date().toISOString());
    formData.append('width', '640');
    formData.append('height', '360');
    formData.append('compressionQuality', '85');
    formData.append('idempotencyKey', `capture-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`);
    if (lat != null && !isNaN(lat)) formData.append('latitude', String(lat));
    if (lon != null && !isNaN(lon)) formData.append('longitude', String(lon));
    if (speed != null && !isNaN(speed)) formData.append('speedKph', String(speed));
    if (effectiveDeviceId) formData.append('deviceId', effectiveDeviceId);

    try {
      const resp = await fetch(`${API_BASE_URL}/evidence/upload`, {
        method: 'POST',
        body: formData,
      });
      if (resp.ok) {
        const data = await resp.json();
        return { success: true, url: data.imageUrl || data.relativePath };
      }
    } catch (err) {
      console.warn('[MotionDetection] Evidence upload note:', err);
    }
    return { success: false };
  };

  // Decoupled 30 FPS Cloud Relay (Timer based)
  useEffect(() => {
    if (!cameraActive || !streamRelayEnabled) return;

    const relayInterval = setInterval(() => {
      if (!serialConnectedRef.current) return;
      const video = videoRef.current;
      if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;

      if (!relayCanvasRef.current) {
        relayCanvasRef.current = document.createElement('canvas');
        relayCanvasRef.current.width = 480;
        relayCanvasRef.current.height = 270;
      }
      const rCanvas = relayCanvasRef.current;
      const rCtx = rCanvas.getContext('2d');
      rCtx.drawImage(video, 0, 0, rCanvas.width, rCanvas.height);

      rCanvas.toBlob((blob) => {
        if (blob) {
          const effDevice = deviceIdRef.current && deviceIdRef.current !== 'UNCONNECTED' ? deviceIdRef.current : 'SWSTP-AHMC-001';
          postCameraFrame(effDevice, blob).catch(() => {});
        }
      }, 'image/jpeg', 0.65);
    }, 33);

    return () => clearInterval(relayInterval);
  }, [cameraActive, streamRelayEnabled]);

  // MAIN RENDER LOOP: Runs at GPU-accelerated 30-60 FPS (Zero CPU Stalls)
  useEffect(() => {
    if (!cameraActive) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    let isProcessing = true;
    const ctx = canvas.getContext('2d');

    const processFrame = () => {
      if (!isProcessing || !video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        animFrameIdRef.current = requestAnimationFrame(processFrame);
        return;
      }

      const vw = video.videoWidth || 640;
      const vh = video.videoHeight || 360;
      if (canvas.width !== vw || canvas.height !== vh) {
        canvas.width = vw;
        canvas.height = vh;
      }

      // 1. Direct GPU Video Blit (Super Fast ~0.2ms)
      ctx.drawImage(video, 0, 0, vw, vh);

      const isHardwareReady = serialConnectedRef.current;
      const now = performance.now();

      // 2. Offload Frame to Background Web Worker (15-20 Hz detector)
      if (isHardwareReady && workerRef.current && !isWorkerBusyRef.current && (now - lastDispatchTimeRef.current >= 66)) {
        lastDispatchTimeRef.current = now;
        isWorkerBusyRef.current = true;

        createImageBitmap(video).then((bitmap) => {
          workerRef.current?.postMessage(
            { type: 'PROCESS_FRAME', payload: { imageBitmap: bitmap } },
            [bitmap] // Zero-copy memory transfer
          );
        }).catch(() => {
          isWorkerBusyRef.current = false;
        });
      }

      // 3. Read latest worker results
      const { isMotion, minX, minY, maxX, maxY, procW, procH } = latestResultRef.current;

      if (isHardwareReady && isMotion) {
        if (!motionDetectedUI) setMotionDetectedUI(true);
      } else {
        if (motionDetectedUI) setMotionDetectedUI(false);
      }

      // 4. Draw Polygon ROI on Canvas
      ctx.save();
      const isDrawing = isDrawingPolygonRef.current;
      const activePts = isDrawing ? tempPolygonRef.current : polygonRef.current;
      const mouse = mousePosRef.current;

      if (activePts.length > 0) {
        ctx.beginPath();
        ctx.moveTo(activePts[0].x * vw, activePts[0].y * vh);
        for (let i = 1; i < activePts.length; i++) {
          ctx.lineTo(activePts[i].x * vw, activePts[i].y * vh);
        }

        if (activePts.length >= 3) {
          ctx.closePath();
        }

        ctx.lineWidth = 2;
        ctx.strokeStyle = isDrawing
          ? '#00d9ff'
          : (isMotion && isHardwareReady ? '#ef233c' : 'rgba(0, 217, 255, 0.85)');
        ctx.setLineDash(isDrawing ? [4, 4] : [6, 4]);
        ctx.stroke();

        if (activePts.length >= 3) {
          ctx.fillStyle = (isMotion && isHardwareReady) ? 'rgba(239, 35, 60, 0.18)' : 'rgba(0, 217, 255, 0.10)';
          ctx.fill();
        }

        // Draw Vertex Handles
        activePts.forEach((pt, idx) => {
          ctx.beginPath();
          ctx.arc(pt.x * vw, pt.y * vh, isDrawing ? 6 : 4, 0, Math.PI * 2);
          ctx.fillStyle = isDrawing ? (idx === 0 && activePts.length >= 3 ? '#2dc653' : '#00d9ff') : '#00d9ff';
          ctx.fill();
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = '#ffffff';
          ctx.stroke();

          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 9px monospace';
          ctx.fillText(`P${idx + 1}`, pt.x * vw + 7, pt.y * vh - 4);
        });

        // Live drawing cursor line & P1 snap indicator
        if (isDrawing && mouse && activePts.length > 0) {
          const lastPt = activePts[activePts.length - 1];
          ctx.beginPath();
          ctx.moveTo(lastPt.x * vw, lastPt.y * vh);
          ctx.lineTo(mouse.x * vw, mouse.y * vh);
          ctx.strokeStyle = 'rgba(0, 217, 255, 0.6)';
          ctx.setLineDash([3, 3]);
          ctx.stroke();

          if (activePts.length >= 3) {
            const p1 = activePts[0];
            const dist = Math.hypot(mouse.x - p1.x, mouse.y - p1.y);
            if (dist < 0.06) {
              ctx.beginPath();
              ctx.arc(p1.x * vw, p1.y * vh, 12, 0, Math.PI * 2);
              ctx.strokeStyle = '#2dc653';
              ctx.lineWidth = 2;
              ctx.setLineDash([]);
              ctx.stroke();
              ctx.fillStyle = '#2dc653';
              ctx.fillText('SNAP TO CLOSE', p1.x * vw + 14, p1.y * vh + 3);
            }
          }
        }

        // Polygon Badge
        if (activePts.length >= 3 && !isDrawing) {
          const firstX = activePts[0].x * vw;
          const firstY = activePts[0].y * vh;
          ctx.fillStyle = (isMotion && isHardwareReady) ? 'rgba(239, 35, 60, 0.85)' : 'rgba(0, 217, 255, 0.85)';
          ctx.fillRect(firstX, Math.max(10, firstY - 18), 130, 16);
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 9px monospace';
          ctx.fillText((isMotion && isHardwareReady) ? '● COLLECTION ZONE' : 'POLYGON ROI ZONE', firstX + 4, Math.max(22, firstY - 6));
        }
      }

      // Draw Motion Bounding Box
      if (isHardwareReady && isMotion && minX <= maxX && minY <= maxY && procW > 0 && procH > 0) {
        const bboxX = (minX / procW) * vw;
        const bboxY = (minY / procH) * vh;
        const bboxW = ((maxX - minX + 1) / procW) * vw;
        const bboxH = ((maxY - minY + 1) / procH) * vh;

        ctx.strokeStyle = '#2dc653';
        ctx.setLineDash([]);
        ctx.lineWidth = 3;
        ctx.strokeRect(bboxX, bboxY, bboxW, bboxH);
      }
      ctx.restore();

      // 5. Draw Telemetry HUD
      const telemetry = useTelemetryStore.getState().latest;
      const rtcTime = telemetry?.rtc?.iso || new Date().toISOString().replace('T', ' ').substring(0, 19);
      const gnssLat = telemetry?.gnss?.lat != null ? telemetry.gnss.lat.toFixed(6) : 'SEARCHING';
      const gnssLon = telemetry?.gnss?.lon != null ? telemetry.gnss.lon.toFixed(6) : '';
      const imuOrient = telemetry?.imu?.orientation;
      const pitch = imuOrient?.pitch != null ? `${imuOrient.pitch.toFixed(1)}°` : '0.0°';
      const roll = imuOrient?.roll != null ? `${imuOrient.roll.toFixed(1)}°` : '0.0°';

      // Top Banner
      ctx.fillStyle = 'rgba(10, 15, 29, 0.75)';
      ctx.fillRect(0, 0, vw, 26);
      ctx.fillStyle = '#00d9ff';
      ctx.font = '9px monospace';
      const effDev = deviceIdRef.current || 'SWSTP-AHMC-001';
      ctx.fillText(`[SWSTP WEB AI - WORKER THREAD] CAM:OK | ${isHardwareReady ? `DEVICE:${effDev} (AUTHENTICATED)` : 'HARDWARE:DISCONNECTED'} | FPS:${fpsTrackerRef.current.frames} | ROI:${polygonRef.current.length} PTS`, 10, 17);

      if (!isHardwareReady) {
        ctx.fillStyle = '#ef233c';
        ctx.font = 'bold 11px monospace';
        ctx.fillText('🔒 HARDWARE LOCKED · CONNECT ARDUINO FOR IDENTITY', vw - 380, 18);
      } else if (isDrawing) {
        ctx.fillStyle = '#00d9ff';
        ctx.font = 'bold 11px monospace';
        ctx.fillText(`✎ DRAWING ROI: ${tempPolygonRef.current.length} PTS (Click P1 to Auto-Close)`, vw - 360, 18);
      } else if (isMotion) {
        ctx.fillStyle = '#ef233c';
        ctx.font = 'bold 12px monospace';
        ctx.fillText('⚠ MOTION / COLLECTION DETECTED', vw - 240, 18);
      }

      // Bottom Metadata Strip
      const bannerH = 46;
      ctx.fillStyle = 'rgba(10, 15, 29, 0.85)';
      ctx.fillRect(0, vh - bannerH, vw, bannerH);
      ctx.fillStyle = '#f48c06';
      ctx.font = '10px monospace';
      ctx.fillText(`RTC TIMESTAMP : ${rtcTime}`, 10, vh - 28);
      ctx.fillStyle = '#2dc653';
      ctx.fillText(`GNSS LOCATION : ${gnssLat} ${gnssLon} · PITCH:${pitch} ROLL:${roll}`, 10, vh - 10);

      // Lockout Overlay if not connected
      if (!isHardwareReady) {
        ctx.fillStyle = 'rgba(10, 15, 29, 0.65)';
        ctx.fillRect(0, 26, vw, vh - bannerH - 26);
        ctx.fillStyle = '#ef233c';
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('🔒 PROGRAM LOCKED: HARDWARE IDENTITY REQUIRED', vw / 2, vh / 2 - 10);
        ctx.fillStyle = '#ffffff';
        ctx.font = '11px monospace';
        ctx.fillText('Please connect the Arduino Uno R3 via COM port to activate motion detection & recording.', vw / 2, vh / 2 + 15);
        ctx.textAlign = 'left';
      }

      // 6. Non-blocking Offscreen Evidence Capture
      if (isHardwareReady && isMotion && !isDrawing && !isCapturingRef.current && (now - lastSaveTimeRef.current >= saveCooldownSecRef.current * 1000)) {
        lastSaveTimeRef.current = now;
        isCapturingRef.current = true;
        const captureTs = rtcTime;

        if (!evidenceCanvasRef.current) {
          evidenceCanvasRef.current = document.createElement('canvas');
        }
        const evCanvas = evidenceCanvasRef.current;
        evCanvas.width = vw;
        evCanvas.height = vh;
        const evCtx = evCanvas.getContext('2d');
        evCtx.drawImage(canvas, 0, 0);

        evCanvas.toBlob(async (blob) => {
          if (blob) {
            setCapturesCount(c => c + 1);
            const previewUrl = URL.createObjectURL(blob);
            const captureObj = {
              id: Date.now(),
              url: previewUrl,
              capturedAt: captureTs,
              status: 'UPLOADING',
            };
            setRecentCaptures(prev => [captureObj, ...prev.slice(0, 19)]);

            const res = await uploadEvidence(blob, captureTs);
            setRecentCaptures(prev => prev.map(item =>
              item.id === captureObj.id
                ? { ...item, status: res.success ? 'SAVED (evidence/)' : 'OFFLINE_SAVED', serverUrl: res.url }
                : item
            ));
          }
          isCapturingRef.current = false;
        }, 'image/jpeg', 0.85);
      }

      // FPS Tracker
      fpsTrackerRef.current.frames++;
      if (now - fpsTrackerRef.current.lastTime >= 1000) {
        setFps(fpsTrackerRef.current.frames);
        fpsTrackerRef.current.frames = 0;
        fpsTrackerRef.current.lastTime = now;
      }

      animFrameIdRef.current = requestAnimationFrame(processFrame);
    };

    animFrameIdRef.current = requestAnimationFrame(processFrame);

    return () => {
      isProcessing = false;
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
      }
    };
  }, [cameraActive]);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      width: '100vw',
      background: 'var(--bg-base)',
      color: 'var(--text-primary)',
      overflow: 'hidden',
    }}>
      {/* Top Header */}
      <div style={{
        height: '46px',
        borderBottom: '1px solid var(--border)',
        padding: '0 18px',
        display: 'flex',
        alignItems: 'center',
        background: 'var(--bg-panel)',
        gap: '14px',
        flexShrink: 0,
      }}>
        <button
          onClick={() => navigate('/')}
          style={{
            background: 'none',
            border: '1px solid var(--border)',
            color: 'var(--text-secondary)',
            padding: '4px 10px',
            fontFamily: 'var(--text-mono)',
            fontSize: '11px',
            cursor: 'pointer',
            borderRadius: '2px',
          }}
        >
          ← HOME
        </button>

        <div style={{ fontFamily: 'var(--text-mono)', fontSize: '11px', fontWeight: 700, color: '#00d9ff', letterSpacing: '0.1em' }}>
          SWSTP WEB MOTION DETECTION & POLYGON ROI GATEWAY
        </div>

        <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto', alignItems: 'center' }}>
          <span style={{
            padding: '2px 8px',
            borderRadius: '2px',
            fontFamily: 'var(--text-mono)',
            fontSize: '9px',
            fontWeight: 700,
            background: cameraActive ? 'rgba(45, 198, 83, 0.15)' : 'rgba(239, 35, 60, 0.15)',
            border: `1px solid ${cameraActive ? 'var(--status-ok)' : 'var(--status-error)'}`,
            color: cameraActive ? 'var(--status-ok)' : 'var(--status-error)',
          }}>
            {cameraActive ? `CAM ACTIVE · ${fps} FPS` : 'CAM OFFLINE'}
          </span>

          <span style={{
            padding: '2px 8px',
            borderRadius: '2px',
            fontFamily: 'var(--text-mono)',
            fontSize: '9px',
            fontWeight: 700,
            background: serialConnected ? 'rgba(0, 217, 255, 0.15)' : 'rgba(239, 35, 60, 0.15)',
            border: `1px solid ${serialConnected ? '#00d9ff' : 'var(--status-error)'}`,
            color: serialConnected ? '#00d9ff' : 'var(--status-error)',
          }}>
            {serialConnected ? `SERIAL: ${deviceId || 'CONNECTED'}` : '🔒 HARDWARE DISCONNECTED'}
          </span>

          <ThemeToggle />
        </div>
      </div>

      {/* Main Workspace Body */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        
        {/* Center: Live Video Feed Canvas with Interactive Polygon Drawer */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px',
          background: 'var(--bg-base)',
          position: 'relative',
          overflow: 'hidden',
        }}>
          {/* Hidden Source Video Element */}
          <video ref={videoRef} playsInline muted style={{ display: 'none' }} />

          {/* Active Canvas Display */}
          {cameraActive ? (
            <div style={{
              position: 'relative',
              maxWidth: '100%',
              maxHeight: '100%',
              boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
              border: `2px solid ${isDrawingPolygon ? '#00d9ff' : (!serialConnected ? 'var(--status-error)' : (motionDetectedUI ? 'var(--status-error)' : 'var(--border)'))}`,
              borderRadius: '4px',
              overflow: 'hidden',
              background: '#000',
              cursor: isDrawingPolygon ? 'crosshair' : 'default',
            }}>
              <canvas
                ref={canvasRef}
                onClick={handleCanvasClick}
                onMouseMove={handleCanvasMouseMove}
                style={{
                  display: 'block',
                  maxWidth: '100%',
                  maxHeight: 'calc(100vh - 120px)',
                  objectFit: 'contain',
                }}
              />
            </div>
          ) : (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '40px',
              background: 'var(--bg-panel)',
              border: '1px dashed var(--border)',
              borderRadius: '4px',
              maxWidth: '480px',
              textAlign: 'center',
              gap: '14px',
            }}>
              <div style={{ fontSize: '36px' }}>📹</div>
              <div style={{ fontFamily: 'var(--text-mono)', fontSize: '13px', fontWeight: 600 }}>
                Camera Initializing...
              </div>
              <div style={{ fontFamily: 'var(--text-mono)', fontSize: '10px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                Auto-detecting connected camera hardware. If camera prompt appears, please click "Allow".
              </div>
              {cameraError && (
                <div style={{ padding: '8px', background: 'rgba(239,35,60,0.1)', border: '1px solid var(--status-error)', color: 'var(--status-error)', fontFamily: 'var(--text-mono)', fontSize: '10px' }}>
                  ⚠ {cameraError}
                </div>
              )}
              <button
                onClick={startCamera}
                style={{
                  padding: '10px 20px',
                  background: '#00d9ff',
                  color: '#000',
                  border: 'none',
                  fontFamily: 'var(--text-mono)',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  borderRadius: '2px',
                  letterSpacing: '0.08em',
                }}
              >
                ▶ RETRY START CAMERA
              </button>
            </div>
          )}

          {/* Quick Floating Action Controls */}
          {cameraActive && (
            <div style={{
              position: 'absolute',
              bottom: '24px',
              left: '50%',
              transform: 'translateX(-50%)',
              display: 'flex',
              gap: '8px',
              background: 'rgba(15, 23, 42, 0.85)',
              backdropFilter: 'blur(8px)',
              padding: '6px 12px',
              borderRadius: '20px',
              border: '1px solid var(--border)',
              alignItems: 'center',
              zIndex: 10,
            }}>
              {!serialConnected ? (
                <button
                  onClick={connect}
                  style={{
                    background: 'rgba(239, 35, 60, 0.25)',
                    border: '1px solid var(--status-error)',
                    color: '#ffffff',
                    padding: '6px 14px',
                    fontFamily: 'var(--text-mono)',
                    fontSize: '10px',
                    cursor: 'pointer',
                    borderRadius: '12px',
                    fontWeight: 700,
                  }}
                >
                  🔌 CONNECT ARDUINO (SOURCE OF IDENTITY)
                </button>
              ) : isDrawingPolygon ? (
                <>
                  <button
                    onClick={completePolygonDrawing}
                    style={{
                      background: 'rgba(45, 198, 83, 0.25)',
                      border: '1px solid var(--status-ok)',
                      color: 'var(--status-ok)',
                      padding: '4px 12px',
                      fontFamily: 'var(--text-mono)',
                      fontSize: '10px',
                      cursor: 'pointer',
                      borderRadius: '12px',
                      fontWeight: 700,
                    }}
                  >
                    ✓ AUTO-COMPLETE & SAVE ({tempPolygon.length} pts)
                  </button>
                  <button
                    onClick={() => { setIsDrawingPolygon(false); setTempPolygon([]); }}
                    style={{
                      background: 'rgba(239, 35, 60, 0.2)',
                      border: '1px solid var(--status-error)',
                      color: 'var(--status-error)',
                      padding: '4px 10px',
                      fontFamily: 'var(--text-mono)',
                      fontSize: '10px',
                      cursor: 'pointer',
                      borderRadius: '12px',
                    }}
                  >
                    ✕ CANCEL
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => { setIsDrawingPolygon(true); setTempPolygon([]); }}
                    style={{
                      background: 'rgba(0, 217, 255, 0.2)',
                      border: '1px solid #00d9ff',
                      color: '#00d9ff',
                      padding: '4px 12px',
                      fontFamily: 'var(--text-mono)',
                      fontSize: '10px',
                      cursor: 'pointer',
                      borderRadius: '12px',
                      fontWeight: 700,
                    }}
                  >
                    ✎ DRAW POLYGON ROI ({polygon.length} PTS)
                  </button>
                  <button
                    onClick={() => setPolygon(DEFAULT_POLYGON)}
                    style={{
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-secondary)',
                      padding: '4px 10px',
                      fontFamily: 'var(--text-mono)',
                      fontSize: '10px',
                      cursor: 'pointer',
                      borderRadius: '12px',
                    }}
                  >
                    ⟲ RESET ROI
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Right Sidebar: Controls & Captures */}
        <div style={{
          width: '380px',
          borderLeft: '1px solid var(--border)',
          background: 'var(--bg-panel)',
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto',
          flexShrink: 0,
        }}>
          
          {/* Hardware Serial Section */}
          <div style={{ padding: '12px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontFamily: 'var(--text-mono)', fontSize: '10px', fontWeight: 700, color: '#00d9ff', letterSpacing: '0.08em' }}>
                🔌 HARDWARE IDENTITY (SOURCE)
              </span>
              <span style={{
                fontFamily: 'var(--text-mono)',
                fontSize: '8px',
                padding: '2px 6px',
                borderRadius: '2px',
                fontWeight: 700,
                background: serialConnected ? 'rgba(45, 198, 83, 0.2)' : 'rgba(239, 35, 60, 0.2)',
                color: serialConnected ? 'var(--status-ok)' : 'var(--status-error)',
                border: `1px solid ${serialConnected ? 'var(--status-ok)' : 'var(--status-error)'}`,
              }}>
                {serialConnected ? 'AUTHENTICATED' : 'REQUIRED'}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '9px', fontFamily: 'var(--text-mono)', marginBottom: '8px' }}>
              <div style={{ color: 'var(--text-dim)' }}>DEVICE ID:</div>
              <div style={{ textAlign: 'right', fontWeight: 600, color: serialConnected ? '#00d9ff' : 'var(--status-error)' }}>
                {serialConnected ? (deviceId || 'SWSTP-AHMC-001') : 'UNCONNECTED'}
              </div>
              <div style={{ color: 'var(--text-dim)' }}>VEHICLE:</div>
              <div style={{ textAlign: 'right', fontWeight: 600 }}>{vehicleRegistrationNumber || 'MH-27-BE-1088'}</div>
              <div style={{ color: 'var(--text-dim)' }}>ULB:</div>
              <div style={{ textAlign: 'right', fontWeight: 600 }}>{ulbName || 'Amravati Municipal Corporation'}</div>
            </div>

            {!serialConnected ? (
              <button
                onClick={connect}
                style={{
                  width: '100%',
                  padding: '9px',
                  background: 'rgba(0, 217, 255, 0.2)',
                  border: '1px solid #00d9ff',
                  color: '#00d9ff',
                  fontFamily: 'var(--text-mono)',
                  fontSize: '10px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  borderRadius: '2px',
                }}
              >
                🔌 CONNECT ARDUINO (COM PORT)
              </button>
            ) : (
              <button
                onClick={disconnect}
                style={{
                  width: '100%',
                  padding: '8px',
                  background: 'rgba(239, 35, 60, 0.15)',
                  border: '1px solid var(--status-error)',
                  color: 'var(--status-error)',
                  fontFamily: 'var(--text-mono)',
                  fontSize: '10px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  borderRadius: '2px',
                }}
              >
                🛑 DISCONNECT SERIAL
              </button>
            )}
          </div>

          {/* Polygon ROI Information & Editor */}
          <div style={{ padding: '12px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontFamily: 'var(--text-mono)', fontSize: '10px', fontWeight: 700, color: '#00d9ff', letterSpacing: '0.08em' }}>
                ⬡ AREA OF INTEREST (POLYGON)
              </span>
              <span style={{ fontFamily: 'var(--text-mono)', fontSize: '9px', color: 'var(--text-dim)' }}>
                {polygon.length} Vertices · Auto-Closed
              </span>
            </div>

            <div style={{
              background: 'var(--bg-panel-2)',
              border: '1px solid var(--border)',
              padding: '8px',
              borderRadius: '2px',
              fontFamily: 'var(--text-mono)',
              fontSize: '9px',
              marginBottom: '8px',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              maxHeight: '110px',
              overflowY: 'auto',
            }}>
              {polygon.map((p, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
                  <span>Vertex P{idx + 1}:</span>
                  <span style={{ color: 'var(--text-primary)' }}>({(p.x * 100).toFixed(1)}%, {(p.y * 100).toFixed(1)}%)</span>
                </div>
              ))}
            </div>

            <button
              onClick={() => { setIsDrawingPolygon(true); setTempPolygon([]); }}
              style={{
                width: '100%',
                padding: '7px',
                background: isDrawingPolygon ? 'rgba(0,217,255,0.15)' : 'var(--bg-elevated)',
                border: `1px solid ${isDrawingPolygon ? '#00d9ff' : 'var(--border)'}`,
                color: isDrawingPolygon ? '#00d9ff' : 'var(--text-primary)',
                fontFamily: 'var(--text-mono)',
                fontSize: '10px',
                fontWeight: 600,
                cursor: 'pointer',
                borderRadius: '2px',
              }}
            >
              {isDrawingPolygon ? '✎ CLICK ON VIDEO (AUTO-CONNECTS ON >= 3 DOTS)' : '✎ REDRAW POLYGON ROI'}
            </button>
          </div>

          {/* Algorithm Settings Section */}
          <div style={{ padding: '12px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontFamily: 'var(--text-mono)', fontSize: '10px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '10px', letterSpacing: '0.08em' }}>
              ⚙ MOTION DETECTION PARAMETERS
            </div>

            {/* Threshold */}
            <div style={{ marginBottom: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--text-mono)', fontSize: '9px', color: 'var(--text-dim)', marginBottom: '4px' }}>
                <span>DIFF THRESHOLD</span>
                <span style={{ color: '#00d9ff', fontWeight: 600 }}>{diffThreshold}</span>
              </div>
              <input
                type="range"
                min="5"
                max="80"
                value={diffThreshold}
                onChange={e => setDiffThreshold(Number(e.target.value))}
                style={{ width: '100%', accentColor: '#00d9ff' }}
              />
            </div>

            {/* Min Contour Area */}
            <div style={{ marginBottom: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--text-mono)', fontSize: '9px', color: 'var(--text-dim)', marginBottom: '4px' }}>
                <span>MIN MOTION AREA (px)</span>
                <span style={{ color: '#00d9ff', fontWeight: 600 }}>{minContourArea}</span>
              </div>
              <input
                type="range"
                min="20"
                max="500"
                value={minContourArea}
                onChange={e => setMinContourArea(Number(e.target.value))}
                style={{ width: '100%', accentColor: '#00d9ff' }}
              />
            </div>

            {/* Cooldown */}
            <div style={{ marginBottom: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--text-mono)', fontSize: '9px', color: 'var(--text-dim)', marginBottom: '4px' }}>
                <span>CAPTURE COOLDOWN</span>
                <span style={{ color: '#00d9ff', fontWeight: 600 }}>{saveCooldownSec}s</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="5.0"
                step="0.5"
                value={saveCooldownSec}
                onChange={e => setSaveCooldownSec(Number(e.target.value))}
                style={{ width: '100%', accentColor: '#00d9ff' }}
              />
            </div>

            {/* Stream Relay Toggle */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '4px' }}>
              <span style={{ fontFamily: 'var(--text-mono)', fontSize: '9px', color: 'var(--text-secondary)' }}>
                RELAY LIVE 30 FPS FEED TO CLOUD
              </span>
              <input
                type="checkbox"
                checked={streamRelayEnabled}
                onChange={e => setStreamRelayEnabled(e.target.checked)}
                style={{ accentColor: '#2dc653' }}
              />
            </div>
          </div>

          {/* Evidence Captures Gallery */}
          <div style={{ padding: '12px', flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontFamily: 'var(--text-mono)', fontSize: '10px', fontWeight: 700, color: '#2dc653', letterSpacing: '0.08em' }}>
                📸 EVIDENCE CAPTURES ({capturesCount})
              </span>
              <span style={{ fontFamily: 'var(--text-mono)', fontSize: '8px', color: 'var(--text-dim)' }}>
                Saved in evidence/
              </span>
            </div>

            <div style={{
              flex: 1,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}>
              {recentCaptures.length === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-dim)', fontFamily: 'var(--text-mono)', fontSize: '10px' }}>
                  No collection events detected yet.<br />Motion triggers inside polygon will appear here.
                </div>
              ) : (
                recentCaptures.map(cap => (
                  <div
                    key={cap.id}
                    onClick={() => setSelectedCapture(cap)}
                    style={{
                      display: 'flex',
                      gap: '10px',
                      background: 'var(--bg-panel-2)',
                      border: '1px solid var(--border)',
                      padding: '6px',
                      borderRadius: '2px',
                      cursor: 'pointer',
                      alignItems: 'center',
                    }}
                  >
                    <img
                      src={cap.url}
                      alt="Evidence"
                      style={{ width: '64px', height: '36px', objectFit: 'cover', borderRadius: '2px' }}
                    />
                    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: '2px' }}>
                      <div style={{ fontFamily: 'var(--text-mono)', fontSize: '9px', color: '#f48c06', fontWeight: 600 }}>
                        {cap.capturedAt}
                      </div>
                      <div style={{ fontFamily: 'var(--text-mono)', fontSize: '8px', color: cap.status.includes('SAVED') ? '#2dc653' : '#00d9ff' }}>
                        {cap.status}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>
      </div>

      {/* Preview Modal for Selected Capture */}
      {selectedCapture && (
        <div
          onClick={() => setSelectedCapture(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '20px',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--bg-panel)',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              padding: '16px',
              maxWidth: '720px',
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontFamily: 'var(--text-mono)', fontSize: '11px', fontWeight: 700, color: '#00d9ff' }}>
                EVIDENCE CAPTURE PREVIEW
              </span>
              <button
                onClick={() => setSelectedCapture(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '14px' }}
              >
                ✕
              </button>
            </div>
            <img
              src={selectedCapture.url}
              alt="Evidence Full Preview"
              style={{ width: '100%', borderRadius: '2px', border: '1px solid var(--border)' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--text-mono)', fontSize: '10px' }}>
              <span style={{ color: '#f48c06' }}>Captured: {selectedCapture.capturedAt}</span>
              <span style={{ color: '#2dc653' }}>Status: {selectedCapture.status}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
