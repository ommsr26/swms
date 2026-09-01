/**
 * IMUView.jsx — 3D IMU & Spatial Orientation View (Debug Workstation)
 *
 * Connected container for the /debug IMU screen. Reads live serial telemetry
 * from Zustand useTelemetryStore and passes props to the shared
 * presentational component IMUPresentation.jsx.
 */
import { useTelemetryStore } from '../telemetry/telemetryStore.js';
import IMUPresentation from '../components/IMUPresentation.jsx';

export default function IMUView() {
  const { latest, activeFaults } = useTelemetryStore();

  return (
    <IMUPresentation
      latest={latest}
      activeFaults={activeFaults}
      isCloudPolled={false}
    />
  );
}

