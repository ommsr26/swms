import { TelemetrySource } from '../../TelemetrySource.js';

const MOCK_HZ = 20;
const INTERVAL_MS = 1000 / MOCK_HZ;

const SYNTHETIC_PATH = [
  { lat: 51.5000, lon: -0.1200 },
  { lat: 51.5015, lon: -0.1200 },
  { lat: 51.5025, lon: -0.1200 },
  { lat: 51.5030, lon: -0.1190 },
  { lat: 51.5030, lon: -0.1175 },
  { lat: 51.5025, lon: -0.1165 },
  { lat: 51.5015, lon: -0.1162 },
  { lat: 51.5010, lon: -0.1155 },
  { lat: 51.5005, lon: -0.1158 },
  { lat: 51.4998, lon: -0.1165 },
  { lat: 51.4992, lon: -0.1175 },
  { lat: 51.4990, lon: -0.1188 },
  { lat: 51.4993, lon: -0.1200 },
  { lat: 51.5000, lon: -0.1200 },
];

const SEGMENT_SPEEDS = [110, 120, 40, 50, 60, 90, 55, 55, 85, 90, 40, 45, 80];

function gauss(mean = 0, stddev = 1) {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return mean + stddev * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function lerp(a, b, t) { return a + (b - a) * t; }

function bearing(p1, p2) {
  const dLon = (p2.lon - p1.lon) * Math.PI / 180;
  const lat1 = p1.lat * Math.PI / 180;
  const lat2 = p2.lat * Math.PI / 180;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
}

function distanceDeg(p1, p2) {
  const dlat = p2.lat - p1.lat;
  const dlon = p2.lon - p1.lon;
  return Math.sqrt(dlat * dlat + dlon * dlon);
}

function eulerToQuaternion(rollDeg, pitchDeg, yawDeg) {
  const r = (rollDeg * Math.PI) / 360;
  const p = (pitchDeg * Math.PI) / 360;
  const y = (yawDeg * Math.PI) / 360;

  const cr = Math.cos(r), sr = Math.sin(r);
  const cp = Math.cos(p), sp = Math.sin(p);
  const cy = Math.cos(y), sy = Math.sin(y);

  return {
    w: cr * cp * cy + sr * sp * sy,
    x: sr * cp * cy - cr * sp * sy,
    y: cr * sp * cy + sr * cp * sy,
    z: cr * cp * sy - sr * sp * cy,
  };
}

export class MockTelemetrySource extends TelemetrySource {
  constructor() {
    super();
    this._faults = new Set();
    this._reset();
  }

  setFault(faultId, active) {
    if (active) this._faults.add(faultId);
    else this._faults.delete(faultId);
  }

  toggleFault(faultId) {
    if (this._faults.has(faultId)) this._faults.delete(faultId);
    else this._faults.add(faultId);
  }

  getFaults() {
    return Array.from(this._faults);
  }

  _reset() {
    this._startTime = null;
    this._t = 0;
    this._interval = null;
    this._sequence = 0;

    this._segIdx = 0;
    this._segProgress = 0;
    this._runCount = 1;

    this._speed = 0;
    this._heading = 0;
    this._lat = SYNTHETIC_PATH[0].lat;
    this._lon = SYNTHETIC_PATH[0].lon;
    this._altitude = 28.5;

    this._ax = 0;
    this._ay = 0;
    this._az = 9.81;
    this._gx = 0;
    this._gy = 0;
    this._gz = 0;

    this._roll = 0;
    this._pitch = 0;
    this._yaw = 0;

    this._battery = 94.5;
    this._uptime = 0;
    this._temperature = 42.3;
    this._imuTemperature = 31.4;
    this._satellites = 12;
    this._hdop = 0.85;
    this._fix = 'FIX_3D';

    this._lastEvents = [];
    this._prevSpeed = 0;
    this._eventCooldown = 0;
    this._lastStalePacket = null;
  }

  start() {
    this._reset();
    this._startTime = Date.now();
    this._running = true;
    this._interval = setInterval(() => this._tick(), INTERVAL_MS);
  }

  stop() {
    this._running = false;
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
  }

  _tick() {
    const dt = 1 / MOCK_HZ;
    this._sequence++;
    this._t += dt;
    this._uptime += dt;
    this._eventCooldown = Math.max(0, this._eventCooldown - dt);

    if (this._faults.has('PACKET_LOSS_5') && Math.random() < 0.05) return;
    if (this._faults.has('PACKET_LOSS_20') && Math.random() < 0.20) return;
    if (this._faults.has('PACKET_LOSS_50') && Math.random() < 0.50) return;

    if (this._faults.has('STALE_PACKET')) {
      if (!this._lastStalePacket) {
        this._lastStalePacket = this._buildPacket(Date.now());
      }
      this._emit(this._lastStalePacket);
      return;
    }
    this._lastStalePacket = null;

    const seg = this._segIdx % SYNTHETIC_PATH.length;
    const nextSeg = (seg + 1) % SYNTHETIC_PATH.length;
    const from = SYNTHETIC_PATH[seg];
    const to = SYNTHETIC_PATH[nextSeg];
    const targetSpeed = SEGMENT_SPEEDS[seg] ?? 80;

    const segLen = distanceDeg(from, to);
    const speedMs = this._speed / 3.6;
    const progressIncrement = (speedMs * dt * 0.000009) / Math.max(segLen, 0.0001);
    this._segProgress += progressIncrement;

    if (this._segProgress >= 1) {
      this._segProgress = 0;
      this._segIdx++;
      if (this._segIdx >= SYNTHETIC_PATH.length) {
        this._segIdx = 0;
        this._runCount++;
      }
    }

    const progress = Math.min(this._segProgress, 1);
    const idealLat = lerp(from.lat, to.lat, progress);
    const idealLon = lerp(from.lon, to.lon, progress);

    const gnssNoise = this._faults.has('SENSOR_NOISE') ? 0.00005 : 0.0000045;
    this._lat = idealLat + gauss(0, gnssNoise);
    this._lon = idealLon + gauss(0, gnssNoise * 1.4);

    const rawHeading = bearing(from, to);
    const headingDiff = ((rawHeading - this._heading + 540) % 360) - 180;
    this._heading = (this._heading + headingDiff * 0.15 + 360) % 360;

    const speedError = targetSpeed - this._speed;
    const accelMs = speedError > 0 ? Math.min(6, speedError * 0.2) : Math.max(-8, speedError * 0.3);
    this._speed = Math.max(0, this._speed + accelMs * dt * 3.6);

    const noiseStd = this._faults.has('SENSOR_NOISE') ? 0.8 : 0.08;
    const biasG = this._faults.has('GYRO_BIAS') ? 4.5 : 0.0;

    const targetAx = accelMs + gauss(0, noiseStd);
    this._ax += (targetAx - this._ax) * 0.4;

    const headingRateRad = (headingDiff * 0.15) * Math.PI / 180 * MOCK_HZ;
    const targetAy = -headingRateRad * (this._speed / 3.6) + gauss(0, noiseStd * 0.7);
    this._ay += (targetAy - this._ay) * 0.3;

    this._az = 9.81 + gauss(0, noiseStd * 1.5);

    this._gz = headingRateRad * 57.2958 + biasG + gauss(0, 0.4);
    this._gx = this._ay * 2.1 + biasG + gauss(0, 0.3);
    this._gy = -this._ax * 1.4 + biasG + gauss(0, 0.3);

    this._roll = this._ay * 2.5 + gauss(0, 0.2);
    this._pitch = -this._ax * 1.8 + gauss(0, 0.2);
    this._yaw = this._heading;

    this._altitude += gauss(0, 0.05) + Math.sin(this._t * 0.08) * 0.03;

    if (this._faults.has('GNSS_NO_FIX')) {
      this._fix = 'NO_FIX';
      this._satellites = 3;
      this._hdop = 8.5;
    } else {
      this._satellites = 12 + Math.floor(Math.sin(this._t * 0.03) * 2);
      this._hdop = 0.85;
      this._fix = 'FIX_3D';
    }

    this._battery = Math.max(0, this._battery - 0.000015 * dt);
    this._temperature += gauss(0, 0.01);
    this._imuTemperature = 31.4 + (this._temperature - 40) * 0.3;

    // Engineering Events
    const events = [];
    if (this._eventCooldown <= 0) {
      if (Math.abs(headingDiff) > 15) {
        events.push(headingDiff > 0 ? 'HEADING_CHANGE_RIGHT' : 'HEADING_CHANGE_LEFT');
        this._eventCooldown = 2.5;
      } else if (accelMs > 3.0) {
        events.push('ACCELERATION_PEAK');
        this._eventCooldown = 2.0;
      } else if (accelMs < -4.0) {
        events.push('DECELERATION_EVENT');
        this._eventCooldown = 2.0;
      } else if (Math.abs(this._gz) > 30) {
        events.push('HIGH_GYRO_RATE');
        this._eventCooldown = 2.0;
      }
    }

    const now = Date.now();
    const packet = this._buildPacket(now, events);
    this._emit(packet);
  }

  _buildPacket(now, events = []) {
    const isImuDisconnected = this._faults.has('IMU_DISCONNECT');

    const yawRad = (this._yaw * Math.PI) / 180;
    const mx = 31.2 * Math.cos(yawRad) + gauss(0, 0.5);
    const my = -31.2 * Math.sin(yawRad) + gauss(0, 0.5);
    const mz = 42.7 + gauss(0, 0.5);

    const ax = isImuDisconnected ? 0 : this._ax;
    const ay = isImuDisconnected ? 0 : this._ay;
    const az = isImuDisconnected ? 0 : this._az;
    const accelMag = Math.sqrt(ax * ax + ay * ay + az * az);

    const quat = eulerToQuaternion(
      isImuDisconnected ? 0 : this._roll,
      isImuDisconnected ? 0 : this._pitch,
      isImuDisconnected ? 0 : this._yaw
    );

    return {
      type: 'telemetry',
      device_id: 'SWSTP-DEV-MOCK',
      sequence: this._sequence,
      timestamp: now,
      t: parseFloat(this._t.toFixed(3)),
      gnss: {
        lat: this._lat,
        lon: this._lon,
        alt: parseFloat(this._altitude.toFixed(2)),
        speed: parseFloat(this._speed.toFixed(1)),
        heading: parseFloat(this._heading.toFixed(1)),
        satellites: this._satellites,
        hdop: parseFloat(this._hdop.toFixed(2)),
        fix: this._fix,
        valid: this._fix !== 'NO_FIX',
      },
      imu: {
        accel: {
          x: parseFloat(ax.toFixed(4)),
          y: parseFloat(ay.toFixed(4)),
          z: parseFloat(az.toFixed(4)),
        },
        gyro: {
          x: isImuDisconnected ? 0 : parseFloat(this._gx.toFixed(4)),
          y: isImuDisconnected ? 0 : parseFloat(this._gy.toFixed(4)),
          z: isImuDisconnected ? 0 : parseFloat(this._gz.toFixed(4)),
        },
        mag: {
          x: isImuDisconnected ? 0 : parseFloat(mx.toFixed(1)),
          y: isImuDisconnected ? 0 : parseFloat(my.toFixed(1)),
          z: isImuDisconnected ? 0 : parseFloat(mz.toFixed(1)),
        },
        orientation: {
          roll: isImuDisconnected ? 0 : parseFloat(this._roll.toFixed(2)),
          pitch: isImuDisconnected ? 0 : parseFloat(this._pitch.toFixed(2)),
          yaw: isImuDisconnected ? 0 : parseFloat(this._yaw.toFixed(2)),
        },
        quaternion: quat,
        temperature_c: isImuDisconnected ? 0 : parseFloat(this._imuTemperature.toFixed(1)),
        accel_magnitude: parseFloat(accelMag.toFixed(4)),
        valid: !isImuDisconnected,
      },
      rtc: {
        iso: new Date(now).toISOString(),
        epoch: now,
        synced: !this._faults.has('RTC_DRIFT'),
      },
      system: {
        battery: parseFloat(this._battery.toFixed(1)),
        uptime: parseFloat(this._uptime.toFixed(1)),
        temperature: parseFloat(this._temperature.toFixed(1)),
        connected: true,
        runCount: this._runCount,
      },
      events,
      diagnostics: {
        activeFaults: this.getFaults(),
      },
    };
  }
}
