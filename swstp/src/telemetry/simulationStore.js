import { create } from 'zustand';
import { ingestPacket } from './telemetryStore.js';

// ─── AMRAVATI ROAD CORRIDOR NODES (Street Centerline between Side A & Side B) ─
// Parallel to straight vector from [20.955760, 77.764500] to [20.956460, 77.763070]
export const DEFAULT_ROAD_NODES = [
  { lat: 20.955760, lon: 77.764500 },
  { lat: 20.955889, lon: 77.764240 },
  { lat: 20.955972, lon: 77.764065 },
  { lat: 20.956065, lon: 77.763885 },
  { lat: 20.956141, lon: 77.763730 },
  { lat: 20.956212, lon: 77.763580 },
  { lat: 20.956285, lon: 77.763430 },
  { lat: 20.956350, lon: 77.763280 },
  { lat: 20.956460, lon: 77.763070 },
];

export const INITIAL_HOUSES = [
  // Side A (North-East / Left side of road)
  { id: 'H-AMR-01', address: 'COSMO AESTHETIC / Vrushangi Modular', lat: 20.9558016, lon: 77.7642758, status: 'NOT_COLLECTED', collectedAt: null, evidencePhoto: null },
  { id: 'H-AMR-02', address: 'Ambika Provision / Godrej Interio', lat: 20.9558842, lon: 77.7641069, status: 'NOT_COLLECTED', collectedAt: null, evidencePhoto: null },
  { id: 'H-AMR-03', address: 'सुनील जयसिंगपुरे (Education center)', lat: 20.9559889, lon: 77.7638930, status: 'NOT_COLLECTED', collectedAt: null, evidencePhoto: null },
  { id: 'H-AMR-04', address: 'Dr. Kishorsingh Chungade Clinic', lat: 20.9560605, lon: 77.7637466, status: 'NOT_COLLECTED', collectedAt: null, evidencePhoto: null },
  { id: 'H-AMR-05', address: "Khond's House", lat: 20.9561282, lon: 77.7635980, status: 'NOT_COLLECTED', collectedAt: null, evidencePhoto: null },
  { id: 'H-AMR-06', address: 'Residential House (Khond Adjacent)', lat: 20.9561943, lon: 77.7634629, status: 'NOT_COLLECTED', collectedAt: null, evidencePhoto: null },
  { id: 'H-AMR-07', address: 'Shree Ganesh Apartment', lat: 20.9562564, lon: 77.7633255, status: 'NOT_COLLECTED', collectedAt: null, evidencePhoto: null },
  // Side B (South-West / Right side of road)
  { id: 'H-AMR-08', address: 'Wellness MEDeal Generic Pharmacy / Dr DEEPAK KEDAR', lat: 20.9559766, lon: 77.7643740, status: 'NOT_COLLECTED', collectedAt: null, evidencePhoto: null },
  { id: 'H-AMR-09', address: 'Radhika Fashion / Indrashesh Medicals', lat: 20.9560593, lon: 77.7642051, status: 'NOT_COLLECTED', collectedAt: null, evidencePhoto: null },
  { id: 'H-AMR-10', address: 'Residential Plot 1', lat: 20.9561419, lon: 77.7640362, status: 'NOT_COLLECTED', collectedAt: null, evidencePhoto: null },
  { id: 'H-AMR-11', address: 'Residential Plot 2', lat: 20.9562190, lon: 77.7638786, status: 'NOT_COLLECTED', collectedAt: null, evidencePhoto: null },
  { id: 'H-AMR-12', address: 'Residential Plot 3', lat: 20.9562962, lon: 77.7637210, status: 'NOT_COLLECTED', collectedAt: null, evidencePhoto: null },
  { id: 'H-AMR-13', address: 'Sthapatya Consultants (I) Pvt.Ltd', lat: 20.9563773, lon: 77.7635655, status: 'NOT_COLLECTED', collectedAt: null, evidencePhoto: null },
  { id: 'H-AMR-14', address: 'AMF Project Consultant', lat: 20.9564434, lon: 77.7634304, status: 'NOT_COLLECTED', collectedAt: null, evidencePhoto: null },
];

