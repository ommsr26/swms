const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.PROD ? 'https://solidwasteapi.scipl.info.in/api' : 'http://localhost:5000/api');

export async function fetchHealth() {
  try {
    const res = await fetch(`${API_BASE_URL}/health`);
    if (!res.ok) {
      return { status: 'DEGRADED', database: 'DISCONNECTED' };
    }
    return await res.json();
  } catch (err) {
    return { status: 'UNHEALTHY', database: 'DISCONNECTED', error: err.message };
  }
}

export async function startHardwareSession(deviceCode, mode = 'REAL_HARDWARE') {
  try {
    const res = await fetch(`${API_BASE_URL}/sessions/start-hardware-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceCode, mode }),
    });

    const data = await res.json();
    if (!res.ok) {
      return { success: false, error: data.error || 'SESSION_CREATION_FAILED', message: data.message };
    }
    return { success: true, session: data };
  } catch (err) {
    console.warn('[backendApiClient] Start session error:', err.message);
    return { success: false, error: 'NETWORK_ERROR', message: err.message };
  }
}

export async function endHardwareSession(sessionId, status = 'COMPLETED') {
  if (!sessionId) return false;
  try {
    const res = await fetch(`${API_BASE_URL}/sessions/${sessionId}/end?status=${encodeURIComponent(status)}`, {
      method: 'POST',
    });
    return res.ok;
  } catch (err) {
    console.warn('[backendApiClient] End session error:', err.message);
    return false;
  }
}

export async function sendTelemetryBatch(sessionId, mode, packets) {
  if (!packets || packets.length === 0) return true;

  try {
    const formattedPackets = packets.map((p) => ({
      sequence: p.sequence ?? p.seq ?? 0,
      timestamp: p.timestamp ?? Date.now(),
      uptime_ms: p.uptime_ms ?? 0,
      rawJson: JSON.stringify(p),
      imu: p.imu ? {
        accel: p.imu.accel ? { x: p.imu.accel.x, y: p.imu.accel.y, z: p.imu.accel.z } : null,
        gyro: p.imu.gyro ? { x: p.imu.gyro.x, y: p.imu.gyro.y, z: p.imu.gyro.z } : null,
        orientation: p.imu.orientation ? { roll: p.imu.orientation.roll, pitch: p.imu.orientation.pitch, yaw: p.imu.orientation.yaw, yaw_source: p.imu.orientation.yaw_source } : null,
        quaternion: p.imu.quaternion ? { w: p.imu.quaternion.w, x: p.imu.quaternion.x, y: p.imu.quaternion.y, z: p.imu.quaternion.z } : null,
        temperature_c: p.imu.temperature_c ?? null,
        accel_magnitude: p.imu.accel_magnitude ?? null,
        valid: p.imu.valid !== false,
      } : null,
      gnss: p.gnss ? {
        lat: p.gnss.valid && p.gnss.lat != null ? p.gnss.lat : null,
        lon: p.gnss.valid && p.gnss.lon != null ? p.gnss.lon : null,
        alt: p.gnss.valid && p.gnss.alt != null ? p.gnss.alt : null,
        speed: p.gnss.valid && p.gnss.speed != null ? p.gnss.speed : null,
        heading: p.gnss.valid && p.gnss.heading != null ? p.gnss.heading : null,
        satellites: p.gnss.satellites ?? 0,
        satellites_in_view: p.gnss.satellites_in_view ?? 0,
        satellites_used: p.gnss.satellites_used ?? 0,
        hdop: p.gnss.hdop ?? null,
        gsv_seq: p.gnss.gsv_seq ?? null,
        gsv_uptime_ms: p.gnss.gsv_uptime_ms ?? null,
        fix: p.gnss.fix || 'NO_FIX',
        valid: Boolean(p.gnss.valid),
        satellites_detail: Array.isArray(p.gnss.satellites_detail) ? p.gnss.satellites_detail : [],
      } : null,
      rtc: p.rtc ? {
        iso: p.rtc.iso,
        epoch: p.rtc.epoch,
        synced: p.rtc.synced !== false,
      } : null,
    }));

    const body = {
      sessionId: typeof sessionId === 'number' ? sessionId : (parseInt(sessionId, 10) || 1),
      mode: mode || 'REAL_HARDWARE',
      packets: formattedPackets,
    };

    const res = await fetch(`${API_BASE_URL}/telemetry/ingest-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    return res.ok;
  } catch (err) {
    console.warn('[backendApiClient] Ingest batch background error:', err.message);
    return false;
  }
}

export async function fetchSessions(mode = null) {
  try {
    const url = mode ? `${API_BASE_URL}/sessions?mode=${encodeURIComponent(mode)}` : `${API_BASE_URL}/sessions`;
    const res = await fetch(url);
    if (!res.ok) return [];
    return await res.json();
  } catch (err) {
    console.warn('[backendApiClient] Fetch sessions error:', err.message);
    return [];
  }
}

export async function fetchDevices() {
  try {
    const res = await fetch(`${API_BASE_URL}/sessions/devices`);
    if (!res.ok) return [];
    return await res.json();
  } catch (err) {
    console.warn('[backendApiClient] Fetch devices error:', err.message);
    return [];
  }
}

export async function fetchHistoricalTrajectory(sessionId, limit = 5000) {
  try {
    const res = await fetch(`${API_BASE_URL}/historical/sessions/${sessionId}/gnss-trajectory?limit=${limit}`);
    if (!res.ok) return [];
    return await res.json();
  } catch (err) {
    console.warn('[backendApiClient] Fetch trajectory error:', err.message);
    return [];
  }
}

export async function fetchVehicleRoute(vehicleId, from = null, to = null, limit = 5000) {
  try {
    const params = new URLSearchParams();
    if (from) params.append('from', typeof from === 'string' ? from : from.toISOString());
    if (to) params.append('to', typeof to === 'string' ? to : to.toISOString());
    params.append('limit', limit);

    const res = await fetch(`${API_BASE_URL}/historical/vehicles/${vehicleId}/route?${params.toString()}`);
    if (!res.ok) return [];
    return await res.json();
  } catch (err) {
    console.warn('[backendApiClient] Fetch vehicle route error:', err.message);
    return [];
  }
}

export async function fetchVehicleSessions(vehicleId, limit = 50) {
  try {
    const res = await fetch(`${API_BASE_URL}/historical/vehicles/${vehicleId}/sessions?limit=${limit}`);
    if (!res.ok) return [];
    return await res.json();
  } catch (err) {
    console.warn('[backendApiClient] Fetch vehicle sessions error:', err.message);
    return [];
  }
}

export async function fetchHistoricalSatellites(sessionId) {
  try {
    const res = await fetch(`${API_BASE_URL}/historical/sessions/${sessionId}/satellites`);
    if (!res.ok) return [];
    return await res.json();
  } catch (err) {
    console.warn('[backendApiClient] Fetch satellite history error:', err.message);
    return [];
  }
}

export async function fetchHistoricalImu(sessionId) {
  try {
    const res = await fetch(`${API_BASE_URL}/historical/sessions/${sessionId}/imu-history`);
    if (!res.ok) return [];
    return await res.json();
  } catch (err) {
    console.warn('[backendApiClient] Fetch IMU history error:', err.message);
    return [];
  }
}

// ─── Admin API ───────────────────────────────────────────────────────────────

export async function fetchAdminUlbs() {
  try {
    const res = await fetch(`${API_BASE_URL}/admin/ulbs`);
    if (!res.ok) return [];
    return await res.json();
  } catch (err) {
    console.warn('[backendApiClient] Fetch admin ULBs error:', err.message);
    return [];
  }
}

export async function fetchAdminVehicles(ulbId = null) {
  try {
    const url = ulbId
      ? `${API_BASE_URL}/admin/vehicles?ulbId=${encodeURIComponent(ulbId)}`
      : `${API_BASE_URL}/admin/vehicles`;
    const res = await fetch(url);
    if (!res.ok) return [];
    return await res.json();
  } catch (err) {
    console.warn('[backendApiClient] Fetch admin vehicles error:', err.message);
    return [];
  }
}

export async function fetchAdminDevices() {
  try {
    const res = await fetch(`${API_BASE_URL}/admin/devices`);
    if (!res.ok) return [];
    return await res.json();
  } catch (err) {
    console.warn('[backendApiClient] Fetch admin devices error:', err.message);
    return [];
  }
}

export async function fetchAdminFleetLive(ulbId = null) {
  try {
    const url = ulbId
      ? `${API_BASE_URL}/admin/fleet/live?ulbId=${encodeURIComponent(ulbId)}`
      : `${API_BASE_URL}/admin/fleet/live`;
    const res = await fetch(url);
    if (!res.ok) return [];
    return await res.json();
  } catch (err) {
    console.warn('[backendApiClient] Fetch fleet live error:', err.message);
    return [];
  }
}

export async function fetchAdminSessions(ulbId = null, limit = 100) {
  try {
    const params = new URLSearchParams();
    if (ulbId) params.set('ulbId', ulbId);
    params.set('limit', String(limit));
    const res = await fetch(`${API_BASE_URL}/admin/sessions?${params.toString()}`);
    if (!res.ok) return [];
    return await res.json();
  } catch (err) {
    console.warn('[backendApiClient] Fetch admin sessions error:', err.message);
    return [];
  }
}

/**
 * Fetch cloud-sourced live telemetry snapshot for a given session.
 * Used by Admin Live Debug panel. Poll cadence 1-2s.
 */
export async function fetchAdminSessionLive(sessionId) {
  try {
    const res = await fetch(`${API_BASE_URL}/admin/sessions/${encodeURIComponent(sessionId)}/live`);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.warn('[backendApiClient] Fetch session live error:', err.message);
    return null;
  }
}


// ─── Camera API ───────────────────────────────────────────────────────────────

/**
 * Post a raw JPEG frame (ArrayBuffer or Uint8Array) to the camera endpoint.
 * Source-agnostic: used by getUserMedia captures in HardwareConnectView.
 * Future RPi/Arducam sources post directly to the same endpoint — no change needed.
 */
export async function postCameraFrame(deviceId, jpegBytes) {
  try {
    const res = await fetch(`${API_BASE_URL}/camera/${encodeURIComponent(deviceId)}/frame`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: jpegBytes,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.warn('[backendApiClient] Camera frame POST error:', err.error ?? res.status);
      return false;
    }
    return true;
  } catch (err) {
    // Network error — silently swallow to not interrupt the capture loop
    return false;
  }
}

/**
 * Returns the URL for the latest JPEG frame as a string suitable for img.src.
 * ulbId: when provided, the server enforces ULB scope (Officer path).
 *        Without ulbId (Admin path) the frame is returned unconditionally.
 * Uses a cache-busting timestamp so the browser doesn't cache the response.
 */
export function getCameraFrameUrl(deviceId, ulbId = null) {
  const params = new URLSearchParams({ _t: Date.now().toString() });
  if (ulbId) params.set('ulbId', ulbId);
  return `${API_BASE_URL}/camera/${encodeURIComponent(deviceId)}/latest?${params.toString()}`;
}

/**
 * Returns the persistent 15-30 FPS MJPEG stream URL suitable for direct img.src streaming.
 */
export function getCameraStreamUrl(deviceId, ulbId = null) {
  const params = new URLSearchParams();
  if (ulbId) params.set('ulbId', ulbId);
  const query = params.toString() ? `?${params.toString()}` : '';
  return `${API_BASE_URL}/camera/${encodeURIComponent(deviceId)}/stream${query}`;
}

/**
 * Fetch lightweight camera frame metadata (capturedAt, ageSeconds, hasFrame).
 * Use this for staleness polling — cheaper than fetching the full JPEG.
 * ulbId is NOT passed to the meta endpoint (it's purely informational, no binary).
 */
export async function fetchCameraFrameMeta(deviceId) {
  try {
    const res = await fetch(`${API_BASE_URL}/camera/${encodeURIComponent(deviceId)}/meta`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Remote Camera Control API:
 * Admin / ULB Officer triggers live streaming, remotely signaling the camera publisher.
 */
export async function startRemoteCameraStream(deviceId) {
  try {
    const res = await fetch(`${API_BASE_URL}/camera/${encodeURIComponent(deviceId)}/stream/start`, { method: 'POST' });
    return res.ok;
  } catch {
    return false;
  }
}

export async function stopRemoteCameraStream(deviceId) {
  try {
    const res = await fetch(`${API_BASE_URL}/camera/${encodeURIComponent(deviceId)}/stream/stop`, { method: 'POST' });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchRemoteCameraStreamStatus(deviceId) {
  try {
    const res = await fetch(`${API_BASE_URL}/camera/${encodeURIComponent(deviceId)}/stream/status`);
    if (!res.ok) return false;
    const data = await res.json();
    return !!data.streaming;
  } catch {
    return false;
  }
}

// ─── Officer Operational API ──────────────────────────────────────────────────

export async function fetchOfficerSessions(ulbId = null, status = null, limit = 100) {
  try {
    const params = new URLSearchParams();
    if (ulbId) params.set('ulbId', ulbId);
    if (status && status !== 'ALL') params.set('status', status);
    params.set('limit', String(limit));
    const res = await fetch(`${API_BASE_URL}/officer/sessions?${params.toString()}`);
    if (!res.ok) return [];
    return await res.json();
  } catch (err) {
    console.warn('[backendApiClient] Fetch officer sessions error:', err.message);
    return [];
  }
}

export async function fetchOfficerSessionById(sessionId, ulbId = null) {
  try {
    const params = new URLSearchParams();
    if (ulbId) params.set('ulbId', ulbId);
    const res = await fetch(`${API_BASE_URL}/officer/sessions/${encodeURIComponent(sessionId)}?${params.toString()}`);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.warn('[backendApiClient] Fetch officer session error:', err.message);
    return null;
  }
}

export async function createOfficerSession(dto) {
  try {
    const res = await fetch(`${API_BASE_URL}/officer/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dto),
    });
    const data = await res.json();
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export async function pauseOfficerSession(sessionId, ulbId) {
  try {
    const res = await fetch(`${API_BASE_URL}/officer/sessions/${sessionId}/pause?ulbId=${encodeURIComponent(ulbId)}`, {
      method: 'POST',
    });
    return await res.json();
  } catch (err) {
    return { success: false, message: err.message };
  }
}

export async function resumeOfficerSession(sessionId, ulbId) {
  try {
    const res = await fetch(`${API_BASE_URL}/officer/sessions/${sessionId}/resume?ulbId=${encodeURIComponent(ulbId)}`, {
      method: 'POST',
    });
    return await res.json();
  } catch (err) {
    return { success: false, message: err.message };
  }
}

export async function completeOfficerSession(sessionId, ulbId, reason = 'OFFICER_NORMAL') {
  try {
    const res = await fetch(`${API_BASE_URL}/officer/sessions/${sessionId}/complete?ulbId=${encodeURIComponent(ulbId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    return await res.json();
  } catch (err) {
    return { success: false, message: err.message };
  }
}

export async function abortOfficerSession(sessionId, ulbId, reason) {
  try {
    const res = await fetch(`${API_BASE_URL}/officer/sessions/${sessionId}/abort?ulbId=${encodeURIComponent(ulbId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    return await res.json();
  } catch (err) {
    return { success: false, message: err.message };
  }
}

export async function cancelOfficerSession(sessionId, ulbId) {
  try {
    const res = await fetch(`${API_BASE_URL}/officer/sessions/${sessionId}/cancel?ulbId=${encodeURIComponent(ulbId)}`, {
      method: 'POST',
    });
    return await res.json();
  } catch (err) {
    return { success: false, message: err.message };
  }
}

export async function fetchOfficerCoverageStatus(sessionId, ulbId = null) {
  try {
    const params = new URLSearchParams();
    if (ulbId) params.set('ulbId', ulbId);
    const res = await fetch(`${API_BASE_URL}/officer/sessions/${encodeURIComponent(sessionId)}/coverage-status?${params.toString()}`);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.warn('[backendApiClient] Fetch coverage status error:', err.message);
    return null;
  }
}

export async function fetchOfficerCollectionEvents(sessionId, ulbId = null) {
  try {
    const params = new URLSearchParams();
    if (ulbId) params.set('ulbId', ulbId);
    const res = await fetch(`${API_BASE_URL}/officer/sessions/${encodeURIComponent(sessionId)}/collection-events?${params.toString()}`);
    if (!res.ok) return [];
    return await res.json();
  } catch (err) {
    console.warn('[backendApiClient] Fetch collection events error:', err.message);
    return [];
  }
}

export async function fetchOfficerFleet(ulbId = null) {
  try {
    const params = new URLSearchParams();
    if (ulbId) params.set('ulbId', ulbId);
    const res = await fetch(`${API_BASE_URL}/officer/fleet?${params.toString()}`);
    if (!res.ok) return [];
    return await res.json();
  } catch (err) {
    console.warn('[backendApiClient] Fetch officer fleet error:', err.message);
    return [];
  }
}

export async function fetchOfficerRoads(ulbId = null) {
  try {
    const params = new URLSearchParams();
    if (ulbId) params.set('ulbId', ulbId);
    const res = await fetch(`${API_BASE_URL}/officer/roads?${params.toString()}`);
    if (!res.ok) return [];
    return await res.json();
  } catch (err) {
    console.warn('[backendApiClient] Fetch officer roads error:', err.message);
    return [];
  }
}

export async function fetchOfficerRoadSegments(roadId) {
  try {
    const res = await fetch(`${API_BASE_URL}/officer/roads/${encodeURIComponent(roadId)}/segments`);
    if (!res.ok) return [];
    return await res.json();
  } catch (err) {
    console.warn('[backendApiClient] Fetch officer road segments error:', err.message);
    return [];
  }
}

export async function fetchOfficerSessionLiveStatus(sessionId, ulbId = null) {
  try {
    const params = new URLSearchParams();
    if (ulbId) params.set('ulbId', ulbId);
    const res = await fetch(`${API_BASE_URL}/officer/sessions/${encodeURIComponent(sessionId)}/live-status?${params.toString()}`);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.warn('[backendApiClient] Fetch officer session live status error:', err.message);
    return null;
  }
}

export async function fetchAdminOperationalSessions(ulbId = null, limit = 100) {
  try {
    const params = new URLSearchParams();
    if (ulbId) params.set('ulbId', ulbId);
    params.set('limit', String(limit));
    const res = await fetch(`${API_BASE_URL}/admin/operational-sessions?${params.toString()}`);
    if (!res.ok) return [];
    return await res.json();
  } catch (err) {
    console.warn('[backendApiClient] Fetch admin operational sessions error:', err.message);
    return [];
  }
}

export async function fetchAdminAuditLogs(ulbId = null, entityType = null, action = null, limit = 100) {
  try {
    const params = new URLSearchParams();
    if (ulbId) params.set('ulbId', ulbId);
    if (entityType) params.set('entityType', entityType);
    if (action) params.set('action', action);
    params.set('limit', String(limit));
    const res = await fetch(`${API_BASE_URL}/admin/audit?${params.toString()}`);
    if (!res.ok) return [];
    return await res.json();
  } catch (err) {
    console.warn('[backendApiClient] Fetch audit logs error:', err.message);
    return [];
  }
}

// ─── GIS Roads & Houses API ──────────────────────────────────────────────────

export async function fetchGisRoads(ulbId = null) {
  try {
    const params = new URLSearchParams();
    if (ulbId) params.set('ulbId', ulbId);
    const res = await fetch(`${API_BASE_URL}/gis/roads?${params.toString()}`);
    if (!res.ok) return [];
    return await res.json();
  } catch (err) {
    console.warn('[backendApiClient] Fetch GIS roads error:', err.message);
    return [];
  }
}

export async function fetchGisHouses(ulbId = null, sessionId = null, date = null) {
  try {
    const params = new URLSearchParams();
    if (ulbId) params.set('ulbId', ulbId);
    if (sessionId) params.set('sessionId', String(sessionId));
    if (date) params.set('date', String(date));
    const res = await fetch(`${API_BASE_URL}/gis/houses?${params.toString()}`);
    if (!res.ok) return [];
    return await res.json();
  } catch (err) {
    console.warn('[backendApiClient] Fetch GIS houses error:', err.message);
    return [];
  }
}

export async function fetchGisCollectionEvents(ulbId = null, date = null) {
  try {
    const params = new URLSearchParams();
    if (ulbId) params.set('ulbId', ulbId);
    if (date) params.set('date', String(date));
    const res = await fetch(`${API_BASE_URL}/gis/collection-events?${params.toString()}`);
    if (!res.ok) return [];
    return await res.json();
  } catch (err) {
    console.warn('[backendApiClient] Fetch GIS collection events error:', err.message);
    return [];
  }
}

export async function fetchAdminStateDefinitions(entityType = null) {
  try {
    const params = new URLSearchParams();
    if (entityType) params.set('entityType', entityType);
    const res = await fetch(`${API_BASE_URL}/admin/system/state-definitions?${params.toString()}`);
    if (!res.ok) return [];
    return await res.json();
  } catch (err) {
    console.warn('[backendApiClient] Fetch state definitions error:', err.message);
    return [];
  }
}

export async function fetchOfficerEvidenceImages(eventId, ulbId = null) {
  try {
    const params = new URLSearchParams();
    if (ulbId) params.set('ulbId', ulbId);
    const res = await fetch(`${API_BASE_URL}/officer/collection-events/${encodeURIComponent(eventId)}/images?${params.toString()}`);
    if (!res.ok) return [];
    return await res.json();
  } catch (err) {
    console.warn('[backendApiClient] Fetch officer evidence images error:', err.message);
    return [];
  }
}

export async function fetchOfficerRouteAdherence(sessionId, ulbId = null, vehicleId = null) {
  try {
    const params = new URLSearchParams();
    if (ulbId) params.set('ulbId', ulbId);
    if (vehicleId) params.set('vehicleId', String(vehicleId));
    const res = await fetch(`${API_BASE_URL}/officer/sessions/${encodeURIComponent(sessionId)}/route-adherence?${params.toString()}`);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.warn('[backendApiClient] Fetch officer route adherence error:', err.message);
    return null;
  }
}

export async function fetchOfficerRoadAssignments(sessionId, ulbId = null) {
  try {
    const params = new URLSearchParams();
    if (ulbId) params.set('ulbId', ulbId);
    const res = await fetch(`${API_BASE_URL}/officer/sessions/${encodeURIComponent(sessionId)}/road-assignments?${params.toString()}`);
    if (!res.ok) return [];
    return await res.json();
  } catch (err) {
    console.warn('[backendApiClient] Fetch officer road assignments error:', err.message);
    return [];
  }
}

export async function fetchOfficerAlerts(ulbId = null, status = null, limit = 100) {
  try {
    const params = new URLSearchParams();
    if (ulbId) params.set('ulbId', ulbId);
    if (status) params.set('status', status);
    params.set('limit', String(limit));
    const res = await fetch(`${API_BASE_URL}/officer/alerts?${params.toString()}`);
    if (!res.ok) return [];
    return await res.json();
  } catch (err) {
    console.warn('[backendApiClient] Fetch officer alerts error:', err.message);
    return [];
  }
}

export async function acknowledgeOfficerAlert(alertId) {
  try {
    const res = await fetch(`${API_BASE_URL}/officer/alerts/${encodeURIComponent(alertId)}/acknowledge`, {
      method: 'POST',
    });
    return res.ok;
  } catch (err) {
    console.warn('[backendApiClient] Acknowledge alert error:', err.message);
    return false;
  }
}

/**
 * Resolves full authoritative backend URL for an evidence image.
 * Handles IDs, absolute URLs, or relative paths (/api/evidence/images/...).
 */
export function getEvidenceImageUrl(rawUrlOrId) {
  if (!rawUrlOrId) return '';
  const str = String(rawUrlOrId).trim();
  if (!str) return '';
  if (/^\d+$/.test(str)) {
    return `${API_BASE_URL}/evidence/images/${str}`;
  }
  if (str.startsWith('http://') || str.startsWith('https://')) {
    return str;
  }
  const clean = str.startsWith('/api/') ? str.substring(5) : (str.startsWith('/') ? str.substring(1) : str);
  return `${API_BASE_URL}/${clean}`;
}



