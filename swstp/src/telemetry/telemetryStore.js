import { create } from 'zustand';
import { useGNSSHistoryStore } from './gnssHistoryStore.js';

export const EXPECTED_RATES = {
  telemetry: 20,
  imu: 20,
  rtc: 1,
  gnss: 1,
};

function numOrNaN(v) {
  return v != null && typeof v === 'number' && !isNaN(v) ? v : NaN;
}

class TelemetryBuffers {
  constructor(maxSamples = 1200) {
    this.maxSamples = maxSamples;
    this.time = new Float64Array(maxSamples);
    this.ax = new Float64Array(maxSamples);
    this.ay = new Float64Array(maxSamples);
    this.az = new Float64Array(maxSamples);
    this.accelMag = new Float64Array(maxSamples);
    this.gx = new Float64Array(maxSamples);
    this.gy = new Float64Array(maxSamples);
    this.gz = new Float64Array(maxSamples);
    this.mx = new Float64Array(maxSamples);
    this.my = new Float64Array(maxSamples);
    this.mz = new Float64Array(maxSamples);
    this.roll = new Float64Array(maxSamples);
    this.pitch = new Float64Array(maxSamples);
    this.yaw = new Float64Array(maxSamples);
    this.speed = new Float64Array(maxSamples);
    this.alt = new Float64Array(maxSamples);
    this.heading = new Float64Array(maxSamples);

    this.head = 0;
    this.count = 0;
    this.subscribers = new Set();
    this.track = [];
  }

  // Backward-compatible alias getters (referencing exact same underlying Float64Arrays)
  get accelX() { return this.ax; }
  get accelY() { return this.ay; }
  get accelZ() { return this.az; }
  get gyroX() { return this.gx; }
  get gyroY() { return this.gy; }
  get gyroZ() { return this.gz; }
  get altitude() { return this.alt; }

  push(packet) {
    const idx = this.head;
    const t = packet.t ?? 0;

    this.time[idx]     = t;
    this.ax[idx]       = numOrNaN(packet.imu?.accel?.x);
    this.ay[idx]       = numOrNaN(packet.imu?.accel?.y);
    this.az[idx]       = numOrNaN(packet.imu?.accel?.z);
    this.accelMag[idx] = numOrNaN(packet.imu?.accel_magnitude);
    this.gx[idx]       = numOrNaN(packet.imu?.gyro?.x);
    this.gy[idx]       = numOrNaN(packet.imu?.gyro?.y);
    this.gz[idx]       = numOrNaN(packet.imu?.gyro?.z);
    this.mx[idx]       = numOrNaN(packet.imu?.mag?.x);
    this.my[idx]       = numOrNaN(packet.imu?.mag?.y);
    this.mz[idx]       = numOrNaN(packet.imu?.mag?.z);
    this.roll[idx]     = numOrNaN(packet.imu?.orientation?.roll);
    this.pitch[idx]    = numOrNaN(packet.imu?.orientation?.pitch);
    this.yaw[idx]      = numOrNaN(packet.imu?.orientation?.yaw);
    this.speed[idx]    = numOrNaN(packet.gnss?.speed);
    this.alt[idx]      = numOrNaN(packet.gnss?.alt);
    this.heading[idx]  = numOrNaN(packet.gnss?.heading);

    if (packet.gnss?.valid && packet.gnss.lat != null && packet.gnss.lon != null) {
      this.track.push({
        lat: packet.gnss.lat,
        lon: packet.gnss.lon,
        speed: packet.gnss.speed ?? 0,
        t,
      });
      if (this.track.length > 500) this.track.shift();
    }

    this.head = (this.head + 1) % this.maxSamples;
    if (this.count < this.maxSamples) this.count++;

    this.notify();
  }

  subscribe(cb) {
    this.subscribers.add(cb);
    return () => this.subscribers.delete(cb);
  }

  notify() {
    this.subscribers.forEach((cb) => cb(this));
  }

  getSeriesArray(field) {
    const FIELD_MAP = {
      altitude: 'alt',
      accelX: 'ax',
      accelY: 'ay',
      accelZ: 'az',
      gyroX: 'gx',
      gyroY: 'gy',
      gyroZ: 'gz',
    };
    const actualField = FIELD_MAP[field] || field;
    const buffer = this[actualField];
    if (!buffer) return new Float64Array(0);

    const arr = new Float64Array(this.count);
    const start = this.count < this.maxSamples ? 0 : this.head;
    for (let i = 0; i < this.count; i++) {
      arr[i] = buffer[(start + i) % this.maxSamples];
    }
    return arr;
  }