// Helper to compute rotated rectangular footprint parallel to the road corridor
export function computeHouseFootprint(h) {
  const tx = -0.8858;
  const ty = 0.4642;
  const nx = -ty;
  const ny = tx;

  const hw = 3.8; // half width along road (7.6m building width)
  const hh = 3.4; // half depth off road (6.8m building depth)
  const latScale = 111320.0;
  const lonScale = 111320.0 * Math.cos((h.lat * Math.PI) / 180.0);

  return [
    [h.lat + (hw * ty + hh * ny) / latScale, h.lon + (hw * tx + hh * nx) / lonScale],
    [h.lat + (-hw * ty + hh * ny) / latScale, h.lon + (-hw * tx + hh * nx) / lonScale],
    [h.lat + (-hw * ty - hh * ny) / latScale, h.lon + (-hw * tx - hh * nx) / lonScale],
    [h.lat + (hw * ty - hh * ny) / latScale, h.lon + (hw * tx - hh * nx) / lonScale],
  ];
}

// Helper to calculate distance in meters between two lat/lon points
export function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
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

// Helper to calculate heading angle from point 1 to point 2
function calculateBearing(lat1, lon1, lat2, lon2) {
  const y = Math.sin(((lon2 - lon1) * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180);
  const x =
    Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
    Math.sin((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.cos(((lon2 - lon1) * Math.PI) / 180);
  const brng = (Math.atan2(y, x) * 180) / Math.PI;
  return (brng + 360) % 360;
}

// ─── PROCEDURAL CAMERA EVIDENCE PHOTO GENERATOR ────────────────────────────────
export function generateEvidencePhotoCanvas({
  house,
  vehicleReg = 'MH-27-AM-4001',
  timestamp = new Date(),
  lat = 20.956112,
  lon = 77.763861,
  speed = 12.4,
  heading = 295,
  ulbName = 'AMRAVATI MUNICIPAL CORP',
}) {
  const width = 640;
  const height = 480;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // 1. Sky & Environment background
  const skyGrad = ctx.createLinearGradient(0, 0, 0, height * 0.5);
  skyGrad.addColorStop(0, '#1e293b');
  skyGrad.addColorStop(1, '#334155');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, width, height * 0.5);

  // 2. Street / Road surface
  const roadGrad = ctx.createLinearGradient(0, height * 0.5, 0, height);
  roadGrad.addColorStop(0, '#1e2022');
  roadGrad.addColorStop(1, '#0f172a');
  ctx.fillStyle = roadGrad;
  ctx.fillRect(0, height * 0.5, width, height * 0.5);

  // 3. Curb & Sidewalk
  ctx.fillStyle = '#475569';
  ctx.fillRect(0, height * 0.48, width, 24);
  ctx.fillStyle = '#cbd5e1';
  for (let x = 0; x < width; x += 40) {
    ctx.fillRect(x, height * 0.48, 20, 4);
  }

  // 4. Buildings in background
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(40, height * 0.2, 180, height * 0.28);
  ctx.fillRect(260, height * 0.15, 220, height * 0.33);
  ctx.fillRect(510, height * 0.22, 100, height * 0.26);

  // Building Windows
  ctx.fillStyle = '#fef08a';
  for (let bx = 60; bx < 200; bx += 30) {
    for (let by = height * 0.24; by < height * 0.45; by += 28) {
      ctx.fillRect(bx, by, 16, 18);
    }
  }
  for (let bx = 280; bx < 460; bx += 36) {
    for (let by = height * 0.18; by < height * 0.45; by += 32) {
      ctx.fillRect(bx, by, 20, 22);
    }
  }

  // 5. Municipal Waste Bin (Green & Blue Segregated Bins)
  // Green Bin (Organic)
  ctx.fillStyle = '#15803d';
  ctx.fillRect(160, height * 0.52, 60, 90);
  ctx.fillStyle = '#166534';
  ctx.fillRect(156, height * 0.50, 68, 12);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 9px sans-serif';
  ctx.fillText('WET WASTE', 165, height * 0.58);

  // Blue Bin (Dry/Recyclable)
  ctx.fillStyle = '#1d4ed8';
  ctx.fillRect(235, height * 0.52, 60, 90);
  ctx.fillStyle = '#1e40af';
  ctx.fillRect(231, height * 0.50, 68, 12);
  ctx.fillStyle = '#ffffff';
  ctx.fillText('DRY WASTE', 240, height * 0.58);

  // Waste Bags on Sidewalk
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.arc(315, height * 0.60, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#334155';
  ctx.beginPath();
  ctx.arc(335, height * 0.62, 14, 0, Math.PI * 2);
  ctx.fill();

  // 6. Truck Hood / Camera Frame Vignette at bottom
  ctx.fillStyle = '#0284c7';
  ctx.beginPath();
  ctx.moveTo(0, height);
  ctx.lineTo(120, height * 0.85);
  ctx.lineTo(width - 120, height * 0.85);
  ctx.lineTo(width, height);
  ctx.fill();

  // 7. AI Waste Detection Bounding Box (Bounding Box around Waste Bin)
  ctx.strokeStyle = '#22c55e';
  ctx.lineWidth = 2;
  ctx.strokeRect(150, height * 0.46, 200, 115);
  ctx.fillStyle = '#22c55e';
  ctx.fillRect(150, height * 0.46 - 16, 170, 16);
  ctx.fillStyle = '#000000';
  ctx.font = 'bold 9px monospace';
  ctx.fillText('WASTE DETECTED: 97.2%', 154, height * 0.46 - 4);

  // 8. OSD / Telemetry Watermark Overlay HUD
  ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
  ctx.fillRect(0, 0, width, 40);
  ctx.fillRect(0, height - 35, width, 35);

  ctx.fillStyle = '#00d9ff';
  ctx.font = 'bold 11px monospace';
  ctx.fillText(`SWSTP CAM-01 [${ulbName}]`, 12, 18);
  ctx.fillStyle = '#ffffff';
  ctx.font = '10px monospace';
  ctx.fillText(`VEHICLE: ${vehicleReg} | GPS FIX: 3D (14 SATS)`, 12, 32);

  const timeStr = timestamp.toISOString().replace('T', ' ').substring(0, 19);
  ctx.fillStyle = '#22c55e';
  ctx.fillText(timeStr, width - 190, 18);
  ctx.fillStyle = '#cbd5e1';
  ctx.fillText(`LAT: ${lat.toFixed(6)}° LON: ${lon.toFixed(6)}°`, width - 230, 32);

  // Bottom HUD
  ctx.fillStyle = '#f8fafc';
  ctx.font = '10px monospace';
  ctx.fillText(`TARGET: ${house?.id || 'H-AMR-01'} · ${house?.address || 'Corridor Road'}`, 12, height - 14);
  ctx.fillStyle = '#38bdf8';
  ctx.fillText(`SPD: ${speed.toFixed(1)} km/h | HDG: ${heading.toFixed(0)}° | GEO-FENCE: OK`, width - 270, height - 14);

  return canvas.toDataURL('image/jpeg', 0.85);
}

// ─── ZUSTAND STORE ────────────────────────────────────────────────────────────
export const useSimulationStore = create((set, get) => ({
  // Vehicle state
  isRunning: true,
  engineOn: true,
  gear: 'D', // 'D' | 'R' | 'P'
  lat: 20.955700,
  lon: 77.764500,
  heading: 298.0,
  speed: 14.5,
  targetSpeed: 15.0,
  throttle: 0.5,
  steering: 0.0, // -1.0 (left) to +1.0 (right)
  isAutoPatrol: false,
  currentRoadNodeIndex: 0,
  vehicleReg: 'MH-27-AM-4001',
  ulbId: 'ULB_MH_AMRAVATI',
  ulbName: 'AMRAVATI MUNICIPAL CORP',

  // Breadcrumbs & Distance
  totalDistanceTraveledM: 340.0,
  trajectory: [{ lat: 20.955700, lon: 77.764500, t: Date.now() }],

  // GIS Houses & Collection
  houses: INITIAL_HOUSES,
  closestHouse: null,
  closestHouseDistanceM: 999,
  isEligibleForCollection: false,
  collectionEvents: [],
  latestCapturedEvidence: null,
  isEvidenceModalOpen: false,

  // Selected date for Daily Timeline inspection
  selectedTimelineDate: new Date().toISOString().split('T')[0],
  timelineHour: 10.5, // 10:30 AM
  isTimelineAutoPlaying: false,

  // Joystick Input Actions
  setJoystick: (x, y) => {
    // x: -1 (left) to +1 (right)
    // y: -1 (forward/up) to +1 (back/down)
    const steering = Math.max(-1, Math.min(1, x));
    const forwardThrottle = Math.max(-1, Math.min(1, -y));

    const state = get();
    if (!state.engineOn) return;

    let targetSpeed = state.targetSpeed;
    let gear = state.gear;

    if (forwardThrottle > 0.05) {
      gear = 'D';
      targetSpeed = forwardThrottle * 45; // max 45 km/h
    } else if (forwardThrottle < -0.05) {
      gear = 'R';
      targetSpeed = Math.abs(forwardThrottle) * 15; // max 15 km/h in reverse
    } else {
      targetSpeed = 0;
    }

    set({
      steering,
      throttle: Math.abs(forwardThrottle),
      targetSpeed,
      gear,
      isAutoPatrol: false, // Joystick manual override stops auto-patrol
    });
  },

  setSpeed: (targetSpeed) => set({ targetSpeed: Math.max(0, Math.min(60, targetSpeed)) }),
  setGear: (gear) => set({ gear }),
  toggleEngine: () => set((s) => ({ engineOn: !s.engineOn, targetSpeed: !s.engineOn ? 15 : 0 })),
  toggleAutoPatrol: () => set((s) => ({ isAutoPatrol: !s.isAutoPatrol })),

  snapToRoad: () => {
    const state = get();
    let minDist = Infinity;
    let closestNode = DEFAULT_ROAD_NODES[0];
    let closestIdx = 0;

    DEFAULT_ROAD_NODES.forEach((n, idx) => {
      const d = calculateDistanceMeters(state.lat, state.lon, n.lat, n.lon);
      if (d < minDist) {
        minDist = d;
        closestNode = n;
        closestIdx = idx;
      }
    });

    set({
      lat: closestNode.lat,
      lon: closestNode.lon,
      currentRoadNodeIndex: closestIdx,
      speed: 0,
      targetSpeed: 0,
    });
  },

  resetToDepot: () => {
    const startNode = DEFAULT_ROAD_NODES[0];
    set({
      lat: startNode.lat,
      lon: startNode.lon,
      heading: 298.0,
      speed: 0,
      targetSpeed: 0,
      currentRoadNodeIndex: 0,
      isAutoPatrol: false,
    });
  },

  // Collection circles formed by camera captures (15m radius buffer)
  collectionCircles: [],
  speedWarningMessage: null,

  // Snap & Capture Picture Action (Enforces speed <= 5.0 km/h and forms 15m collection circle)
  capturePicture: () => {
    const state = get();
    const now = new Date();

    // 1. Enforce Speed <= 5.0 km/h rule from main algorithm
    if (state.speed > 5.0) {
      const msg = `SPEED TOO HIGH (${state.speed.toFixed(1)} km/h). Vehicle speed must be ≤ 5.0 km/h to trigger collection evidence.`;
      set({ speedWarningMessage: msg });
      setTimeout(() => set({ speedWarningMessage: null }), 3500);
      return { success: false, reason: 'SPEED_TOO_HIGH', message: msg };
    }

    set({ speedWarningMessage: null });

    // 2. Spatial Circle Forming: Form 15m circle at vehicle GPS (lat, lon)
    const eventLat = state.lat;
    const eventLon = state.lon;
    const collectionRadiusMeters = 15.0;

    // Road tangent vector for 2-side separation
    const tx = -0.8858;
    const ty = 0.4642;

    const sideAHouses = [];
    const sideBHouses = [];
    const allImpacted = [];

    state.houses.forEach((h) => {
      const dist = calculateDistanceMeters(eventLat, eventLon, h.lat, h.lon);
      if (dist <= collectionRadiusMeters) {
        const sideVal = (h.lon - eventLon) * ty - (h.lat - eventLat) * tx;
        const entry = { ...h, distanceMeters: dist };
        allImpacted.push(entry);
        if (sideVal >= 0) {
          sideAHouses.push(entry);
        } else {
          sideBHouses.push(entry);
        }
      }
    });

    // Closest on Side A and Side B are primary COLLECTED
    sideAHouses.sort((a, b) => a.distanceMeters - b.distanceMeters);
    sideBHouses.sort((a, b) => a.distanceMeters - b.distanceMeters);

    const primaryAId = sideAHouses[0]?.id;
    const primaryBId = sideBHouses[0]?.id;

    const primaryHouse = sideAHouses[0] || sideBHouses[0] || state.closestHouse || state.houses[0];

    const photoDataUrl = generateEvidencePhotoCanvas({
      house: primaryHouse,
      vehicleReg: state.vehicleReg,
      timestamp: now,
      lat: eventLat,
      lon: eventLon,
      speed: state.speed,
      heading: state.heading,
      ulbName: state.ulbName,
    });

    // Update house statuses according to municipal algorithm:
    // - Primary closest adjacent on Side A / B => COLLECTED (Solid Green)
    // - Secondary adjacent in 15m buffer => INTERSECTED (Light Green)
    // - Unreached houses retain previous status (or NOT_COLLECTED)
    const finalizedHouses = state.houses.map((h) => {
      const isPrimary = h.id === primaryAId || h.id === primaryBId;
      const isSecondary = allImpacted.some((ih) => ih.id === h.id);

      if (isPrimary) {
        return {
          ...h,
          status: 'COLLECTED',
          collectedAt: h.collectedAt || now.toLocaleTimeString(),
          evidencePhoto: photoDataUrl,
        };
      } else if (isSecondary) {
        // If already COLLECTED from previous stop, keep COLLECTED; otherwise INTERSECTED
        return {
          ...h,
          status: h.status === 'COLLECTED' ? 'COLLECTED' : 'INTERSECTED',
          collectedAt: h.collectedAt || now.toLocaleTimeString(),
          evidencePhoto: h.evidencePhoto || photoDataUrl,
        };
      }
      return h;
    });

    const newCircle = {
      id: `CIRC-${Date.now()}`,
      lat: eventLat,
      lon: eventLon,
      radius: collectionRadiusMeters,
      timestamp: now.toISOString(),
      timeStr: now.toLocaleTimeString(),
      speedKmh: state.speed,
      impactedHouseCount: allImpacted.length,
      impactedHouseIds: allImpacted.map((ih) => ih.id),
      photoUrl: photoDataUrl,
    };

    const newEvidence = {
      id: `EV-${Date.now()}`,
      houseId: primaryHouse.id,
      address: primaryHouse.address,
      timestamp: now.toISOString(),
      lat: eventLat,
      lon: eventLon,
      photoUrl: photoDataUrl,
      status: 'VERIFIED',
      distanceMeters: Math.round(primaryHouse.distanceMeters || state.closestHouseDistanceM),
      impactedHouses: allImpacted,
      circle: newCircle,
    };

    set({
      houses: finalizedHouses,
      collectionCircles: [newCircle, ...state.collectionCircles],
      latestCapturedEvidence: newEvidence,
      collectionEvents: [newEvidence, ...state.collectionEvents],
      isEvidenceModalOpen: true,
    });

    return { success: true, evidence: newEvidence, circle: newCircle };
  },

  closeEvidenceModal: () => set({ isEvidenceModalOpen: false }),

  setTimelineDate: (dateStr) => set({ selectedTimelineDate: dateStr }),
  setTimelineHour: (hour) => set({ timelineHour: hour }),
  toggleTimelineAutoPlay: () => set((s) => ({ isTimelineAutoPlaying: !s.isTimelineAutoPlaying })),

  // Step physics simulation tick (invoked at 20Hz / 50ms)
  tickSimulation: () => {
    const state = get();
    if (!state.isRunning) return;

    const dt = 0.05; // 50ms = 0.05 sec
    let { lat, lon, heading, speed, targetSpeed, gear, engineOn, isAutoPatrol, currentRoadNodeIndex } = state;

    if (!engineOn) {
      speed = Math.max(0, speed - 2.0 * dt);
    } else if (isAutoPatrol) {
      // Auto patrol along road nodes
      const targetNode = DEFAULT_ROAD_NODES[currentRoadNodeIndex];
      const distToNode = calculateDistanceMeters(lat, lon, targetNode.lat, targetNode.lon);

      if (distToNode < 4.0) {
        // Reached waypoint, advance to next or loop
        currentRoadNodeIndex = (currentRoadNodeIndex + 1) % DEFAULT_ROAD_NODES.length;
      } else {
        const targetHeading = calculateBearing(lat, lon, targetNode.lat, targetNode.lon);
        // Smoothly rotate towards target heading
        let diff = (((targetHeading - heading) + 540) % 360) - 180;
        heading = (heading + diff * 0.15 + 360) % 360;
        targetSpeed = 16.0;
        gear = 'D';
      }
    } else {
      // Manual steering from joystick
      if (Math.abs(state.steering) > 0.05 && speed > 0.5) {
        const turnRate = state.steering * (gear === 'R' ? -45 : 45); // deg/sec
        heading = (heading + turnRate * dt + 360) % 360;
      }
    }

    // Accelerate / decelerate towards target speed
    if (speed < targetSpeed) {
      speed = Math.min(targetSpeed, speed + 4.0 * dt);
    } else if (speed > targetSpeed) {
      speed = Math.max(targetSpeed, speed - 6.0 * dt);
    }

    // Calculate new position based on speed and heading
    let newLat = lat;
    let newLon = lon;

    if (speed > 0.1) {
      const speedMps = (speed * 1000) / 3600;
      const moveDistanceMeters = speedMps * dt * (gear === 'R' ? -1 : 1);

      const rad = (heading * Math.PI) / 180;
      const dLat = (moveDistanceMeters * Math.cos(rad)) / 111320;
      const dLon = (moveDistanceMeters * Math.sin(rad)) / (111320 * Math.cos((lat * Math.PI) / 180));

      newLat = lat + dLat;
      newLon = lon + dLon;
    }

    // Proximity to houses
    let closestHouse = null;
    let minHouseDist = 999;

    state.houses.forEach((h) => {
      const d = calculateDistanceMeters(newLat, newLon, h.lat, h.lon);
      if (d < minHouseDist) {
        minHouseDist = d;
        closestHouse = h;
      }
    });

    const isEligible = minHouseDist <= 15.0;

    // Check auto-collection during auto-patrol if within 10m
    let updatedHouses = state.houses;
    let newEvents = state.collectionEvents;

    if (isAutoPatrol && isEligible && closestHouse && closestHouse.status === 'UNCOLLECTED' && minHouseDist <= 10.0) {
      const now = new Date();
      const photoDataUrl = generateEvidencePhotoCanvas({
        house: closestHouse,
        vehicleReg: state.vehicleReg,
        timestamp: now,
        lat: newLat,
        lon: newLon,
        speed,
        heading,
        ulbName: state.ulbName,
      });

      const autoEv = {
        id: `EV-${Date.now()}`,
        houseId: closestHouse.id,
        address: closestHouse.address,
        timestamp: now.toISOString(),
        lat: newLat,
        lon: newLon,
        photoUrl: photoDataUrl,
        status: 'AUTO_CAPTURED',
        distanceMeters: Math.round(minHouseDist),
      };

      updatedHouses = updatedHouses.map((h) =>
        h.id === closestHouse.id ? { ...h, status: 'COLLECTED', collectedAt: now.toLocaleTimeString(), evidencePhoto: photoDataUrl } : h
      );
      newEvents = [autoEv, ...newEvents];
    }

    // Generate telemetry packet and feed into global telemetry store
    const simPacket = {
      device_id: 'SWSTP_SIM_TRUCK_01',
      t: Date.now() / 1000,
      ts: Date.now(),
      sequence: Math.floor(Date.now() / 50) % 100000,
      gnss: {
        valid: true,
        fix: 'FIX_3D',
        status: 'FIX',
        lat: newLat,
        lon: newLon,
        speed: speed,
        heading: heading,
        alt: 312.4 + Math.sin(Date.now() / 1000) * 0.5,
        satellites: 14,
        satellites_in_view: 16,
        satellites_used: 14,
        hdop: 0.85,
        satellites_detail: [
          { prn: 1, constellation: 'GPS', elevation: 45, azimuth: 120, snr: 42, used_in_fix: true },
          { prn: 3, constellation: 'GPS', elevation: 60, azimuth: 210, snr: 46, used_in_fix: true },
          { prn: 7, constellation: 'GPS', elevation: 32, azimuth: 85, snr: 39, used_in_fix: true },
          { prn: 11, constellation: 'GLONASS', elevation: 55, azimuth: 300, snr: 44, used_in_fix: true },
          { prn: 14, constellation: 'GALILEO', elevation: 70, azimuth: 175, snr: 48, used_in_fix: true },
        ],
      },
      imu: {
        valid: true,
        accel: {
          x: state.steering * 0.4,
          y: (speed - state.speed) * 0.5,
          z: 9.81,
        },
        accel_magnitude: 9.81,
        gyro: {
          x: (Math.random() - 0.5) * 0.05,
          y: (Math.random() - 0.5) * 0.05,
          z: state.steering * 0.35,
        },
        orientation: {
          roll: state.steering * 4.2,
          pitch: Math.max(-8, Math.min(8, (targetSpeed - speed) * 0.8)),
          yaw: heading,
        },
      },
      rtc: {
        synced: true,
        iso: new Date().toISOString(),
        epoch: Date.now(),
      },
    };

    try {
      ingestPacket(simPacket);
    } catch {}

    set({
      lat: newLat,
      lon: newLon,
      heading,
      speed,
      currentRoadNodeIndex,
      closestHouse,
      closestHouseDistanceM: minHouseDist,
      isEligibleForCollection: isEligible,
      houses: updatedHouses,
      collectionEvents: newEvents,
      totalDistanceTraveledM: state.totalDistanceTraveledM + ((speed * 1000) / 3600) * dt,
      trajectory:
        state.trajectory.length > 500
          ? [...state.trajectory.slice(1), { lat: newLat, lon: newLon, t: Date.now() }]
          : [...state.trajectory, { lat: newLat, lon: newLon, t: Date.now() }],
    });
  },
}));

// Global ticker loop for simulation
let _simInterval = null;

export function startSimulationEngine() {
  if (_simInterval) return;
  _simInterval = setInterval(() => {
    useSimulationStore.getState().tickSimulation();
  }, 50); // 20 Hz
}

export function stopSimulationEngine() {
  if (_simInterval) {
    clearInterval(_simInterval);
    _simInterval = null;
  }
}
