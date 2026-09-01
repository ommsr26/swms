import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { fetchAdminUlbs } from '../../telemetry/backendApiClient.js';
import ThemeToggle from '../ThemeToggle.jsx';

/**
 * UlbSelectorView — Interactive municipal jurisdiction selection screen for Officer Console.
 * Follows the high-density, engineering-console aesthetic established in HomeView.jsx.
 */
export default function UlbSelectorView() {
  const navigate = useNavigate();
  const location = useLocation();
  const [ulbs, setUlbs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchAdminUlbs().then((data) => {
      setUlbs(data || []);
      setLoading(false);
    });
  }, []);

  const filteredUlbs = ulbs.filter((u) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      u.ulbId?.toLowerCase().includes(q) ||
      u.ulbName?.toLowerCase().includes(q) ||
      u.state?.toLowerCase().includes(q)
    );
  });

  const getSubPath = () => {
    // Keep current sub-tab (e.g. sessions, fleet, coverage) or default to overview
    const segments = location.pathname.split('/').filter(Boolean);
    if (segments.length >= 2 && segments[0] === 'officer') {
      return segments[1];
    }
    return 'overview';
  };

  const handleSelectUlb = (ulbId) => {
    const subPath = getSubPath();
    navigate(`/officer/${subPath}?ulb=${encodeURIComponent(ulbId)}`);
  };

  const ACCENTS = ['#43aa8b', '#00d9ff', '#9d4edd', '#f48c06', '#2dc653', '#e09f3e'];

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      width: '100%',
      background: 'var(--bg-base)',
      overflow: 'hidden',
    }}>
      {/* Console Header */}
      <div style={{
        borderBottom: '1px solid var(--border)',
        padding: '14px 24px',
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        background: 'var(--bg-panel)',
        flexShrink: 0,
      }}>
        <div style={{
          fontFamily: 'var(--text-mono)',
          fontSize: '9px',
          fontWeight: 700,
          color: '#43aa8b',
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
        }}>
          SWSTP
        </div>
        <div style={{ width: '1px', height: '14px', background: 'var(--border-mid)' }} />
        <div style={{ fontFamily: 'var(--text-mono)', fontSize: '11px', color: 'var(--text-primary)', fontWeight: 600 }}>
          ULB Officer Console
        </div>
        <span style={{ fontFamily: 'var(--text-mono)', fontSize: '9px', color: 'var(--text-dim)' }}>
          / SELECT JURISDICTION
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={() => navigate('/')}
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              color: 'var(--text-secondary)',
              fontFamily: 'var(--text-mono)',
              fontSize: '9px',
              padding: '4px 10px',
              borderRadius: '2px',
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            ← HOME
          </button>
          <span style={{ color: 'var(--border-mid)', margin: '0 2px' }}>|</span>
          <span style={{
            width: '6px', height: '6px', borderRadius: '50%',
            background: '#2dc653',
            boxShadow: '0 0 6px #2dc653',
            display: 'inline-block',
          }} />
          <span style={{ fontFamily: 'var(--text-mono)', fontSize: '9px', color: 'var(--text-dim)' }}>
            DATABASE CONNECTED
          </span>
          <span style={{ color: 'var(--border-mid)', margin: '0 2px' }}>|</span>
          <ThemeToggle />
        </div>
      </div>

      {/* Main Container */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 24px',
        overflow: 'auto',
      }}>
        {/* Title / Scope Guidance */}
        <div style={{
          fontFamily: 'var(--text-mono)',
          fontSize: '10px',
          color: '#43aa8b',
          fontWeight: 700,
          letterSpacing: '0.14em',
          marginBottom: '6px',
          textAlign: 'center',
        }}>
          OFFICER OPERATIONAL DOMAIN · SELECT MUNICIPAL ULB
        </div>
        <div style={{
          fontFamily: 'var(--text-mono)',
          fontSize: '9px',
          color: 'var(--text-label)',
          marginBottom: '20px',
          textAlign: 'center',
          maxWidth: '600px',
          lineHeight: '1.6',
        }}>
          Officer telemetry, road segments, missions, and camera feeds are strictly scoped to a single Urban Local Body. Select your assigned municipality below:
        </div>

        {/* Quick Search */}
        {ulbs.length > 2 && (
          <div style={{ marginBottom: '20px', width: '100%', maxWidth: '860px', display: 'flex', justifyContent: 'flex-end' }}>
            <input
              type="text"
              placeholder="FILTER ULB BY NAME OR CODE…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                background: 'var(--bg-panel)',
                border: '1px solid var(--border-mid)',
                color: 'var(--text-primary)',
                fontFamily: 'var(--text-mono)',
                fontSize: '9.5px',
                padding: '6px 12px',
                outline: 'none',
                borderRadius: '2px',
                width: '280px',
                letterSpacing: '0.04em',
              }}
            />
          </div>
        )}

        {/* Loading State */}
        {loading ? (
          <div style={{ fontFamily: 'var(--text-mono)', fontSize: '10px', color: 'var(--text-dim)', padding: '40px' }}>
            LOADING MUNICIPAL REGISTRIES FROM DATABASE…
          </div>
        ) : filteredUlbs.length === 0 ? (
          <div style={{ fontFamily: 'var(--text-mono)', fontSize: '10px', color: 'var(--status-warn)', padding: '40px', textAlign: 'center' }}>
            NO MATCHING ULBs FOUND IN REGISTRY
          </div>
        ) : (
          /* ULB Cards Grid matching HomeView.jsx styling */
          <div style={{
            display: 'grid',
            gridTemplateColumns: filteredUlbs.length === 1 ? '1fr' : 'repeat(2, 1fr)',
            gap: '12px',
            maxWidth: '860px',
            width: '100%',
          }}>
            {filteredUlbs.map((ulb, idx) => {
              const borderAccent = ACCENTS[idx % ACCENTS.length];
              return (
                <button
                  key={ulb.ulbId}
                  id={`ulb-select-${ulb.ulbId}`}
                  onClick={() => handleSelectUlb(ulb.ulbId)}
                  style={{
                    background: 'var(--bg-panel)',
                    border: `1px solid var(--border)`,
                    borderLeft: `3px solid ${borderAccent}`,
                    borderRadius: '2px',
                    padding: '20px 20px 16px 20px',
                    textAlign: 'left',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    transition: 'background 0.15s, border-color 0.15s, transform 0.1s',
                    outline: 'none',
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--bg-elevated)';
                    e.currentTarget.style.borderColor = borderAccent;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'var(--bg-panel)';
                    e.currentTarget.style.borderColor = 'var(--border)';
                    e.currentTarget.style.borderLeftColor = borderAccent;
                  }}
                >
                  {/* Top row: icon + name + code badge */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '20px', lineHeight: 1 }}>🏛</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontFamily: 'var(--text-mono)',
                        fontSize: '12px',
                        fontWeight: 700,
                        color: 'var(--text-primary)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}>
                        {ulb.ulbName || ulb.name}
                      </div>
                      <div style={{
                        fontFamily: 'var(--text-mono)',
                        fontSize: '9px',
                        color: 'var(--text-dim)',
                        marginTop: '2px',
                      }}>
                        ID: {ulb.ulbId}
                      </div>
                    </div>
                    <span style={{
                      fontFamily: 'var(--text-mono)',
                      fontSize: '8px',
                      fontWeight: 700,
                      color: borderAccent,
                      border: `1px solid ${borderAccent}`,
                      padding: '2px 6px',
                      borderRadius: '2px',
                      letterSpacing: '0.08em',
                      flexShrink: 0,
                    }}>
                      {ulb.state || 'MAHARASHTRA'}
                    </span>
                  </div>

                  {/* Geography & CRS metadata */}
                  <div style={{
                    fontFamily: 'var(--text-mono)',
                    fontSize: '9.5px',
                    color: 'var(--text-secondary)',
                    lineHeight: '1.6',
                    display: 'flex',
                    gap: '12px',
                    flexWrap: 'wrap',
                  }}>
                    {ulb.centerLatitude != null && ulb.centerLongitude != null && (
                      <span>📍 {ulb.centerLatitude.toFixed(4)}° N, {ulb.centerLongitude.toFixed(4)}° E</span>
                    )}
                    {ulb.projectionCrs && (
                      <span>🌐 EPSG:{ulb.projectionCrs}</span>
                    )}
                  </div>

                  {/* Bottom status line */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    paddingTop: '6px',
                    borderTop: '1px solid var(--border)',
                    marginTop: 'auto',
                  }}>
                    <span style={{
                      width: '5px',
                      height: '5px',
                      borderRadius: '50%',
                      background: '#2dc653',
                      boxShadow: '0 0 6px #2dc653',
                      flexShrink: 0,
                    }} />
                    <span style={{
                      fontFamily: 'var(--text-mono)',
                      fontSize: '8.5px',
                      color: '#2dc653',
                      letterSpacing: '0.06em',
                    }}>
                      OPERATIONAL JURISDICTION
                    </span>
                    <span style={{
                      marginLeft: 'auto',
                      fontFamily: 'var(--text-mono)',
                      fontSize: '9px',
                      fontWeight: 700,
                      color: borderAccent,
                      letterSpacing: '0.06em',
                    }}>
                      LAUNCH CONSOLE →
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Footer info */}
        <div style={{
          marginTop: '32px',
          fontFamily: 'var(--text-mono)',
          fontSize: '8.5px',
          color: 'var(--text-label)',
          display: 'flex',
          gap: '24px',
          justifyContent: 'center',
          flexWrap: 'wrap',
        }}>
          <span>SWSTP OFFICER PORTAL</span>
          <span style={{ color: 'var(--border-mid)' }}>│</span>
          <span>STRICT ULB ISOLATION ENFORCED</span>
          <span style={{ color: 'var(--border-mid)' }}>│</span>
          <span>MUNICIPAL DATA AUTHORITATIVE</span>
        </div>
      </div>
    </div>
  );
}
