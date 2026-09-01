import React, { useEffect, useState, useMemo } from 'react';
import { MapContainer, TileLayer, Polygon, Polyline, Circle, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { useTheme, cartoTileUrl } from '../../ThemeContext.jsx';
import { useSimulationStore, DEFAULT_ROAD_NODES, computeHouseFootprint, startSimulationEngine, stopSimulationEngine } from '../../telemetry/simulationStore.js';
import VehicleCommandDeck from '../../components/simulation/VehicleCommandDeck.jsx';
import { AnimatedVehicleMarker } from '../../components/fleet/VehicleMarker.jsx';

export default function SimulationDriveView() {
  const { theme } = useTheme();
  const {
    lat,
    lon,
    heading,
    speed,
    trajectory,
    houses,
    closestHouse,
    closestHouseDistanceM,
    isEligibleForCollection,
    collectionCircles,
    latestCapturedEvidence,
    isEvidenceModalOpen,
    closeEvidenceModal,
    capturePicture,
  } = useSimulationStore();

  const [selectedHouse, setSelectedHouse] = useState(null);

  // Start 20Hz simulation loop
  useEffect(() => {
    startSimulationEngine();
    return () => {
      stopSimulationEngine();
    };
  }, []);

  const mapCenter = [20.956112, 77.763861];

  const getHouseColor = (status) => {
    if (status === 'COLLECTED') return '#2dc653';     // Solid Green (Primary & Multi-event)
    if (status === 'INTERSECTED') return '#74c69d';   // Light Green (Adjacent 15m)
    return '#ef233c';                                 // Red (Not Collected)
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden', minHeight: 0 }}>
      {/* ─── FULL SCREEN LEAFLET MAP ────────────────────────────────────────── */}
      <div style={{ flex: 1, position: 'relative', width: '100%', height: '100%' }}>
        <MapContainer center={mapCenter} zoom={18} style={{ width: '100%', height: '100%' }} zoomControl={true}>
          <TileLayer url={cartoTileUrl(theme)} attribution='&copy; CARTO' maxZoom={20} />

          {/* 1. Road Geometry Line and Glow */}
          <Polyline
            positions={DEFAULT_ROAD_NODES.map((n) => [n.lat, n.lon])}
            pathOptions={{ color: '#00d9ff', weight: 4, opacity: 0.9 }}
          />
          <Polyline
            positions={DEFAULT_ROAD_NODES.map((n) => [n.lat, n.lon])}
            pathOptions={{ color: '#00d9ff', weight: 24, opacity: 0.15 }}
          />

          {/* 2. Rotated GIS House Footprints (Parallel to Road Corridor) */}
          {houses.map((h, i) => {
            const color = getHouseColor(h.status);
            const isSelected = selectedHouse?.id === h.id;
            const poly = computeHouseFootprint(h);

            return (
              <Polygon
                key={`sim-h-${h.id}-${i}`}
                positions={poly}
                pathOptions={{
                  color: color,
                  fillColor: color,
                  fillOpacity: isSelected ? 0.95 : (h.status === 'NOT_COLLECTED' || h.status === 'UNCOLLECTED' ? 0.45 : 0.8),
                  weight: isSelected ? 3 : 1.5,
                }}
                eventHandlers={{
                  click: () => setSelectedHouse(h),
                }}
              >
                <Tooltip sticky>
                  <div style={{ fontFamily: 'var(--text-mono)', fontSize: '11px', color: '#ffffff' }}>
                    <strong style={{ color }}>{h.id}: {h.address}</strong>
                    <div style={{ fontSize: '9px', marginTop: '2px' }}>
                      Status: <strong style={{ color }}>{h.status}</strong>
                    </div>
                  </div>
                </Tooltip>
              </Polygon>
            );
          })}

          {/* 3. Formed 15m Waste Collection Circles from Camera Captures (Main Algorithm) */}
          {collectionCircles.map((circ, idx) => (
            <Circle
              key={`sim-circ-${circ.id || idx}`}
              center={[circ.lat, circ.lon]}
              radius={circ.radius || 15}
              pathOptions={{
                color: '#2dc653',
                fillColor: '#2dc653',
                fillOpacity: 0.12,
                weight: 1.5,
                dashArray: '3, 4',
              }}
            >
              <Tooltip sticky>
                <div style={{ fontFamily: 'var(--text-mono)', fontSize: '10px', color: '#ffffff' }}>
                  <strong style={{ color: '#2dc653' }}>🎯 15M COLLECTION EVENT CIRCLE</strong>
                  <div>Time: {circ.timeStr} | Speed: {circ.speedKmh.toFixed(1)} km/h</div>
                  <div>Impacted: {circ.impactedHouseCount} house(s) ({circ.impactedHouseIds.join(', ') || 'None'})</div>
                </div>
              </Tooltip>
            </Circle>
          ))}

          {/* 4. Live Proximity Vehicle Radius Circle (15m) */}
          <Circle
            center={[lat, lon]}
            radius={15}
            pathOptions={{
              color: isEligibleForCollection ? (speed <= 5.0 ? '#2dc653' : '#f48c06') : 'rgba(0, 217, 255, 0.4)',
              fillColor: isEligibleForCollection ? (speed <= 5.0 ? '#2dc653' : '#f48c06') : '#00d9ff',
              fillOpacity: isEligibleForCollection ? 0.15 : 0.04,
              weight: 1.5,
              dashArray: isEligibleForCollection ? undefined : '4, 6',
            }}
          />

          {/* 5. Trajectory Breadcrumbs */}
          {trajectory.length > 1 && (
            <Polyline
              positions={trajectory.map((p) => [p.lat, p.lon])}
              pathOptions={{ color: '#f48c06', weight: 2.5, opacity: 0.7, dashArray: '2, 4' }}
            />
          )}

          {/* 6. Animated Virtual Garbage Truck Marker */}
          <AnimatedVehicleMarker
            position={[lat, lon]}
            heading={heading}
            speed={speed}
            color="#00d9ff"
            isLive={true}
            isSelected={true}
          />
        </MapContainer>

        {/* ─── FLOATING TOP-LEFT HUD ────────────────────────────────────────── */}
        <div
          style={{
            position: 'absolute',
            top: '12px',
            left: '12px',
            zIndex: 1000,
            background: 'rgba(10, 14, 22, 0.92)',
            border: '1px solid var(--border)',
            borderRadius: '4px',
            padding: '10px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            fontFamily: 'var(--text-mono)',
            fontSize: '9.5px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#2dc653', boxShadow: '0 0 6px #2dc653' }} />
            <span style={{ fontWeight: 800, color: '#00d9ff' }}>SIMULATED VEHICLE TRUCK-01</span>
          </div>
          <div style={{ color: 'var(--text-secondary)' }}>
            GPS: <strong style={{ color: '#ffffff' }}>{lat.toFixed(6)}°, {lon.toFixed(6)}°</strong>
          </div>
          <div style={{ color: 'var(--text-secondary)' }}>
            SPEED: <strong style={{ color: '#2dc653' }}>{speed.toFixed(1)} km/h</strong> | HDG: <strong style={{ color: '#ffffff' }}>{heading.toFixed(0)}°</strong>
          </div>
          <div style={{ color: 'var(--text-secondary)' }}>
            TARGET: <strong style={{ color: isEligibleForCollection ? '#2dc653' : 'var(--text-primary)' }}>{closestHouse?.id} ({closestHouseDistanceM.toFixed(1)}m)</strong>
          </div>
        </div>

        {/* ─── FLOATING GIS LEGEND ───────────────────────────────────────────── */}
        <div
          style={{
            position: 'absolute',
            bottom: '220px',
            left: '12px',
            zIndex: 1000,
            background: 'rgba(7, 9, 13, 0.92)',
            border: '1px solid var(--border-mid)',
            borderRadius: '3px',
            padding: '8px 12px',
            fontFamily: 'var(--text-mono)',
            fontSize: '9px',
            display: 'flex',
            flexDirection: 'column',
            gap: '5px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
          }}
        >
          <div style={{ color: '#00d9ff', fontWeight: 700, letterSpacing: '0.08em', marginBottom: '2px' }}>
            SIDDHIVINAYAK NAGAR GIS LAYER
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: '10px', height: '10px', background: '#ef233c', display: 'inline-block' }} />
            <span style={{ color: '#ef233c' }}>NOT COLLECTED</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: '10px', height: '10px', background: '#74c69d', display: 'inline-block' }} />
            <span style={{ color: '#74c69d' }}>INTERSECTED (15m ADJACENT)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: '10px', height: '10px', background: '#2dc653', display: 'inline-block' }} />
            <span style={{ color: '#2dc653' }}>COLLECTED (PRIMARY / MULTI)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: '10px', height: '1px', borderTop: '1.5px dashed #2dc653', display: 'inline-block' }} />
            <span style={{ color: '#2dc653' }}>15m DETECTION CIRCLE</span>
          </div>
        </div>

        {/* ─── FLOATING BOTTOM VEHICLE COMMAND DECK ──────────────────────────── */}
        <div
          style={{
            position: 'absolute',
            bottom: '12px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1000,
            maxWidth: '920px',
            width: 'calc(100% - 24px)',
          }}
        >
          <VehicleCommandDeck />
        </div>
      </div>

      {/* ─── CAPTURED EVIDENCE IMAGE MODAL POPUP ────────────────────────────── */}
      {isEvidenceModalOpen && latestCapturedEvidence && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 2000,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
        >
          <div
            style={{
              background: 'var(--bg-panel)',
              border: '2px solid #00d9ff',
              borderRadius: '6px',
              maxWidth: '680px',
              width: '100%',
              boxShadow: '0 12px 48px rgba(0, 217, 255, 0.3)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              animation: 'fadeIn 0.2s ease-out',
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '12px 16px',
                background: 'var(--bg-panel-2)',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '16px' }}>📸</span>
                <span style={{ fontFamily: 'var(--text-mono)', fontSize: '11px', fontWeight: 800, color: '#00d9ff' }}>
                  EVIDENCE PHOTO CAPTURED · {latestCapturedEvidence.houseId}
                </span>
              </div>
              <button
                onClick={closeEvidenceModal}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#ffffff',
                  fontSize: '18px',
                  cursor: 'pointer',
                  outline: 'none',
                }}
              >
                ✕
              </button>
            </div>

            {/* Modal Body with Image */}
            <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <img
                src={latestCapturedEvidence.photoUrl}
                alt="Captured Waste Evidence"
                style={{
                  width: '100%',
                  borderRadius: '4px',
                  border: '1px solid var(--border)',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
                }}
              />

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  background: 'var(--bg-panel-2)',
                  padding: '10px 14px',
                  borderRadius: '4px',
                  fontFamily: 'var(--text-mono)',
                  fontSize: '9.5px',
                  color: 'var(--text-secondary)',
                }}
              >
                <div>
                  <strong>PROPERTY:</strong> {latestCapturedEvidence.address}
                  <br />
                  <strong>STATUS:</strong> <span style={{ color: '#2dc653', fontWeight: 800 }}>TRASH COLLECTED (VERIFIED)</span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <strong>TIME:</strong> {new Date(latestCapturedEvidence.timestamp).toLocaleTimeString()}
                  <br />
                  <strong>DIST:</strong> {latestCapturedEvidence.distanceMeters}m from truck
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div
              style={{
                padding: '10px 16px',
                background: 'var(--bg-panel-2)',
                borderTop: '1px solid var(--border)',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '8px',
              }}
            >
              <button
                onClick={closeEvidenceModal}
                style={{
                  padding: '6px 16px',
                  fontFamily: 'var(--text-mono)',
                  fontSize: '9.5px',
                  fontWeight: 700,
                  color: '#000000',
                  background: '#00d9ff',
                  border: 'none',
                  borderRadius: '3px',
                  cursor: 'pointer',
                }}
              >
                CONFIRM & CLOSE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