  getChartData(...fieldNames) {
    const timeArr = Array.from(this.getSeriesArray('time'));
    const seriesArrs = fieldNames.map((name) => Array.from(this.getSeriesArray(name)));
    return [timeArr, ...seriesArrs];
  }

  reset() {
    this.head = 0;
    this.count = 0;
    this.track = [];
    this.notify();
  }
}

export const buffers = new TelemetryBuffers(1200);
export const eventLog = [];

let _lastPacketTime = 0;
let _lastSeq = null;
let _totalPackets = 0;
let _lostPackets = 0;
let _invalidPackets = 0;
let _jitterSum = 0;
let _sampleCount = 0;
let _ppsWindowCount = 0;
let _lastPpsCalcTime = Date.now();
let _currentActualHz = 0.0;
let _watchdogTimer = null;

export const useTelemetryStore = create((set) => ({
  mode: 'STANDBY',
  setMode: (mode) => set({ mode }),

  sourceType: 'REAL_SERIAL', // REAL_HARDWARE strictly
  baudRate: 115200,
  serialConnected: false,
  serialError: null,

  deviceId: null,
  vehicleRegistrationNumber: null,
  ulbName: null,
  hardwareVersion: null,
  firmwareVersion: null,
  sessionIdentity: null,

  setSourceType: (sourceType) => set({ sourceType }),
  setSerialState: (serialConnected, serialError = null) => set({ serialConnected, serialError }),

  sessionId: null,
  sessionStart: null,
  sessionElapsed: 0,
  runCount: 0,

  latest: null,

  sensorStatus: {
    gnss: 'NO_DATA',
    imu: 'NO_DATA',
    rtc: 'NO_DATA',
    camera: 'STANDBY',
    serial: 'DISCONNECTED',
  },

  dataQuality: {
    expectedHz: EXPECTED_RATES.imu,
    actualHz: 0.0,
    packetLossPct: 0.0,
    jitterMs: 1.2,
    lastUpdateMs: null,
    totalPackets: 0,
    lostPackets: 0,
    invalidPackets: 0,
  },

  activeFaults: [],

  cursorT: null,
  cursorValues: null,
  setCursor: (t, values) => set({ cursorT: t, cursorValues: values }),
  clearCursor: () => set({ cursorT: null, cursorValues: null }),

  activeView: 'overview',
  setActiveView: (view) => set({ activeView: view }),

  selectedReplaySessionId: null,
  setSelectedReplaySessionId: (selectedReplaySessionId) => set({ selectedReplaySessionId }),
}));

let _sessionStart = null;
let _backendSessionInitiated = false;
let _currentNumericSessionId = 1;
let _unregisteredDevice = false;

function startWatchdogIfNeeded() {
  if (_watchdogTimer) return;
  _watchdogTimer = setInterval(() => {
    const state = useTelemetryStore.getState();
    if (state.sourceType === 'REAL_SERIAL' && state.serialConnected) {
      if (_sampleCount > 0 && _lastPacketTime > 0 && Date.now() - _lastPacketTime > 10000) {
        console.warn('[telemetryStore] Real hardware timeout (>10s without packets). Transitioning to DISCONNECTED.');
        resetSerialDisconnect('Serial telemetry stream timeout (no packets for >10s)');
      }
    } else {
      stopWatchdog();
    }
  }, 2000);
}

function stopWatchdog() {
  if (_watchdogTimer) {
    clearInterval(_watchdogTimer);
    _watchdogTimer = null;
  }
}

import { sendTelemetryBatch, startHardwareSession, endHardwareSession } from './backendApiClient.js';

export function resetSerialDisconnect(reason = null) {
  stopWatchdog();
  _currentActualHz = 0.0;
  _ppsWindowCount = 0;

  if (_backendSessionInitiated && _currentNumericSessionId) {
    endHardwareSession(_currentNumericSessionId, 'COMPLETED').catch(() => {});
  }
  _backendSessionInitiated = false;

  useTelemetryStore.setState((state) => ({
    mode: 'STANDBY',
    serialConnected: false,
    serialError: reason,
    deviceId: null,
    vehicleRegistrationNumber: null,
    ulbName: null,
    hardwareVersion: null,
    firmwareVersion: null,
    sessionIdentity: null,
    sensorStatus: {
      ...state.sensorStatus,
      serial: 'DISCONNECTED',
      imu: 'NO_DATA',
      gnss: 'NO_DATA',
      rtc: 'NO_DATA',
    },
    dataQuality: {
      ...state.dataQuality,
      actualHz: 0.0,
      lastUpdateMs: null,
    },
  }));
}

let _pendingBatchQueue = [];
let _batchFlushTimer = null;

function scheduleBatchFlush() {
  if (!_batchFlushTimer) {
    _batchFlushTimer = setInterval(() => {
      flushBatchQueueAsync();
    }, 1000);
  }
}

