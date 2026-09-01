import { useRef, useMemo, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import * as THREE from 'three';
import { WORLD_OUTLINES, INDIA_BOUNDARY } from '../assets/worldOutlines.js';

const EARTH_RADIUS = 1.6;
const SKY_RADIUS = 1.4;

/**
 * Converts Geographic Latitude & Longitude (degrees) to 3D Cartesian Position on Earth Sphere.
 */
export function latLonToVector3(lat, lon, radius = EARTH_RADIUS) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);

  const x = -(radius * Math.sin(phi) * Math.cos(theta));
  const z = radius * Math.sin(phi) * Math.sin(theta);
  const y = radius * Math.cos(phi);

  return new THREE.Vector3(x, y, z);
}

/**
 * Computes Satellite 3D Position relative to Receiver using East-North-Up (ENU) Local Tangent Frame.
 * Derived strictly from real GSV azimuth and elevation reported by Arduino hardware.
 */
export function getSatellitePositionENU(receiverPos, lat, lon, elevationDeg, azimuthDeg) {
  if (lat == null || lon == null || isNaN(lat) || isNaN(lon)) {
    // Default zenith fallback relative to default North Pole receiver
    const el = Math.max(0, Math.min(90, elevationDeg ?? 30));
    const az = (azimuthDeg ?? 0) % 360;
    const elRad = (el * Math.PI) / 180;
    const azRad = (az * Math.PI) / 180;

    const horizDist = SKY_RADIUS * Math.cos(elRad);
    const x = horizDist * Math.sin(azRad);
    const y = SKY_RADIUS * Math.sin(elRad);
    const z = -horizDist * Math.cos(azRad);

    return new THREE.Vector3(receiverPos.x + x, receiverPos.y + y, receiverPos.z + z);
  }

  const el = Math.max(0, Math.min(90, elevationDeg ?? 30));
  const az = (azimuthDeg ?? 0) % 360;

  const elRad = (el * Math.PI) / 180;
  const azRad = (az * Math.PI) / 180;

  // Local ENU Tangent Frame Vectors centered at Receiver
  const Up = receiverPos.clone().normalize();
  let East = new THREE.Vector3(-Math.sin((lon * Math.PI) / 180), 0, Math.cos((lon * Math.PI) / 180)).normalize();
  if (East.lengthSq() < 0.001) East = new THREE.Vector3(1, 0, 0);
  const North = new THREE.Vector3().crossVectors(Up, East).normalize();

  // Local ENU direction vector: x=East (sin az * cos el), y=North (cos az * cos el), z=Up (sin el)
  const eComp = Math.sin(azRad) * Math.cos(elRad);
  const nComp = Math.cos(azRad) * Math.cos(elRad);
  const uComp = Math.sin(elRad);

  const satOffset = new THREE.Vector3()
    .addScaledVector(East, eComp * SKY_RADIUS)
    .addScaledVector(North, nComp * SKY_RADIUS)
    .addScaledVector(Up, uComp * SKY_RADIUS);

  return receiverPos.clone().add(satOffset);
}

function EarthMesh() {
  const earthGroupRef = useRef();

  useFrame((_, delta) => {
    if (earthGroupRef.current) {
      earthGroupRef.current.rotation.y += delta * 0.03;
    }
  });

  // Pre-generate Geographic Country Outlines & India Boundary geometries
  const boundaryGeometries = useMemo(() => {
    const geometries = [];

    const processPoints = (pts) => {
      const vecPoints = pts.map(([lon, lat]) => latLonToVector3(lat, lon, EARTH_RADIUS * 1.003));
      return new THREE.BufferGeometry().setFromPoints(vecPoints);
    };

    // India Boundary (J&K, PoK, Aksai Chin)
    geometries.push({
      geom: processPoints(INDIA_BOUNDARY),
      color: '#00d9ff',
      linewidth: 2,
    });

    // World outlines
    WORLD_OUTLINES.forEach((feature) => {
      if (Array.isArray(feature[0])) {
        feature.forEach((ring) => {
          if (Array.isArray(ring) && ring.length > 2) {
            geometries.push({
              geom: processPoints(ring),
              color: '#475569',
              linewidth: 1,
            });
          }
        });
      }
    });

    return geometries;
  }, []);

  return (
    <group ref={earthGroupRef}>
      {/* Central Earth Globe Sphere */}
      <mesh>
        <sphereGeometry args={[EARTH_RADIUS, 36, 36]} />
        <meshStandardMaterial color="#1e293b" roughness={0.6} metalness={0.1} />
      </mesh>

      {/* Lat/Lon Engineering Grid Lines */}
      <mesh>
        <sphereGeometry args={[EARTH_RADIUS * 1.001, 24, 16]} />
        <meshBasicMaterial color="#334155" wireframe transparent opacity={0.4} />
      </mesh>

      {/* Geographic World Country & India Outlines */}
      {boundaryGeometries.map((bg, idx) => (
        <lineLoop key={idx} geometry={bg.geom}>
          <lineBasicMaterial color={bg.color} transparent opacity={0.8} />
        </lineLoop>
      ))}

      {/* Equator Ring */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[EARTH_RADIUS + 0.002, EARTH_RADIUS + 0.01, 64]} />
        <meshBasicMaterial color="#64748b" side={THREE.DoubleSide} transparent opacity={0.6} />
      </mesh>
    </group>
  );
}

