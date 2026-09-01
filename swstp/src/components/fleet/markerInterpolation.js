/**
 * markerInterpolation.js — Mathematical utilities for smooth vehicle marker interpolation.
 */

/**
 * Calculates geodesic distance between two coordinates in meters (Haversine formula).
 */
export function haversineDistanceMeters(lat1, lon1, lat2, lon2) {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return 0;
  const R = 6371000; // Earth's radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Interpolates heading angle using the shortest angular path around the circle.
 * E.g. 350° to 10° yields a 20° clockwise transition.
 */
export function interpolateHeading(fromDeg, toDeg, progress) {
  if (fromDeg == null || isNaN(fromDeg)) return toDeg ?? 0;
  if (toDeg == null || isNaN(toDeg)) return fromDeg ?? 0;

  let diff = (toDeg - fromDeg) % 360;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;

  const result = fromDeg + diff * progress;
  return ((result % 360) + 360) % 360;
}
