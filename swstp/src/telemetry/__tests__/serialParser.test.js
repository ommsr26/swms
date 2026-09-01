import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { parseSerialLine, getParseErrorCount, resetParserSequence } from '../serialParser.js';

describe('JSON Serial Parser Unit Tests', () => {
  it('parses telemetry packets, handles null GNSS values, and ignores boot text lines', () => {
    resetParserSequence();

    // Test 1: Full valid JSON telemetry line matching the Arduino contract
    const sampleJson1 = JSON.stringify({
      type: "telemetry",
      device_id: "SWSTP-DEV-000001",
      seq: 1527,
      uptime_ms: 183420,
      rtc: {
        valid: true,
        timestamp: "2026-08-13T11:12:14",
        epoch: 1786628534000
      },
      imu: {
        valid: true,
        accel_g: { x: 0.001, y: -0.002, z: 0.998 },
        accel_ms2: { x: 0.0098, y: -0.0196, z: 9.7860 },
        accel_magnitude_ms2: 9.8060,
        gyro_dps: { x: 0.03, y: -0.01, z: 0.02 },
        temperature_c: 31.25,
        orientation: { roll: 0.8, pitch: -1.2, yaw: 14.3, yaw_source: "GYRO_INTEGRATED" },
        quaternion: { w: 0.99, x: 0.01, y: -0.01, z: 0.12 }
      },
      gnss: {
        data_received: true,
        fix: true,
        status: "FIX",
        latitude: 20.937400,
        longitude: 77.779600,
        altitude_m: 312.4,
        speed_kmh: 2.4,
        course_deg: 183.2,
        satellites: 8,
        hdop: 1.4
      },
      status: {
        rtc: "ACTIVE",
        imu: "ACTIVE",
        gnss: "ACTIVE",
        serial: "CONNECTED",
        baud: 115200
      }
    });

    const packet1 = parseSerialLine(sampleJson1);

    assert.notEqual(packet1, null);
    assert.equal(packet1.type, 'telemetry');
    assert.equal(packet1.source, 'REAL_HARDWARE');
    assert.equal(packet1.device_id, 'SWSTP-DEV-000001');
    assert.equal(packet1.sequence, 1527);
    assert.equal(packet1.timestamp, 1786628534000);

    // Accel & Gyro
    assert.equal(packet1.imu.accel.x, 0.0098);
    assert.equal(packet1.imu.accel.y, -0.0196);
    assert.equal(packet1.imu.accel.z, 9.7860);
    assert.equal(packet1.imu.accel_magnitude, 9.8060);
    assert.equal(packet1.imu.gyro.x, 0.03);

    // GNSS Valid Fix
    assert.equal(packet1.gnss.valid, true);
    assert.equal(packet1.gnss.lat, 20.937400);
    assert.equal(packet1.gnss.lon, 77.779600);

    // Test 2: Null GNSS packet (GNSS no fix / unavailable)
    const sampleJsonNoFix = JSON.stringify({
      type: "telemetry",
      device_id: "SWSTP-DEV-000001",
      seq: 1528,
      uptime_ms: 183470,
      rtc: { valid: true, timestamp: "2026-08-13T11:12:14.050", epoch: 1786628534050 },
      imu: { valid: true, accel_ms2: { x: 0, y: 0, z: 9.81 }, gyro_dps: { x: 0, y: 0, z: 0 } },
      gnss: {
        data_received: false,
        fix: false,
        status: "NO_FIX",
        latitude: null,
        longitude: null,
        altitude_m: null,
        speed_kmh: null,
        course_deg: null,
        satellites: 0,
        hdop: null
      }
    });

    const packet2 = parseSerialLine(sampleJsonNoFix);
    assert.equal(packet2.sequence, 1528);
    assert.equal(packet2.gnss.valid, false);
    assert.equal(packet2.gnss.fix, 'NO_FIX');

    // Null values MUST remain null, not zero!
    assert.equal(packet2.gnss.lat, null);
    assert.equal(packet2.gnss.lon, null);
    assert.equal(packet2.gnss.alt, null);

    // Test 3: GNSS Packet containing satellites_detail array
    const sampleJsonSatsDetail = JSON.stringify({
      type: "telemetry",
      device_id: "SWSTP-DEV-000001",
      seq: 1529,
      uptime_ms: 183520,
      gnss: {
        data_received: true,
        fix: false,
        status: "NO_FIX",
        latitude: null,
        longitude: null,
        altitude_m: null,
        satellites_in_view: 4,
        satellites_detail: [
          { prn: 1, constellation: "GPS", elevation_deg: 23, azimuth_deg: 184, snr_db: 31, used_in_fix: false },
          { prn: 7, constellation: "GPS", elevation_deg: 65, azimuth_deg: 42, snr_db: 41, used_in_fix: true },
          { prn: 14, constellation: "GLONASS", elevation_deg: 48, azimuth_deg: 210, snr_db: null, used_in_fix: false },
          { prn: 28, elevation_deg: 12, azimuth_deg: 315, snr_db: 22, used_in_fix: false }
        ]
      }
    });

    const packet3 = parseSerialLine(sampleJsonSatsDetail);
    assert.equal(packet3.gnss.satellites_in_view, 4);
    assert.equal(packet3.gnss.satellites_used, 1);
    assert.equal(packet3.gnss.satellites_detail.length, 4);
    assert.equal(packet3.gnss.satellites_detail[0].prn, 1);
    assert.equal(packet3.gnss.satellites_detail[1].status, 'USED IN FIX');

    // Test 4: Malformed JSON line handling
    const initialErrors = getParseErrorCount();
    const malformedResult = parseSerialLine('{ invalid json line ...');
    assert.equal(malformedResult, null);
    assert.equal(getParseErrorCount(), initialErrors + 1);

    // Test 5: Boot text line ignoring
    const bootLineResult = parseSerialLine('System initializing... Baud 115200');
    assert.equal(bootLineResult, null);
  });
});
