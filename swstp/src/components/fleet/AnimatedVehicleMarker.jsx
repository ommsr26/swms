/**
 * AnimatedVehicleMarker.jsx — Smooth real-time 3D truck marker for Leaflet maps.
 *
 * Implements:
 * - Time-based linear interpolation of latitude/longitude.
 * - Shortest-path angular heading interpolation (350° -> 10° rotates +20° clockwise).
 * - Direct Leaflet marker position & CSS transform updates (0 React re-renders during animation).
 * - Large jump detection with immediate position snapping.
 * - Stationary detection (avoids jitter when truck speed ≈ 0).
 * - Clean cleanup on unmount or disconnect.
 */
import { useEffect, useRef } from 'react';
import { Marker } from 'react-leaflet';
import { createFleetIcon, createOfflineFleetIcon } from './VehicleMarker.jsx';
import { haversineDistanceMeters, interpolateHeading } from './markerInterpolation.js';

export { haversineDistanceMeters, interpolateHeading };

export default function AnimatedVehicleMarker({
  position, // [lat, lon]
  heading = 0,
  speed = 0,
  color = '#00d9ff',
  isLive = true,
  isSelected = false,
  eventHandlers = {},
  children,
}) {
  const markerRef = useRef(null);

  const targetLat = position ? position[0] : null;
  const targetLon = position ? position[1] : null;
  const targetHeading = heading ?? 0;

  const anim = useRef({
    currentLat: targetLat,
    currentLon: targetLon,
    currentHeading: targetHeading,
    startLat: targetLat,
    startLon: targetLon,
    startHeading: targetHeading,
    targetLat: targetLat,
    targetLon: targetLon,
    targetHeading: targetHeading,
    startTime: 0,
    duration: 1000,
    lastUpdateTs: 0,
    animFrameId: null,
    isAnimating: false,
  });

  // Track target position changes and drive the animation loop
  useEffect(() => {
    if (targetLat == null || targetLon == null) return;

    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const st = anim.current;

    // First fix / uninitialized: snap directly
    if (st.currentLat == null || st.currentLon == null) {
      st.currentLat = targetLat;
      st.currentLon = targetLon;
      st.currentHeading = targetHeading;
      st.startLat = targetLat;
      st.startLon = targetLon;
      st.startHeading = targetHeading;
      st.targetLat = targetLat;
      st.targetLon = targetLon;
      st.targetHeading = targetHeading;
      st.lastUpdateTs = now;
      if (markerRef.current) {
        markerRef.current.setLatLng([targetLat, targetLon]);
        updateIconRotation(markerRef.current, targetHeading);
      }
      return;
    }

    const deltaT = st.lastUpdateTs > 0 ? now - st.lastUpdateTs : 1000;
    st.lastUpdateTs = now;

    const dist = haversineDistanceMeters(st.currentLat, st.currentLon, targetLat, targetLon);

    // Stationary check: ignore sub-meter noise when stationary
    if (dist < 0.25 && Math.abs(speed || 0) < 0.5) {
      st.targetLat = targetLat;
      st.targetLon = targetLon;
      st.targetHeading = targetHeading;
      return;
    }

    // Large jump or restart check: snap immediately without dragging or spinning across the street
    const isRestartOrStale = deltaT > 2500 && dist > 10.0;
    const maxVelocityMs = Math.max(70, (speed || 0) * 1.5) / 3.6;
    const maxAllowedDist = Math.max(30.0, maxVelocityMs * (deltaT / 1000) * 1.5);

    if (dist > 40.0 || isRestartOrStale || dist > maxAllowedDist) {
      // Snap immediately without dragging or spinning across the map
      st.currentLat = targetLat;
      st.currentLon = targetLon;
      st.currentHeading = targetHeading;
      st.startLat = targetLat;
      st.startLon = targetLon;
      st.startHeading = targetHeading;
      st.targetLat = targetLat;
      st.targetLon = targetLon;
      st.targetHeading = targetHeading;
      if (st.animFrameId) {
        cancelAnimationFrame(st.animFrameId);
        st.animFrameId = null;
      }
      st.isAnimating = false;
      if (markerRef.current) {
        markerRef.current.setLatLng([targetLat, targetLon]);
        updateIconRotation(markerRef.current, targetHeading);
      }
      return;
    }

    // Normal smooth interpolation
    st.startLat = st.currentLat;
    st.startLon = st.currentLon;
    st.startHeading = st.currentHeading;
    st.targetLat = targetLat;
    st.targetLon = targetLon;
    st.targetHeading = targetHeading;
    st.startTime = now;
    // Adapt duration to telemetry tick, clamped between 200ms and 4000ms
    st.duration = Math.max(200, Math.min(deltaT, 4000));

    if (!st.isAnimating) {
      st.isAnimating = true;

      const step = (currentTime) => {
        const elapsed = currentTime - st.startTime;
        const progress = Math.min(1.0, Math.max(0.0, elapsed / st.duration));

        // Linear interpolation for smooth coordinate transition
        st.currentLat = st.startLat + (st.targetLat - st.startLat) * progress;
        st.currentLon = st.startLon + (st.targetLon - st.startLon) * progress;
        st.currentHeading = interpolateHeading(st.startHeading, st.targetHeading, progress);

        if (markerRef.current) {
          markerRef.current.setLatLng([st.currentLat, st.currentLon]);
          updateIconRotation(markerRef.current, st.currentHeading);
        }

        if (progress < 1.0) {
          st.animFrameId = requestAnimationFrame(step);
        } else {
          st.isAnimating = false;
        }
      };

      st.animFrameId = requestAnimationFrame(step);
    }
  }, [targetLat, targetLon, targetHeading, speed]);

  // Clean up animation on unmount and snap immediately on tab foregrounding
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const st = anim.current;
        if (st.animFrameId) {
          cancelAnimationFrame(st.animFrameId);
          st.animFrameId = null;
        }
        st.isAnimating = false;
        if (st.targetLat != null && st.targetLon != null) {
          st.currentLat = st.targetLat;
          st.currentLon = st.targetLon;
          st.currentHeading = st.targetHeading;
          st.startLat = st.targetLat;
          st.startLon = st.targetLon;
          st.startHeading = st.targetHeading;
          if (markerRef.current) {
            markerRef.current.setLatLng([st.targetLat, st.targetLon]);
            updateIconRotation(markerRef.current, st.targetHeading);
          }
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (anim.current.animFrameId) {
        cancelAnimationFrame(anim.current.animFrameId);
      }
    };
  }, []);

  const icon = isLive
    ? createFleetIcon(targetHeading, color, isSelected, true)
    : createOfflineFleetIcon(targetHeading, color, isSelected);

  if (!position || targetLat == null || targetLon == null) return null;

  return (
    <Marker
      ref={markerRef}
      position={[targetLat, targetLon]}
      icon={icon}
      eventHandlers={eventHandlers}
    >
      {children}
    </Marker>
  );
}

/**
 * Direct DOM rotation update helper on the Leaflet DivIcon
 */
function updateIconRotation(marker, headingDeg) {
  if (!marker) return;
  const el = marker.getElement();
  if (el) {
    const truckBody = el.querySelector('.truck-topdown-marker > div:nth-child(2)');
    if (truckBody) {
      truckBody.style.transform = `rotate(${headingDeg}deg)`;
    }
  }
}
