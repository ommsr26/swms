import { TelemetrySource } from './TelemetrySource.js';
import { parseSerialLine, getParseErrorCount, resetParserSequence } from './serialParser.js';

export class RealSerialTelemetrySource extends TelemetrySource {
  constructor(baudRate = 115200) {
    super();
    this._baudRate = baudRate;
    this._port = null;
    this._reader = null;
    this._readableStreamClosed = null;
    this._lineBuffer = '';
    this._connected = false;
    this._error = null;
    this._portInfo = null;
    this._disconnectListeners = new Set();

    // Listen to physical USB removal on navigator.serial
    if (typeof window !== 'undefined' && 'serial' in navigator) {
      navigator.serial.addEventListener('disconnect', (event) => {
        if (this._port && event.target === this._port) {
          console.warn('[RealSerialTelemetrySource] Physical USB device unplugged');
          this.stop('Physical USB device unplugged');
        }
      });
    }
  }

  static isSupported() {
    return typeof window !== 'undefined' && 'serial' in navigator;
  }

  get connected() {
    return this._connected;
  }

  get baudRate() {
    return this._baudRate;
  }

  get error() {
    return this._error;
  }

  get portInfo() {
    return this._portInfo;
  }

  get parseErrorCount() {
    return getParseErrorCount();
  }

  onDisconnect(callback) {
    if (typeof callback === 'function') {
      this._disconnectListeners.add(callback);
    }
    return () => {
      this._disconnectListeners.delete(callback);
    };
  }

  /**
   * Prompts user to select an Arduino COM port and connects over Web Serial at configured baud rate.
   * MUST be triggered by an explicit user gesture (e.g. button click).
   */
  async connect() {
    if (!RealSerialTelemetrySource.isSupported()) {
      const err = new Error('Web Serial API is not supported in this browser. Please use Google Chrome or Microsoft Edge.');
      this._error = err.message;
      throw err;
    }

    try {
      this._error = null;
      // 1. Request port selection from user
      this._port = await navigator.serial.requestPort();

      try {
        this._portInfo = this._port.getInfo() || {};
      } catch {
        this._portInfo = {};
      }

      // 2. Open serial port at 115200 baud
      await this._port.open({ baudRate: this._baudRate });

      this._connected = true;
      resetParserSequence();

      // Listen for disconnect event directly on port if available
      this._port.addEventListener('disconnect', () => {
        this.stop('Serial port disconnect event');
      });

      // Start processing line stream
      this.start();
      return true;
    } catch (err) {
      this._connected = false;
      this._error = err.message || 'Failed to connect to serial port';
      this.stop(this._error);
      throw err;
    }
  }

  start() {
    if (!this._port || !this._port.readable) {
      return;
    }
    this._running = true;
    this._readLoop().catch((err) => {
      console.warn('[RealSerialTelemetrySource] Read loop exited:', err);
    });
  }

  async _readLoop() {
    const textDecoder = new TextDecoderStream();
    this._readableStreamClosed = this._port.readable.pipeTo(textDecoder.writable);
    this._reader = textDecoder.readable.getReader();

    this._lineBuffer = '';

    try {
      while (this._running) {
        const { value, done } = await this._reader.read();
        if (done) {
          console.warn('[RealSerialTelemetrySource] Reader done (stream closed)');
          break;
        }
        if (value) {
          this._lineBuffer += value;
          const lines = this._lineBuffer.split('\n');

          // Keep the last un-terminated fragment in lineBuffer
          this._lineBuffer = lines.pop();

          for (const line of lines) {
            const packet = parseSerialLine(line);
            if (packet) {
              this._emit(packet);
            }
          }
        }
      }
    } catch (err) {
      if (this._running) {
        console.error('[RealSerialTelemetrySource] Stream error:', err);
        this._error = err.message;
      }
    } finally {
      if (this._reader) {
        try {
          await this._reader.cancel();
          this._reader.releaseLock();
        } catch {
          // Ignore release lock warnings on abrupt disconnect
        }
      }
      if (this._running) {
        this.stop(this._error || 'Serial stream ended');
      }
    }
  }

  async stop(reason = null) {
    const wasConnected = this._connected || this._running;
    this._running = false;
    this._connected = false;

    if (this._reader) {
      try {
        await this._reader.cancel();
      } catch {
        // Ignore
      }
      this._reader = null;
    }

    if (this._port) {
      try {
        await this._port.close();
      } catch {
        // Ignore port close errors if disconnected physically
      }
      this._port = null;
    }

    if (wasConnected) {
      this._disconnectListeners.forEach(cb => {
        try {
          cb(reason);
        } catch (err) {
          console.error('[RealSerialTelemetrySource] Disconnect listener error:', err);
        }
      });
    }
  }
}
