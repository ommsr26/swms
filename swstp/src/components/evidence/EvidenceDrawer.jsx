/**
 * EvidenceDrawer.jsx — Collection event detail inspection drawer.
 *
 * Shows full detail for a selected collection event:
 *   - Precise timestamp and location
 *   - Speed at collection
 *   - Evidence images (21-day retention, thumbnail grid)
 *   - Impacted houses list
 *
 * Current milestone: shell with proper loading/empty states.
 * No data is fabricated.
 *
 * Props:
 *   event:    object|null — selected collection event
 *   images:   Array       — evidence images for this event
 *   houses:   Array       — impacted houses
 *   loading:  boolean
 *   onClose:  () => void
 */
import { getEvidenceImageUrl } from '../../telemetry/backendApiClient.js';

export default function EvidenceDrawer({ event = null, images = [], houses = [], loading = false, onClose = null }) {
  if (!event) return null;

  const capturedAt = event.capturedAt ? new Date(event.capturedAt) : null;
  const now = Date.now();
  const RETENTION_MS = 21 * 24 * 60 * 60 * 1000; // 21 days

  return (
    <div style={{
      width: '300px',
      flexShrink: 0,
      background: 'var(--bg-panel)',
      borderLeft: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', background: 'var(--bg-panel-2)', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        <span style={{ fontFamily: 'var(--text-mono)', fontSize: '10px', fontWeight: 700, color: 'var(--text-primary)', flex: 1 }}>
          EVENT #{event.collectionEventId || event.eventId}
        </span>
        {onClose && (
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontFamily: 'var(--text-mono)', fontSize: '12px', padding: '0 2px' }}>✕</button>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {/* Event meta */}
        <Section label="EVENT DATA">
          <Row k="Timestamp"  v={capturedAt ? capturedAt.toLocaleString() : '—'} />
          <Row k="Latitude"   v={event.latitude?.toFixed(6) ?? '—'} />
          <Row k="Longitude"  v={event.longitude?.toFixed(6) ?? '—'} />
          <Row k="Speed"      v={event.fusedSpeedKph != null ? `${event.fusedSpeedKph.toFixed(1)} km/h` : (event.speedKmh != null ? `${event.speedKmh.toFixed(1)} km/h` : '—')} />
          <Row k="Road Dist"  v={event.distanceToRoadMeters != null ? `${event.distanceToRoadMeters.toFixed(1)} m` : '—'} />
          <Row k="Status"     v={event.status ?? 'DETECTED'} />
        </Section>

        {/* Evidence images */}
        <Section label={`EVIDENCE IMAGES (${images.length})`}>
          {loading ? (
            <div style={{ padding: '10px', fontFamily: 'var(--text-mono)', fontSize: '9px', color: 'var(--text-dim)' }}>Loading images…</div>
          ) : images.length === 0 ? (
            <div style={{ padding: '10px 12px', fontFamily: 'var(--text-mono)', fontSize: '9px', color: 'var(--text-dim)', lineHeight: 1.6 }}>
              No images recorded for this event.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', padding: '8px 12px' }}>
              {images.map((img, i) => {
                const imgDate = img.capturedAt ? new Date(img.capturedAt).getTime() : 0;
                const expired = img.isDeleted || (imgDate > 0 && (now - imgDate) > RETENTION_MS);
                const imgSrc = getEvidenceImageUrl(img.imageUrl || img.url || img.evidenceImageId);

                return (
                  <div key={img.evidenceImageId || i} style={{ position: 'relative', aspectRatio: '4/3', background: '#050709', border: '1px solid var(--border)', overflow: 'hidden' }}>
                    {expired ? (
                      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--text-mono)', fontSize: '8px', color: 'var(--status-warn)', textAlign: 'center', padding: '4px' }}>
                        PURGED<br />(21-day retention)
                      </div>
                    ) : (
                      <a href={imgSrc} target="_blank" rel="noopener noreferrer" style={{ display: 'block', width: '100%', height: '100%' }}>
                        <img
                          src={imgSrc}
                          alt={`Evidence #${img.evidenceImageId || i + 1}`}
                          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                          onError={e => {
                            e.target.style.display = 'none';
                            e.target.parentElement.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:8px;color:var(--text-dim);">IMAGE NOT FOUND</div>';
                          }}
                        />
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        {/* Impacted houses */}
        <Section label={`IMPACTED HOUSES (${houses.length})`}>
          {houses.length === 0 ? (
            <div style={{ padding: '10px 12px', fontFamily: 'var(--text-mono)', fontSize: '9px', color: 'var(--text-dim)' }}>
              No houses recorded within 10m collection radius.
            </div>
          ) : (
            houses.map((h, i) => (
              <Row key={i} k={`House ${h.houseId ?? i + 1}`} v={h.address ?? h.propertyId ?? '—'} />
            ))
          )}
        </Section>
      </div>
    </div>
  );
}

function Section({ label, children }) {
  return (
    <div>
      <div style={{ padding: '5px 12px', fontFamily: 'var(--text-mono)', fontSize: '8px', fontWeight: 700, color: 'var(--text-dim)', letterSpacing: '0.12em', background: 'var(--bg-panel-2)', borderBottom: '1px solid var(--border)', borderTop: '1px solid var(--border)' }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function Row({ k, v }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 12px', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontFamily: 'var(--text-mono)', fontSize: '8.5px', color: 'var(--text-dim)' }}>{k}</span>
      <span style={{ fontFamily: 'var(--text-mono)', fontSize: '9px', fontWeight: 600, color: 'var(--text-secondary)' }}>{v}</span>
    </div>
  );
}
