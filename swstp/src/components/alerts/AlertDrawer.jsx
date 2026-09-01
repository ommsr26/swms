/**
 * AlertDrawer.jsx — Operational Alerts & Intelligence Slide-out Drawer.
 */
import { useState } from 'react';
import { acknowledgeOfficerAlert } from '../../telemetry/backendApiClient.js';

export default function AlertDrawer({
  isOpen,
  onClose,
  alerts = [],
  onSelectVehicle,
  onAlertAcknowledged,
}) {
  const [filter, setFilter] = useState('ACTIVE'); // 'ACTIVE' | 'CRITICAL' | 'WARNING' | 'RESOLVED'

  if (!isOpen) return null;

  const activeAlerts = alerts.filter((a) => a.status === 'ACTIVE');
  const resolvedAlerts = alerts.filter((a) => a.status === 'RESOLVED');

  const filteredAlerts = alerts.filter((a) => {
    if (filter === 'ACTIVE') return a.status === 'ACTIVE';
    if (filter === 'CRITICAL') return a.status === 'ACTIVE' && a.severity === 'CRITICAL';
    if (filter === 'WARNING') return a.status === 'ACTIVE' && a.severity === 'WARNING';
    if (filter === 'RESOLVED') return a.status === 'RESOLVED';
    return true;
  });

  const handleAcknowledge = async (alertId) => {
    const ok = await acknowledgeOfficerAlert(alertId);
    if (ok && onAlertAcknowledged) {
      onAlertAcknowledged(alertId);
    }
  };

  const getSeverityBadgeStyle = (sev) => {
    if (sev === 'CRITICAL') return { color: '#ef233c', background: 'rgba(239,35,60,0.12)', border: '1px solid rgba(239,35,60,0.3)' };
    if (sev === 'WARNING') return { color: '#f48c06', background: 'rgba(244,140,6,0.12)', border: '1px solid rgba(244,140,6,0.3)' };
    return { color: '#00b4d8', background: 'rgba(0,180,216,0.12)', border: '1px solid rgba(0,180,216,0.3)' };
  };

  const getTypeIcon = (type) => {
    if (type === 'TRUCK_OFFLINE') return '📡';
    if (type === 'GPS_UNAVAILABLE') return '🛰';
    if (type === 'PROLONGED_IDLE') return '⏱';
    if (type === 'ROUTE_DEVIATION') return '⚠️';
    return '🔔';
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: '380px',
        maxWidth: '100vw',
        background: 'var(--bg-panel-2)',
        borderLeft: '1px solid var(--border)',
        boxShadow: '-4px 0 24px rgba(0,0,0,0.6)',
        zIndex: 2000,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'var(--text-mono)',
        animation: 'slideInRight 0.2s ease-out',
      }}
    >
      {/* ─── HEADER ──────────────────────────────────────────────────────── */}
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-panel)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '14px' }}>🚨</span>
          <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '0.08em' }}>
            OPERATIONAL ALERTS
          </span>
          <span
            style={{
              fontSize: '8.5px',
              padding: '2px 6px',
              borderRadius: '10px',
              fontWeight: 700,
              background: activeAlerts.length > 0 ? '#ef233c' : 'var(--status-ok)',
              color: '#fff',
            }}
          >
            {activeAlerts.length} ACTIVE
          </span>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-dim)',
            fontSize: '14px',
            cursor: 'pointer',
            padding: '4px 8px',
          }}
        >
          ✕
        </button>
      </div>

      {/* ─── FILTER TABS ─────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--bg-panel)', flexShrink: 0 }}>
        {[
          { id: 'ACTIVE', label: `ACTIVE (${activeAlerts.length})` },
          { id: 'CRITICAL', label: `CRITICAL (${activeAlerts.filter((a) => a.severity === 'CRITICAL').length})` },
          { id: 'WARNING', label: `WARNINGS (${activeAlerts.filter((a) => a.severity === 'WARNING').length})` },
          { id: 'RESOLVED', label: `RESOLVED (${resolvedAlerts.length})` },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setFilter(t.id)}
            style={{
              flex: 1,
              padding: '8px 4px',
              fontFamily: 'var(--text-mono)',
              fontSize: '8px',
              fontWeight: filter === t.id ? 700 : 400,
              color: filter === t.id ? '#00d9ff' : 'var(--text-dim)',
              background: filter === t.id ? 'var(--bg-elevated)' : 'none',
              border: 'none',
              borderBottom: filter === t.id ? '2px solid #00d9ff' : 'none',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ─── ALERTS LIST ─────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {filteredAlerts.length === 0 ? (
          <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-dim)', fontSize: '9.5px', lineHeight: 1.6 }}>
            <span style={{ fontSize: '20px', color: 'var(--status-ok)' }}>✓</span>
            <br />
            No {filter.toLowerCase()} alerts.
            <br />
            System operational within normal parameters.
          </div>
        ) : (
          filteredAlerts.map((alert) => {
            const badgeStyle = getSeverityBadgeStyle(alert.severity);
            const isResolved = alert.status === 'RESOLVED';

            return (
              <div
                key={alert.alertId}
                style={{
                  background: isResolved ? 'rgba(255,255,255,0.02)' : 'var(--bg-elevated)',
                  border: isResolved ? '1px solid var(--border)' : `1px solid ${alert.severity === 'CRITICAL' ? '#ef233c44' : '#f48c0644'}`,
                  borderLeft: isResolved ? '3px solid var(--text-dim)' : `3px solid ${alert.severity === 'CRITICAL' ? '#ef233c' : '#f48c06'}`,
                  borderRadius: '3px',
                  padding: '10px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  opacity: isResolved ? 0.7 : 1.0,
                }}
              >
                {/* Top Row: Type, Severity, Time */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '12px' }}>{getTypeIcon(alert.alertType)}</span>
                    <span style={{ fontSize: '9px', fontWeight: 800, color: 'var(--text-primary)' }}>
                      {alert.alertType}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '7.5px', fontWeight: 700, padding: '1px 5px', borderRadius: '2px', ...badgeStyle }}>
                      {isResolved ? 'RESOLVED' : alert.severity}
                    </span>
                    <span style={{ fontSize: '8px', color: 'var(--text-dim)' }}>
                      {new Date(alert.createdAt).toLocaleTimeString()}
                    </span>
                  </div>
                </div>

                {/* Vehicle & Message */}
                <div style={{ fontSize: '8.5px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                  {alert.vehicleRegistrationNumber && (
                    <strong style={{ color: '#00d9ff', marginRight: '4px' }}>
                      [{alert.vehicleRegistrationNumber}]
                    </strong>
                  )}
                  {alert.message}
                </div>

                {/* Resolution Time Info */}
                {isResolved && alert.resolvedAt && (
                  <div style={{ fontSize: '7.5px', color: 'var(--status-ok)' }}>
                    ✓ Resolved at {new Date(alert.resolvedAt).toLocaleTimeString()}
                  </div>
                )}

                {/* Action Buttons */}
                <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                  {alert.vehicleId && (
                    <button
                      onClick={() => {
                        if (onSelectVehicle) onSelectVehicle(alert.vehicleId);
                        onClose();
                      }}
                      style={{
                        flex: 1,
                        padding: '4px',
                        background: 'rgba(0,217,255,0.08)',
                        border: '1px solid #00d9ff44',
                        color: '#00d9ff',
                        borderRadius: '2px',
                        fontSize: '8px',
                        cursor: 'pointer',
                        fontWeight: 700,
                      }}
                    >
                      📍 LOCATE TRUCK
                    </button>
                  )}

                  {!isResolved && (
                    alert.isAcknowledged ? (
                      <span
                        style={{
                          padding: '4px 8px',
                          background: 'rgba(45,198,83,0.1)',
                          border: '1px solid rgba(45,198,83,0.3)',
                          color: '#2dc653',
                          borderRadius: '2px',
                          fontSize: '8px',
                          fontWeight: 700,
                        }}
                      >
                        ✓ ACKED
                      </span>
                    ) : (
                      <button
                        onClick={() => handleAcknowledge(alert.alertId)}
                        style={{
                          padding: '4px 8px',
                          background: 'rgba(255,255,255,0.05)',
                          border: '1px solid var(--border-mid)',
                          color: 'var(--text-dim)',
                          borderRadius: '2px',
                          fontSize: '8px',
                          cursor: 'pointer',
                        }}
                      >
                        ACK
                      </button>
                    )
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
