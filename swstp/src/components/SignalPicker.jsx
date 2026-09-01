import React, { useState } from 'react';
import { SIGNALS, SIGNAL_CATEGORIES } from '../telemetry/signalRegistry.js';

export default function SignalPicker({ isOpen, onClose, onSelectSignal, onSelectPreset }) {
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [search, setSearch] = useState('');

  if (!isOpen) return null;

  const allSignals = Object.values(SIGNALS);

  const filteredSignals = allSignals.filter((sig) => {
    const matchesCategory = selectedCategory === 'ALL' || sig.category === selectedCategory;
    const matchesSearch = search === '' ||
      sig.label.toLowerCase().includes(search.toLowerCase()) ||
      sig.id.toLowerCase().includes(search.toLowerCase()) ||
      sig.description.toLowerCase().includes(search.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(5, 7, 11, 0.8)',
      backdropFilter: 'blur(4px)',
      zIndex: 2000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <div style={{
        width: '640px',
        maxHeight: '80vh',
        background: 'var(--bg-panel)',
        border: '1px solid var(--border-mid)',
        boxShadow: '0 12px 32px rgba(0,0,0,0.6)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Modal Header */}
        <div className="panel__header" style={{ padding: '12px 16px' }}>
          <span className="panel__title" style={{ fontSize: '11px' }}>SIGNAL BROWSER & PANEL CREATOR</span>
          <button className="btn btn--sm" style={{ marginLeft: 'auto' }} onClick={onClose}>✕ Close</button>
        </div>

        {/* Search & Category Filter Bar */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: '10px' }}>
          <input
            type="text"
            placeholder="Search signals by name, ID, description..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              flex: 1,
              background: 'var(--bg-base)',
              border: '1px solid var(--border-mid)',
              color: 'var(--text-primary)',
              fontFamily: 'var(--text-mono)',
              fontSize: '11px',
              padding: '6px 10px',
              borderRadius: '2px',
              outline: 'none',
            }}
          />
        </div>

        {/* Category Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', overflowX: 'auto', background: 'var(--bg-panel-2)' }}>
          <button
            className={`tab${selectedCategory === 'ALL' ? ' tab--active' : ''}`}
            onClick={() => setSelectedCategory('ALL')}
          >
            ALL SIGNALS ({allSignals.length})
          </button>
          {Object.values(SIGNAL_CATEGORIES).map((cat) => (
            <button
              key={cat.id}
              className={`tab${selectedCategory === cat.id ? ' tab--active' : ''}`}
              onClick={() => setSelectedCategory(cat.id)}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Signals List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 16px' }}>
          {filteredSignals.length === 0 ? (
            <div style={{ padding: '32px 0', textTransform: 'uppercase', textAlign: 'center', fontFamily: 'var(--text-mono)', fontSize: '11px', color: 'var(--text-dim)' }}>
              No matching signals found
            </div>
          ) : (
            filteredSignals.map((sig) => (
              <div
                key={sig.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '10px 12px',
                  borderBottom: '1px solid var(--border)',
                  cursor: 'pointer',
                  transition: 'background 0.1s',
                }}
                className="session-item"
                onClick={() => {
                  onSelectSignal(sig);
                  onClose();
                }}
              >
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: sig.color, marginRight: '12px', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: 'var(--text-mono)', fontSize: '12px', fontWeight: 500, color: 'var(--text-primary)' }}>
                    {sig.label} <span style={{ fontSize: '10px', color: 'var(--text-label)' }}>({sig.id})</span>
                  </div>
                  <div style={{ fontFamily: 'var(--text-mono)', fontSize: '10px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    {sig.description} · Source: {sig.source}
                  </div>
                </div>
                <div style={{ textAlign: 'right', fontFamily: 'var(--text-mono)', fontSize: '10px' }}>
                  <div style={{ color: 'var(--text-label)' }}>UNIT: {sig.unit || 'dimensionless'}</div>
                  <div style={{ color: 'var(--status-ok)', marginTop: '2px' }}>{sig.sampleRate} Hz</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
