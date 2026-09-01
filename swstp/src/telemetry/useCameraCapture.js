/**
 * useCameraCapture.js
 *
 * React hook: getUserMedia webcam capture → JPEG frame → POST to backend.
 *
 * DESIGN:
 *   - Uses the laptop webcam via navigator.mediaDevices.getUserMedia.
 *   - Captures a JPEG frame every `captureIntervalMs` (default 1500 ms) by
 *     drawing the video frame to an offscreen <canvas> and calling toBlob('image/jpeg').
 *   - Posts the raw JPEG ArrayBuffer to POST /api/camera/{deviceId}/frame
 *     via postCameraFrame() in backendApiClient.js.
 *   - Capture is tied to active hardware connection: starts only when
 *     `enabled` is true AND `deviceId` is non-empty.
 *   - Automatically stops on: enabled=false, deviceId cleared, component unmount.
 *
 * FORWARD-COMPAT NOTE:
 *   The backend POST endpoint is source-agnostic. This hook will be replaced or
 *   supplemented when the capture source moves to Raspberry Pi + Arducam — the
 *   Pi will post frames directly to the same endpoint without using getUserMedia.
 *   No backend change needed at that point.
 *
 * Returns:
 *   { isCapturing, cameraError, frameCount, lastFrameMs }
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { postCameraFrame, fetchRemoteCameraStreamStatus } from './backendApiClient.js';

const JPEG_QUALITY = 0.70;
const CAPTURE_WIDTH  = 640;
const CAPTURE_HEIGHT = 360;

export function useCameraCapture({ enabled, deviceId, captureIntervalMs = 33, autoRemoteControl = true }) {
  const [isCapturing, setIsCapturing]   = useState(false);
  const [cameraError, setCameraError]   = useState(null);
  const [frameCount, setFrameCount]     = useState(0);
  const [lastFrameMs, setLastFrameMs]   = useState(null);
  const [remoteRequested, setRemoteRequested] = useState(false);

  const videoRef     = useRef(null);
  const canvasRef    = useRef(null);
  const streamRef    = useRef(null);
  const intervalRef  = useRef(null);
  const mountedRef   = useRef(true);

  // Poll remote stream trigger status
  useEffect(() => {
    if (!enabled || !deviceId || !autoRemoteControl) return;

    let active = true;
    const checkRemote = async () => {
      const isReq = await fetchRemoteCameraStreamStatus(deviceId);
      if (active) setRemoteRequested(isReq);
    };

    checkRemote();
    const pollTimer = setInterval(checkRemote, 1500);
    return () => {
      active = false;
      clearInterval(pollTimer);
    };
  }, [enabled, deviceId, autoRemoteControl]);

  // ─── Stop everything cleanly ──────────────────────────────────────────────
  const stopCapture = useCallback(() => {
    clearInterval(intervalRef.current);
    intervalRef.current = null;

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    if (mountedRef.current) {
      setIsCapturing(false);
    }
  }, []);

  // ─── Capture one JPEG frame and POST it ──────────────────────────────────
  const captureFrame = useCallback(() => {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) return; // HAVE_CURRENT_DATA
    if (!deviceId) return;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, CAPTURE_WIDTH, CAPTURE_HEIGHT);

    canvas.toBlob(async (blob) => {
      if (!blob || !mountedRef.current) return;
      const buffer = await blob.arrayBuffer();
      const ok = await postCameraFrame(deviceId, buffer);
      if (mountedRef.current) {
        setLastFrameMs(Date.now());
        if (ok) setFrameCount(c => c + 1);
      }
    }, 'image/jpeg', JPEG_QUALITY);
  }, [deviceId]);

  // ─── Start getUserMedia and begin capture loop ────────────────────────────
  const startCapture = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('getUserMedia not available in this browser.');
      return;
    }
    if (!deviceId) {
      setCameraError('No device connected — cannot start camera capture.');
      return;
    }

    setCameraError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: CAPTURE_WIDTH }, height: { ideal: CAPTURE_HEIGHT }, frameRate: { ideal: 30, max: 30 } },
        audio: false,
      });

      if (!mountedRef.current) {
        stream.getTracks().forEach(t => t.stop());
        return;
      }

      streamRef.current = stream;

      // Wire stream to hidden video element
      if (!videoRef.current) {
        videoRef.current = document.createElement('video');
        videoRef.current.playsInline = true;
        videoRef.current.muted = true;
        videoRef.current.style.display = 'none';
        document.body.appendChild(videoRef.current);
      }

      videoRef.current.srcObject = stream;
      await videoRef.current.play();

      // Create offscreen canvas
      if (!canvasRef.current) {
        canvasRef.current = document.createElement('canvas');
        canvasRef.current.width  = CAPTURE_WIDTH;
        canvasRef.current.height = CAPTURE_HEIGHT;
      }

      // Begin capture loop (e.g. 33ms for 30 FPS)
      intervalRef.current = setInterval(captureFrame, captureIntervalMs);
      setIsCapturing(true);
      setFrameCount(0);
    } catch (err) {
      console.warn('[useCameraCapture] getUserMedia error:', err.message);
      if (mountedRef.current) {
        setCameraError(`Camera access denied: ${err.message}`);
        setIsCapturing(false);
      }
    }
  }, [deviceId, captureFrame, captureIntervalMs]);

  // ─── React to enabled/deviceId/remoteRequested changes ───────────────────
  useEffect(() => {
    const shouldCapture = enabled && deviceId && (!autoRemoteControl || remoteRequested);
    if (shouldCapture) {
      startCapture();
    } else {
      stopCapture();
    }

    return () => {
      stopCapture();
    };
  }, [enabled, deviceId, autoRemoteControl, remoteRequested, startCapture, stopCapture]);

  // ─── Cleanup on unmount ───────────────────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopCapture();

      // Remove hidden video from DOM
      if (videoRef.current && videoRef.current.parentNode) {
        videoRef.current.parentNode.removeChild(videoRef.current);
        videoRef.current = null;
      }
    };
  }, []);

  return { isCapturing, cameraError, frameCount, lastFrameMs };
}
