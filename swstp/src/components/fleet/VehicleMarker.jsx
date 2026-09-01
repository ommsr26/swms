/**
 * VehicleMarker.jsx — 3D Municipal Fleet map icon factories and auto-fit helper.
 *
 * Renders 3D isometric municipal waste collection tipper trucks (Tata Ace / Dost style)
 * with dynamic heading tracking, wet/dry waste compartments, and circular pedestal halo.
 */
import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { create3DTruckMarkerIcon, TRUCK_COLOR_THEMES } from './Truck3DIcon.js';
import AnimatedVehicleMarker from './AnimatedVehicleMarker.jsx';

export { TRUCK_COLOR_THEMES, create3DTruckMarkerIcon, AnimatedVehicleMarker };

// ─── ULB color palette — uses existing signal color tokens ────────────────────
export const ULB_COLORS = ['#00d9ff', '#9d4edd', '#2dc653', '#f48c06', '#f72585', '#43aa8b'];

export function ulbColor(ulbId, ulbList) {
  if (!ulbList || !Array.isArray(ulbList)) return '#00d9ff';
  const idx = ulbList.findIndex(u => u.ulbId === ulbId);
  return ULB_COLORS[Math.max(0, idx) % ULB_COLORS.length];
}

// ─── Default map center: Nagpur ───────────────────────────────────────────────
export const DEFAULT_CENTER = [21.1458, 79.0882];

// ─── Live vehicle 3D isometric truck marker (Swachh Bharat tipper truck) ──────
export function createFleetIcon(heading = 0, color = '#00d9ff', isSelected = false, isLive = true) {
  const theme = {
    ...TRUCK_COLOR_THEMES.municipal_dual,
    accent: color || '#00d9ff',
  };

  return create3DTruckMarkerIcon({
    heading,
    theme,
    isLive,
    scale: 1.1,
    isSelected,
  });
}

// ─── Offline last-known position 3D truck marker ─────────────────────────────
export function createOfflineFleetIcon(heading = 0, color = '#94a3b8', isSelected = false) {
  return create3DTruckMarkerIcon({
    heading,
    theme: {
      ...TRUCK_COLOR_THEMES.municipal_dual,
      accent: '#94a3b8',
    },
    isLive: false,
    scale: 1.0,
    isSelected,
  });
}

// ─── Map auto-fit helper (fits viewport to all vehicle positions on first load) ─
export function FleetMapAutoFit({ vehicles }) {
  const map = useMap();
  const fitted = useRef(false);
  useEffect(() => {
    if (!fitted.current && vehicles && vehicles.length > 0 && map) {
      const pts = vehicles.filter(v => v && v.lat != null && v.lon != null);
      if (pts.length > 0) {
        const bounds = L.latLngBounds(pts.map(v => [v.lat, v.lon]));
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
        fitted.current = true;
      }
    }
  }, [vehicles, map]);
  return null;
}
