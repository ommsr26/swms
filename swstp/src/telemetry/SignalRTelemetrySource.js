import * as signalR from '@microsoft/signalr';
import { TelemetrySource } from './TelemetrySource.js';
import { ingestRemoteSignalRPacket, useTelemetryStore } from './telemetryStore.js';

const DEFAULT_HUB_URL =
  import.meta.env.VITE_SIGNALR_HUB_URL ||
  (import.meta.env.PROD ? 'https://solidwasteapi.scipl.info.in/hubs/telemetry' : 'http://localhost:5000/hubs/telemetry');

/**
 * SignalRTelemetrySource — Real-time telemetry transport over SignalR WebSockets.
 * Connects to /hubs/telemetry and subscribes to session or fleet updates.
 *
 * Multiplexed connection management: Reuses an active HubConnection instance
 * across multiple views to prevent connection exhaustion.
 */
class SignalRConnectionManager {
  constructor() {
    this.connection = null;
    this.connectionPromise = null;
    this.subscribedSessions = new Set();
    this.subscribedFleets = new Set();
    this.reconnectedCallbacks = new Set();
  }

  async getConnection(hubUrl = DEFAULT_HUB_URL) {
    if (this.connection && this.connection.state === signalR.HubConnectionState.Connected) {
      return this.connection;
    }

    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    const fullUrl = hubUrl.startsWith('http') ? hubUrl : `${window.location.origin}${hubUrl}`;

    this.connection = new signalR.HubConnectionBuilder()
      .withUrl(fullUrl, {
        transport: signalR.HttpTransportType.WebSockets | signalR.HttpTransportType.LongPolling,
        withCredentials: true,
      })
      .withAutomaticReconnect([0, 1000, 2000, 5000, 10000])
      .configureLogging(signalR.LogLevel.Warning)
      .build();

    this.connection.onreconnecting((error) => {
      console.warn('[SignalRTelemetrySource] Reconnecting to TelemetryHub:', error);
      useTelemetryStore.setState((s) => ({
        sensorStatus: { ...s.sensorStatus, serial: 'RECONNECTING' },
      }));
    });

    this.connection.onreconnected(async (connectionId) => {
      console.log('[SignalRTelemetrySource] Reconnected to TelemetryHub. ConnectionId:', connectionId);
      useTelemetryStore.setState((s) => ({
        sensorStatus: { ...s.sensorStatus, serial: 'CONNECTED' },
      }));
      // Resubscribe active subscriptions
      for (const sessionId of this.subscribedSessions) {
        try {
          await this.connection.invoke('SubscribeToSession', sessionId);
        } catch (e) {
          console.warn(`[SignalRTelemetrySource] Failed to resubscribe session ${sessionId}:`, e);
        }
      }
      for (const ulbId of this.subscribedFleets) {
        try {
          await this.connection.invoke('SubscribeToFleet', ulbId);
        } catch (e) {
          console.warn(`[SignalRTelemetrySource] Failed to resubscribe fleet ${ulbId}:`, e);
        }
      }
      // Notify active views to perform snapshot reconciliation
      for (const cb of this.reconnectedCallbacks) {
        try {
          cb();
        } catch (err) {
          console.warn('[SignalRTelemetrySource] Reconnected callback error:', err);
        }
      }
    });

    this.connection.onclose((error) => {
      console.warn('[SignalRTelemetrySource] Disconnected from TelemetryHub:', error);
      useTelemetryStore.setState((s) => ({
        sensorStatus: { ...s.sensorStatus, serial: 'DISCONNECTED' },
      }));
      this.connectionPromise = null;
    });

    this.connectionPromise = this.connection
      .start()
      .then(() => {
        console.log('[SignalRTelemetrySource] Connected to TelemetryHub at', fullUrl);
        return this.connection;
      })
      .catch((err) => {
        console.warn('[SignalRTelemetrySource] Connection start failed:', err.message);
        this.connectionPromise = null;
        throw err;
      });

    return this.connectionPromise;
  }
}

const g_connectionManager = new SignalRConnectionManager();

/**
 * Subscribes a callback to realtime fleet location updates over SignalR for an Urban Local Body.
 * @param {string} ulbId - The ULB ID (e.g. 'ULB_MH_AMRAVATI')
 * @param {function(object): void} onTruckUpdated - Callback receiving LiveTruckStateDto
 * @param {function(): void} [onReconnected] - Optional callback triggered after successful reconnection
 * @returns {Promise<function(): void>} Unsubscribe cleanup function
 */
