/**
 * AdminLayout.jsx — Admin console shell layout.
 *
 * Provides:
 *   - Compact view-header with cross-ULB context meta
 *   - ULB summary strip (cross-ULB only)
 *   - Horizontal tab navigation: 9 sections
 *   - URL-based navigation via React Router (tabs = routes)
 *   - Outlet for nested route content
 *
 * Navigation tabs:
 *   OVERVIEW | ULBS | FLEET | DEVICES | SESSIONS | TELEMETRY | CAMERAS | AUDIT | SYSTEM
 *
 * Admin role: cross-ULB READ ONLY inspection. No operational controls.
 *
 * Tab state is driven by the URL path (/admin/overview, /admin/fleet, etc.)
 * so browser refresh retains the active view.
 */
import { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { fetchAdminUlbs } from '../telemetry/backendApiClient.js';
import ErrorBoundary from '../components/ErrorBoundary.jsx';

const ADMIN_TABS = [
  { id: 'overview',   label: 'OVERVIEW'   },
  { id: 'timeline',   label: 'TIMELINE'   },
  { id: 'ulbs',       label: 'ULBS'       },
  { id: 'fleet',      label: 'FLEET'      },
  { id: 'devices',    label: 'DEVICES'    },
  { id: 'sessions',   label: 'SESSIONS'   },
  { id: 'telemetry',  label: 'TELEMETRY'  },
  { id: 'cameras',    label: 'CAMERAS'    },
  { id: 'audit',      label: 'AUDIT'      },
  { id: 'system',     label: 'SYSTEM'     },
];

// ─── ULB summary strip ────────────────────────────────────────────────────────
function UlbSummaryStrip({ ulbs, loading }) {
  if (loading || ulbs.length === 0) return null;
  return (
    <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', flexShrink: 0, overflowX: 'auto', background: 'var(--bg-base)' }}>
      {ulbs.map(u => (
        <div key={u.ulbId} style={{
          padding: '6px 14px',
          borderRight: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          gap: '2px',
          minWidth: '140px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
            <span style={{ fontFamily: 'var(--text-mono)', fontSize: '9px', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '0.04em' }}>
              {u.ulbName}
            </span>
            {u.safeZoneRadiusMeters != null && (
              <span style={{ fontFamily: 'var(--text-mono)', fontSize: '7.5px', color: 'var(--status-ok)', background: 'rgba(45,198,83,0.1)', padding: '1px 3px', borderRadius: '2px' }}>
                🛡 {u.safeZoneRadiusMeters}m
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <span style={{ fontFamily: 'var(--text-mono)', fontSize: '8px', color: 'var(--text-dim)' }}>🚛 {u.vehicleCount ?? '—'}</span>
            <span style={{ fontFamily: 'var(--text-mono)', fontSize: '8px', color: 'var(--text-dim)' }}>🔧 {u.deviceCount ?? '—'}</span>
            <span style={{ fontFamily: 'var(--text-mono)', fontSize: '8px', color: u.activeSessionsToday > 0 ? 'var(--status-ok)' : 'var(--text-dim)' }}>
              ● {u.activeSessionsToday ?? 0} LIVE
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Horizontal tab nav (URL-driven) ─────────────────────────────────────────
function AdminTabBar({ active, onSelect }) {
  return (
    <div style={{
      display: 'flex',
      background: 'var(--bg-panel)',
      borderBottom: '1px solid var(--border)',
      flexShrink: 0,
      overflowX: 'auto',
    }}>
      {ADMIN_TABS.map(t => (
        <button
          key={t.id}
          id={`admin-nav-${t.id}`}
          onClick={() => onSelect(t.id)}
          style={{
            padding: '8px 16px',
            fontFamily: 'var(--text-mono)',
            fontSize: '9.5px',
            fontWeight: active === t.id ? 700 : 400,
            color: active === t.id ? 'var(--text-primary)' : 'var(--text-dim)',
            background: 'none',
            border: 'none',
            borderBottom: active === t.id ? '2px solid var(--accent)' : '2px solid transparent',
            cursor: 'pointer',
            letterSpacing: '0.07em',
            transition: 'color 0.12s',
            whiteSpace: 'nowrap',
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ─── Admin Layout root ────────────────────────────────────────────────────────
export default function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [ulbs, setUlbs] = useState([]);
  const [ulbsLoading, setUlbsLoading] = useState(true);

  // Derive active tab from current URL path
  const pathSegments = location.pathname.split('/');
  const activeTab = pathSegments[2] || 'overview'; // /admin/:tab

  useEffect(() => {
    fetchAdminUlbs().then(data => {
      setUlbs(data || []);
      setUlbsLoading(false);
    });
  }, []);

  const handleTabSelect = (tabId) => {
    navigate(`/admin/${tabId}`);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-base)', overflow: 'hidden' }}>
      {/* View header */}
      <div className="view-header">
        <span className="view-header__title">Admin Console</span>
        <span className="view-header__sep" />
        <span className="view-header__meta">CROSS-ULB · INSPECTION ONLY · MSSQL 192.168.1.8</span>
        <span className="view-header__spacer" />
        <span className="rate-badge">
          {ulbsLoading ? '…' : `${ulbs.length} ULB${ulbs.length !== 1 ? 's' : ''}`}
        </span>
      </div>

      {/* ULB summary strip */}
      <UlbSummaryStrip ulbs={ulbs} loading={ulbsLoading} />

      {/* Tab navigation */}
      <AdminTabBar active={activeTab} onSelect={handleTabSelect} />

      {/* Route content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
        <ErrorBoundary name={`Admin/${activeTab}`}>
          {/* Pass ulbs context to child routes via Outlet context */}
          <Outlet context={{ ulbs, ulbsLoading }} />
        </ErrorBoundary>
      </div>
    </div>
  );
}
