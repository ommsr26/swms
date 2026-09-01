/**
 * serialParser.js — Parser for physical Arduino JSON Lines telemetry output.
 *
 * Contract Spec:
 * {
 *   "type": "telemetry",
 *   "seq": 1527,
 *   "uptime_ms": 183420,
 *   "rtc": { "valid": true, "timestamp": "2026-08-13T11:12:14", "epoch": 1786628534000 },
 *   "imu": {
 *     "valid": true,
 *     "accel_g": { "x": 0.001, "y": -0.002, "z": 0.998 },
 *     "accel_ms2": { "x": 0.0098, "y": -0.0196, "z": 9.7860 },
 *     "accel_magnitude_ms2": 9.8060,
 *     "gyro_dps": { "x": 0.03, "y": -0.01, "z": 0.02 },
 *     "temperature_c": 31.25,
 *     "orientation": { "roll": 0.8, "pitch": -1.2, "yaw": 14.3, "yaw_source": "GYRO_INTEGRATED" },
 *     "quaternion": { "w": 0.99, "x": 0.01, "y": -0.01, "z": 0.12 }
 *   },
 *   "gnss": {
 *     "data_received": true, "fix": true, "status": "FIX",
 *     "latitude": 20.937400, "longitude": 77.779600, "altitude_m": 312.4,
 *     "speed_kmh": 2.4, "course_deg": 183.2, "satellites": 8, "hdop": 1.4
 *   },
 *   "status": { "rtc": "ACTIVE", "imu": "ACTIVE", "gnss": "ACTIVE", "serial": "CONNECTED", "baud": 115200 }
 * }
 */

let _packetSequence = 0;
let _sessionStartTime = null;
let _parseErrorCount = 0;

export function resetParserSequence() {
  _packetSequence = 0;
  _sessionStartTime = null;
  _parseErrorCount = 0;
}

export function getParseErrorCount() {
  return _parseErrorCount;
}

/**
 * Parses a single JSON line or raw string from serial stream.
 *
 * @param {string} line - Single line string received over serial
 * @param {number} [receiveTimestamp] - Fallback epoch ms if RTC is missing
 * @returns {object|null} Canonical Normalized Telemetry Packet or null if line is not valid telemetry
 */
export function parseSerialLine(line, receiveTimestamp = Date.now()) {
  const trimmed = line ? line.trim() : '';

  if (!trimmed) {
    return null;
  }

  // Find JSON boundaries in case of debug prefix/suffix (e.g. [101] {"type":"telemetry",...})
  const jsonStart = trimmed.indexOf('{');
  const jsonEnd = trimmed.lastIndexOf('}');

  if (jsonStart !== -1 && jsonEnd > jsonStart) {
    try {
      const jsonStr = trimmed.substring(jsonStart, jsonEnd + 1);
      const raw = JSON.parse(jsonStr);

      if (raw && typeof raw === 'object') {
        return normalizeJsonTelemetry(raw, receiveTimestamp);
      }
    } catch {
      _parseErrorCount++;
    }
  }

  // Legacy multiline fallback parser (if record contains newline-delimited text blocks)
  if (trimmed.includes('RTC Time:') || trimmed.includes('IMU Accel')) {
    return parseLegacyMultilineRecord(trimmed, receiveTimestamp);
  }

  // Non-JSON boot/status message
  return null;
}

/**
 * Normalizes new JSON telemetry packet into canonical application shape.
 */