export async function subscribeToFleetRealtime(ulbId, onTruckUpdated, onReconnected) {
  try {
    const connection = await g_connectionManager.getConnection();
    const effectiveUlb = ulbId || 'ULB_MH_AMRAVATI';

    g_connectionManager.subscribedFleets.add(effectiveUlb);
    if (onReconnected) {
      g_connectionManager.reconnectedCallbacks.add(onReconnected);
    }

    try {
      await connection.invoke('SubscribeToFleet', effectiveUlb);
      console.log(`[SignalR Fleet] Subscribed to fleet:${effectiveUlb}`);
    } catch (e) {
      console.warn(`[SignalR Fleet] Failed to invoke SubscribeToFleet for ${effectiveUlb}:`, e.message);
    }

    const handler = (truck) => {
      if (onTruckUpdated && truck) {
        onTruckUpdated(truck);
      }
    };

    connection.on('TruckLocationUpdated', handler);

    return () => {
      connection.off('TruckLocationUpdated', handler);
      g_connectionManager.subscribedFleets.delete(effectiveUlb);
      if (onReconnected) {
        g_connectionManager.reconnectedCallbacks.delete(onReconnected);
      }
      if (connection.state === signalR.HubConnectionState.Connected) {
        connection.invoke('UnsubscribeFromFleet', effectiveUlb).catch(() => {});
      }
    };
  } catch (err) {
    console.warn('[SignalR Fleet] Connection error in subscribeToFleetRealtime:', err.message);
    return () => {};
  }
}

/**
 * Subscribes to real-time operational alerts (AlertRaised, AlertResolved) over SignalR.
 */
export async function subscribeToAlertsRealtime(ulbId, onAlertRaised, onAlertResolved) {
  try {
    const connection = await g_connectionManager.getConnection();
    const effectiveUlb = ulbId || 'ULB_MH_AMRAVATI';

    g_connectionManager.subscribedFleets.add(effectiveUlb);

    try {
      await connection.invoke('SubscribeToFleet', effectiveUlb);
    } catch (e) {
      console.warn(`[SignalR Alerts] SubscribeToFleet error:`, e.message);
    }

    const raisedHandler = (alert) => {
      if (onAlertRaised && alert) onAlertRaised(alert);
    };

    const resolvedHandler = (res) => {
      if (onAlertResolved && res) onAlertResolved(res);
    };

    connection.on('AlertRaised', raisedHandler);
    connection.on('AlertResolved', resolvedHandler);

    return () => {
      connection.off('AlertRaised', raisedHandler);
      connection.off('AlertResolved', resolvedHandler);
    };
  } catch (err) {
    console.warn('[SignalR Alerts] Connection error:', err.message);
    return () => {};
  }
}

export class SignalRTelemetrySource extends TelemetrySource {
  /**
   * @param {Object} options
   * @param {number|string} [options.sessionId] - Session ID to subscribe to.
   * @param {string} [options.ulbId] - Optional ULB ID for fleet subscriptions.
   * @param {string} [options.hubUrl] - Hub URL (default: '/hubs/telemetry').
   */
  constructor({ sessionId = null, ulbId = null, hubUrl = DEFAULT_HUB_URL } = {}) {
    super();
    this._sessionId = sessionId ? Number(sessionId) : null;
    this._ulbId = ulbId;
    this._hubUrl = hubUrl;
    this._connection = null;
    this._sessionStartTime = Date.now();
    this._telemetryHandler = null;
  }

