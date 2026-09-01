/**
 * motionDetectionWorker.js — Dedicated Web Worker for Computer Vision
 *
 * Runs background subtraction, polygon ROI masking, and contour detection
 * on a dedicated background CPU thread, keeping the main UI thread at 30-60 FPS.
 */

let procW = 320;
let procH = 180;
let totalPixels = procW * procH;

let offscreenCanvas = null;
let offscreenCtx = null;
let grayBuffer = null;
let bgModel = null;
let polygonMask = null;

let diffThreshold = 25;
let minContourArea = 120;
let bgAlpha = 0.04;

function rasterizePolygonMask(polyPts, w, h) {
  if (!polyPts || polyPts.length < 3) return null;
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, w, h);

  ctx.beginPath();
  ctx.moveTo(polyPts[0].x * w, polyPts[0].y * h);
  for (let i = 1; i < polyPts.length; i++) {
    ctx.lineTo(polyPts[i].x * w, polyPts[i].y * h);
  }
  ctx.closePath();
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  const imgData = ctx.getImageData(0, 0, w, h);
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < mask.length; i++) {
    mask[i] = imgData.data[i * 4] > 128 ? 1 : 0;
  }
  return mask;
}

self.onmessage = function (e) {
  const { type, payload } = e.data;

  if (type === 'INIT') {
    procW = payload.width || 320;
    procH = payload.height || 180;
    totalPixels = procW * procH;
    diffThreshold = payload.diffThreshold ?? 25;
    minContourArea = payload.minContourArea ?? 120;
    bgAlpha = payload.bgAlpha ?? 0.04;

    offscreenCanvas = new OffscreenCanvas(procW, procH);
    offscreenCtx = offscreenCanvas.getContext('2d', { willReadFrequently: true });
    grayBuffer = new Uint8Array(totalPixels);
    bgModel = null;

    if (payload.polygon) {
      polygonMask = rasterizePolygonMask(payload.polygon, procW, procH);
    }
    self.postMessage({ type: 'INIT_DONE' });
    return;
  }

  if (type === 'UPDATE_POLYGON') {
    polygonMask = rasterizePolygonMask(payload.polygon, procW, procH);
    return;
  }

  if (type === 'UPDATE_SETTINGS') {
    if (payload.diffThreshold != null) diffThreshold = payload.diffThreshold;
    if (payload.minContourArea != null) minContourArea = payload.minContourArea;
    if (payload.bgAlpha != null) bgAlpha = payload.bgAlpha;
    return;
  }

  if (type === 'PROCESS_FRAME') {
    const { imageBitmap } = payload;
    if (!imageBitmap || !offscreenCtx) return;

    try {
      offscreenCtx.drawImage(imageBitmap, 0, 0, procW, procH);
      imageBitmap.close(); // Immediate memory release

      const imgData = offscreenCtx.getImageData(0, 0, procW, procH);
      const pixels = imgData.data;

      // 1. Grayscale extraction
      for (let i = 0; i < totalPixels; i++) {
        const offset = i * 4;
        grayBuffer[i] = (pixels[offset] * 77 + pixels[offset + 1] * 150 + pixels[offset + 2] * 29) >> 8;
      }

      // 2. Initialize or update Background Model
      if (!bgModel || bgModel.length !== totalPixels) {
        bgModel = new Float32Array(grayBuffer);
      }

      let motionPixelCount = 0;
      let minX = procW, minY = procH, maxX = 0, maxY = 0;
      const mask = polygonMask;
      const thresh = diffThreshold;
      const alpha = bgAlpha;

      for (let i = 0; i < totalPixels; i++) {
        const currentVal = grayBuffer[i];
        const bgVal = bgModel[i];
        const diff = Math.abs(currentVal - bgVal);

        bgModel[i] = (1.0 - alpha) * bgVal + alpha * currentVal;

        if (mask && mask[i] === 1 && diff > thresh) {
          motionPixelCount++;
          const y = Math.floor(i / procW);
          const x = i % procW;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }

      const isMotion = motionPixelCount >= minContourArea;

      self.postMessage({
        type: 'FRAME_RESULT',
        payload: {
          isMotion,
          motionPixelCount,
          minX,
          minY,
          maxX,
          maxY,
          procW,
          procH,
        },
      });
    } catch (err) {
      console.warn('[motionDetectionWorker] Processing error:', err);
      self.postMessage({
        type: 'FRAME_RESULT',
        payload: { isMotion: false, motionPixelCount: 0 },
      });
    }
  }
};
