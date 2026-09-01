import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { useTelemetryStore, ingestPacket, resetSerialDisconnect, resetSession } from '../telemetryStore.js';

describe('Web Serial Connection Lifecycle & Disconnect Unit Tests', () => {
  it('verifies initial disconnected state and real hardware reconnection lifecycle', () => {
    // 1. Test Initial Disconnected State
    resetSession();
    resetSerialDisconnect();

    let state = useTelemetryStore.getState();
    assert.equal(state.serialConnected, false, 'Initial serialConnected must be false');
    assert.equal(state.sourceType, 'REAL_SERIAL', 'Initial sourceType must default to REAL_SERIAL');
    assert.equal(state.baudRate, 115200, 'Web Serial transport baud rate must be 115200');
    assert.equal(state.sensorStatus.serial, 'DISCONNECTED', 'Initial serial sensorStatus must be DISCONNECTED');
    assert.equal(state.sensorStatus.imu, 'NO_DATA', 'Initial IMU status must be NO_DATA');
    assert.equal(state.sensorStatus.gnss, 'NO_DATA', 'Initial GNSS status must be NO_DATA');
    assert.equal(state.sensorStatus.rtc, 'NO_DATA', 'Initial RTC status must be NO_DATA');
    assert.equal(state.dataQuality.actualHz, 0.0, 'Initial actualHz must be 0.0');
    assert.equal(state.dataQuality.lastUpdateMs, null, 'Initial lastUpdateMs must be null');

    // 2. Test Real Hardware Packet Ingestion
    const sampleRealPacket = {
      version: "2.0.0",
      source: "REAL_HARDWARE",
      device_id: "SWSTP-DEV-000001",
      baud_rate: 115200,
      sequence: 1,
      ts: 1770970000,
      timestamp: Date.now(),
      t: 0.05,
      system: { mode: "RUNNING", runCount: 1, uptime_ms: 10500 },
      imu: {
        valid: true,
        accel: { x: 0.12, y: -0.05, z: 9.81 },
        gyro: { x: 0.1, y: -0.2, z: 0.0 },
        orientation: { roll: 0.2, pitch: -0.1, yaw: 12.4 },
        accel_magnitude: 9.81
      },
      rtc: { synced: true, epoch: 1770970000, iso: "2026-08-13 14:50:00" },
      gnss: { valid: true, fix: "FIX_3D", lat: 20.9374, lon: 77.7796, alt: 312.4, speed: 2.1, heading: 180.0, satellites: 8, hdop: 1.2 }
    };

    ingestPacket(sampleRealPacket);
    state = useTelemetryStore.getState();

    assert.equal(state.serialConnected, true, 'serialConnected must be true after real packet ingestion');
    assert.equal(state.sourceType, 'REAL_SERIAL', 'sourceType must be REAL_SERIAL after real packet');
    assert.equal(state.sensorStatus.serial, 'CONNECTED', 'Serial status must be CONNECTED');
    assert.equal(state.sensorStatus.imu, 'ACTIVE', 'IMU status must be ACTIVE');
    assert.equal(state.sensorStatus.gnss, 'ACTIVE', 'GNSS status must be ACTIVE');
    assert.equal(state.sensorStatus.rtc, 'ACTIVE', 'RTC status must be ACTIVE');
    assert.notEqual(state.dataQuality.lastUpdateMs, null, 'Data age must be calculated when connected');

    // 3. Test Disconnect State Reset
    resetSerialDisconnect('Physical USB device unplugged');
    state = useTelemetryStore.getState();

    assert.equal(state.serialConnected, false, 'serialConnected must be false after disconnect');
    assert.equal(state.sensorStatus.serial, 'DISCONNECTED', 'Serial status must reset to DISCONNECTED');
    assert.equal(state.sensorStatus.imu, 'NO_DATA', 'IMU status must reset to NO_DATA');
    assert.equal(state.sensorStatus.gnss, 'NO_DATA', 'GNSS status must reset to NO_DATA');
    assert.equal(state.sensorStatus.rtc, 'NO_DATA', 'RTC status must reset to NO_DATA');
    assert.equal(state.dataQuality.actualHz, 0.0, 'actualHz must reset to 0.0');
    assert.equal(state.dataQuality.lastUpdateMs, null, 'lastUpdateMs must reset to null');

    // 4. Test Reconnection Flow
    ingestPacket._lastUpdate = 0;
    ingestPacket({ ...sampleRealPacket, sequence: 2, timestamp: Date.now() });
    state = useTelemetryStore.getState();

    assert.equal(state.serialConnected, true, 'serialConnected must be true after reconnection packet');
    assert.equal(state.sensorStatus.serial, 'CONNECTED', 'Serial status must be CONNECTED');
    assert.equal(state.sensorStatus.imu, 'ACTIVE', 'IMU status must be ACTIVE');
  });
});
