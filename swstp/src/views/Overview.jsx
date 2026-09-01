/**
 * Overview.jsx — Engineering Control Overview View (Debug Workstation)
 *
 * Connected container for the /debug screen. Reads live serial telemetry
 * from Zustand useTelemetryStore and passes props to the shared
 * presentational component OverviewPresentation.jsx.
 */
import { useTelemetryStore } from '../telemetry/telemetryStore.js';
import OverviewPresentation from '../components/OverviewPresentation.jsx';

export default function Overview() {
  const {
    latest,
    sensorStatus,
    sessionElapsed,
    runCount,
    sessionId,
    mode,
    activeFaults,
    sourceType,
    serialConnected,
  } = useTelemetryStore();

  return (
    <OverviewPresentation
      latest={latest}
      sensorStatus={sensorStatus}
      sessionElapsed={sessionElapsed}
      runCount={runCount}
      sessionId={sessionId}
      mode={mode}
      activeFaults={activeFaults}
      sourceType={sourceType}
      serialConnected={serialConnected}
      isCloudPolled={false}
    />
  );
}

