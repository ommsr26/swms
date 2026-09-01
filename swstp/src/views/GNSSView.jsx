/**
 * GNSSView.jsx — GNSS Satellite Workstation View (Debug Workstation)
 *
 * Connected container for the /debug GNSS screen. Reads live serial telemetry
 * and satellite event records from Zustand & gnssHistoryStore and passes
 * props to the shared presentational component GNSSPresentation.jsx.
 */
import { useTelemetryStore } from '../telemetry/telemetryStore.js';
import { useGNSSHistoryStore } from '../telemetry/gnssHistoryStore.js';
import GNSSPresentation from '../components/GNSSPresentation.jsx';

export default function GNSSView() {
  const { latest, sensorStatus, sourceType } = useTelemetryStore();
  const satellitesMap = useGNSSHistoryStore((state) => state.satellitesMap);

  return (
    <GNSSPresentation
      latest={latest}
      sensorStatus={sensorStatus}
      sourceType={sourceType}
      satellitesMap={satellitesMap}
      isCloudPolled={false}
    />
  );
}