function flushBatchQueueAsync() {
  if (_unregisteredDevice || _pendingBatchQueue.length === 0) return;
  const toSend = [..._pendingBatchQueue];
  _pendingBatchQueue = [];

  const state = useTelemetryStore.getState();
  const mode = 'REAL_HARDWARE';
  const numericSessionId = _currentNumericSessionId;

  // Asynchronous non-blocking background post
  sendTelemetryBatch(numericSessionId, mode, toSend).catch((err) => {
    console.warn('[telemetryStore] Async batch flush warning:', err);
  });
}

export function ingestPacket(packet) {
  const now = Date.now();
  const isReal = true;
  const devId = packet?.device_id || null;

  // Immediately transition to LIVE and assign deviceId from hardware packet
  useTelemetryStore.setState((prev) => ({
    mode: 'LIVE',
    serialConnected: true,
    serialError: null,
    deviceId: prev.deviceId || devId,
  }));

  // Initiate Hardware Session on first packet
  if (!_backendSessionInitiated && packet && devId) {
    _backendSessionInitiated = true;
    startHardwareSession(devId, 'REAL_HARDWARE').then((res) => {
      if (res && res.success && res.session) {
        _unregisteredDevice = false;
        const s = res.session;
        _currentNumericSessionId = s.sessionId;
        useTelemetryStore.setState({
          sessionId: String(s.sessionId),
          deviceId: s.device?.deviceCode || devId,
          vehicleRegistrationNumber: s.vehicle?.registrationNumber || null,
          ulbName: s.ulb?.name || null,
          hardwareVersion: s.device?.hardwareVersion || null,
          firmwareVersion: s.device?.firmwareVersion || null,
          sessionIdentity: s
        });
      }
    }).catch(() => {});
  }

  // Queue packet for asynchronous backend persistence (non-blocking)
  if (packet) {
    _pendingBatchQueue.push(packet);
    scheduleBatchFlush();
  }

  // Process GSV satellite detail history
  if (packet?.gnss) {
    useGNSSHistoryStore.getState().processGSVSnapshot(packet);
  }

  if (isReal) {
    startWatchdogIfNeeded();
  }

  if (!_sessionStart && packet?.ts) {
    _sessionStart = packet.ts;
  }

  // Sequence & Loss Tracking
  if (packet?.sequence != null) {
    if (_lastSeq != null && packet.sequence > _lastSeq + 1) {
      _lostPackets += (packet.sequence - _lastSeq - 1);
    }
    _lastSeq = packet.sequence;
  }
  _totalPackets++;
  _ppsWindowCount++;

  // Calculate actual Hz dynamically
  if (now - _lastPpsCalcTime >= 1000) {
    const elapsedSec = (now - _lastPpsCalcTime) / 1000;
    _currentActualHz = parseFloat((_ppsWindowCount / elapsedSec).toFixed(1));
    _ppsWindowCount = 0;
    _lastPpsCalcTime = now;
  }

  // Jitter calculation (expected delta = 50ms for 20 Hz)
  const delta = _lastPacketTime > 0 ? now - _lastPacketTime : 50;
  _lastPacketTime = now;
  const expectedDelta = 1000 / EXPECTED_RATES.imu;
  const jitter = Math.abs(delta - expectedDelta);
  _jitterSum += jitter;
  _sampleCount++;

  // Validation
  if (!packet?.gnss || !packet?.imu) {
    _invalidPackets++;
  }

  buffers.push(packet);

  if (packet?.events?.length) {
    packet.events.forEach(type => {
      eventLog.push({ t: packet.t, ts: packet.timestamp || packet.ts, type });
    });
  }

  if (!ingestPacket._lastUpdate || now - ingestPacket._lastUpdate > 100) {
    ingestPacket._lastUpdate = now;

    const g = packet?.gnss || {};
    const imu = packet?.imu || {};
    const rtc = packet?.rtc || {};

    const activeFaults = packet?.diagnostics?.activeFaults || [];

    const gnssStatus = activeFaults.includes('GNSS_NO_FIX') ? 'NO_FIX'
      : (g.valid || g.fix === 'FIX' || g.status === 'FIX') ? 'ACTIVE'
      : (g.data_received || g.fix === false) ? 'NO_FIX'
      : 'NO DATA';

    const imuStatus = activeFaults.includes('IMU_DISCONNECT') ? 'FAULT'
      : activeFaults.includes('GYRO_BIAS') || activeFaults.includes('SENSOR_NOISE') ? 'WARN'
      : imu.valid ? 'ACTIVE' : 'FAULT';

    const rtcStatus = activeFaults.includes('RTC_DRIFT') ? 'DRIFT'
      : rtc.synced ? 'ACTIVE' : 'FAULT';

    const serialStatus = isReal ? 'CONNECTED' : 'LIVE';

    const lossPct = _totalPackets > 0 ? ((_lostPackets / (_totalPackets + _lostPackets)) * 100).toFixed(1) : 0;
    const avgJitter = _sampleCount > 0 ? (_jitterSum / _sampleCount).toFixed(1) : 1.2;

    const dataAgeMs = (packet && typeof packet.timestamp === 'number') ? Math.max(0, Math.round(now - packet.timestamp)) : null;

    useTelemetryStore.setState({
      latest: packet,
      sourceType: isReal ? 'REAL_SERIAL' : 'MOCK',
      serialConnected: isReal,
      sessionElapsed: packet?.t ?? 0,
      runCount: packet?.system?.runCount ?? 1,
      activeFaults,
      sensorStatus: {
        gnss: gnssStatus,
        imu: imuStatus,
        rtc: rtcStatus,
        camera: 'STANDBY',
        serial: serialStatus,
      },
      dataQuality: {
        expectedHz: EXPECTED_RATES.imu,
        actualHz: _currentActualHz,
        packetLossPct: parseFloat(lossPct),
        jitterMs: parseFloat(avgJitter),
        lastUpdateMs: dataAgeMs,
        totalPackets: _totalPackets,
        lostPackets: _lostPackets,
        invalidPackets: _invalidPackets,
      },
    });
  }
}

