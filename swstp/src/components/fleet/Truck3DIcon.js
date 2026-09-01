/**
 * Truck3DIcon.js — Top-Down 3D Municipal Waste Collection Tipper Truck Icon Factory.
 *
 * Renders the top-down plan view of the municipal tipper truck (Tata Ace Swachh Bharat vehicle)
 * that rotates and drives smoothly along roads with the vehicle's heading.
 */
import L from 'leaflet';

export const TRUCK_COLOR_THEMES = {
  municipal_dual: {
    label: 'Swachh Dual (Green / Blue)',
    accent: '#00d9ff',
  },
  municipal_green: {
    label: 'Municipal Green',
    accent: '#22c55e',
  },
  amravati_teal: {
    label: 'Amravati AMC Teal',
    accent: '#0d9488',
  },
};

/**
 * Generates the Top-Down Plan View SVG for the municipal tipper truck.
 * Modeled directly after the Indian Swachh Bharat waste collection vehicle.
 */
export function generateTopDownTruckSvg({
  heading = 0,
  accentColor = '#00d9ff',
  isLive = true,
  scale = 1.0,
  isSelected = false,
}) {
  const width = Math.round(20 * scale);
  const height = Math.round(32 * scale);
  const halfW = width / 2;
  const halfH = height / 2;

  const wetColor = isLive ? '#22c55e' : '#475569';
  const dryColor = isLive ? '#0284c7' : '#334155';
  const ringColor = isLive ? accentColor : '#64748b';

  return `
    <div class="truck-topdown-marker ${isLive ? 'truck-live' : 'truck-offline'} ${isSelected ? 'truck-selected' : ''}"
         style="width:${width}px; height:${height}px; position:relative; display:flex; align-items:center; justify-content:center; user-select:none;">
      
      <!-- Ground Tracker Aura / Halo -->
      <div style="
        position: absolute;
        inset: -3px;
        border-radius: 50%;
        border: 1px solid ${ringColor};
        background: ${ringColor}18;
        box-shadow: 0 0 ${isSelected ? '6px' : '3px'} ${ringColor}55;
        pointer-events: none;
        ${isLive ? 'animation: truckBeaconPulse 2.4s infinite ease-out;' : ''}
      "></div>

      <!-- Heading-Oriented Top-Down Truck Body -->
      <div style="
        width: 100%;
        height: 100%;
        position: relative;
        transform-origin: center center;
        transform: rotate(${heading}deg);
        transition: transform 0.25s cubic-bezier(0.2, 0, 0, 1);
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        
        <!-- Forward Headlight Beams (Live) -->
        ${isLive ? `
          <div style="
            position: absolute;
            top: -18px;
            left: 4px;
            right: 4px;
            height: 22px;
            background: linear-gradient(to top, rgba(255,255,255,0.5), rgba(0,217,255,0.2) 60%, transparent);
            clip-path: polygon(25% 100%, 75% 100%, 100% 0, 0 0);
            pointer-events: none;
            opacity: 0.85;
          "></div>
        ` : ''}

        <!-- Vector Top-Down Truck (Sharp, Crisp, Vector Graphics) -->
        <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 34 54" style="display:block; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.6));">
          <defs>
            <linearGradient id="cab-top-grad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stop-color="#e2e8f0"/>
              <stop offset="30%" stop-color="#ffffff"/>
              <stop offset="70%" stop-color="#ffffff"/>
              <stop offset="100%" stop-color="#cbd5e1"/>
            </linearGradient>
            <linearGradient id="windshield-top-grad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stop-color="#0f172a"/>
              <stop offset="60%" stop-color="#1e293b"/>
              <stop offset="100%" stop-color="#334155"/>
            </linearGradient>
            <linearGradient id="wet-bin-grad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stop-color="#15803d"/>
              <stop offset="25%" stop-color="${wetColor}"/>
              <stop offset="75%" stop-color="${wetColor}"/>
              <stop offset="100%" stop-color="#166534"/>
            </linearGradient>
            <linearGradient id="dry-bin-grad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stop-color="#0369a1"/>
              <stop offset="25%" stop-color="${dryColor}"/>
              <stop offset="75%" stop-color="${dryColor}"/>
              <stop offset="100%" stop-color="#075985"/>
            </linearGradient>
          </defs>

          <!-- Underbody Chassis -->
          <rect x="6" y="5" width="22" height="45" rx="2" fill="#090d16"/>

          <!-- 4 Tires (Black Rubber + Silver Hubcaps) -->
          <!-- Front Tires -->
          <rect x="2" y="9" width="4" height="8.5" rx="1.5" fill="#1e293b" stroke="#090d16" stroke-width="0.5"/>
          <rect x="28" y="9" width="4" height="8.5" rx="1.5" fill="#1e293b" stroke="#090d16" stroke-width="0.5"/>
          <rect x="3" y="11" width="2" height="4.5" rx="0.5" fill="#64748b"/>
          <rect x="29" y="11" width="2" height="4.5" rx="0.5" fill="#64748b"/>

          <!-- Rear Dual Tires -->
          <rect x="2" y="38" width="4.5" height="10" rx="1.5" fill="#1e293b" stroke="#090d16" stroke-width="0.5"/>
          <rect x="27.5" y="38" width="4.5" height="10" rx="1.5" fill="#1e293b" stroke="#090d16" stroke-width="0.5"/>
          <rect x="3" y="40" width="2.5" height="6" rx="0.5" fill="#64748b"/>
          <rect x="28.5" y="40" width="2.5" height="6" rx="0.5" fill="#64748b"/>

          <!-- Side View Mirrors -->
          <path d="M 5 13 L 1 11 L 1 14 L 5 15 Z" fill="#0f172a"/>
          <circle cx="1.5" cy="12.5" r="1.2" fill="#38bdf8"/>
          <path d="M 29 13 L 33 11 L 33 14 L 29 15 Z" fill="#0f172a"/>
          <circle cx="32.5" cy="12.5" r="1.2" fill="#38bdf8"/>

          <!-- Front Cab Hood & Bumper -->
          <path d="M 6 7 Q 17 4 28 7 L 28 10 L 6 10 Z" fill="#334155"/>
          <!-- Headlights -->
          <rect x="6.5" y="5.5" width="4" height="2" rx="0.8" fill="#fef08a" stroke="#eab308" stroke-width="0.3"/>
          <rect x="23.5" y="5.5" width="4" height="2" rx="0.8" fill="#fef08a" stroke="#eab308" stroke-width="0.3"/>

          <!-- Cab Main Body (White) -->
          <path d="M 5.5 10 Q 17 7.5 28.5 10 L 28.5 21 L 5.5 21 Z" fill="url(#cab-top-grad)" stroke="#94a3b8" stroke-width="0.5"/>

          <!-- Curved Windshield with Wipers -->
          <path d="M 7 10.5 Q 17 8.5 27 10.5 L 26 14.5 Q 17 13 8 14.5 Z" fill="url(#windshield-top-grad)" stroke="#090d16" stroke-width="0.4"/>
          <line x1="12" y1="13.5" x2="15" y2="11" stroke="#94a3b8" stroke-width="0.4"/>
          <line x1="19" y1="13.5" x2="22" y2="11" stroke="#94a3b8" stroke-width="0.4"/>

          <!-- Cab Roof Ribs -->
          <rect x="7.5" y="15" width="19" height="5" rx="0.8" fill="#f8fafc" stroke="#cbd5e1" stroke-width="0.4"/>
          <line x1="11" y1="15.5" x2="11" y2="19.5" stroke="#cbd5e1" stroke-width="0.6"/>
          <line x1="17" y1="15.5" x2="17" y2="19.5" stroke="#cbd5e1" stroke-width="0.6"/>
          <line x1="23" y1="15.5" x2="23" y2="19.5" stroke="#cbd5e1" stroke-width="0.6"/>

          <!-- Waste Container Frame Outer -->
          <rect x="4.5" y="22" width="25" height="29" rx="1.5" fill="#0f172a" stroke="#334155" stroke-width="0.5"/>

          <!-- Wet Waste Hopper (Front Green Section) -->
          <rect x="5.5" y="23" width="23" height="13" rx="0.8" fill="url(#wet-bin-grad)" stroke="#15803d" stroke-width="0.4"/>
          <!-- Wet Compartment Cavity Depth -->
          <rect x="7" y="24.5" width="20" height="10" rx="0.5" fill="#14532d" fill-opacity="0.3"/>
          <line x1="5.5" y1="27" x2="28.5" y2="27" stroke="#86efac" stroke-width="0.4" opacity="0.6"/>
          <line x1="5.5" y1="32" x2="28.5" y2="32" stroke="#86efac" stroke-width="0.4" opacity="0.6"/>

          <!-- Swachh Bharat Specs Logo (White vector) -->
          <circle cx="14.5" cy="29.5" r="1.6" fill="none" stroke="#ffffff" stroke-width="0.5" opacity="0.9"/>
          <circle cx="19.5" cy="29.5" r="1.6" fill="none" stroke="#ffffff" stroke-width="0.5" opacity="0.9"/>
          <line x1="16.1" y1="29.5" x2="17.9" y2="29.5" stroke="#ffffff" stroke-width="0.5" opacity="0.9"/>

          <!-- Divider Partition -->
          <rect x="4.5" y="36.5" width="25" height="1.8" fill="#1e293b" stroke="#090d16" stroke-width="0.3"/>

          <!-- Dry Waste Hopper (Rear Blue Section) -->
          <rect x="5.5" y="38.5" width="23" height="11.5" rx="0.8" fill="url(#dry-bin-grad)" stroke="#0369a1" stroke-width="0.4"/>
          <!-- Dry Compartment Cavity Depth -->
          <rect x="7" y="39.5" width="20" height="9.5" rx="0.5" fill="#082f49" fill-opacity="0.3"/>
          <line x1="5.5" y1="42.5" x2="28.5" y2="42.5" stroke="#7dd3fc" stroke-width="0.4" opacity="0.6"/>
          <line x1="5.5" y1="46.5" x2="28.5" y2="46.5" stroke="#7dd3fc" stroke-width="0.4" opacity="0.6"/>

          <!-- Rear Tailgate, Bumper & Tail Lights -->
          <rect x="5" y="50.5" width="24" height="2" rx="0.5" fill="#0f172a"/>
          <rect x="5.5" y="51" width="3" height="1.2" rx="0.2" fill="#ef4444"/>
          <rect x="25.5" y="51" width="3" height="1.2" rx="0.2" fill="#ef4444"/>
          <rect x="9.5" y="51" width="1.5" height="1.2" fill="#f59e0b"/>
          <rect x="23" y="51" width="1.5" height="1.2" fill="#f59e0b"/>
        </svg>
      </div>

      <!-- Live / Offline Status Micro-Dot (Green = Operational, Red = Offline) -->
      <div style="
        position: absolute;
        top: -1px;
        right: -1px;
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: ${isLive ? '#22c55e' : '#ef4444'};
        border: 1px solid #090d16;
        box-shadow: 0 0 6px ${isLive ? '#22c55e' : '#ef4444'};
        z-index: 3;
      "></div>
    </div>
  `;
}

/**
 * Creates the authoritative Leaflet DivIcon for Top-Down Municipal Waste Truck.
 */
export function create3DTruckMarkerIcon({
  heading = 0,
  theme = TRUCK_COLOR_THEMES.municipal_dual,
  isLive = true,
  scale = 1.0,
  isSelected = false,
}) {
  const width = Math.round(34 * scale);
  const height = Math.round(54 * scale);

  const html = generateTopDownTruckSvg({
    heading,
    accentColor: theme.accent || '#00d9ff',
    isLive,
    scale,
    isSelected,
  });

  return L.divIcon({
    html,
    className: 'swstp-3d-truck-icon',
    iconSize: [width, height],
    iconAnchor: [width / 2, height / 2],
    popupAnchor: [0, -height / 2],
  });
}