function normalizeJsonTelemetry(raw, receiveTimestamp) {
  const seq = raw.seq != null ? raw.seq : ++_packetSequence;
  _packetSequence = seq;

  const rtc = raw.rtc || {};
  const imu = raw.imu || {};
  const gnss = raw.gnss || {};
  const status = raw.status || {};

  const rtcEpoch = typeof rtc.epoch === 'number' && !isNaN(rtc.epoch) ? rtc.epoch : receiveTimestamp;
  if (!_sessionStartTime) {
    _sessionStartTime = rtcEpoch;
  }

  const elapsedSec = parseFloat((Math.max(0, rtcEpoch - _sessionStartTime) / 1000).toFixed(3));

  // Extract Accel & Gyro
  const accelMs2 = imu.accel_ms2 ? {
    x: imu.accel_ms2.x != null ? imu.accel_ms2.x : null,
    y: imu.accel_ms2.y != null ? imu.accel_ms2.y : null,
    z: imu.accel_ms2.z != null ? imu.accel_ms2.z : null,
  } : null;

  const accelG = imu.accel_g ? {
    x: imu.accel_g.x != null ? imu.accel_g.x : null,
    y: imu.accel_g.y != null ? imu.accel_g.y : null,
    z: imu.accel_g.z != null ? imu.accel_g.z : null,
  } : null;

  const gyroDps = imu.gyro_dps ? {
    x: imu.gyro_dps.x != null ? imu.gyro_dps.x : null,
    y: imu.gyro_dps.y != null ? imu.gyro_dps.y : null,
    z: imu.gyro_dps.z != null ? imu.gyro_dps.z : null,
  } : null;

  // Extract Orientation & Quaternion
  const orient = imu.orientation ? {
    roll: imu.orientation.roll != null ? imu.orientation.roll : null,
    pitch: imu.orientation.pitch != null ? imu.orientation.pitch : null,
    yaw: imu.orientation.yaw != null ? imu.orientation.yaw : null,
    yaw_source: imu.orientation.yaw_source || 'GYRO_INTEGRATED',
  } : null;

  const quat = imu.quaternion ? {
    w: imu.quaternion.w != null ? imu.quaternion.w : null,
    x: imu.quaternion.x != null ? imu.quaternion.x : null,
    y: imu.quaternion.y != null ? imu.quaternion.y : null,
    z: imu.quaternion.z != null ? imu.quaternion.z : null,
  } : null;

  // GNSS Parsing (Null safe, never convert null lat/lon into 0)
  const hasGnssFix = Boolean(gnss.fix && gnss.latitude != null && gnss.longitude != null);

  const rawSatsDetail = Array.isArray(gnss.satellites_detail)
    ? gnss.satellites_detail
    : (Array.isArray(gnss.satellites_list) ? gnss.satellites_list : []);

  const satellitesDetail = rawSatsDetail.map(sat => {
    if (!sat || typeof sat !== 'object') return null;

    const prn = sat.prn ?? sat.id ?? null;
    const elevation = sat.elevation_deg ?? sat.elevation ?? null;
    const azimuth = sat.azimuth_deg ?? sat.azimuth ?? null;
    const snr = sat.snr_db ?? sat.snr_dbhz ?? sat.snr ?? null;
    const usedInFix = Boolean(sat.used_in_fix ?? sat.used ?? false);

    // Constellation: Use explicit NMEA/Arduino field or UNKNOWN (No PRN range guessing)
    const constellation = sat.constellation ? String(sat.constellation).toUpperCase() : 'UNKNOWN';

    return {
      prn,
      constellation,
      elevation: elevation != null ? Number(elevation) : null,
      azimuth: azimuth != null ? Number(azimuth) : null,
      snr: snr != null ? Number(snr) : null,
      used_in_fix: usedInFix,
      status: usedInFix ? 'USED IN FIX' : (snr != null && snr > 0 ? 'TRACKED' : 'VISIBLE'),
    };
  }).filter(Boolean);

  const satellitesInView = gnss.satellites_in_view != null
    ? gnss.satellites_in_view
    : (satellitesDetail.length > 0 ? satellitesDetail.length : (gnss.satellites || 0));

  const satellitesUsed = satellitesDetail.length > 0
    ? satellitesDetail.filter(s => s.used_in_fix).length
    : (gnss.satellites || 0);

  const gnssData = {
    lat: gnss.latitude != null ? gnss.latitude : null,
    lon: gnss.longitude != null ? gnss.longitude : null,
    alt: gnss.altitude_m != null ? gnss.altitude_m : null,
    speed: gnss.speed_kmh != null ? gnss.speed_kmh : null,
    heading: gnss.course_deg != null ? gnss.course_deg : null,
    satellites: gnss.satellites != null ? gnss.satellites : 0,
    satellites_in_view: satellitesInView,
    satellites_used: satellitesUsed,
    satellites_detail: satellitesDetail,
    gsv_seq: gnss.gsv_seq != null ? Number(gnss.gsv_seq) : null,
    gsv_uptime_ms: gnss.gsv_uptime_ms != null ? Number(gnss.gsv_uptime_ms) : (raw.system?.uptime_ms != null ? Number(raw.system.uptime_ms) : rtcEpoch),
    hdop: gnss.hdop != null ? gnss.hdop : null,
    fix: hasGnssFix ? (gnss.status || 'FIX_3D') : 'NO_FIX',
    valid: hasGnssFix,
    data_received: Boolean(gnss.data_received),
    status: gnss.status || (hasGnssFix ? 'ACTIVE' : 'NO_FIX'),
  };

  const deviceId = raw.device_id || raw.deviceId || raw.devId || raw.id || null;

  return {
    type: 'telemetry',
    source: 'REAL_HARDWARE',
    device_id: deviceId,
    sequence: seq,
    timestamp: rtcEpoch,
    t: elapsedSec,
    uptime_ms: raw.uptime_ms != null ? raw.uptime_ms : elapsedSec * 1000,
    gnss: gnssData,
    imu: {
      accel: accelMs2,
      accel_g: accelG,
      gyro: gyroDps,
      mag: null, // MPU6500 has no magnetometer!
      orientation: orient,
      quaternion: quat,
      temperature_c: imu.temperature_c != null ? imu.temperature_c : null,
      accel_magnitude: imu.accel_magnitude_ms2 != null ? imu.accel_magnitude_ms2 : null,
      valid: imu.valid !== false,
    },
    rtc: {
      iso: rtc.timestamp || new Date(rtcEpoch).toISOString(),
      epoch: rtcEpoch,
      synced: rtc.valid !== false,
    },
    system: {
      battery: null,
      uptime: raw.uptime_ms ? parseFloat((raw.uptime_ms / 1000).toFixed(1)) : elapsedSec,
      temperature: imu.temperature_c != null ? imu.temperature_c : null,
      connected: true,
      runCount: 1,
    },
    status: {
      rtc: status.rtc || (rtc.valid !== false ? 'ACTIVE' : 'OFFLINE'),
      imu: status.imu || (imu.valid !== false ? 'ACTIVE' : 'OFFLINE'),
      gnss: status.gnss || (gnssData.valid ? 'ACTIVE' : 'NO_FIX'),
      serial: status.serial || 'CONNECTED',
      baud: status.baud || 115200,
    },
    events: [],
    diagnostics: {
      activeFaults: [],
    },
  };
}

