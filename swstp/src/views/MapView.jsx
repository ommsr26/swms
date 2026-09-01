/**
 * MapView.jsx — Map / GNSS Trajectory View (Debug Workstation)
 *
 * Connected container for the /debug Map screen. Reads live serial telemetry
 * and buffer tracks from Zustand and passes props to the shared
 * presentational component MapPresentation.jsx.
 */
import { useEffect, useState } from 'react';
import { useTelemetryStore, buffers } from '../telemetry/telemetryStore.js';
import MapPresentation from '../components/MapPresentation.jsx';

export default function MapView() {
  const { latest, sensorStatus } = useTelemetryStore();
  const [track, setTrack] = useState([]);

  useEffect(() => {
    const unsub = buffers.subscribe((b) => {
      if (b.track.length > 0) {
        const validTrack = b.track.filter(p => p && p.lat != null && p.lon != null && !isNaN(p.lat) && !isNaN(p.lon));
        setTrack(validTrack);
      }
    });
    return unsub;
  }, []);

  return (
    <MapPresentation
      latest={latest}
      sensorStatus={sensorStatus}
      track={track}
      isCloudPolled={false}
    />
  );
}

