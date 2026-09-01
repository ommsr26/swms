import { useNavigate } from 'react-router-dom';
import ThemeToggle from '../components/ThemeToggle.jsx';

/**
 * SWSTP Console Entry Screen
 *
 * This is the root "/" route. It is a dense, engineering-console style
 * launcher — 4 tiles, one per top-level screen. No marketing copy.
 * Uses the existing design tokens exclusively from index.css.
 */

const SCREENS = [
  {
    id: 'debug',
    path: '/debug',
    icon: '⚡',
    label: 'Engineering Debug',
    badge: 'DEV',
    badgeColor: '#f48c06',
    description: 'Full telemetry workstation — live sensor data, 3D IMU, GNSS satellite sky view, map trajectory, camera, diagnostics, session history and replay.',
    status: 'REAL HARDWARE · 115200 BAUD',
    statusColor: '#2dc653',
    borderAccent: '#f48c06',
  },
  {
    id: 'motion-detection',
    path: '/motion-detection',
    icon: '📹',
    label: 'Motion Detection',
    badge: 'BROWSER AI',
    badgeColor: '#00d9ff',
    description: 'In-browser 30-40 FPS motion detection & edge gateway. Connects Arduino for metadata, runs background subtraction on camera feed, and auto-uploads collection evidence.',
    status: 'WEB CAMERA + SERIAL AI',
    statusColor: '#2dc653',
    borderAccent: '#00d9ff',
  },
  {
    id: 'hardware-connect',
    path: '/hardware-connect',
    icon: '🔌',
    label: 'Hardware Connect',
    badge: 'COMMISSION',
    badgeColor: '#00d9ff',
    description: 'Minimal commissioning interface. Connect a device, verify device → vehicle → ULB resolution, and confirm live telemetry streaming status.',
    status: 'WEB SERIAL · AUTO-DETECT',
    statusColor: '#00d9ff',
    borderAccent: '#00d9ff',
  },
  {
    id: 'admin',
    path: '/admin',
    icon: '⊞',
    label: 'Admin Console',
    badge: 'CROSS-ULB',
    badgeColor: '#9d4edd',
    description: 'Cross-ULB fleet overview. All ULBs, all vehicles, all devices, fleet live map, all sessions filterable by ULB/device/date, and camera feeds.',
    status: 'ALL ULBs · AGGREGATE VIEW',
    statusColor: '#9d4edd',
    borderAccent: '#9d4edd',
  },
  {
    id: 'officer',
    path: '/officer',
    icon: '🗺',
    label: 'ULB Officer View',
    badge: 'ULB SCOPED',
    badgeColor: '#43aa8b',
    description: 'Single-ULB operational view for a municipal officer. Fleet map, live vehicles, sessions, and camera feeds scoped strictly to one ULB.',
    status: 'REQUIRES ?ulb= PARAM',
    statusColor: '#f48c06',
    borderAccent: '#43aa8b',
  },
  {
    id: 'simulation',
    path: '/simulation',
    icon: '🎮',
    label: 'Operations Simulator',
    badge: 'INTERACTIVE',
    badgeColor: '#00d9ff',
    description: 'Interactive virtual vehicle simulation. Drive trucks with virtual joystick and commands, snap roadside camera evidence, and inspect daily waste collection compliance timelines.',
    status: 'VIRTUAL DRIVE · JOYSTICK & TIMELINE',
    statusColor: '#00d9ff',
    borderAccent: '#00d9ff',
  },
];