function ReceiverMarker({ position, hasFix, lat, lon }) {
  return (
    <group position={position.toArray()}>
      {/* Hardware Receiver Box Representation */}
      <mesh position={[0, 0.04, 0]}>
        <boxGeometry args={[0.2, 0.06, 0.2]} />
        <meshStandardMaterial
          color={hasFix ? '#2dc653' : '#00d9ff'}
          emissive={hasFix ? '#2dc653' : '#00d9ff'}
          emissiveIntensity={0.4}
          roughness={0.2}
        />
      </mesh>
      {/* Receiver Patch Antenna (Gold/Copper) */}
      <mesh position={[0, 0.08, 0]}>
        <boxGeometry args={[0.14, 0.02, 0.14]} />
        <meshStandardMaterial color="#e9c46a" roughness={0.2} metalness={0.9} />
      </mesh>

      <Html position={[0, 0.22, 0]} center distanceFactor={10}>
        <div style={{
          fontFamily: 'var(--text-mono)',
          fontSize: '9px',
          fontWeight: 700,
          background: 'var(--bg-base)',
          color: hasFix ? 'var(--status-ok)' : '#00d9ff',
          border: `1.5px solid ${hasFix ? 'var(--status-ok)' : '#00d9ff'}`,
          padding: '2px 7px',
          borderRadius: '2px',
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          boxShadow: '0 0 10px rgba(0,0,0,0.5)',
          letterSpacing: '0.06em',
        }}>
          {hasFix ? `FIX: ${lat?.toFixed(4)}°, ${lon?.toFixed(4)}°` : 'NEO-6M RECEIVER'}
        </div>
      </Html>
    </group>
  );
}

function SatelliteNode({ sat, receiverPos, lat, lon, isSelected, onSelect }) {
  const [hovered, setHovered] = useState(false);

  const pos = useMemo(
    () => getSatellitePositionENU(receiverPos, lat, lon, sat.elevation, sat.azimuth),
    [receiverPos, lat, lon, sat.elevation, sat.azimuth]
  );

  const isUsed = Boolean(sat.used_in_fix);
  const snr = sat.snr;

  let baseColor = '#94a3b8';
  if (isUsed) {
    baseColor = '#2dc653';
  } else if (snr != null && snr >= 25) {
    baseColor = '#00b4d8';
  } else if (snr != null && snr > 0) {
    baseColor = '#f48c06';
  }

  const nodeColor = isSelected ? '#ffffff' : baseColor;
  const nodeSize = isSelected ? 0.16 : (hovered ? 0.14 : (isUsed ? 0.12 : 0.09));

  const lineGeometry = useMemo(() => {
    return new THREE.BufferGeometry().setFromPoints([receiverPos, pos]);
  }, [receiverPos, pos]);

  return (
    <group>
      {/* Connecting Line from Receiver -> Satellite for all visible satellites */}
      <line geometry={lineGeometry}>
        <lineBasicMaterial
          color={isUsed ? '#2dc653' : '#64748b'}
          transparent
          opacity={isUsed ? 0.7 : 0.35}
          linewidth={isUsed ? 1.5 : 1.0}
        />
      </line>

      {/* Satellite Node Mesh */}
      <mesh
        position={pos.toArray()}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(sat);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = 'auto';
        }}
      >
        <sphereGeometry args={[nodeSize, 16, 16]} />
        <meshStandardMaterial
          color={nodeColor}
          emissive={nodeColor}
          emissiveIntensity={isSelected ? 1.0 : (isUsed ? 0.8 : 0.4)}
          roughness={0.1}
        />
      </mesh>

      {/* Selected Halo Ring */}
      {isSelected && (
        <mesh position={pos.toArray()}>
          <ringGeometry args={[nodeSize + 0.04, nodeSize + 0.08, 32]} />
          <meshBasicMaterial color="#00d9ff" side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* PRN Label */}
      <Html position={pos.toArray()} center distanceFactor={10}>
        <div
          onClick={(e) => {
            e.stopPropagation();
            onSelect(sat);
          }}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          style={{
            fontFamily: 'var(--text-mono)',
            fontSize: '9px',
            fontWeight: isSelected ? 700 : 600,
            background: isSelected ? '#ffffff' : (isUsed ? '#2dc653' : 'var(--bg-base)'),
            color: isSelected ? '#000000' : (isUsed ? '#000000' : nodeColor),
            border: `1.5px solid ${isSelected ? '#00d9ff' : nodeColor}`,
            padding: '1px 6px',
            borderRadius: '2px',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            userSelect: 'none',
            boxShadow: isSelected ? '0 0 10px rgba(0, 217, 255, 0.8)' : '0 2px 6px rgba(0,0,0,0.6)',
            transform: hovered || isSelected ? 'scale(1.12)' : 'scale(1)',
          }}
        >
          PRN {sat.prn != null ? String(sat.prn).padStart(2, '0') : '??'}
        </div>
      </Html>
    </group>
  );
}

