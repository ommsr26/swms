/**
 * KpiRibbon.jsx — Compact horizontal KPI metric ribbon.
 *
 * Renders a strip of labeled numeric KPI cells separated by thin dividers.
 * Used across OfficerOverview (fleet ops stats) and AdminOverview (cross-ULB stats).
 * Strictly uses existing F1 design tokens — no new colors.
 *
 * Props:
 *   metrics: Array<{ label: string, value: string|number, color?: string, icon?: string }>
 *   loading: boolean
 */
export default function KpiRibbon({ metrics = [], loading = false }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 0,
      padding: '0',
      background: 'var(--bg-panel)',
      borderBottom: '1px solid var(--border)',
      flexShrink: 0,
      overflowX: 'auto',
    }}>
      {metrics.map((m, i) => (
        <div key={m.label} style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{
            padding: '8px 18px',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
            minWidth: '90px',
          }}>
            <div style={{
              fontFamily: 'var(--text-mono)',
              fontSize: '7.5px',
              fontWeight: 700,
              color: 'var(--text-dim)',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}>
              {m.icon && <span>{m.icon}</span>}
              {m.label}
            </div>
            <div style={{
              fontFamily: 'var(--text-mono)',
              fontSize: '15px',
              fontWeight: 700,
              color: loading ? 'var(--text-dim)' : (m.color || 'var(--text-primary)'),
              lineHeight: 1.1,
              letterSpacing: '-0.01em',
            }}>
              {loading ? '—' : (m.value ?? '—')}
            </div>
            {m.sub && (
              <div style={{
                fontFamily: 'var(--text-mono)',
                fontSize: '7.5px',
                color: 'var(--text-dim)',
              }}>
                {m.sub}
              </div>
            )}
          </div>
          {i < metrics.length - 1 && (
            <div style={{ width: '1px', height: '36px', background: 'var(--border)', flexShrink: 0 }} />
          )}
        </div>
      ))}
    </div>
  );
}
