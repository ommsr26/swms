import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { buffers, resetSession } from '../telemetryStore.js';

describe('TelemetryBuffers Ring Buffer Unit Tests', () => {
  it('stores telemetry in Float64 circular arrays, supports aliases, and preserves nulls as NaN', () => {
    resetSession();

    // 1. Test pushing representative packet with canonical fields
    const representativePacket = {
      t: 1.05,
      gnss: {
        alt: 123.45,
        speed: 45.2,
        heading: 180.0,
      },
      imu: {
        accel: { x: 1.1, y: 2.2, z: 9.8 },
        accel_magnitude: 10.1,
        gyro: { x: 0.1, y: 0.2, z: 0.3 },
        mag: { x: 31.2, y: -15.4, z: 42.1 },
        orientation: { roll: 2.5, pitch: -1.2, yaw: 180.0 },
      },
    };

    buffers.push(representativePacket);

    assert.equal(buffers.getSeriesArray('alt')[0], 123.45, 'alt array must contain 123.45');
    assert.equal(buffers.getSeriesArray('ax')[0], 1.1, 'ax array must contain 1.1');
    assert.equal(buffers.getSeriesArray('ay')[0], 2.2, 'ay array must contain 2.2');
    assert.equal(buffers.getSeriesArray('az')[0], 9.8, 'az array must contain 9.8');
    assert.equal(buffers.getSeriesArray('accelMag')[0], 10.1, 'accelMag array must contain 10.1');
    assert.equal(buffers.getSeriesArray('gx')[0], 0.1, 'gx array must contain 0.1');
    assert.equal(buffers.getSeriesArray('gy')[0], 0.2, 'gy array must contain 0.2');
    assert.equal(buffers.getSeriesArray('gz')[0], 0.3, 'gz array must contain 0.3');
    assert.equal(buffers.getSeriesArray('speed')[0], 45.2, 'speed array must contain 45.2');

    // Alias mappings
    assert.equal(buffers.getSeriesArray('altitude')[0], 123.45, 'altitude alias must map to alt (123.45)');
    assert.equal(buffers.getSeriesArray('accelX')[0], 1.1, 'accelX alias must map to ax (1.1)');
    assert.equal(buffers.getSeriesArray('accelY')[0], 2.2, 'accelY alias must map to ay (2.2)');
    assert.equal(buffers.getSeriesArray('accelZ')[0], 9.8, 'accelZ alias must map to az (9.8)');

    // Chart Data formatting
    const chartData = buffers.getChartData('alt', 'ax', 'ay', 'az', 'gx', 'gy', 'gz');
    assert.equal(chartData.length, 8, 'getChartData should return time array + 7 signal series');
    assert.equal(chartData[0][0], 1.05, 'time series must match packet t');

    // Null / NaN preservation
    buffers.push({
      t: 1.10,
      gnss: { alt: null, speed: 45.3 },
      imu: { accel: { x: 1.2, y: 2.1, z: 9.8 }, gyro: { x: 0.1, y: 0.2, z: 0.3 } }
    });

    const altSeries = buffers.getSeriesArray('alt');
    assert.equal(altSeries.length, 2);
    assert.equal(altSeries[0], 123.45);
    assert.ok(Number.isNaN(altSeries[1]), 'Missing altitude must remain NaN (never 0)');
  });
});