export default function GNSSGlobe3D({ satellites = [], selectedSat, onSelectSatellite, gnssFix }) {
  const hasFix = Boolean(gnssFix?.valid && gnssFix?.lat != null && gnssFix?.lon != null);
  const lat = hasFix ? gnssFix.lat : null;
  const lon = hasFix ? gnssFix.lon : null;

  const receiverPos = useMemo(() => {
    if (hasFix && lat != null && lon != null) {
      return latLonToVector3(lat, lon, EARTH_RADIUS + 0.05);
    }
    // Default position when no fix
    return new THREE.Vector3(0, EARTH_RADIUS + 0.08, 0);
  }, [hasFix, lat, lon]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', background: 'var(--bg-base)' }}>
      {/* Top-Left Engineering Overlay Label */}
      <div style={{
        position: 'absolute',
        top: '12px',
        left: '12px',
        zIndex: 10,
        fontFamily: 'var(--text-mono)',
        fontSize: '10px',
        fontWeight: 600,
        color: 'var(--text-primary)',
        background: 'var(--bg-panel)',
        border: '1px solid var(--border)',
        borderLeft: '3px solid #00d9ff',
        padding: '6px 12px',
        letterSpacing: '0.08em',
        pointerEvents: 'none',
      }}>
        {hasFix ? `POSITION: ${lat?.toFixed(5)}°, ${lon?.toFixed(5)}°` : 'SATELLITE VIEW: RECEIVER-CENTRIC'}
      </div>

      {/* Top-Right Flag & Receiver Identifier Overlay */}
      <div style={{
        position: 'absolute',
        top: '12px',
        right: '12px',
        zIndex: 10,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        background: 'var(--bg-panel)',
        border: '1px solid var(--border)',
        borderRight: '3px solid #00d9ff',
        padding: '6px 12px',
        pointerEvents: 'none',
      }}>
        <span style={{ fontSize: '18px', lineHeight: '1', marginBottom: '4px' }}>🇮🇳</span>
        <span style={{
          fontFamily: 'var(--text-mono)',
          fontSize: '9.5px',
          fontWeight: 700,
          color: '#00d9ff',
          letterSpacing: '0.08em',
          whiteSpace: 'nowrap',
        }}>
          SWSTP TELEMETRY
        </span>
      </div>

      <Canvas camera={{ position: [0, 2.5, 4.5], fov: 45 }}>
        <ambientLight intensity={0.9} />
        <directionalLight position={[5, 5, 5]} intensity={1.2} />
        <pointLight position={[-5, -5, -5]} intensity={0.4} />

        <EarthMesh />
        <ReceiverMarker position={receiverPos} hasFix={hasFix} lat={lat} lon={lon} />

        {satellites.map((sat) => {
          const constellation = String(sat.constellation || 'UNKNOWN').toUpperCase();
          const satKey = `${constellation}_${sat.prn}`;
          const isSelected = selectedSat?.key === satKey || selectedSat?.prn === sat.prn;

          return (
            <SatelliteNode
              key={satKey}
              sat={sat}
              receiverPos={receiverPos}
              lat={lat}
              lon={lon}
              isSelected={isSelected}
              onSelect={onSelectSatellite}
            />
          );
        })}

        <OrbitControls enablePan enableZoom minDistance={2.2} maxDistance={8.0} />
      </Canvas>
    </div>
  );
}
