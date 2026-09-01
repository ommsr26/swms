/**
 * TablePrimitives.jsx — Shared F1-style dense table primitives.
 *
 * Extracted from AdminPanels.jsx for reuse across Admin and Officer panels.
 * All styling strictly uses existing index.css tokens.
 */

// ─── Column Header ────────────────────────────────────────────────────────────
export function THead({ cols }) {
  return (
    <thead>
      <tr>
        {cols.map(c => (
          <th key={c} style={{
            fontFamily: 'var(--text-mono)',
            fontSize: '8.5px',
            fontWeight: 700,
            color: 'var(--text-dim)',
            letterSpacing: '0.1em',
            padding: '5px 10px',
            textAlign: 'left',
            background: 'var(--bg-panel-2)',
            borderBottom: '1px solid var(--border)',
            position: 'sticky',
            top: 0,
            whiteSpace: 'nowrap',
          }}>{c}</th>
        ))}
      </tr>
    </thead>
  );
}

// ─── Table Row with optional left accent ──────────────────────────────────────
export function TRow({ children, accent }) {
  return (
    <tr style={{ borderLeft: accent ? `2px solid ${accent}` : '2px solid transparent' }}>
      {children}
    </tr>
  );
}

// ─── Table Cell ───────────────────────────────────────────────────────────────
export function TD({ children, mono, dim, color }) {
  return (
    <td style={{
      padding: '5px 10px',
      fontFamily: mono ? 'var(--text-mono)' : 'var(--text-sans)',
      fontSize: mono ? '10px' : '11px',
      color: color || (dim ? 'var(--text-dim)' : 'var(--text-secondary)'),
      borderBottom: '1px solid var(--border)',
      whiteSpace: 'nowrap',
    }}>
      {children}
    </td>
  );
}

// ─── Online/Offline dot indicator ────────────────────────────────────────────
export function StatusDot({ ok }) {
  return (
    <span style={{
      display: 'inline-block',
      width: '6px',
      height: '6px',
      borderRadius: '50%',
      background: ok ? 'var(--status-ok)' : 'var(--status-off)',
      boxShadow: ok ? '0 0 5px var(--status-ok)' : 'none',
      marginRight: '6px',
      verticalAlign: 'middle',
    }} />
  );
}

// ─── Empty state row ──────────────────────────────────────────────────────────
export function EmptyRow({ cols, msg }) {
  return (
    <tr>
      <td colSpan={cols} style={{
        padding: '20px',
        fontFamily: 'var(--text-mono)',
        fontSize: '10px',
        color: 'var(--text-dim)',
        textAlign: 'center',
      }}>{msg}</td>
    </tr>
  );
}

// ─── Loading state row ────────────────────────────────────────────────────────
export function LoadingRow({ cols }) {
  return <EmptyRow cols={cols} msg="Loading from MSSQL…" />;
}
