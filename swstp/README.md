# IoT Telemetry & Hardware Diagnostics Workstation (SWSTP)

> **Application Purpose:** A single engineering workstation for monitoring, visualizing, diagnosing, testing, and debugging physical IoT sensors and hardware telemetry systems.

---

## 🌟 Overview

The **SWSTP IoT Telemetry Workstation** is a high-performance, real-time web workstation designed to evaluate hardware sensor streams (Arduino/MCU, MPU-9250 IMU, GNSS/GPS, RTC Clock, System Thermal/Battery).

It uses motorsport-inspired engineering visualization principles—such as stacked uPlot traces, synchronized cursor crosshairs, dark technical styling, compact data density, and high-frequency rendering—to make complex sensor behavior immediately understandable to engineers.

---

## 🛰️ Major Workstation Views

1. **Overview:** Non-scrolling 3-column control workstation displaying sensor health status, system states, primary metrics (Speed, Altitude, Heading), GNSS position, acceleration dynamics summary, and live telemetry traces.
2. **Telemetry Analysis:** Stacked uPlot charts with customizable signal group visibility chips (Speed, Altitude, Acceleration XYZ, Gyroscope XYZ, Magnetometer XYZ, Spatial Orientation Roll/Pitch/Yaw, Heading) with a synchronized cursor sidebar and event log.
3. **Custom Telemetry Workspace:** Customizable draggable and resizable panel grid powered by `react-grid-layout`. Supports chart panels, 3D views, event logs, custom layout presets (*Stacked*, *Quad Split*, *IMU 3D Layout*), and saved views (`localStorage`).
4. **Hardware Diagnostics Center:**
   - **Sensor Health Grid:** Live status for GNSS, IMU, RTC, Camera, Comms.
   - **Transport Data Quality:** Expected Hz vs Actual Hz, Packet Loss %, Jitter (ms), Total Packets, Dropped Packets, Invalid Count.
   - **Interactive Sensor Self-Tests:** Step-by-step diagnostic test suite (`[ TEST IMU ]`, `[ TEST GNSS ]`, `[ TEST RTC ]`, `[ TEST COMMS ]`).
   - **Live Fault Injection Testing:** Interactive toggles to inject real-time failures (`IMU Disconnect`, `GNSS Loss of Fix`, `RTC Drift`, `Packet Loss 5%/20%/50%`, `Sensor Noise`, `Gyro Bias`, `Stale Freeze`) to test system detection and recovery.
5. **3D IMU View:** Real-time 3D model of the MPU-9250 breakout board using `@react-three/fiber` & `three.js`, featuring 3/4 perspective camera framing, explicit $+X$ (Red), $+Y$ (Green), $+Z$ (Blue) axis arrow indicators, configurable axis sign mapping, and 60fps quaternion rotation.
6. **Map / GNSS:** Speed-encoded historical trajectory visualization on a dark Leaflet map with live position indicator, heading vector, and satellite quality metrics.
7. **Sessions:** Logged device test runs and session records (`SESSION 027`, `RUN 003`).
8. **System:** Software transport diagnostics, packet rates, device uptime, thermal metrics, and event log.

---

## 🛠️ Technology Stack

- **Core Framework:** React 19 + Vite 8
- **Chart Engine:** uPlot 1.6 (Imperative high-frequency canvas rendering)
- **3D Engine:** Three.js + React Three Fiber 9 + Drei 10
- **Grid Layout:** react-grid-layout 2.2
- **Map Engine:** Leaflet 1.9 + React Leaflet 5
- **State Management:** Zustand 5 + Plain RingBuffer (Float64Array circular buffers)

---

## 🚀 Office PC Setup & Installation

### Prerequisites
- **Operating System:** Windows 10 / 11 (or macOS / Linux)
- **Node.js:** v18.0.0 or higher (v20+ recommended)
- **Git:** Installed and on system PATH

### Quick Start Commands

```bash
# 1. Clone the repository
git clone https://github.com/ommsr26/swstp.git

# 2. Navigate into the project directory
cd swstp

# 3. Install dependencies cleanly
npm install

# 4. Start the local development server
npm run dev
```

Open `http://localhost:5173/` in Google Chrome or Microsoft Edge.

---

## 📜 Available NPM Scripts

- `npm run dev` — Starts Vite local development server with Hot Module Replacement (HMR).
- `npm run build` — Compiles production bundle into `dist/`.
- `npm run preview` — Locally previews production build.
- `npm run lint` — Runs `oxlint` code linter.

---

## 🔌 Hardware Integration & Serial Telemetry

The application operates out-of-the-box in **Simulation Mode** via `MockTelemetrySource` (20 Hz in-memory timer) without requiring physical hardware.

To connect physical Arduino hardware:
1. Connect the MCU to your PC via USB.
2. Refer to `docs/hardware-integration.md` for step-by-step COM port setup and firmware output instructions.
3. Refer to `docs/TELEMETRY_CONTRACT.md` for the canonical JSON packet contract.

---

## 📁 Repository Structure

```
swstp/
├── docs/
│   ├── TELEMETRY_CONTRACT.md    # Formal hardware telemetry JSON contract & units
│   └── hardware-integration.md  # Step-by-step Arduino & USB serial connection guide
├── public/
│   └── hardware/                # Hardware images & reference assets
├── src/
│   ├── components/              # Navigation, TelemetryChart, IMUBoard3D, WorkspacePanel, SignalPicker
│   ├── telemetry/               # MockTelemetrySource, TelemetrySource, telemetryStore, RingBuffer, signalRegistry
│   ├── views/                   # Overview, TelemetryAnalysis, WorkspaceView, DiagnosticsView, IMUView, MapView, etc.
│   ├── App.jsx                  # Main application entry & view routing
│   └── index.css                # Master CSS design system tokens & styling
├── .gitignore                   # Git exclusion rules
├── package.json                 # Project dependencies & scripts
├── README.md                    # Workstation documentation
└── vite.config.js               # Vite bundler configuration
```
