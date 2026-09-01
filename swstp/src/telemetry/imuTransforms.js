import * as THREE from 'three';

/**
 * Configurable IMU Sensor Mounting Transformation Frame Architecture:
 * MPU6500 SENSOR FRAME ---> MOUNTING TRANSFORM ---> VEHICLE FRAME ---> 3D MODEL
 */
export const MOUNTING_TRANSFORMS = {
  IDENTITY: {
    id: 'IDENTITY',
    name: 'DEFAULT / IDENTITY (Sensor = Vehicle Frame)',
    description: 'X\' = X, Y\' = Y, Z\' = Z',
    transformQuaternion: (quat) => quat,
    transformEuler: (roll, pitch, yaw) => ({ roll, pitch, yaw }),
  },

  YAW_180: {
    id: 'YAW_180',
    name: 'ROTATED 180° AROUND VERTICAL Z-AXIS',
    description: 'X\' = -X, Y\' = -Y, Z\' = Z (Breadboard rotated 180°)',
    transformQuaternion: (quat) => {
      // In Three.js scene, vertical normal axis is Y (0, 1, 0)
      const rotVertical180 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
      return quat.clone().multiply(rotVertical180);
    },
    transformEuler: (roll, pitch, yaw) => ({
      roll: -roll,
      pitch: -pitch,
      yaw: (yaw + 180) % 360,
    }),
  },

  FLIP_X_180: {
    id: 'FLIP_X_180',
    name: 'FLIPPED 180° AROUND LONGITUDINAL X-AXIS',
    description: 'X\' = X, Y\' = -Y, Z\' = -Z (Board flipped upside down)',
    transformQuaternion: (quat) => {
      const rotX180 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);
      return quat.clone().multiply(rotX180);
    },
    transformEuler: (roll, pitch, yaw) => ({
      roll,
      pitch: -pitch,
      yaw: -yaw,
    }),
  },

  FLIP_Y_180: {
    id: 'FLIP_Y_180',
    name: 'FLIPPED 180° AROUND LATERAL Y-AXIS',
    description: 'X\' = -X, Y\' = Y, Z\' = -Z (Board flipped pitch-wise)',
    transformQuaternion: (quat) => {
      // In Three.js scene, in-plane longitudinal axis is Z (0, 0, 1)
      const rotZ180 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI);
      return quat.clone().multiply(rotZ180);
    },
    transformEuler: (roll, pitch, yaw) => ({
      roll: -roll,
      pitch,
      yaw: -yaw,
    }),
  },
};
