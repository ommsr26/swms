/**
 * TelemetrySourceAbstraction.js — Telemetry source integration point.
 *
 * ARCHITECTURE DOCUMENTATION — NOT YET IMPLEMENTED
 * ─────────────────────────────────────────────────────────────────────────────
 * This file documents the required abstraction layer for smooth remote
 * live telemetry streaming. Currently, Admin Live Debug uses 1.5s HTTP polling.
 *
 * TARGET ARCHITECTURE:
 *
 * Both sources feed the SAME ingestPacket() path in telemetryStore.js,
 * writing directly into the TelemetryBuffers Float64Array ring buffers.
 * The canvas-based TelemetryChart.jsx and IMUBoard3D.jsx render at 60 FPS
 * via requestAnimationFrame regardless of whether the source is local or remote.
 *
 * ┌─────────────────────────────┐
 * │  TelemetrySource (interface)│
 * │  src/telemetry/TelemetrySource.js (existing)
 * │    connect()                │
 * │    disconnect()             │
 * │    onPacket(handler)        │
 * └─────────┬───────────────────┘
 *           │
 *     ┌─────┴──────────────────────────────────┐
 *     │                                         │
 * ┌───▼───────────────────┐        ┌────────────▼────────────────┐
 * │ RealSerialTelemetry   │        │ SignalRTelemetrySource       │
 * │ Source.js (existing)  │        │ (TO BE IMPLEMENTED)         │
 * │ Web Serial API        │        │ @microsoft/signalr client   │
 * │ 115200 baud           │        │ connects to /hubs/telemetry │
 * │ 20 Hz local           │        │ joins session group         │
 * │ /debug ONLY           │        │ receives broadcast packets  │
 * └───────────────────────┘        └─────────────────────────────┘
 *                                           │
 *                               ┌───────────▼───────────────────┐
 *                               │ TelemetryHub (ASP.NET Core)   │
 *                               │ /hubs/telemetry               │
 *                               │ Reads from Channel<Packet>    │
 *                               │ that telemetry ingest writes  │
 *                               │ Broadcasts to session group   │
 *                               │ at 50ms batching cadence      │
 *                               └───────────────────────────────┘
 *
 * IMPLEMENTATION PLAN FOR SignalRTelemetrySource:
 *
 *   import * as signalR from '@microsoft/signalr';
 *
 *   export class SignalRTelemetrySource extends TelemetrySource {
 *     constructor(hubUrl, sessionId) { ... }
 *
 *     async connect() {
 *       this._connection = new signalR.HubConnectionBuilder()
 *         .withUrl(hubUrl)
 *         .withAutomaticReconnect()
 *         .build();
 *
 *       this._connection.on('TelemetryPacket', (packet) => {
 *         this._onPacket?.(packet);
 *       });
 *
 *       await this._connection.start();
 *       await this._connection.invoke('JoinSession', sessionId);
 *     }
 *
 *     disconnect() {
 *       this._connection?.stop();
 *     }
 *   }
 *
 * BACKEND DEPENDENCY:
 *   The backend TelemetryHub must be implemented in the next backend milestone.
 *   Required package: Microsoft.AspNetCore.SignalR.Core
 *   Hub registration: app.MapHub<TelemetryHub>("/hubs/telemetry")
 *   Channel bridge: When TelemetryController.IngestBatch() stores packets,
 *     it should also write to a Channel<TelemetryPacket> that TelemetryHub
 *     reads and broadcasts to the joined session group.
 *
 * CURRENT STATE:
 *   Admin Telemetry view uses the existing LiveDebugPanel with 1.5s polling.
 *   Until SignalR is implemented, this remains the only remote telemetry path.
 *   The LiveDebugPanel wrapper is preserved in AdminTelemetryView.jsx.
 *
 * @module TelemetrySourceAbstraction
 */

import { TelemetrySource } from './TelemetrySource.js';
import { RealSerialTelemetrySource } from './RealSerialTelemetrySource.js';
import { SignalRTelemetrySource } from './SignalRTelemetrySource.js';

export { TelemetrySource, RealSerialTelemetrySource, SignalRTelemetrySource };

export const SIGNALR_HUB_URL =
  import.meta.env.VITE_SIGNALR_HUB_URL ||
  (import.meta.env.PROD ? 'https://solidwasteapi.scipl.info.in/hubs/telemetry' : 'http://localhost:5000/hubs/telemetry');
export const SIGNALR_STATUS = 'ACTIVE';

/**
 * Creates a telemetry source instance based on requested transport type.
 * @param {'REAL_SERIAL' | 'SIGNALR'} type
 * @param {Object} options
 * @returns {TelemetrySource}
 */
export function createTelemetrySource(type, options = {}) {
  switch (type) {
    case 'REAL_SERIAL':
      return new RealSerialTelemetrySource(options);
    case 'SIGNALR':
      return new SignalRTelemetrySource(options);
    default:
      throw new Error(`Unknown telemetry source type: ${type}`);
  }
}
