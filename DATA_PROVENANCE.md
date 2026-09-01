# SWSTP — Data Provenance & Authoritative Lineage Specification

This document maps every operational field, UI view, and user interaction in the SWSTP platform to its exact authoritative source: Frontend API $\rightarrow$ Backend HTTP Controller Endpoint $\rightarrow$ Domain/Operational Service $\rightarrow$ Authoritative SQL Server Database Table / Web Serial Ingestion Pipeline.

**Authoritative Database:**
- **Server:** `192.168.1.8`
- **Database:** `Solid_Waste`
- **Dialect:** Microsoft SQL Server with NetTopologySuite spatial extensions

---

## 1. Zero-Mock & Provenance Architecture Matrix

| View / Component | UI Field / Element | Frontend API Client | Backend Route / Hub | Application Service | Database Table / Hardware Ingestion | Disconnected / Empty Fallback |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Global Header** | Mode Indicator | `useTelemetryStore.mode` | — (Web Serial State) | `RealSerialTelemetrySource.js` | Web Serial Port (115200 Baud) | `STANDBY` / `DISCONNECTED` |
| **Global Header** | Connected Device | `useTelemetryStore.deviceId` | `/api/sessions/start-hardware-session` | `TelemetrySessionService` | `DeviceRegistry.DeviceCode` | `—` |
| **Global Header** | Assigned Vehicle | `useTelemetryStore.vehicleRegistrationNumber` | `/api/sessions/start-hardware-session` | `TelemetrySessionService` | `VehicleRegistry.VehicleRegistrationNumber` | `—` |
| **Global Header** | API Server Health | `fetchHealth()` | `GET /api/health` | `HealthController` | SQL Server `SELECT 1` | `DEGRADED` / `UNHEALTHY` |
| **Admin Overview** (`/admin/overview`) | ULBs Count | `fetchAdminUlbs()` | `GET /api/admin/ulbs` | `AdminController` | `UlbRegistry` | `0` |
| **Admin Overview** (`/admin/overview`) | Fleet Vehicle Total | `fetchAdminUlbs()` | `GET /api/admin/ulbs` | `AdminController` | `VehicleRegistry` | `0` |
| **Admin Overview** (`/admin/overview`) | Registered Devices | `fetchAdminDevices()` | `GET /api/admin/devices` | `AdminController` | `DeviceRegistry` | `0` |
| **Admin Overview** (`/admin/overview`) | Live Fleet Count | `fetchAdminFleetLive()` | `GET /api/admin/fleet/live` | `AdminController` | `VehicleRegistry` + `TelemetrySessions` (Active $\le$ 15s) | `0` |
| **Admin Overview** (`/admin/overview`) | Fleet Map Markers | `fetchAdminFleetLive()` | `GET /api/admin/fleet/live` | `AdminController` | `GnssSamples` (Latest valid fix) | Map centered on ULB boundary |
| **Admin Fleet** (`/admin/fleet`) | Vehicle Table | `fetchAdminFleet()` | `GET /api/admin/fleet?ulbId={ulb}` | `AdminController` | `VehicleRegistry` $\bowtie$ `[DeviceVehicleAssignment]` | `No vehicles registered.` |
| **Admin Devices** (`/admin/devices`) | Device Table | `fetchAdminDevices()` | `GET /api/admin/devices` | `AdminController` | `DeviceRegistry` $\bowtie$ `[DeviceVehicleAssignment]` | `No devices registered.` |
| **Admin Sessions** (`/admin/sessions`) | Operational Sessions | `fetchAdminOperationalSessions()` | `GET /api/admin/operational-sessions` | `IOperationalSessionService` | `OperationalSessions` $\bowtie$ `StateDefinitions` | `No operational sessions found.` |
| **Admin Audit** (`/admin/audit`) | Audit Events Ledger | `fetchAdminAuditLogs()` | `GET /api/admin/audit` | `IAuditService` | `AuditLogs` (Immutable append-only ledger) | `No audit logs recorded.` |
| **Admin System** (`/admin/system`) | State Definitions Catalog | `fetchAdminStateDefinitions()` | `GET /api/admin/system/state-definitions` | `IStateDefinitionResolver` | `StateDefinitions` (19 core state definitions) | Empty catalog |
| **Officer Overview** (`/officer/overview`) | Active Sessions Sidebar | `fetchAdminFleetLive(ulbId)` | `GET /api/admin/fleet/live?ulbId={ulb}` | `AdminController` | `OperationalSessions` $\bowtie$ `VehicleRegistry` | `No active sessions.` |
| **Officer Overview** (`/officer/overview`) | Fleet Location & Speed | `fetchAdminFleetLive(ulbId)` | `GET /api/admin/fleet/live?ulbId={ulb}` | `AdminController` | `GnssSamples.SpeedKmh` / `VehicleRegistry` | `◌ NO GNSS FIX` / `—` |
| **Officer Fleet** (`/officer/fleet`) | ULB Vehicle Cards | `fetchAdminFleet(ulbId)` | `GET /api/admin/fleet?ulbId={ulb}` | `AdminController` | `VehicleRegistry` (Filtered by `UlbId`) | `No vehicles found for ULB.` |
| **Officer Sessions** (`/officer/sessions`) | Session Cards & Status | `fetchOfficerSessions(ulbId)` | `GET /api/officer/sessions?ulbId={ulb}` | `IOperationalSessionService` | `OperationalSessions` $\bowtie$ `SessionRoadAssignments` | `No sessions created.` |
| **Officer Creation Modal** | Available ULB Vehicles | `fetchOfficerVehicles(ulbId)` | `GET /api/officer/vehicles?ulbId={ulb}` | `AdminController` | `VehicleRegistry` (`IsActiveReservation = 0`) | `No available vehicles.` |
| **Officer Creation Modal** | Assigned Roads & Segments | `fetchOfficerRoads(ulbId)` | `GET /api/officer/roads?ulbId={ulb}` | `IRoadAssignmentService` | `Roads` $\bowtie$ `RoadGeometryVersions` $\bowtie$ `RoadSegments` | `No roads found.` |
| **Officer Creation Modal** | Road Trim Percentage | `CreateSessionModal.jsx` | `POST /api/officer/sessions` | `IRoadAssignmentService.TrimGeometry()` | Metric substring along LineString in projected CRS | Full segment geometry |
| **Officer Session Drawer** | Real-time Proximity | `fetchOfficerSessionLiveStatus()` | `GET /api/officer/sessions/{id}/live-status` | `IProximityService` | Metric distance to `AssignedGeometry` (NTS CRS) | `OUT_OF_BOUNDS (>100m)` / `—` |
| **Officer Session Drawer** | Fused Speed Metric | `fetchOfficerSessionLiveStatus()` | `GET /api/officer/sessions/{id}/live-status` | `ISpeedFusionService` | Fused GNSS/IMU sensor speed ($\le 5.0\text{ km/h}$) | `0.0 km/h (No data)` |
| **Officer Session Drawer** | Coverage Percent | `fetchOfficerSessionLiveStatus()` | `GET /api/officer/sessions/{id}/live-status` | `ICoverageService` | $\frac{\text{Length}(\text{Assigned} \cap \text{Buffer})}{\text{Length}(\text{Assigned})} \times 100$ | `0.0%` |
| **Officer Coverage** (`/officer/coverage`) | Road Buffer Layers | `fetchOfficerSessionCoverage()` | `GET /api/officer/sessions/{id}/coverage-status` | `ICoverageService` | 100m metric buffer polygon in UTM CRS (NTS) | `NO COVERAGE DATA` |
| **Officer Evidence** (`/officer/evidence`) | Collection Events | `fetchOfficerCollectionEvents()` | `GET /api/officer/sessions/{id}/collection-events` | `ICollectionEventService` | `CollectionEvents` (CapturedAt RTC vs ReceivedAt) | `0 events recorded.` |
| **Officer Evidence** (`/officer/evidence`) | Evidence Image Metadata | `fetchOfficerEvidenceImages()` | `GET /api/officer/collection-events/{id}/images` | `IEvidenceService` | `EvidenceImages` (SHA-256 + 21-day auto-retention) | `No images for event.` |
| **Officer Cameras** (`/officer/cameras`) | Live JPEG Snapshot | `CameraViewer.jsx` | `GET /api/camera/{deviceId}/latest?ulbId={ulb}` | `CameraController` | Device frame store / RPi edge feed | `WAITING FOR FRAME` |
| **Diagnostics / Hardware** (`/debug`) | Raw Web Serial Packets | `RealSerialTelemetrySource.js` | Web Serial Port (115200 Baud) | Web Serial Stream Parser | Raw NMEA sentences (`$GPRMC`, `$GPGGA`, `$PSMD`) | `WAITING FOR PACKETS` |

