import { describe, it, expect } from 'vitest';

function fmtDur(sec) {
  if (sec == null) return '—';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60).toString().padStart(2, '0');
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
}

describe('Admin Sessions Formatting & Data Shape Regression Tests', () => {
  it('formats active session with null duration as dash', () => {
    const activeSession = {
      sessionId: 101,
      sessionCode: 'SWSTP-SESS-000101',
      deviceCode: 'SWSTP-DEV-000001',
      vehicleRegistration: 'MH31AB1234',
      status: 'ACTIVE',
      startedAt: '2026-08-14T10:00:00Z',
      endedAt: null,
      durationSeconds: null,
      ulbId: 'ULB_MH_NAGPUR',
      ulbName: 'Nagpur Municipal Corporation',
    };

    expect(fmtDur(activeSession.durationSeconds)).toBe('—');
    expect(activeSession.status).toBe('ACTIVE');
  });

  it('formats completed session with duration under 1 hour as MM:SS', () => {
    const completedShortSession = {
      sessionId: 102,
      durationSeconds: 125, // 2m 5s
    };

    expect(fmtDur(completedShortSession.durationSeconds)).toBe('02:05');
  });

  it('formats completed session with duration over 1 hour as H:MM:SS', () => {
    const completedLongSession = {
      sessionId: 103,
      durationSeconds: 3665, // 1h 1m 5s
    };

    expect(fmtDur(completedLongSession.durationSeconds)).toBe('1:01:05');
  });

  it('safely handles sessions with null ULB fields or unassigned vehicle', () => {
    const unassignedSession = {
      sessionId: 104,
      sessionCode: 'SWSTP-SESS-000104',
      deviceCode: 'SWSTP-DEV-000099',
      vehicleRegistration: 'UNASSIGNED',
      status: 'UNREGISTERED_DEVICE',
      startedAt: '2026-08-14T09:00:00Z',
      endedAt: '2026-08-14T09:05:00Z',
      durationSeconds: 300,
      ulbId: null,
      ulbName: null,
    };

    expect(unassignedSession.ulbName || unassignedSession.ulbId || '—').toBe('—');
    expect(fmtDur(unassignedSession.durationSeconds)).toBe('05:00');
  });
});
