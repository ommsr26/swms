/**
 * OfficerEvidenceView.jsx — /officer/evidence?ulb=:ulbId
 *
 * Municipal evidence inspection: collection events, timestamps, locations,
 * speed, impacted houses, and 21-day evidence images.
 *
 * This milestone: reusable EvidenceGallery + EvidenceDrawer with honest empty state.
 * No data is fabricated.
 *
 * REQUIRED BACKEND APIS (not yet implemented):
 *   GET /api/officer/sessions/{sessionId}/collection-events
 *   GET /api/officer/collection-events/{eventId}/images
 *
 * UX INTENT (when backend ready):
 *   Left: EvidenceGallery (event list + filters)
 *   Right: EvidenceDrawer (selected event detail + image grid)
 */
import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { fetchAdminSessions, fetchOfficerCollectionEvents, fetchOfficerEvidenceImages } from '../../telemetry/backendApiClient.js';
import EvidenceGallery from '../../components/evidence/EvidenceGallery.jsx';
import EvidenceDrawer from '../../components/evidence/EvidenceDrawer.jsx';

export default function OfficerEvidenceView() {
  const { ulbId } = useOutletContext();
  const [sessions, setSessions] = useState([]);
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [events, setEvents] = useState([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventImages, setEventImages] = useState([]);
  const [imagesLoading, setImagesLoading] = useState(false);

  useEffect(() => {
    fetchAdminSessions(ulbId, 50).then(data => {
      const list = data || [];
      setSessions(list);
      if (list.length > 0) {
        setSelectedSessionId(list[0].sessionId);
      }
      setSessionsLoading(false);
    });
  }, [ulbId]);

  useEffect(() => {
    if (!selectedSessionId) {
      setEvents([]);
      return;
    }
    setEventsLoading(true);
    fetchOfficerCollectionEvents(selectedSessionId, ulbId).then(data => {
      setEvents(data || []);
      setEventsLoading(false);
    });
  }, [selectedSessionId, ulbId]);

  useEffect(() => {
    const id = selectedEvent?.collectionEventId || selectedEvent?.eventId;
    if (!id) {
      setEventImages([]);
      return;
    }
    setImagesLoading(true);
    fetchOfficerEvidenceImages(id, ulbId).then(imgs => {
      setEventImages(imgs || []);
      setImagesLoading(false);
    });
  }, [selectedEvent, ulbId]);

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
      {/* Left: Controls + event list */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        {/* Session selector + filter bar */}
        <div style={{
          padding: '6px 12px',
          background: 'var(--bg-panel)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          flexShrink: 0,
        }}>
          <span style={{ fontFamily: 'var(--text-mono)', fontSize: '8.5px', color: 'var(--text-dim)' }}>SESSION:</span>
          {sessionsLoading ? (
            <span style={{ fontFamily: 'var(--text-mono)', fontSize: '9px', color: 'var(--text-dim)' }}>Loading…</span>
          ) : sessions.length === 0 ? (
            <span style={{ fontFamily: 'var(--text-mono)', fontSize: '9px', color: 'var(--status-warn)' }}>No sessions found</span>
          ) : (
            <select
              value={selectedSessionId || ''}
              onChange={e => setSelectedSessionId(e.target.value ? Number(e.target.value) : null)}
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-mid)', color: 'var(--text-primary)', fontFamily: 'var(--text-mono)', fontSize: '9px', padding: '2px 6px', outline: 'none' }}
            >
              <option value="">— Select session —</option>
              {sessions.map(s => (
                <option key={s.sessionId} value={s.sessionId}>
                  #{s.sessionId} · {s.vehicleRegistration || '—'} · {s.status}
                </option>
              ))}
            </select>
          )}
          <span style={{ marginLeft: 'auto', fontFamily: 'var(--text-mono)', fontSize: '8px', color: 'var(--text-dim)' }}>
            {events.length} events
          </span>
        </div>

        {/* Evidence gallery */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <EvidenceGallery
            events={events}
            loading={eventsLoading}
            onSelect={setSelectedEvent}
            selectedId={selectedEvent?.eventId}
          />
        </div>
      </div>

      {/* Right: Evidence drawer */}
      {selectedEvent && (
        <EvidenceDrawer
          event={selectedEvent}
          images={eventImages}
          houses={[]}
          loading={imagesLoading}
          onClose={() => setSelectedEvent(null)}
        />
      )}
    </div>
  );
}