---

## 2. Ingestion & Persistence Pipelines

### A. Raw Continuous Telemetry Pipeline
1. **Edge Hardware:** ESP32 / Arduino transmitting NMEA 0183 & IMU sentences over UART @ 115200 baud.
2. **Browser Ingestion:** `RealSerialTelemetrySource.js` parses ASCII sentences into typed packets (`gnss`, `imu`, `rtc`, `system`, `diagnostics`).
3. **Store Dispatch:** `telemetryStore.js` updates high-frequency ring buffers (1200 samples/channel) and updates UI subscribers at 20 Hz.
4. **Backend Ingestion:** `telemetryStore.js` batches raw telemetry packets into HTTP batches posted to `POST /api/telemetry/batch`.
5. **Database Commit:** `TelemetryController` persists into `TelemetryPackets`, `GnssSamples`, `ImuSamples`, and `GnssSatelliteObservations`.

### B. Operational Session & State Machine Pipeline
1. **Session Provisioning:** Officer selects ULB vehicle and assigned roads, trims geometry, sets `ScheduledStartAt`.
2. **Scheduled Insertion:** `IOperationalSessionService.CreateSessionAsync()` inserts session into `OperationalSessions` with state `SCHEDULED` (`StatusStateDefinitionId = 15`), preserving vehicle reservation (`IsActiveReservation = false`).
3. **Background Activation:** `SessionActivationService` runs every 2.0s, queries scheduled sessions where `ScheduledStartAt <= UtcNow`, executes `ActivateScheduledSessionsAsync()`, transitions status to `ACTIVE` (`StatusStateDefinitionId = 16`), and sets `IsActiveReservation = true`.
4. **Manual Controls:** Officer actions (`Pause`, `Resume`, `Complete`, `Abort`, `Cancel`) invoke `IOperationalSessionService`, transitioning state definitions, writing audit trails into `AuditLogs`, and recording transition history in `EntityStateTransitions`.

