/**
 * EvidenceGallery.jsx — Collection event evidence gallery.
 *
 * Renders collection events as F1-style cards with:
 *   - Event timestamp, location, speed
 *   - Impacted house count
 *   - Evidence image thumbnails (21-day availability window)
 *   - Event selection → EvidenceDrawer
 *
 * Current milestone: architecture shell + honest empty state.
 * No data is fabricated.
 *
 * BACKEND API REQUIREMENTS (not yet implemented):
 *   GET /api/officer/sessions/{sessionId}/collection-events
 *     → Array<CollectionEvent>
 *   GET /api/officer/collection-events/{eventId}/images
 *     → Array<EvidenceImage>
 *
 * Props:
 *   events:       Array — collection events
 *   loading:      boolean
 *   onSelect:     (event) => void
 *   selectedId:   number|null
 */
export default function EvidenceGallery({ events = [], loading = false, onSelect = null, selectedId = null }) {
  if (loading) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', fontFamily: 'var(--text-mono)', fontSize: '10px', color: 'var(--text-dim)' }}>
        Loading collection events…
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 20px', gap: '12px' }}>
        <div style={{ fontSize: '28px', opacity: 0.3 }}>📦</div>
        <div style={{ fontFamily: 'var(--text-mono)', fontSize: '11px', color: 'var(--text-dim)', textAlign: 'center' }}>
          No collection events recorded.
        </div>
        <div style={{ fontFamily: 'var(--text-mono)', fontSize: '9px', color: 'var(--text-dim)', textAlign: 'center', maxWidth: '260px', lineHeight: 1.6 }}>
          Collection events are recorded automatically when motion is detected within the 100m road buffer during an active operational session.
          <br /><br />
          <span style={{ color: 'var(--status-warn)', fontSize: '8.5px' }}>
            ⓘ Backend endpoint: GET /api/officer/sessions/{'{sessionId}'}/collection-events — not yet implemented.
          </span>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {events.map(e => {
        const isSelected = e.eventId === selectedId;
        const capturedAt = e.capturedAt ? new Date(e.capturedAt) : null;
        const imageCount = e.imageCount ?? 0;
        const houseCount = e.houseCount ?? 0;

        return (
          <div
            key={e.eventId}
            onClick={() => onSelect?.(e)}
            style={{
              padding: '10px 14px',
              borderBottom: '1px solid var(--border)',
              borderLeft: `2px solid ${isSelected ? 'var(--status-ok)' : 'var(--border)'}`,
              background: isSelected ? 'var(--bg-elevated)' : 'transparent',
              cursor: 'pointer',
              transition: 'background 0.1s',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ fontFamily: 'var(--text-mono)', fontSize: '9.5px', fontWeight: 700, color: 'var(--text-primary)' }}>
                EVENT #{e.eventId}
              </span>
              <span style={{ fontFamily: 'var(--text-mono)', fontSize: '8px', color: 'var(--status-ok)', background: 'rgba(45,198,83,0.1)', padding: '1px 5px', borderRadius: '2px' }}>
                {imageCount} 📷
              </span>
            </div>
            <div style={{ fontFamily: 'var(--text-mono)', fontSize: '8.5px', color: 'var(--text-dim)', marginBottom: '3px' }}>
              {capturedAt ? capturedAt.toLocaleString() : '—'}
            </div>
            {e.latitude != null && (
              <div style={{ fontFamily: 'var(--text-mono)', fontSize: '8px', color: 'var(--text-secondary)' }}>
                📍 {e.latitude.toFixed(5)}, {e.longitude.toFixed(5)}
                {e.speedKmh != null && <span style={{ color: '#00b4d8', marginLeft: '8px' }}>{e.speedKmh.toFixed(1)} km/h</span>}
              </div>
            )}
            {houseCount > 0 && (
              <div style={{ fontFamily: 'var(--text-mono)', fontSize: '8px', color: 'var(--text-dim)', marginTop: '2px' }}>
                🏠 {houseCount} impacted house{houseCount !== 1 ? 's' : ''}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
