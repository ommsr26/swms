/**
 * useHardwareConnection.js
 *
 * Shared React hook encapsulating the full Web Serial → telemetry pipeline:
 *   RealSerialTelemetrySource → ingestPacket() → startHardwareSession()
 *   → sendTelemetryBatch() (via telemetryStore's scheduled flush)
 *
 * Both DebugLayout (/debug) and HardwareConnectView (/hardware-connect) use
 * this hook. Each consumer gets its own RealSerialTelemetrySource instance
 * (created on mount, destroyed on unmount) — the two routes are never mounted
 * simultaneously in the BrowserRouter, so there is no shared-instance conflict.
 *
 * The hook does NOT modify RealSerialTelemetrySource — it only orchestrates it.
 *
 * Exports:
 *   connect()       — prompts user to select a COM port (user-gesture required)
 *   disconnect()    — stops serial source, resets session state
 *   tryAutoConnect()— checks navigator.serial.getPorts() for previously-
 *                     authorized ports and silently reconnects (no user gesture)
 *   serialSource    — the underlying RealSerialTelemetrySource instance (for
 *                     use in window.__telemetrySource if needed)
 */
import { useRef, useCallback, useEffect } from 'react';
import { RealSerialTelemetrySource } from './RealSerialTelemetrySource.js';
import { resetParserSequence } from './serialParser.js';
import { useTelemetryStore, ingestPacket, resetSession, resetSerialDisconnect } from './telemetryStore.js';

export function useHardwareConnection() {
  // Each hook consumer gets its own source instance. Since /debug and
  // /hardware-connect are never simultaneously mounted, there is no conflict.
  const sourceRef = useRef(null);

  function _getOrCreateSource() {
    if (!sourceRef.current) {
      sourceRef.current = new RealSerialTelemetrySource(115200);
    }
    return sourceRef.current;
  }

  function _wireSource(source) {
    source.onPacket((packet) => {
      ingestPacket(packet);
    });
    source.onDisconnect((reason) => {
      console.warn('[useHardwareConnection] Serial disconnected:', reason);
      resetSerialDisconnect(reason);
    });
  }

  /**
   * connect() — prompts the user via navigator.serial.requestPort().
   * MUST be called from a user-gesture handler (button click).
   * Returns true on success, false on failure.
   */
  const connect = useCallback(async () => {
    if (!RealSerialTelemetrySource.isSupported()) {
      const errorMsg = 'Web Serial API requires Google Chrome or Microsoft Edge.';
      useTelemetryStore.getState().setSerialState(false, errorMsg);
      alert(errorMsg);
      return false;
    }

    const source = _getOrCreateSource();

    try {
      await source.connect();
      _wireSource(source);
      useTelemetryStore.getState().setSourceType('REAL_SERIAL');
      useTelemetryStore.getState().setSerialState(true, null);
      return true;
    } catch (err) {
      console.error('[useHardwareConnection] Serial connection failed:', err);
      resetSerialDisconnect(err.message);
      useTelemetryStore.getState().setSourceType('REAL_SERIAL');
      return false;
    }
  }, []);

  /**
   * tryAutoConnect() — silently reconnects to a previously-authorized port.
   * Safe to call from useEffect on mount (no user gesture required).
   * Returns true if auto-connect succeeded, false otherwise.
   */
  const tryAutoConnect = useCallback(async () => {
    if (!RealSerialTelemetrySource.isSupported()) return false;

    try {
      const ports = await navigator.serial.getPorts();
      if (!ports || ports.length === 0) return false;

      const source = _getOrCreateSource();
      if (source._connected) return true;

      // Find matching Arduino/serial port
      const port = ports[0];
      source._port = port;
      try {
        source._portInfo = port.getInfo() || {};
      } catch {
        source._portInfo = {};
      }

      // If port is already opened/readable, skip opening again
      if (!port.readable) {
        await port.open({ baudRate: 115200 });
      }
      source._connected = true;

      resetParserSequence();

      port.addEventListener('disconnect', () => {
        source.stop('Serial port disconnect event');
      });

      source.start();
      _wireSource(source);

      useTelemetryStore.getState().setSourceType('REAL_SERIAL');
      useTelemetryStore.getState().setSerialState(true, null);
      console.log('[useHardwareConnection] Auto-reconnected to authorized serial port.');
      return true;
    } catch (err) {
      console.warn('[useHardwareConnection] Auto-connect note:', err.message);
      return false;
    }
  }, []);

  // Listen for USB device connection events
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serial' in navigator)) return;

    const handleConnectEvent = () => {
      console.log('[useHardwareConnection] Serial device connected to USB. Attempting auto-connect...');
      tryAutoConnect();
    };

    navigator.serial.addEventListener('connect', handleConnectEvent);
    return () => {
      navigator.serial.removeEventListener('connect', handleConnectEvent);
    };
  }, [tryAutoConnect]);

  /**
   * disconnect() — stops serial source, flushes and resets session state.
   */
  const disconnect = useCallback(() => {
    if (sourceRef.current) {
      sourceRef.current.stop();
      sourceRef.current = null;
    }
    resetSession();
    useTelemetryStore.getState().setSerialState(false, 'Hardware Disconnected');
  }, []);

  return {
    connect,
    disconnect,
    tryAutoConnect,
    get serialSource() { return sourceRef.current; },
  };
}
