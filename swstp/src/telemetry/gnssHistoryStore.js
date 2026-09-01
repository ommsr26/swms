import { create } from 'zustand';

function formatTimestamp(packet) {
  if (packet?.rtc?.iso) {
    return packet.rtc.iso;
  }
  if (packet?.ts != null) {
    return new Date(packet.ts * 1000).toISOString().replace('T', ' ').substring(0, 19);
  }
  const tMs = packet?.timestamp || Date.now();
  return new Date(tMs).toISOString().replace('T', ' ').substring(0, 19);
}

function formatEpochMs(packet) {
  if (packet?.gnss?.gsv_uptime_ms != null) {
    return Number(packet.gnss.gsv_uptime_ms);
  }
  if (packet?.uptime_ms != null) {
    return Number(packet.uptime_ms);
  }
  if (packet?.rtc?.epoch != null) {
    return Number(packet.rtc.epoch) * 1000;
  }
  if (packet?.ts != null) {
    return Number(packet.ts) * 1000;
  }
  return Number(packet?.timestamp || Date.now());
}

let _lastProcessedGsvSeq = null;
let _lastSnapshotHash = null;

export const useGNSSHistoryStore = create((set, get) => ({
  satellitesMap: {}, // key -> history record

  resetHistory: () => {
    _lastProcessedGsvSeq = null;
    _lastSnapshotHash = null;
    set({ satellitesMap: {} });
  },

  /**
   * Processes incoming GNSS telemetry packet.
   * Authoritative `gsv_seq` deduplication ensures satellite history is updated ONLY when
   * a genuine new GSV snapshot arrives from Arduino, ignoring identical 20 Hz packets.
   */
  processGSVSnapshot: (packet) => {
    if (!packet || !packet.gnss) return;
    const g = packet.gnss;

    // CRITICAL: satellites_detail is authoritative. If missing/null/not an array, do not touch history!
    if (!Array.isArray(g.satellites_detail)) {
      return;
    }

    // 1. Authoritative gsv_seq Deduplication
    if (g.gsv_seq != null) {
      if (_lastProcessedGsvSeq !== null && g.gsv_seq === _lastProcessedGsvSeq) {
        // Same GSV snapshot repeated over 20 Hz telemetry: IGNORE completely!
        return;
      }
      _lastProcessedGsvSeq = g.gsv_seq;
    } else {
      // Fallback hash check for legacy/mock data without firmware gsv_seq
      const currentSats = g.satellites_detail;
      const hashKey = currentSats.map(s => `${s.constellation}_${s.prn}`).sort().join('|');
      if (_lastSnapshotHash !== null && hashKey === _lastSnapshotHash && currentSats.length > 0) {
        return;
      }
      _lastSnapshotHash = hashKey;
    }

    const currentSats = g.satellites_detail;
    const pktTime = formatTimestamp(packet);
    const pktEpochMs = formatEpochMs(packet);

    const prevMap = get().satellitesMap;
    const nextMap = { ...prevMap };
    const observedKeys = new Set();
    let hasChanges = false;

    // 2. Process all satellites in the new GSV snapshot
    for (const sat of currentSats) {
      if (sat.prn == null || isNaN(sat.prn)) continue;

      const constellation = String(sat.constellation || 'UNKNOWN').toUpperCase();
      const key = `${constellation}_${sat.prn}`;
      observedKeys.add(key);

      const snr = sat.snr != null && !isNaN(sat.snr) ? Number(sat.snr) : null;
      const elevation = sat.elevation != null && !isNaN(sat.elevation) ? Number(sat.elevation) : null;
      const azimuth = sat.azimuth != null && !isNaN(sat.azimuth) ? Number(sat.azimuth) : null;
      const isUsed = Boolean(sat.used_in_fix);

      const existingRecord = nextMap[key];

      if (!existingRecord) {
        // --- FIRST SEEN DETECTION ---
        nextMap[key] = {
          key,
          prn: Number(sat.prn),
          constellation,
          firstSeenTimestamp: pktTime,
          lastSeenTimestamp: pktTime,
          firstSeenEpochMs: pktEpochMs,
          lastSeenEpochMs: pktEpochMs,
          trackedDurationMs: 0,
          status: isUsed ? 'USED IN FIX' : 'TRACKED',
          currentlyVisible: true,
          currentlyUsedInFix: isUsed,
          consecutiveMissing: 0,
          lastSNR: snr,
          peakSNR: snr,
          minimumSNR: snr,
          snrHistory: snr != null ? [{ timestamp: pktTime, snr }] : [],
          lastElevation: elevation,
          lastAzimuth: azimuth,
          firstElevation: elevation,
          firstAzimuth: azimuth,
          observationCount: 1,
          lastUpdateTimestamp: pktTime,
          episodes: [
            {
              episodeId: 1,
              firstSeen: pktTime,
              lastSeen: pktTime,
              firstEpochMs: pktEpochMs,
              lastEpochMs: pktEpochMs,
              durationMs: 0,
            },
          ],
        };
        hasChanges = true;
      } else {
        // --- CONTINUOUS OBSERVATION OR REAPPEARANCE ---
        const wasVisible = existingRecord.currentlyVisible;
        const newStatus = isUsed ? 'USED IN FIX' : 'TRACKED';
        const updatedEpisodes = [...existingRecord.episodes];

        if (!wasVisible) {
          // --- REAPPEARING SATELLITE (New Visibility Episode) ---
          updatedEpisodes.push({
            episodeId: updatedEpisodes.length + 1,
            firstSeen: pktTime,
            lastSeen: pktTime,
            firstEpochMs: pktEpochMs,
            lastEpochMs: pktEpochMs,
            durationMs: 0,
          });
        } else {
          // Update current episode (same episode continues!)
          const currentEpisode = { ...updatedEpisodes[updatedEpisodes.length - 1] };
          currentEpisode.lastSeen = pktTime;
          currentEpisode.lastEpochMs = pktEpochMs;
          currentEpisode.durationMs = Math.max(0, Math.round(pktEpochMs - currentEpisode.firstEpochMs));
          updatedEpisodes[updatedEpisodes.length - 1] = currentEpisode;
        }

        const totalTrackedMs = updatedEpisodes.reduce((sum, ep) => sum + (ep.durationMs || 0), 0);

        const updatedSnrHistory = [...existingRecord.snrHistory];
        if (snr != null) {
          if (updatedSnrHistory.length === 0 || updatedSnrHistory[updatedSnrHistory.length - 1].snr !== snr) {
            updatedSnrHistory.push({ timestamp: pktTime, snr });
            if (updatedSnrHistory.length > 60) updatedSnrHistory.shift();
          }
        }

        const newPeakSNR = snr != null ? (existingRecord.peakSNR == null ? snr : Math.max(existingRecord.peakSNR, snr)) : existingRecord.peakSNR;
        const newMinSNR = snr != null ? (existingRecord.minimumSNR == null ? snr : Math.min(existingRecord.minimumSNR, snr)) : existingRecord.minimumSNR;

        nextMap[key] = {
          ...existingRecord,
          currentlyVisible: true,
          currentlyUsedInFix: isUsed,
          consecutiveMissing: 0,
          status: newStatus,
          lastSeenTimestamp: pktTime,
          lastSeenEpochMs: pktEpochMs,
          lastUpdateTimestamp: pktTime,
          observationCount: existingRecord.observationCount + 1,
          lastElevation: elevation ?? existingRecord.lastElevation,
          lastAzimuth: azimuth ?? existingRecord.lastAzimuth,
          lastSNR: snr ?? existingRecord.lastSNR,
          peakSNR: newPeakSNR,
          minimumSNR: newMinSNR,
          snrHistory: updatedSnrHistory,
          episodes: updatedEpisodes,
          trackedDurationMs: totalTrackedMs,
        };
        hasChanges = true;
      }
    }

    // 3. DISAPPEARANCE / SATELLITE LOST DETECTION
    // Evaluated ONLY when a new valid GSV snapshot arrives and a satellite identity is absent
    for (const key of Object.keys(nextMap)) {
      const record = nextMap[key];
      if (record.currentlyVisible && !observedKeys.has(key)) {
        const missingCount = (record.consecutiveMissing || 0) + 1;
        // Require 1 consecutive missing snapshot hysteresis to eliminate single-cycle drops/flicker
        nextMap[key] = {
          ...record,
          consecutiveMissing: missingCount,
          currentlyVisible: false,
          currentlyUsedInFix: false,
          status: 'LOST',
        };
        hasChanges = true;
      }
    }

    if (hasChanges) {
      set({ satellitesMap: nextMap });
    }
  },
}));

export function getGNSSHistoryArray() {
  const map = useGNSSHistoryStore.getState().satellitesMap;
  return Object.values(map);
}
