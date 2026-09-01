import React, { useRef, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Text } from '@react-three/drei';
import * as THREE from 'three';
import { useTelemetryStore } from '../telemetry/telemetryStore.js';
import { MOUNTING_TRANSFORMS } from '../telemetry/imuTransforms.js';

function AxisArrow({ dir, color, label, position = [0, 0, 0] }) {
  const rotMap = {
    X: [0, 0, -Math.PI / 2],
    Y: [-Math.PI / 2, 0, 0], // Points forward along PCB surface (aligned with silk screen Y ↑)
    Z: [0, 0, 0],            // Points upward normal to PCB (+Z)
  };

  return (
    <group position={position} rotation={rotMap[dir] || [0, 0, 0]}>
      {/* Arrow Shaft */}
      <mesh position={[0, 0.4, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 0.8, 12]} />
        <meshBasicMaterial color={color} />
      </mesh>
      {/* Arrow Cone Tip */}
      <mesh position={[0, 0.85, 0]}>
        <coneGeometry args={[0.06, 0.15, 12]} />
        <meshBasicMaterial color={color} />
      </mesh>
      {/* Axis Text Label */}
      <Text position={[0, 1.05, 0]} fontSize={0.14} color={color}>
        {label}
      </Text>
    </group>
  );
}

function IMUBoardMesh({ axisConfig, mountingTransformKey = 'IDENTITY', imuData = null }) {
  const groupRef = useRef();
  const imuDataRef = useRef(imuData);
  imuDataRef.current = imuData;
  const transform = MOUNTING_TRANSFORMS[mountingTransformKey] || MOUNTING_TRANSFORMS.IDENTITY;

  useFrame(() => {
    if (!groupRef.current) return;
    const latest = imuDataRef.current || useTelemetryStore.getState().latest?.imu;
    const q = latest?.quaternion;
    const orient = latest?.orientation;

    if (q && q.w != null && q.x != null && q.y != null && q.z != null) {
      // Correct Mapping from IMU Sensor Frame to Three.js Scene Frame:
      // Three.js X (Right)        <-- IMU X (Lateral)
      // Three.js Y (Vertical/Up)  <-- IMU Z (Normal to PCB / Yaw Axis)
      // Three.js Z (Longitudinal) <-- -IMU Y (Pitch Axis, Y-axis flipped 180°)
      let rawQuat = new THREE.Quaternion(
        (q.x ?? 0) * (axisConfig.xSign || 1),
        (q.z ?? 0) * (axisConfig.zSign || 1),
        -(q.y ?? 0) * (axisConfig.ySign || 1),
        q.w ?? 1
      ).normalize();

      // Apply Sensor Mounting Frame Transformation
      const vehicleQuat = transform.transformQuaternion(rawQuat);
      groupRef.current.quaternion.slerp(vehicleQuat, 0.2);
    } else if (orient && (orient.roll != null || orient.pitch != null)) {
      const rollVal = orient.roll ?? 0;
      const pitchVal = orient.pitch ?? 0;
      const yawVal = orient.yaw ?? 0;
      const transformedOrient = transform.transformEuler(rollVal, pitchVal, yawVal);

      const r = (transformedOrient.roll * Math.PI) / 180 * (axisConfig.xSign || 1);
      const p = -(transformedOrient.pitch * Math.PI) / 180 * (axisConfig.ySign || 1);
      const y = (transformedOrient.yaw * Math.PI) / 180 * (axisConfig.zSign || 1);
      // Three.js Euler: X=Roll(r), Y=Yaw(y, vertical), Z=Pitch(p, longitudinal)
      const eulerQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(r, y, p, 'YXZ'));
      groupRef.current.quaternion.slerp(eulerQuat, 0.2);
    }
  });

  const pcbWidth = 1.6;
  const pcbHeight = 0.08;
  const pcbLength = 2.6;

  return (
    <group ref={groupRef}>
      {/* PCB Base Board (Deep Blue solder mask) */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[pcbWidth, pcbHeight, pcbLength]} />
        <meshStandardMaterial color="#0b3874" roughness={0.3} metalness={0.2} />
      </mesh>

      {/* Gold Pin Headers (10 Pins along Left Edge) */}
      {Array.from({ length: 10 }).map((_, i) => {
        const zPos = -1.1 + i * 0.24;
        return (
          <group key={i} position={[-0.65, 0.05, zPos]}>
            <mesh>
              <cylinderGeometry args={[0.07, 0.07, 0.09, 16]} />
              <meshStandardMaterial color="#d4af37" metalness={0.9} roughness={0.1} />
            </mesh>
            <mesh position={[0, 0, 0]}>
              <cylinderGeometry args={[0.035, 0.035, 0.22, 12]} />
              <meshStandardMaterial color="#050505" />
            </mesh>
          </group>
        );
      })}

      {/* Pin Labels (White Silkscreen text on PCB) */}
      {['VCC', 'GND', 'SCL', 'SDA', 'EDA', 'ECL', 'AD0', 'INT', 'NCS', 'FSYNC'].map((pin, i) => (
        <Text
          key={pin}
          position={[-0.42, 0.045, -1.1 + i * 0.24]}
          rotation={[-Math.PI / 2, 0, 0]}
          fontSize={0.07}
          color="#ffffff"
        >
          {pin}
        </Text>
      ))}

      {/* MPU-9250/6500 Main QFN IC Package (Center) */}
      <mesh position={[0.05, 0.07, 0.0]}>
        <boxGeometry args={[0.45, 0.06, 0.45]} />
        <meshStandardMaterial color="#1a1a1a" roughness={0.4} />
      </mesh>
      <Text
        position={[0.05, 0.101, 0.0]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.06}
        color="#a0a0a0"
      >
        MP92
      </Text>

      {/* Tantalum Capacitor (Orange block next to IC) */}
      <mesh position={[0.42, 0.08, 0.0]}>
        <boxGeometry args={[0.16, 0.08, 0.32]} />
        <meshStandardMaterial color="#d97706" roughness={0.3} />
      </mesh>

      {/* SMD Resistors / Capacitors */}
      {[-0.3, 0.25].map((z, idx) => (
        <mesh key={idx} position={[0.1, 0.06, z]}>
          <boxGeometry args={[0.14, 0.04, 0.08]} />
          <meshStandardMaterial color="#333333" />
        </mesh>
      ))}

      {/* Mounting Holes */}
      {[-1.0, 1.0].map((z, idx) => (
        <mesh key={idx} position={[0.55, 0, z]}>
          <cylinderGeometry args={[0.12, 0.12, 0.09, 24]} />
          <meshStandardMaterial color="#071d3d" />
        </mesh>
      ))}

      {/* Board Silk-screen coordinate indicator */}
      <Text
        position={[0.2, 0.045, 0.85]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.11}
        color="#ffffff"
      >
        Y ↑
      </Text>
      <Text
        position={[0.5, 0.045, 1.05]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.11}
        color="#ffffff"
      >
        X →
      </Text>

      {/* 3D Coordinate Axis Arrow Indicators (+X Red, +Y Green, +Z Blue) */}
      <group position={[0, 0.1, 0]}>
        <AxisArrow dir="X" color="#ef233c" label="+X" />
        <AxisArrow dir="Y" color="#2dc653" label="+Y" />
        <AxisArrow dir="Z" color="#00b4d8" label="+Z" />
      </group>
    </group>
  );
}

