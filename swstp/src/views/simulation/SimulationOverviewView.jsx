import React from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { useSimulationStore } from '../../telemetry/simulationStore.js';

export default function SimulationOverviewView() {
  const navigate = useNavigate();
  const { ulbId, ulbName } = useOutletContext();
  const {
    speed,
    heading,
    engineOn,
    isAutoPatrol,
    houses,
    collectionEvents,
    totalDistanceTraveledM,
    capturePicture,
    toggleEngine,
    toggleAutoPatrol,
  } = useSimulationStore();

  const collectedCount = houses.filter((h) => h.status === 'COLLECTED').length;
  const collectionPct = Math.round((collectedCount / (houses.length || 1)) * 100);

  return (
    <div style={{ flex: 1, padding: '20px', overflowY: 'auto', background: 'var(--bg-base)' }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '18px' }}>
        {/* Banner */}
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(0, 217, 255, 0.1) 0%, rgba(15, 23, 42, 0.8) 100%)',
            border: '1px solid rgba(0, 217, 255, 0.3)',
            borderRadius: '6px',
            padding: '18px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '14px',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '18px' }}>🎮</span>
              <span style={{ fontFamily: 'var(--text-mono)', fontSize: '14px', fontWeight: 800, color: 'var(--text-primary)' }}>
                VIRTUAL FIELD OPERATIONS SIMULATOR
              </span>
              <span style={{ fontFamily: 'var(--text-mono)', fontSize: '8.5px', background: '#00d9ff', color: '#000', padding: '2px 6px', borderRadius: '2px', fontWeight: 800 }}>
                ACTIVE · 20 HZ
              </span>
            </div>
            <span style={{ fontFamily: 'var(--text-sans)', fontSize: '11.5px', color: 'var(--text-secondary)' }}>
              Interactive digital twin for municipal waste collection in <strong>{ulbName}</strong>. Drive virtual trucks with joystick or auto-patrol corridors, capture roadside camera evidence, and audit daily compliance timelines.
            </span>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => navigate(`/simulation/drive?ulb=${encodeURIComponent(ulbId)}`)}
              style={{
                padding: '8px 16px',
                fontFamily: 'var(--text-mono)',
                fontSize: '10px',
                fontWeight: 800,
                color: '#000000',
                background: '#00d9ff',
                border: 'none',
                borderRadius: '3px',
                cursor: 'pointer',
                boxShadow: '0 0 12px rgba(0, 217, 255, 0.4)',
              }}
            >
              🕹️ OPEN DRIVE & JOYSTICK →
            </button>
            <button
              onClick={() => navigate(`/simulation/timeline?ulb=${encodeURIComponent(ulbId)}`)}
              style={{
                padding: '8px 14px',
                fontFamily: 'var(--text-mono)',
                fontSize: '10px',
                fontWeight: 700,
                color: 'var(--text-primary)',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: '3px',
                cursor: 'pointer',
              }}
            >
              📅 DAILY TIMELINE
            </button>
          </div>
        </div>

        {/* 4 Stat Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
          <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: '4px', padding: '14px' }}>
            <div style={{ fontFamily: 'var(--text-mono)', fontSize: '8.5px', color: 'var(--text-dim)' }}>TRASH COLLECTION RATE</div>
            <div style={{ fontFamily: 'var(--text-mono)', fontSize: '24px', fontWeight: 800, color: '#2dc653', marginTop: '4px' }}>
              {collectionPct}%
            </div>
            <div style={{ fontFamily: 'var(--text-mono)', fontSize: '9px', color: 'var(--text-secondary)', marginTop: '2px' }}>
              {collectedCount} of {houses.length} properties visited
            </div>
          </div>

          <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: '4px', padding: '14px' }}>
            <div style={{ fontFamily: 'var(--text-mono)', fontSize: '8.5px', color: 'var(--text-dim)' }}>VEHICLE TELEMETRY SPEED</div>
            <div style={{ fontFamily: 'var(--text-mono)', fontSize: '24px', fontWeight: 800, color: '#00d9ff', marginTop: '4px' }}>
              {speed.toFixed(1)} <span style={{ fontSize: '12px' }}>km/h</span>
            </div>
            <div style={{ fontFamily: 'var(--text-mono)', fontSize: '9px', color: 'var(--text-secondary)', marginTop: '2px' }}>
              Heading: {heading.toFixed(0)}° · Engine: {engineOn ? 'ON' : 'OFF'}
            </div>
          </div>

          <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: '4px', padding: '14px' }}>
            <div style={{ fontFamily: 'var(--text-mono)', fontSize: '8.5px', color: 'var(--text-dim)' }}>DISTANCE TRAVELED</div>
            <div style={{ fontFamily: 'var(--text-mono)', fontSize: '24px', fontWeight: 800, color: '#f48c06', marginTop: '4px' }}>
              {(totalDistanceTraveledM / 1000).toFixed(2)} <span style={{ fontSize: '12px' }}>km</span>
            </div>
            <div style={{ fontFamily: 'var(--text-mono)', fontSize: '9px', color: 'var(--text-secondary)', marginTop: '2px' }}>
              Corridor Length: 1.25 km
            </div>
          </div>

          <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: '4px', padding: '14px' }}>
            <div style={{ fontFamily: 'var(--text-mono)', fontSize: '8.5px', color: 'var(--text-dim)' }}>EVIDENCE PHOTOS LOGGED</div>
            <div style={{ fontFamily: 'var(--text-mono)', fontSize: '24px', fontWeight: 800, color: '#9d4edd', marginTop: '4px' }}>
              {collectionEvents.length}
            </div>
            <div style={{ fontFamily: 'var(--text-mono)', fontSize: '9px', color: 'var(--text-secondary)', marginTop: '2px' }}>
              AI Verified Waste Captures
            </div>
          </div>
        </div>

        {/* Quick Launchpad & House Status Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          {/* Quick Simulation Commands */}
          <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: '4px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <span style={{ fontFamily: 'var(--text-mono)', fontSize: '11px', fontWeight: 800, color: 'var(--text-primary)' }}>
              ⚡ QUICK OPERATIONAL TRIGGERS
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                onClick={capturePicture}
                style={{
                  padding: '8px 12px',
                  fontFamily: 'var(--text-mono)',
                  fontSize: '10px',
                  fontWeight: 700,
                  color: '#ffffff',
                  background: '#0284c7',
                  border: 'none',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <span>📸</span>
                <span>CAPTURE EVIDENCE PHOTO FOR NEAREST HOUSE</span>
              </button>

              <button
                onClick={toggleAutoPatrol}
                style={{
                  padding: '8px 12px',
                  fontFamily: 'var(--text-mono)',
                  fontSize: '10px',
                  fontWeight: 700,
                  color: isAutoPatrol ? '#000000' : '#00d9ff',
                  background: isAutoPatrol ? '#00d9ff' : 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <span>🛣</span>
                <span>{isAutoPatrol ? 'DISABLE AUTONOMOUS PATROL' : 'START AUTONOMOUS ROAD PATROL'}</span>
              </button>

              <button
                onClick={toggleEngine}
                style={{
                  padding: '8px 12px',
                  fontFamily: 'var(--text-mono)',
                  fontSize: '10px',
                  fontWeight: 700,
                  color: engineOn ? '#ef233c' : '#2dc653',
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <span>{engineOn ? '⛔' : '⚡'}</span>
                <span>{engineOn ? 'STOP VEHICLE ENGINE' : 'START VEHICLE ENGINE'}</span>
              </button>
            </div>
          </div>

          {/* House Collection List Summary */}
          <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: '4px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <span style={{ fontFamily: 'var(--text-mono)', fontSize: '11px', fontWeight: 800, color: 'var(--text-primary)' }}>
              🏘 PROPERTY COLLECTION SUMMARY ({collectedCount}/{houses.length})
            </span>
            <div style={{ maxHeight: '200px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {houses.map((h) => (
                <div
                  key={h.id}
                  style={{
                    padding: '6px 10px',
                    background: 'var(--bg-panel-2)',
                    border: '1px solid var(--border)',
                    borderRadius: '2px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontFamily: 'var(--text-mono)',
                    fontSize: '9px',
                  }}
                >
                  <span style={{ color: 'var(--text-primary)' }}>{h.id}: {h.address}</span>
                  <span style={{ color: h.status === 'COLLECTED' ? '#2dc653' : '#ef233c', fontWeight: 700 }}>
                    {h.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
