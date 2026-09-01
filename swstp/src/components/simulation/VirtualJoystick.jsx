import { useState, useRef, useEffect, useCallback } from 'react';
import { useSimulationStore } from '../../telemetry/simulationStore.js';

export default function VirtualJoystick() {
  const setJoystick = useSimulationStore((s) => s.setJoystick);
  const [knobPos, setKnobPos] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [activeKeys, setActiveKeys] = useState({ w: false, a: false, s: false, d: false });
  const containerRef = useRef(null);

  const RADIUS = 55; // max radius in pixels

  const handlePointerDown = (e) => {
    setIsDragging(true);
    handlePointerMove(e);
  };

  const handlePointerMove = useCallback((e) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const clientX = e.clientX ?? (e.touches ? e.touches[0].clientX : centerX);
    const clientY = e.clientY ?? (e.touches ? e.touches[0].clientY : centerY);

    const deltaX = clientX - centerX;
    const deltaY = clientY - centerY;
    const dist = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

    let clampedX = deltaX;
    let clampedY = deltaY;

    if (dist > RADIUS) {
      clampedX = (deltaX / dist) * RADIUS;
      clampedY = (deltaY / dist) * RADIUS;
    }

    setKnobPos({ x: clampedX, y: clampedY });
    setJoystick(clampedX / RADIUS, clampedY / RADIUS);
  }, [setJoystick]);

  const handlePointerUp = useCallback(() => {
    setIsDragging(false);
    setKnobPos({ x: 0, y: 0 });
    setJoystick(0, 0);
  }, [setJoystick]);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
      window.addEventListener('touchmove', handlePointerMove);
      window.addEventListener('touchend', handlePointerUp);
    }
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('touchmove', handlePointerMove);
      window.removeEventListener('touchend', handlePointerUp);
    };
  }, [isDragging, handlePointerMove, handlePointerUp]);

  // Keyboard control support (WASD and Arrow keys)
  useEffect(() => {
    const handleKeyDown = (e) => {
      const k = e.key.toLowerCase();
      let newKeys = null;

      if (k === 'w' || e.key === 'ArrowUp') {
        newKeys = { ...activeKeys, w: true };
      } else if (k === 's' || e.key === 'ArrowDown') {
        newKeys = { ...activeKeys, s: true };
      } else if (k === 'a' || e.key === 'ArrowLeft') {
        newKeys = { ...activeKeys, a: true };
      } else if (k === 'd' || e.key === 'ArrowRight') {
        newKeys = { ...activeKeys, d: true };
      }

      if (newKeys) {
        setActiveKeys(newKeys);
        let x = 0;
        let y = 0;
        if (newKeys.a) x -= 1;
        if (newKeys.d) x += 1;
        if (newKeys.w) y -= 1;
        if (newKeys.s) y += 1;
        setKnobPos({ x: x * RADIUS * 0.8, y: y * RADIUS * 0.8 });
        setJoystick(x, y);
      }
    };

    const handleKeyUp = (e) => {
      const k = e.key.toLowerCase();
      let newKeys = null;

      if (k === 'w' || e.key === 'ArrowUp') {
        newKeys = { ...activeKeys, w: false };
      } else if (k === 's' || e.key === 'ArrowDown') {
        newKeys = { ...activeKeys, s: false };
      } else if (k === 'a' || e.key === 'ArrowLeft') {
        newKeys = { ...activeKeys, a: false };
      } else if (k === 'd' || e.key === 'ArrowRight') {
        newKeys = { ...activeKeys, d: false };
      }

      if (newKeys) {
        setActiveKeys(newKeys);
        let x = 0;
        let y = 0;
        if (newKeys.a) x -= 1;
        if (newKeys.d) x += 1;
        if (newKeys.w) y -= 1;
        if (newKeys.s) y += 1;
        setKnobPos({ x: x * RADIUS * 0.8, y: y * RADIUS * 0.8 });
        setJoystick(x, y);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [activeKeys, setJoystick]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '10px',
        userSelect: 'none',
      }}
    >
      {/* Joystick Outer Base */}
      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        style={{
          width: '140px',
          height: '140px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(15, 23, 42, 0.95) 0%, rgba(3, 7, 18, 0.98) 100%)',
          border: '2px solid rgba(0, 217, 255, 0.35)',
          boxShadow: isDragging
            ? '0 0 20px rgba(0, 217, 255, 0.4), inset 0 0 15px rgba(0, 217, 255, 0.2)'
            : '0 8px 24px rgba(0, 0, 0, 0.6), inset 0 0 10px rgba(0, 0, 0, 0.8)',
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'grab',
          touchAction: 'none',
        }}
      >
        {/* Crosshair guide lines */}
        <div style={{ position: 'absolute', width: '100%', height: '1px', background: 'rgba(255,255,255,0.08)' }} />
        <div style={{ position: 'absolute', height: '100%', width: '1px', background: 'rgba(255,255,255,0.08)' }} />
        <div
          style={{
            position: 'absolute',
            width: '80px',
            height: '80px',
            borderRadius: '50%',
            border: '1px dashed rgba(0, 217, 255, 0.2)',
          }}
        />

        {/* Direction labels */}
        <span style={{ position: 'absolute', top: '6px', fontFamily: 'var(--text-mono)', fontSize: '8px', color: activeKeys.w ? '#00d9ff' : 'var(--text-dim)', fontWeight: 700 }}>FWD</span>
        <span style={{ position: 'absolute', bottom: '6px', fontFamily: 'var(--text-mono)', fontSize: '8px', color: activeKeys.s ? '#00d9ff' : 'var(--text-dim)', fontWeight: 700 }}>REV</span>
        <span style={{ position: 'absolute', left: '6px', fontFamily: 'var(--text-mono)', fontSize: '8px', color: activeKeys.a ? '#00d9ff' : 'var(--text-dim)', fontWeight: 700 }}>L</span>
        <span style={{ position: 'absolute', right: '6px', fontFamily: 'var(--text-mono)', fontSize: '8px', color: activeKeys.d ? '#00d9ff' : 'var(--text-dim)', fontWeight: 700 }}>R</span>

        {/* Draggable Knob */}
        <div
          style={{
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            background: isDragging
              ? 'radial-gradient(circle, #38bdf8 0%, #0284c7 100%)'
              : 'radial-gradient(circle, #0ea5e9 0%, #0369a1 100%)',
            border: '2px solid #ffffff',
            boxShadow: '0 4px 12px rgba(0,0,0,0.8), 0 0 10px rgba(14, 165, 233, 0.5)',
            transform: `translate(${knobPos.x}px, ${knobPos.y}px)`,
            transition: isDragging ? 'none' : 'transform 0.15s ease-out',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <div style={{ width: '14px', height: '14px', borderRadius: '50%', background: '#ffffff', opacity: 0.9 }} />
        </div>
      </div>

      {/* Keyboard Controls Legend */}
      <div style={{ display: 'flex', gap: '4px' }}>
        {['W', 'A', 'S', 'D'].map((key) => {
          const kLower = key.toLowerCase();
          const isActive = activeKeys[kLower];
          return (
            <div
              key={key}
              style={{
                fontFamily: 'var(--text-mono)',
                fontSize: '9px',
                fontWeight: 700,
                color: isActive ? '#000000' : 'var(--text-secondary)',
                background: isActive ? '#00d9ff' : 'var(--bg-elevated)',
                border: isActive ? '1px solid #00d9ff' : '1px solid var(--border)',
                padding: '2px 6px',
                borderRadius: '3px',
                boxShadow: isActive ? '0 0 8px rgba(0,217,255,0.6)' : 'none',
                transition: 'all 0.1s',
              }}
            >
              {key}
            </div>
          );
        })}
        <span style={{ fontFamily: 'var(--text-mono)', fontSize: '8px', color: 'var(--text-dim)', alignSelf: 'center', marginLeft: '4px' }}>
          KEYBOARD / JOYSTICK
        </span>
      </div>
    </div>
  );
}
