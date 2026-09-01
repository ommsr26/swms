/**
 * roadSnapping.js
 *
 * Client-side 10-meter GPS road snapping utility:
 * Prevents GNSS multi-path drift from placing the vehicle inside building footprints.
 * When the vehicle's GPS position is within 10.0m of the road centerline,
 * the point is orthogonally projected and snapped onto the nearest road segment.
 */

// Haversine / Equirectangular distance in meters
export function getDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth radius in meters
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

// Project point P onto line segment AB (flat approximation in local UTM/metric frame)
function projectPointToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) return { x: ax, y: ay };

  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  return {
    x: ax + t * dx,
    y: ay + t * dy,
  };
}

/**
 * snapGpsToRoad
 * @param {number} lat - Vehicle raw latitude
 * @param {number} lon - Vehicle raw longitude
 * @param {Array<[number, number]>} roadCoordinates - Array of [lat, lon] waypoints along the road
 * @param {object|null} safeZone - Optional { latitude, longitude, radiusMeters }
 * @returns {{ lat: number, lon: number, isSnapped: boolean, inSafeZone: boolean, distanceMeters: number, roadBearing: number }}
 */
export function snapGpsToRoad(lat, lon, roadCoordinates = [], safeZone = null) {
  if (!roadCoordinates || roadCoordinates.length < 2 || lat == null || lon == null) {
    return { lat, lon, isSnapped: false, inSafeZone: false, distanceMeters: 0, roadBearing: 0 };
  }

  // 1. If vehicle is inside Municipal Safe Zone (Depot/Parking), allow off-road position
  if (safeZone && safeZone.latitude != null && safeZone.longitude != null) {
    const distToSafeZone = getDistanceMeters(lat, lon, safeZone.latitude, safeZone.longitude);
    const szRadius = safeZone.radiusMeters || 50.0;
    if (distToSafeZone <= szRadius) {
      return { lat, lon, isSnapped: false, inSafeZone: true, distanceMeters: 0, roadBearing: 0 };
    }
  }

  // 2. Outside Safe Zone (In Field Operations) -> Strictly center and snap on road centerline
  let minDistance = Infinity;
  let bestPoint = { lat, lon };
  let bestSegmentBearing = 0;

  // Convert lat/lon to approximate local metric coordinates centered around the road
  const refLat = roadCoordinates[0][0];
  const refLon = roadCoordinates[0][1];
  const latScale = 111320; // meters per degree latitude
  const lonScale = 111320 * Math.cos((refLat * Math.PI) / 180);

  const px = (lon - refLon) * lonScale;
  const py = (lat - refLat) * latScale;

  for (let i = 0; i < roadCoordinates.length - 1; i++) {
    const [aLat, aLon] = roadCoordinates[i];
    const [bLat, bLon] = roadCoordinates[i + 1];

    const ax = (aLon - refLon) * lonScale;
    const ay = (aLat - refLat) * latScale;
    const bx = (bLon - refLon) * lonScale;
    const by = (bLat - refLat) * latScale;

    const proj = projectPointToSegment(px, py, ax, ay, bx, by);
    const dist = Math.hypot(px - proj.x, py - proj.y);

    if (dist < minDistance) {
      minDistance = dist;
      bestPoint = {
        lat: refLat + proj.y / latScale,
        lon: refLon + proj.x / lonScale,
      };

      // Segment forward bearing in degrees (0 = North, 90 = East, 180 = South, 270 = West)
      const segDx = bx - ax;
      const segDy = by - ay;
      let angle = (Math.atan2(segDx, segDy) * 180) / Math.PI;
      if (angle < 0) angle += 360;
      bestSegmentBearing = angle;
    }
  }

  // 2. Outside Safe Zone -> If vehicle is along the road corridor (<= 80m), center strictly on centerline.
  // If the vehicle is far away in another part of the city, preserve its real coordinates.
  const maxCorridorMeters = 80.0;
  if (minDistance <= maxCorridorMeters) {
    return {
      lat: bestPoint.lat,
      lon: bestPoint.lon,
      isSnapped: true,
      inSafeZone: false,
      distanceMeters: minDistance,
      roadBearing: bestSegmentBearing,
    };
  }

  return {
    lat,
    lon,
    isSnapped: false,
    inSafeZone: false,
    distanceMeters: minDistance,
    roadBearing: bestSegmentBearing,
  };
}

/**
 * Computes motion heading by comparing GPS coordinates across a 2-4 second sliding window.
 * Avoids magnetometer drift/failure by relying purely on GNSS displacement vectors.
 * 
 * @param {Array<{lat: number, lon: number, timestamp?: number}>} historyBuffer - Array of recent GPS fixes
 * @param {number} defaultHeading - Fallback heading if stationary
 * @param {number} roadBearing - Road segment angle for alignment
 * @returns {number} heading in degrees (0 - 360)
 */
export function estimateHeadingFromGpsHistory(historyBuffer = [], defaultHeading = 0, roadBearing = null) {
  if (!historyBuffer || historyBuffer.length < 2) {
    return defaultHeading;
  }

  const valid = historyBuffer.filter(p => p && p.lat != null && p.lon != null && !isNaN(p.lat) && !isNaN(p.lon));
  if (valid.length < 2) return defaultHeading;

  // Take the oldest and newest points in the 2-4s sliding window
  const oldest = valid[0];
  const newest = valid[valid.length - 1];

  const latScale = 111320;
  const lonScale = 111320 * Math.cos((newest.lat * Math.PI) / 180);

  const dx = (newest.lon - oldest.lon) * lonScale;
  const dy = (newest.lat - oldest.lat) * latScale;
  const displacement = Math.hypot(dx, dy);

  // If vehicle moved at least 0.8 meters, compute velocity motion vector angle
  if (displacement >= 0.8) {
    let angle = (Math.atan2(dx, dy) * 180) / Math.PI;
    if (angle < 0) angle += 360;

    // If roadBearing is provided, snap to road direction (forward or reverse)
    if (roadBearing != null && !isNaN(roadBearing)) {
      const diff1 = Math.abs((angle - roadBearing + 180) % 360 - 180);
      const revBearing = (roadBearing + 180) % 360;
      const diff2 = Math.abs((angle - revBearing + 180) % 360 - 180);
      return diff1 < diff2 ? roadBearing : revBearing;
    }

    return angle;
  }

  // If stationary, preserve default heading (or snap to road)
  return defaultHeading || (roadBearing != null ? roadBearing : 0);
}
