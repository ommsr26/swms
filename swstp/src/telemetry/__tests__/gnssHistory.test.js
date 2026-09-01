import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { useGNSSHistoryStore, getGNSSHistoryArray } from '../gnssHistoryStore.js';
import { resetSession, resetSerialDisconnect } from '../telemetryStore.js';

describe('GNSS Satellite History & Event Log Unit Tests', () => {
  it('tracks satellite observation episodes, safeguards disconnects, and deduplicates gsv_seq', () => {
    resetSession();
    let history = getGNSSHistoryArray();
    assert.equal(history.length, 0, 'History must be empty initially');

    // 1. Test New Satellite First Observation
    const pkt1 = {
      ts: 1770970010,
      rtc: { iso: "2026-08-13 14:42:10", epoch: 1770970010 },
      gnss: {
        valid: true,
        fix: "FIX_3D",
        gsv_seq: 1,
        gsv_uptime_ms: 10000,
        satellites_detail: [
          { prn: 7, constellation: "GPS", elevation: 42, azimuth: 173, snr: 28, used_in_fix: true },
          { prn: 13, constellation: "GPS", elevation: 65, azimuth: 45, snr: 38, used_in_fix: true }
        ]
      }
    };

    useGNSSHistoryStore.getState().processGSVSnapshot(pkt1);
    history = getGNSSHistoryArray();

    assert.equal(history.length, 2, 'History must contain 2 observed satellites');
    const prn7 = useGNSSHistoryStore.getState().satellitesMap['GPS_7'];

    assert.ok(prn7, 'PRN 07 GPS record must exist');
    assert.equal(prn7.prn, 7);
    assert.equal(prn7.constellation, 'GPS');
    assert.equal(prn7.status, 'USED IN FIX');
    assert.equal(prn7.currentlyVisible, true);
    assert.equal(prn7.firstSeenTimestamp, '2026-08-13 14:42:10');
    assert.equal(prn7.lastSeenTimestamp, '2026-08-13 14:42:10');
    assert.equal(prn7.observationCount, 1);
    assert.equal(prn7.lastSNR, 28);
    assert.equal(prn7.episodes.length, 1);

    // 2. Test Continuous Observation Updates
    const pkt2 = {
      ts: 1770970014,
      rtc: { iso: "2026-08-13 14:42:14", epoch: 1770970014 },
      gnss: {
        valid: true,
        fix: "FIX_3D",
        gsv_seq: 2,
        gsv_uptime_ms: 14000,
        satellites_detail: [
          { prn: 7, constellation: "GPS", elevation: 44, azimuth: 175, snr: 32, used_in_fix: true },
          { prn: 13, constellation: "GPS", elevation: 67, azimuth: 47, snr: 40, used_in_fix: true }
        ]
      }
    };

    useGNSSHistoryStore.getState().processGSVSnapshot(pkt2);
    const prn7Updated = useGNSSHistoryStore.getState().satellitesMap['GPS_7'];

    assert.equal(prn7Updated.observationCount, 2);
    assert.equal(prn7Updated.lastSeenTimestamp, '2026-08-13 14:42:14');
    assert.equal(prn7Updated.lastSNR, 32);
    assert.equal(prn7Updated.peakSNR, 32);
    assert.equal(prn7Updated.trackedDurationMs, 4000);
    assert.equal(prn7Updated.episodes[0].durationMs, 4000);

    // 3. Test Satellite Disappearance (PRN 07 disappears from valid GSV snapshot)
    const pkt3 = {
      ts: 1770970018,
      rtc: { iso: "2026-08-13 14:42:18", epoch: 1770970018 },
      gnss: {
        valid: true,
        fix: "FIX_3D",
        gsv_seq: 3,
        gsv_uptime_ms: 18000,
        satellites_detail: [
          { prn: 13, constellation: "GPS", elevation: 68, azimuth: 48, snr: 40, used_in_fix: true }
        ]
      }
    };

    useGNSSHistoryStore.getState().processGSVSnapshot(pkt3);
    const prn7Lost = useGNSSHistoryStore.getState().satellitesMap['GPS_7'];

    assert.equal(prn7Lost.currentlyVisible, false, 'PRN 07 must be currentlyVisible = false');
    assert.equal(prn7Lost.status, 'LOST', 'PRN 07 status must be LOST');
    assert.equal(prn7Lost.lastSNR, 32, 'PRN 07 lastSNR must be retained');
    assert.equal(prn7Lost.lastElevation, 44, 'PRN 07 lastElevation must be retained');
    assert.equal(getGNSSHistoryArray().length, 2, 'History array length must remain 2 (retained!)');

    // 4. Test Safeguard: satellites_detail = null does NOT mark satellites LOST
    const pktNull = {
      ts: 1770970020,
      rtc: { iso: "2026-08-13 14:42:20", epoch: 1770970020 },
      gnss: { valid: false, gsv_seq: 4, gsv_uptime_ms: 20000, satellites_detail: null }
    };

    useGNSSHistoryStore.getState().processGSVSnapshot(pktNull);
    const prn13StillActive = useGNSSHistoryStore.getState().satellitesMap['GPS_13'];

    assert.equal(prn13StillActive.currentlyVisible, true, 'PRN 13 must remain currentlyVisible = true despite null details');

    // 5. Test Satellite Reappearance (New Episode)
    const pkt4 = {
      ts: 1770970025,
      rtc: { iso: "2026-08-13 14:42:25", epoch: 1770970025 },
      gnss: {
        valid: true,
        fix: "FIX_3D",
        gsv_seq: 5,
        gsv_uptime_ms: 25000,
        satellites_detail: [
          { prn: 7, constellation: "GPS", elevation: 46, azimuth: 178, snr: 30, used_in_fix: false },
          { prn: 13, constellation: "GPS", elevation: 70, azimuth: 50, snr: 41, used_in_fix: true }
        ]
      }
    };

    useGNSSHistoryStore.getState().processGSVSnapshot(pkt4);
    const prn7Reappeared = useGNSSHistoryStore.getState().satellitesMap['GPS_7'];

    assert.equal(prn7Reappeared.currentlyVisible, true, 'PRN 07 must be currentlyVisible = true on reappearance');
    assert.equal(prn7Reappeared.status, 'TRACKED', 'PRN 07 status must be TRACKED');
    assert.equal(prn7Reappeared.episodes.length, 2, 'PRN 07 must have 2 visibility episodes');
    assert.equal(prn7Reappeared.episodes[1].firstSeen, '2026-08-13 14:42:25');

    // 6. Test Transport Disconnect Safeguard
    resetSerialDisconnect('USB unplugged');
    const prn7PostDisconnect = useGNSSHistoryStore.getState().satellitesMap['GPS_7'];

    assert.ok(prn7PostDisconnect, 'PRN 07 history record must exist after serial disconnect');
    assert.equal(getGNSSHistoryArray().length, 2, 'History records must remain in store');

    // 7. Test Session Reset
    resetSession();
    assert.equal(getGNSSHistoryArray().length, 0, 'resetSession() must clear history');

    // 8. Test 20 Hz gsv_seq Deduplication
    resetSession();

    const seqPkt = {
      ts: 1770971000,
      rtc: { iso: "2026-08-13 14:50:00", epoch: 1770971000 },
      gnss: {
        valid: true,
        gsv_seq: 17,
        gsv_uptime_ms: 10500,
        satellites_detail: [
          { prn: 5, constellation: "GPS", elevation: 30, azimuth: 120, snr: 35, used_in_fix: true }
        ]
      }
    };

    for (let i = 0; i < 20; i++) {
      useGNSSHistoryStore.getState().processGSVSnapshot({
        ...seqPkt,
        ts: 1770971000 + (i * 0.05),
        gnss: { ...seqPkt.gnss, gsv_uptime_ms: 10500 + (i * 50) }
      });
    }

    const prn5 = useGNSSHistoryStore.getState().satellitesMap['GPS_5'];
    assert.equal(prn5.observationCount, 1, 'observationCount must be 1 (not 20!)');
    assert.equal(prn5.episodes.length, 1, 'episodes length must be 1 (not 20!)');
  });
});