  async start() {
    if (this._running) return;
    this._running = true;

    try {
      this._connection = await g_connectionManager.getConnection(this._hubUrl);

      // Register TelemetryUpdate handler if not registered
      if (!this._telemetryHandler) {
        this._telemetryHandler = (update) => {
          if (!this._running) return;
          if (this._sessionId && update.sessionId !== this._sessionId) return;

          const packet = this._transformUpdateToPacket(update);
          this._emit(packet);
          ingestRemoteSignalRPacket(packet);
        };
        this._connection.on('TelemetryUpdate', this._telemetryHandler);
      }

      // Subscribe to session group
      if (this._sessionId) {
        g_connectionManager.subscribedSessions.add(this._sessionId);
        await this._connection.invoke('SubscribeToSession', this._sessionId);
        console.log(`[SignalRTelemetrySource] Subscribed to session:${this._sessionId}`);
      }

      // Subscribe to fleet group if provided
      if (this._ulbId) {
        g_connectionManager.subscribedFleets.add(this._ulbId);
        await this._connection.invoke('SubscribeToFleet', this._ulbId);
        console.log(`[SignalRTelemetrySource] Subscribed to fleet:${this._ulbId}`);
      }

      useTelemetryStore.setState({
        sourceType: 'SIGNALR',
        serialConnected: true,
        sessionId: this._sessionId ? String(this._sessionId) : null,
      });
    } catch (err) {
      console.warn('[SignalRTelemetrySource] Start error:', err.message);
      this._running = false;
    }
  }

  async setSessionId(newSessionId) {
    const numericId = newSessionId ? Number(newSessionId) : null;
    if (this._sessionId === numericId) return;

    if (this._connection && this._connection.state === signalR.HubConnectionState.Connected) {
      if (this._sessionId) {
        g_connectionManager.subscribedSessions.delete(this._sessionId);
        try {
          await this._connection.invoke('UnsubscribeFromSession', this._sessionId);
        } catch {}
      }
      this._sessionId = numericId;
      if (this._sessionId) {
        g_connectionManager.subscribedSessions.add(this._sessionId);
        try {
          await this._connection.invoke('SubscribeToSession', this._sessionId);
        } catch {}
      }
    } else {
      this._sessionId = numericId;
    }
  }

  async stop() {
    this._running = false;
    if (this._connection && this._connection.state === signalR.HubConnectionState.Connected) {
      if (this._telemetryHandler) {
        this._connection.off('TelemetryUpdate', this._telemetryHandler);
        this._telemetryHandler = null;
      }
      if (this._sessionId) {
        g_connectionManager.subscribedSessions.delete(this._sessionId);
        try {
          await this._connection.invoke('UnsubscribeFromSession', this._sessionId);
        } catch {}
      }
      if (this._ulbId) {
        g_connectionManager.subscribedFleets.delete(this._ulbId);
        try {
          await this._connection.invoke('UnsubscribeFromFleet', this._ulbId);
        } catch {}
      }
    }
  }

  _transformUpdateToPacket(update) {
    const elapsedSec = (Date.now() - this._sessionStartTime) / 1000;
    const g = update.gnss || {};
    const imu = update.imu || {};
    const motion = update.fusedMotion || {};

    return {
      t: parseFloat(elapsedSec.toFixed(2)),
      ts: Date.now(),
      timestamp: Date.now(),
      sequence: update.sequence ?? 0,
      device_id: update.deviceId || 'SIGNALR_GATEWAY',
      gnss: {
        valid: g.fixValid ?? false,
        lat: g.latitude,
        lon: g.longitude,
        alt: g.altitudeM,
        speed: g.speedKmh ?? motion.fusedSpeedKmh ?? 0,
        heading: g.headingDeg,
        satellites: g.satellites,
        hdop: g.hdop,
        fix: g.fixStatus || (g.fixValid ? 'FIX_3D' : 'NO_FIX'),
        status: g.fixStatus || (g.fixValid ? 'FIX' : 'NO DATA'),
        data_received: g.latitude != null && g.longitude != null,
      },
      imu: {
        valid: imu.accelX != null || imu.roll != null,
        accel: {
          x: imu.accelX,
          y: imu.accelY,
          z: imu.accelZ,
        },
        accel_magnitude: imu.accelMagnitude,
        gyro: {
          x: imu.gyroX,
          y: imu.gyroY,
          z: imu.gyroZ,
        },
        mag: {
          x: null,
          y: null,
          z: null,
        },
        orientation: {
          roll: imu.roll,
          pitch: imu.pitch,
          yaw: imu.yaw,
        },
      },
      fusedMotion: {
        fusedSpeedKmh: motion.fusedSpeedKmh,
        source: motion.source,
        confidence: motion.confidence,
        isReliable: motion.isReliable,
      },
      rtc: {
        synced: true,
        iso: new Date().toISOString(),
        epoch: Date.now(),
      },
      system: {
        connected: true,
        source: 'SIGNALR',
        uptime: elapsedSec,
      },
      events: [],
    };
  }
}
