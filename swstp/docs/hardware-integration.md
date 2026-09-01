# Physical Hardware & Arduino Integration Guide

> **Project:** Real-Time IoT Telemetry & Hardware Diagnostics Workstation (SWSTP)  
> **Status:** Simulation Active · Hardware Serial Bridge Prepared  

---

## 1. Overview & Architecture

This application is designed as a single workstation to monitor, visualize, diagnose, and debug physical IoT hardware and sensors (Arduino MCU, MPU-9250 IMU, GNSS module, RTC clock, Camera).

During initial software development, the application operates in **Simulation Mode** via `MockTelemetrySource` (20 Hz in-memory timer).

When physical hardware is connected, the telemetry transport switches to `RealSerialTelemetrySource` via a lightweight PC serial bridge.

```
┌─────────────────┐       ┌─────────────────┐       ┌───────────────────────┐       ┌────────────────────────┐
│ Physical Sensor │ ────> │ MCU / Arduino   │ ────> │ USB Serial (COM Port) │ ────> │ Serial WebSocket Bridge│
│ (IMU, GNSS, RTC)│       │ Firmware (JSON) │       │ 115200 Baud           │       │ (Node / Python)        │
└─────────────────┘       └─────────────────┘       └───────────────────────┘       └────────────────────────┘
                                                                                                │
                                                                                                ▼ (WebSocket / Web Serial)
┌────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                       IoT Telemetry Workstation (React / uPlot / R3F)                                   │
│  [ Overview ]  [ Telemetry Analysis ]  [ Custom Workspace ]  [ Diagnostics ]  [ 3D IMU ]  [ GNSS Trajectory ]          │
└────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Step-by-Step Hardware Integration Procedure

### Step 1: Connect Arduino Hardware
1. Connect the physical Arduino/MCU board to the office PC using a USB cable.
2. Open **Device Manager** on Windows (`Win + X` → `Device Manager`).
3. Expand **Ports (COM & LPT)** to identify the COM port assigned to the microcontroller (e.g., `COM3`, `COM4`).
4. If required by your microcontroller (e.g. CH340, CP2102, FTDI), ensure standard USB-to-UART drivers are installed.

### Step 2: Firmware Verification
1. Flash your MCU with firmware configured to output JSON telemetry packets over Serial.
2. Open the **Arduino Serial Monitor** (or PuTTY / Tera Term).
3. Set the baud rate to the configured baud rate (e.g. `115200` baud).
4. Verify that single-line JSON strings matching the contract in `docs/TELEMETRY_CONTRACT.md` are printed cleanly.

Example JSON output line:
```json
{"type":"telemetry","sequence":102,"timestamp":1723481234123,"gnss":{"lat":51.5005,"lon":-0.118,"alt":28.5,"speed":64.2,"heading":182.4,"satellites":12,"hdop":0.85,"fix":"FIX_3D"},"imu":{"accel":{"x":0.12,"y":-0.04,"z":9.78},"gyro":{"x":0.02,"y":0.14,"z":-0.01},"mag":{"x":31.2,"y":-8.4,"z":42.7},"orientation":{"roll":1.2,"pitch":-2.4,"yaw":182.4},"quaternion":{"w":0.998,"x":0.01,"y":-0.021,"z":0.032},"accel_magnitude":9.78},"rtc":{"iso":"2026-08-13T00:00:00.000Z","epoch":1723481234123},"system":{"battery":94.5,"uptime":358,"temperature":43.7}}
```

### Step 3: Launching the Telemetry Transport
1. In `src/App.jsx`, replace `MockTelemetrySource` with `RealSerialTelemetrySource` (or Web Serial provider).
2. Start the workstation dev server:
   ```bash
   npm run dev
   ```
3. Open `http://localhost:5173/` in Google Chrome or Microsoft Edge.
4. Verify live telemetry updates, incoming packet rates in **Diagnostics**, 3D IMU orientation changes, and GNSS trajectory points.

---

## 3. Verification Checklist

- [ ] USB COM Port identified in Windows Device Manager.
- [ ] Serial JSON packets match canonical contract schema (`docs/TELEMETRY_CONTRACT.md`).
- [ ] Telemetry stream arrives at 20 Hz without dropped sequence numbers.
- [ ] Diagnostics page displays `IMU ACTIVE`, `GNSS FIX 3D`, `0.0% Packet Loss`.
- [ ] 3D IMU board responds accurately to physical board movement.
