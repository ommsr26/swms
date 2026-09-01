/**
 * CoverageProgressBar.jsx — Road coverage progress visualization.
 *
 * Renders a compact progress bar showing covered vs uncovered road segments.
 * Used by OfficerCoverageView.
 *
 * Props:
 *   totalLengthM:    number|null
 *   coveredLengthM:  number|null
 *   roadName:        string|null
 *   loading:         boolean
 */
export default function CoverageProgressBar({ totalLengthM = null, coveredLengthM = null, roadName = null, loading = false }) {
  const pct = totalLengthM && coveredLengthM != null && totalLengthM > 0
    ? Math.min(100, (coveredLengthM / totalLengthM) * 100)
    : null;

  const fmtM = (m) => m != null ? (m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`) : '—';

  const barColor = pct == null ? 'var(--text-dim)' : pct >= 90 ? 'var(--status-ok)' : pct >= 50 ? 'var(--status-warn)' : 'var(--status-error)';

  return (
    <div style={{ padding: '8px 0' }}>
      {roadName && (
        <div style={{ fontFamily: 'var(--text-mono)', fontSize: '8.5px', color: 'var(--text-label)', marginBottom: '5px', letterSpacing: '0.05em' }}>
          {roadName}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {/* Progress bar */}
        <div style={{ flex: 1, height: '5px', background: 'var(--bg-panel-2)', borderRadius: '2px', overflow: 'hidden', border: '1px solid var(--border)' }}>
          {!loading && pct != null && (
            <div style={{
              width: `${pct}%`,
              height: '100%',
              background: barColor,
              transition: 'width 0.4s ease',
            }} />
          )}
        </div>
        {/* Pct label */}
        <span style={{ fontFamily: 'var(--text-mono)', fontSize: '9.5px', fontWeight: 700, color: loading ? 'var(--text-dim)' : barColor, minWidth: '38px', textAlign: 'right' }}>
          {loading ? '—' : pct != null ? `${pct.toFixed(1)}%` : '—'}
        </span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '3px' }}>
        <span style={{ fontFamily: 'var(--text-mono)', fontSize: '7.5px', color: 'var(--text-dim)' }}>
          Covered: {loading ? '…' : fmtM(coveredLengthM)}
        </span>
        <span style={{ fontFamily: 'var(--text-mono)', fontSize: '7.5px', color: 'var(--text-dim)' }}>
          Total: {loading ? '…' : fmtM(totalLengthM)}
        </span>
      </div>
    </div>
  );
}
