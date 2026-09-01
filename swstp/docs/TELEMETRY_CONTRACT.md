# IoT Telemetry Hardware & Communication Protocol Contract

> **Document Version:** 2.0  
> **Status:** Provisional Specification for Hardware Integration  
> **Target MCU:** Arduino / ESP32 / STM32 Class Microcontrollers  

---

## 1. Overview & Purpose

This document defines the formal communication contract between the IoT physical hardware firmware and the **Engineering Telemetry & Hardware Diagnostics Workstation**.

The protocol provides structured, deterministic transmission of multi-sensor data (GNSS, IMU, RTC, System Diagnostics) with sequence tracking, data validity flags, and error detection capabilities.

---

## 2. Canonical Telemetry Packet Specification (JSON)

Every telemetry message transmitted over Serial, WebSocket, or MQTT must conform to the following schema structure:

```json
{
  "type": "telemetry",
  "sequence": 12345,
  "timestamp": 1723481234123,
  "elapsed_s": 142.35,

  "gnss": {
    "lat": 51.5005,
    "lon": -0.1180,
    "alt": 28.5,
    "speed": 64.2,
    "heading": 182.4,
    "satellites": 12,
    "hdop": 0.85,
    "fix": "FIX_3D",
    "valid": true
  },

  "imu": {
    "accel": {
      "x": 0.12,
      "y": -0.04,
      "z": 9.78
    },
    "gyro": {
      "x": 0.02,
      "y": 0.14,
      "z": -0.01
    },
    "mag": {
      "x": 31.2,
      "y": -8.4,
      "z": 42.7
    },
    "temperature_c": 31.4,
    "accel_magnitude": 9.78,
    "orientation": {
      "roll": 1.2,
      "pitch": -2.4,
      "yaw": 182.4
    },
    "quaternion": {
      "w": 0.998,
      "x": 0.010,
      "y": -0.021,
      "z": 0.032
    },
    "valid": true
  },

  "rtc": {
    "iso": "2026-08-12T22:48:31.120Z",
    "epoch": 1723481234123,
    "synced": true
  },

  "system": {
    "battery": 94.5,
    "uptime": 358.0,
    "temperature": 43.7,
    "connected": true,
    "run_count": 3
  },

  "events": [
    "HEADING_CHANGE"
  ],

  "diagnostics": {
    "imu_status": "OK",
    "gnss_status": "OK",
    "crc_ok": true,
    "faults": []
  }
}
```

---

## 3. Signal Definitions & Engineering Units

| Field | Type | Units | Description | Expected Range |
| :--- | :--- | :--- | :--- | :--- |
| `sequence` | `uint32` | count | Monotonically increasing packet counter | `0 – 4,294,967,295` |
| `timestamp` | `uint64` | ms | Unix epoch timestamp | Epoch ms |
| `elapsed_s` | `float` | seconds | Time elapsed since session initialization | `0.0 – 86400.0` |
| `gnss.lat` | `double` | degrees | Latitude (WGS 84) | `-90.0 – +90.0` |
| `gnss.lon` | `double` | degrees | Longitude (WGS 84) | `-180.0 – +180.0` |
| `gnss.alt` | `float` | metres | Altitude above mean sea level | `-100 – +10000` |
| `gnss.speed` | `float` | km/h | Ground speed | `0.0 – 300.0` |
| `gnss.heading` | `float` | degrees | Course over ground (0° = North, clockwise) | `0.0 – 360.0` |
| `gnss.satellites` | `uint8` | count | Number of tracked satellites | `0 – 32` |
| `gnss.hdop` | `float` | index | Horizontal Dilution of Precision | `0.5 – 20.0` |
| `gnss.fix` | `string` | enum | Fix quality: `"NO_FIX"`, `"FIX_2D"`, `"FIX_3D"` | - |
| `imu.accel.x` | `float` | m/s² | X-axis acceleration (Longitudinal) | `-160.0 – +160.0` |
| `imu.accel.y` | `float` | m/s² | Y-axis acceleration (Lateral) | `-160.0 – +160.0` |
| `imu.accel.z` | `float` | m/s² | Z-axis acceleration (Vertical, ~9.81 m/s² rest) | `-160.0 – +160.0` |
| `imu.accel_magnitude`| `float` | m/s² | Total vector magnitude $\sqrt{a_x^2 + a_y^2 + a_z^2}$ | `0.0 – 300.0` |
| `imu.gyro.x` | `float` | °/s | Roll angular rate | `-2000 – +2000` |
| `imu.gyro.y` | `float` | °/s | Pitch angular rate | `-2000 – +2000` |
| `imu.gyro.z` | `float` | °/s | Yaw angular rate | `-2000 – +2000` |
| `imu.mag.x` | `float` | µT | Magnetic field X component | `-4800 – +4800` |
| `imu.mag.y` | `float` | µT | Magnetic field Y component | `-4800 – +4800` |
| `imu.mag.z` | `float` | µT | Magnetic field Z component | `-4800 – +4800` |
| `imu.quaternion.w` | `float` | unitless| Quaternion W scalar | `-1.0 – +1.0` |
| `imu.quaternion.x` | `float` | unitless| Quaternion X vector | `-1.0 – +1.0` |
| `imu.quaternion.y` | `float` | unitless| Quaternion Y vector | `-1.0 – +1.0` |
| `imu.quaternion.z` | `float` | unitless| Quaternion Z vector | `-1.0 – +1.0` |
| `system.battery` | `float` | % | Battery state of charge | `0.0 – 100.0` |
| `system.temperature`| `float` | °C | Main controller junction temperature | `-40 – +105` |

---

## 4. Hardware Fault & Error Detection Contract

The Workstation automatically evaluates arriving packets for anomalies:

1. **Packet Loss Detection:** If `sequence[N] - sequence[N-1] > 1`, packet loss is flagged.
2. **Out-of-Order / Duplicate:** If `sequence[N] <= sequence[N-1]`, packet duplication or re-ordering is logged.
3. **Stale Sensor Detection:** If a sensor timestamp or value remains static beyond 5× the expected update interval, the sensor state flips to `STALE`.
4. **Sensor Range Validation:** Out-of-bounds values trigger `CRITICAL` or `WARNING` sensor health alerts.
5. **CRC Check Failure:** Malformed JSON strings or corrupted payloads are dropped and increment the `invalid_packets` metric.

---

## 5. Distinction: Current Simulation vs. Future Physical Hardware

| Aspect | Current Simulation Mode | Future Physical Hardware |
| :--- | :--- | :--- |
| **Telemetry Transport** | `MockTelemetrySource` (20 Hz in-memory timer) | `RealSerialTelemetrySource` (Serial/WebSocket bridge) |
| **IMU Orientation** | Simulated AHRS complementary filter | Physical MPU-9250 / BNO055 hardware sensor fusion |
| **GNSS Position** | Synthetic circuit waypoint traversal + Gaussian noise | NMEA-0183 / UBX binary parsing from physical module |
| **Camera Feed** | Hardware standby placeholder | RTSP / MJPEG / WebRTC video stream |
| **Self-Tests** | Simulated multi-step verification sequence | Command-response hardware register checks over I2C/SPI |
