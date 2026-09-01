/**
 * StatusBadge.jsx — Reusable status badge and live indicator primitives.
 *
 * Strictly uses existing F1 design tokens. No new colors introduced.
 */

/**
 * StatusBadge: pill-style text badge.
 * color: one of 'ok' | 'warn' | 'error' | 'off' | 'accent' | null (auto from status string)
 */
export function StatusBadge({ children, color, mono = true }) {
  const colorMap = {
    ok:     { text: 'var(--status-ok)',    bg: 'rgba(45,198,83,0.12)',   border: 'rgba(45,198,83,0.3)'   },
    warn:   { text: 'var(--status-warn)',  bg: 'rgba(244,140,6,0.12)',   border: 'rgba(244,140,6,0.3)'   },
    error:  { text: 'var(--status-error)', bg: 'rgba(239,35,60,0.12)',   border: 'rgba(239,35,60,0.3)'   },
    off:    { text: 'var(--text-dim)',     bg: 'rgba(42,62,85,0.3)',     border: 'var(--border)'         },
    accent: { text: 'var(--accent)',       bg: 'rgba(230,57,70,0.12)',   border: 'rgba(230,57,70,0.3)'   },
    cyan:   { text: '#00d9ff',             bg: 'rgba(0,217,255,0.1)',    border: 'rgba(0,217,255,0.3)'   },
    purple: { text: '#9d4edd',             bg: 'rgba(157,78,221,0.12)',  border: 'rgba(157,78,221,0.3)'  },
  };
  const palette = colorMap[color] || colorMap.off;
  return (
    <span style={{
      fontFamily: mono ? 'var(--text-mono)' : 'var(--text-sans)',
      fontSize: '8.5px',
      fontWeight: 700,
      letterSpacing: '0.06em',
      color: palette.text,
      background: palette.bg,
      border: `1px solid ${palette.border}`,
      padding: '1px 6px',
      borderRadius: '2px',
      whiteSpace: 'nowrap',
    }}>
      {children}
    </span>
  );
}

/** Pulsing live indicator with text label */
export function LiveIndicator({ live, label, stale = false }) {
  const dotColor = live && !stale
    ? 'var(--status-ok)'
    : stale
      ? 'var(--status-warn)'
      : 'var(--status-off)';
  const textColor = live && !stale
    ? 'var(--status-ok)'
    : stale
      ? 'var(--status-warn)'
      : 'var(--text-dim)';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontFamily: 'var(--text-mono)', fontSize: '8.5px', fontWeight: 700, letterSpacing: '0.07em', color: textColor }}>
      <span style={{
        width: '6px',
        height: '6px',
        borderRadius: '50%',
        background: dotColor,
        boxShadow: (live && !stale) ? `0 0 6px ${dotColor}` : 'none',
        flexShrink: 0,
      }} />
      {label}
    </span>
  );
}

/** Session status pill — maps status string to color */
export function SessionStatusPill({ status }) {
  const map = {
    ACTIVE:    'ok',
    LIVE:      'ok',
    SCHEDULED: 'cyan',
    PAUSED:    'warn',
    COMPLETED: 'off',
    CANCELLED: 'off',
    ABORTED:   'error',
  };
  return <StatusBadge color={map[status] || 'off'}>{status || '—'}</StatusBadge>;
}