export default function IMUBoard3D({ axisConfig = { xSign: 1, ySign: 1, zSign: 1 }, mountingTransformKey = 'YAW_180', imuData = null }) {
  const controlsRef = useRef();

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', background: 'var(--bg-base)' }}>
      <Canvas
        camera={{ position: [2.5, 2.5, 3.5], fov: 45 }}
        style={{ width: '100%', height: '100%' }}
      >
        <ambientLight intensity={0.8} />
        <directionalLight position={[5, 8, 5]} intensity={1.2} />
        <directionalLight position={[-5, -4, -5]} intensity={0.4} />

        <Suspense fallback={null}>
          <IMUBoardMesh axisConfig={axisConfig} mountingTransformKey={mountingTransformKey} imuData={imuData} />
        </Suspense>

        <gridHelper args={[10, 20, '#1a293d', '#0d1622']} position={[0, -0.8, 0]} />
        <OrbitControls ref={controlsRef} enableDamping dampingFactor={0.05} />
      </Canvas>

      {/* Fixed Viewport Corner Axis Frame Legend */}
      <div style={{
        position: 'absolute',
        top: '12px',
        left: '12px',
        background: 'rgba(7,9,13,0.85)',
        border: '1px solid var(--border-mid)',
        padding: '8px 12px',
        fontFamily: 'var(--text-mono)',
        fontSize: '10px',
        pointerEvents: 'none',
        zIndex: 10,
      }}>
        <div style={{ color: 'var(--text-label)', fontSize: '9px', letterSpacing: '0.1em', marginBottom: '4px' }}>
          IMU BOARD FRAME & MOUNTING ARCHITECTURE
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <span style={{ color: '#ef233c' }}>+X (Longitudinal)</span>
          <span style={{ color: '#2dc653' }}>+Y (Lateral)</span>
          <span style={{ color: '#00b4d8' }}>+Z (Vertical)</span>
        </div>
      </div>

      <button
        className="btn btn--sm"
        style={{ position: 'absolute', bottom: '12px', right: '12px', zIndex: 10 }}
        onClick={() => controlsRef.current?.reset()}
      >
        RESET CAMERA
      </button>
    </div>
  );
}