/**
 * Ingests a real-time packet received from remote SignalR TelemetryHub.
 * Feeds directly into high-speed ring buffers and telemetry store without re-persisting.
 */
export function ingestRemoteSignalRPacket(packet) {
  const now = Date.now();
  if (!_sessionStart && packet?.ts) {
    _sessionStart = packet.ts;
  }

  buffers.push(packet);

  const g = packet?.gnss || {};
  const imu = packet?.imu || {};
  const rtc = packet?.rtc || {};

  const gnssStatus = (g.valid || g.fix === 'FIX' || g.status === 'FIX' || g.fix === 'FIX_3D') ? 'ACTIVE'
    : (g.data_received || g.fix === false) ? 'NO_FIX'
    : 'NO DATA';

  const imuStatus = imu.valid ? 'ACTIVE' : 'NO_DATA';
  const rtcStatus = rtc.synced ? 'ACTIVE' : 'NO_DATA';

  useTelemetryStore.setState({
    latest: packet,
    sourceType: 'SIGNALR',
    serialConnected: true,
    sessionElapsed: packet?.t ?? 0,
    sensorStatus: {
      gnss: gnssStatus,
      imu: imuStatus,
      rtc: rtcStatus,
      camera: 'STANDBY',
      serial: 'CONNECTED',
    },
    dataQuality: {
      expectedHz: 20,
      actualHz: 20,
      packetLossPct: 0.0,
      jitterMs: 1.0,
      lastUpdateMs: 0,
      totalPackets: (useTelemetryStore.getState().dataQuality.totalPackets || 0) + 1,
      lostPackets: 0,
      invalidPackets: 0,
    },
  });
}

export function resetSession() {
  flushBatchQueueAsync();
  stopWatchdog();
  useGNSSHistoryStore.getState().resetHistory();
  _sessionStart = null;
  _lastSeq = null;
  _lastPacketTime = 0;
  _totalPackets = 0;
  _lostPackets = 0;
  _invalidPackets = 0;
  _jitterSum = 0;
  _sampleCount = 0;
  _ppsWindowCount = 0;
  _currentActualHz = 0.0;
  _lastPpsCalcTime = Date.now();
  buffers.reset();

  useTelemetryStore.setState({
    mode: 'STANDBY',
    sourceType: 'REAL_SERIAL',
    serialConnected: false,
    serialError: null,
    deviceId: null,
    vehicleRegistrationNumber: null,
    ulbName: null,
    hardwareVersion: null,
    firmwareVersion: null,
    sessionIdentity: null,
    sessionId: null,
    sessionStart: null,
    sessionElapsed: 0,
    runCount: 0,
    latest: null,
    sensorStatus: {
      gnss: 'NO_DATA',
      imu: 'NO_DATA',
      rtc: 'NO_DATA',
      camera: 'STANDBY',
      serial: 'DISCONNECTED',
    },
    dataQuality: {
      expectedHz: EXPECTED_RATES.imu,
      actualHz: 0.0,
      packetLossPct: 0.0,
      jitterMs: 1.2,
      lastUpdateMs: null,
      totalPackets: 0,
      lostPackets: 0,
      invalidPackets: 0,
    },
    activeFaults: [],
  });
}