### C. Motion & Collection Evidence Pipeline
1. **Proximity & Arming Rule:** Edge GNSS/IMU data is evaluated against `OperationalConstants`:
   - Vehicle fused speed $\le 5.0\text{ km/h}$ (`ISpeedFusionService`).
   - Vehicle distance to assigned road $\le 100.0\text{ m}$ (`IProximityService`).
2. **Trigger Detection:** Rear-trolley ROI optical motion confidence $\ge 0.60$ triggers a solid waste collection event.
3. **Event Recording:** `CollectionEventService.RecordCollectionEventAsync()` records dual timestamps (`CapturedAt` edge RTC vs `ReceivedAt` server ingestion), calculates metric road distance via projected coordinate system, and marks covered road length in `CoverageService`.
4. **Evidence Archival:** `IEvidenceService.StoreEvidenceAsync()` persists JPEG snapshot to disk, computes SHA-256 hash, and sets `ExpiresAt = UtcNow + 21 days`.
5. **Retention Cleanup:** `RetentionCleanupService` runs in the background, deleting expired evidence images older than 21 days while preserving municipal audit metadata for 6 months.

---

## 3. Spatial Coordinate Reference System (CRS) Lineage

All distance, proximity, buffer, and length operations are strictly calculated in metric projected coordinate systems matching the operational ULB:

| ULB Identifier | Municipal Corporation | Longitude / Latitude | Authoritative Projected CRS | SRID | Unit |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `ULB_MH_AMRAVATI` | Amravati Municipal Corporation | $77.7796^\circ\text{ E}, 20.9374^\circ\text{ N}$ | UTM Zone 43N / WGS 84 | **EPSG:32643** | Metre (m) |
| `ULB_MH_NAGPUR` | Nagpur Municipal Corporation | $79.0882^\circ\text{ E}, 21.1458^\circ\text{ N}$ | UTM Zone 44N / WGS 84 | **EPSG:32644** | Metre (m) |
| `ULB_MH_PUNE` | Pune Municipal Corporation | $73.8567^\circ\text{ E}, 18.5204^\circ\text{ N}$ | UTM Zone 43N / WGS 84 | **EPSG:32643** | Metre (m) |
| *Unconfigured ULB* | — | — | *None (Fails explicitly)* | — | — |

---

## 4. Verification Checklist & Compliance

- [x] **Zero Synthetic Mock Data:** No synthetic objects or randomized coordinate generators exist in the codebase.
- [x] **Authoritative Database:** All displayed entities map directly to `192.168.1.8 / Solid_Waste`.
- [x] **Hardware Disconnection Truth:** When ESP32 hardware is disconnected, all sensor widgets display `NO DATA`, `NO FIX`, `STANDBY`, or `—`.
- [x] **Test Fixture Isolation:** All 56 integration tests run against isolated test lifecycles with automated cleanup via `DatabaseTestCollectionFixture`.
- [x] **56/56 Tests Passing:** All unit and integration test suites pass with 0 failures.