export default function HomeView() {
  const navigate = useNavigate();

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
          color: '#00d9ff',
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
        }}>
          SWSTP
        </div>
        <div style={{ width: '1px', height: '14px', background: 'var(--border-mid)' }} />
        <div style={{ fontFamily: 'var(--text-mono)', fontSize: '11px', color: 'var(--text-primary)', fontWeight: 600 }}>
          Solid Waste Telemetry Platform
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{
            width: '6px', height: '6px', borderRadius: '50%',
            background: '#2dc653',
            boxShadow: '0 0 6px #2dc653',
            display: 'inline-block',
          }} />
          <span style={{ fontFamily: 'var(--text-mono)', fontSize: '9px', color: 'var(--text-dim)' }}>
            SYSTEM ONLINE · 192.168.1.8
          </span>
          <span style={{ color: 'var(--border-mid)', margin: '0 2px' }}>|</span>
          <ThemeToggle />
        </div>
      </div>


      {/* Main console body */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 24px',
        overflow: 'auto',
        gap: '0',
      }}>
        {/* Identity block */}
        <div style={{
          fontFamily: 'var(--text-mono)',
          fontSize: '10px',
          color: 'var(--text-dim)',
          letterSpacing: '0.12em',
          marginBottom: '6px',
          textAlign: 'center',
        }}>
          GARBAGE FLEET MONITORING · SELECT CONSOLE
        </div>
        <div style={{
          fontFamily: 'var(--text-mono)',
          fontSize: '9px',
          color: 'var(--text-label)',
          marginBottom: '32px',
          textAlign: 'center',
        }}>
          ASP.NET Core 10 + EF Core + MSSQL · React 19 + Vite 8
        </div>

        {/* Console tiles grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
          gap: '12px',
          maxWidth: '960px',
          width: '100%',
        }}>
          {SCREENS.map((screen) => (
            <button
              key={screen.id}
              id={`home-tile-${screen.id}`}
              onClick={() => navigate(screen.path)}
              style={{
                background: 'var(--bg-panel)',
                border: `1px solid var(--border)`,
                borderLeft: `3px solid ${screen.borderAccent}`,
                borderRadius: '2px',
                padding: '20px 20px 16px 20px',
                textAlign: 'left',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                transition: 'background 0.15s, border-color 0.15s',
                outline: 'none',
                position: 'relative',
                overflow: 'hidden',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--bg-elevated)';
                e.currentTarget.style.borderColor = screen.borderAccent;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--bg-panel)';
                e.currentTarget.style.borderColor = 'var(--border)';
                e.currentTarget.style.borderLeftColor = screen.borderAccent;
              }}
            >
              {/* Top row: icon + label + badge */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '18px', lineHeight: 1 }}>{screen.icon}</span>
                <span style={{
                  fontFamily: 'var(--text-mono)',
                  fontSize: '12px',
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  flex: 1,
                }}>
                  {screen.label}
                </span>
                <span style={{
                  fontFamily: 'var(--text-mono)',
                  fontSize: '8px',
                  fontWeight: 700,
                  color: screen.badgeColor,
                  border: `1px solid ${screen.badgeColor}`,
                  padding: '2px 6px',
                  borderRadius: '2px',
                  letterSpacing: '0.08em',
                  flexShrink: 0,
                }}>
                  {screen.badge}
                </span>
              </div>

              {/* Description */}
              <div style={{
                fontFamily: 'var(--text-sans)',
                fontSize: '11px',
                color: 'var(--text-secondary)',
                lineHeight: '1.5',
              }}>
                {screen.description}
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
                  background: screen.statusColor,
                  flexShrink: 0,
                }} />
                <span style={{
                  fontFamily: 'var(--text-mono)',
                  fontSize: '8.5px',
                  color: screen.statusColor,
                  letterSpacing: '0.06em',
                }}>
                  {screen.status}
                </span>
                <span style={{
                  marginLeft: 'auto',
                  fontFamily: 'var(--text-mono)',
                  fontSize: '9px',
                  color: 'var(--text-dim)',
                }}>
                  ENTER →
                </span>
              </div>
            </button>
          ))}
        </div>

        {/* Footer system info */}
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
          <span>SWSTP v2.0.0</span>
          <span style={{ color: 'var(--border-mid)' }}>│</span>
          <span>DB: MSSQL 192.168.1.8 / Solid_Waste</span>
          <span style={{ color: 'var(--border-mid)' }}>│</span>
          <span>BAUD: 115200</span>
          <span style={{ color: 'var(--border-mid)' }}>│</span>
          <span>IIS · /deploy/frontend</span>
        </div>
      </div>
    </div>
  );
}
