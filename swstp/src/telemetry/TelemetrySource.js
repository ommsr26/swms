/**
 * TelemetrySource — Abstract base class for all telemetry providers.
 *
 * The dashboard depends only on this interface. Concrete implementations:
 *   MockTelemetrySource    — realistic vehicle simulation (current)
 *   RealSerialTelemetrySource — USB serial / WebSocket relay (future)
 *   ReplayTelemetrySource  — recorded session playback (future)
 *
 * Packet shape (conceptual — will be formalized when hardware is known):
 * {
 *   t: number,           // elapsed seconds since session start
 *   ts: number,          // Unix timestamp ms
 *   gnss: {
 *     lat, lon, alt,     // degrees, degrees, metres
 *     speed,             // km/h
 *     heading,           // degrees 0-360
 *     satellites,        // integer
 *     hdop,              // float
 *     fix,               // 'NO_FIX' | 'FIX_2D' | 'FIX_3D'
 *   },
 *   imu: {
 *     ax, ay, az,        // m/s² (raw sensor values)
 *     gx, gy, gz,        // °/s  (raw sensor values)
 *   },
 *   rtc: {
 *     iso,               // ISO 8601 string
 *     epoch,             // Unix ms
 *   },
 *   system: {
 *     battery,           // 0-100 %
 *     uptime,            // seconds
 *     temperature,       // °C (if available)
 *     connected,         // boolean
 *   },
 *   events: [],          // array of event strings fired this tick
 * }
 */
export class TelemetrySource {
  constructor() {
    if (new.target === TelemetrySource) {
      throw new Error("TelemetrySource is abstract");
    }
    this._listeners = new Set();
    this._running = false;
  }

  /** Start emitting telemetry packets. */
  start() {
    throw new Error("start() not implemented");
  }

  /** Stop emitting telemetry packets. */
  stop() {
    throw new Error("stop() not implemented");
  }

  /** Returns true if the source is currently running. */
  get running() {
    return this._running;
  }

  /**
   * Register a packet listener. Returns an unsubscribe function.
   * @param {(packet: object) => void} callback
   * @returns {() => void} unsubscribe
   */
  onPacket(callback) {
    this._listeners.add(callback);
    return () => this._listeners.delete(callback);
  }

  /** Emit a packet to all registered listeners. */
  _emit(packet) {
    this._listeners.forEach(fn => fn(packet));
  }
}