/**
 * Legacy multiline parser backward compatibility.
 */
function parseLegacyMultilineRecord(rawRecord, receiveTimestamp) {
  _packetSequence++;
  const lines = rawRecord.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  let rtcData = null, accelG = null, accelMs2 = null, accelMag = null, gyroData = null;
  const G_TO_MS2 = 9.80665;

  for (const line of lines) {
    if (line.toLowerCase().startsWith('rtc time:')) {
      const timeStr = line.substring(line.indexOf(':') + 1).trim();
      if (timeStr) {
        const parsedEpoch = new Date(timeStr.replace(' ', 'T')).getTime();
        const epoch = !isNaN(parsedEpoch) ? parsedEpoch : receiveTimestamp;
        rtcData = { iso: timeStr, epoch, synced: !isNaN(parsedEpoch) };
      }
    } else if (line.toLowerCase().includes('imu accel')) {
      const colonIdx = line.indexOf(':');
      if (colonIdx !== -1) {
        const parts = line.substring(colonIdx + 1).split(',').map(v => {
          const num = parseFloat(v.trim());
          return Object.is(num, -0) ? 0 : num;
        });
        if (parts.length >= 3 && !parts.some(isNaN)) {
          accelG = { x: parts[0], y: parts[1], z: parts[2] };
          const ax = parts[0] * G_TO_MS2, ay = parts[1] * G_TO_MS2, az = parts[2] * G_TO_MS2;
          accelMs2 = {
            x: Object.is(ax, -0) ? 0 : parseFloat(ax.toFixed(4)),
            y: Object.is(ay, -0) ? 0 : parseFloat(ay.toFixed(4)),
            z: Object.is(az, -0) ? 0 : parseFloat(az.toFixed(4)),
          };
          accelMag = parseFloat(Math.sqrt(ax * ax + ay * ay + az * az).toFixed(4));
        }
      }
    } else if (line.toLowerCase().includes('imu gyro')) {
      const colonIdx = line.indexOf(':');
      if (colonIdx !== -1) {
        const parts = line.substring(colonIdx + 1).split(',').map(v => {
          const num = parseFloat(v.trim());
          return Object.is(num, -0) ? 0 : num;
        });
        if (parts.length >= 3 && !parts.some(isNaN)) {
          gyroData = { x: parts[0], y: parts[1], z: parts[2] };
        }
      }
    }
  }

  if (!rtcData) rtcData = { iso: new Date(receiveTimestamp).toISOString(), epoch: receiveTimestamp, synced: false };
  if (!_sessionStartTime) _sessionStartTime = rtcData.epoch;
  const elapsedSec = parseFloat((Math.max(0, rtcData.epoch - _sessionStartTime) / 1000).toFixed(3));

  return {
    type: 'telemetry',
    source: 'REAL_HARDWARE',
    sequence: _packetSequence,
    timestamp: rtcData.epoch,
    t: elapsedSec,
    gnss: { lat: null, lon: null, alt: null, speed: null, heading: null, satellites: 0, hdop: null, fix: 'NO_FIX', valid: false, data_received: false, status: 'NO_FIX' },
    imu: { accel: accelMs2, accel_g: accelG, gyro: gyroData, mag: null, orientation: null, quaternion: null, temperature_c: null, accel_magnitude: accelMag, valid: Boolean(accelMs2 || gyroData) },
    rtc: rtcData,
    system: { battery: null, uptime: elapsedSec, temperature: null, connected: true, runCount: 1 },
    status: { rtc: 'ACTIVE', imu: 'ACTIVE', gnss: 'NO_FIX', serial: 'CONNECTED', baud: 115200 },
    events: [],
    diagnostics: { activeFaults: [] },
  };
}

/** Legacy wrapper function compatibility */
export function parseSerialRecord(rawRecord, receiveTimestamp = Date.now()) {
  return parseSerialLine(rawRecord, receiveTimestamp);
}
