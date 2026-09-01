import React from 'react';
import { useSimulationStore } from '../../telemetry/simulationStore.js';
import OfficerEvidenceView from '../officer/OfficerEvidenceView.jsx';

export default function SimulationEvidenceView() {
  const { collectionEvents, houses } = useSimulationStore();

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
      {/* Live Simulated Evidence Row */}
      {collectionEvents.length > 0 && (
        <div style={{ padding: '10px 16px', background: 'var(--bg-panel-2)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ fontFamily: 'var(--text-mono)', fontSize: '9px', fontWeight: 800, color: '#00d9ff', marginBottom: '8px' }}>
            ⚡ LIVE SIMULATION CAPTURES ({collectionEvents.length})
          </div>
          <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '4px' }}>
            {collectionEvents.map((ev) => (
              <div
                key={ev.id}
                style={{
                  minWidth: '180px',
                  background: 'var(--bg-panel)',
                  border: '1px solid var(--border)',
                  borderRadius: '3px',
                  overflow: 'hidden',
                  flexShrink: 0,
                }}
              >
                <img src={ev.photoUrl} alt="Evidence" style={{ width: '100%', height: '90px', objectFit: 'cover' }} />
                <div style={{ padding: '6px 8px', fontFamily: 'var(--text-mono)', fontSize: '8px' }}>
                  <div style={{ fontWeight: 700, color: '#2dc653' }}>{ev.houseId}</div>
                  <div style={{ color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.address}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Evidence System */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
        <OfficerEvidenceView />
      </div>
    </div>
  );
}
