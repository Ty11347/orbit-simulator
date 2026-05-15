import { useEffect, useRef } from 'react';
import { useEngineStore } from '../../store/useEngineStore';
import { useUIStore } from '../../store/useUIStore';
import { useTranslation } from '../../hooks/useTranslation';
import { useNativeDrag } from '../../hooks/useNativeDrag';
import { formatUnit, formatTime } from '../../utils/formatters';
import { telemetryRef } from '../../utils/telemetry';

export function DetailPanelWindow() {
  const bodies = useEngineStore(state => state.bodies);
  const { selectedBodyId, setSelectedBody } = useUIStore();
  const { t } = useTranslation();
  const panelRef = useNativeDrag(selectedBodyId);

  const xRef = useRef<HTMLSpanElement>(null);
  const yRef = useRef<HTMLSpanElement>(null);
  const zRef = useRef<HTMLSpanElement>(null);
  const velRef = useRef<HTMLSpanElement>(null);
  const velNameRef = useRef<HTMLSpanElement>(null);
  const smaRef = useRef<HTMLSpanElement>(null);
  const eccRef = useRef<HTMLSpanElement>(null);
  const apRef = useRef<HTMLSpanElement>(null);
  const peRef = useRef<HTMLSpanElement>(null);
  const altRef = useRef<HTMLSpanElement>(null);
  const periodRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (selectedBodyId === null) return;

    let frameId: number;
    let lastParentId = -1;

    const loop = () => {
      const data = telemetryRef.current;
      if (!data) { frameId = requestAnimationFrame(loop); return; }

      if (xRef.current) xRef.current.innerText = data.px.toFixed(2);
      if (yRef.current) yRef.current.innerText = data.py.toFixed(2);
      if (zRef.current) zRef.current.innerText = data.pz.toFixed(2);
      if (velRef.current) velRef.current.innerText = data.speed.toFixed(3) + ' m/s';

      const parentBody = bodies.find(b => b.id === data.parentId);

      if (parentBody) {
        if (velNameRef.current && data.parentId !== lastParentId) {
          velNameRef.current.innerText = `Velocity (${t(parentBody.name)})`;
          lastParentId = data.parentId;
        }

        if (smaRef.current) smaRef.current.innerText = data.sma > 0 ? formatUnit(data.sma) : 'Escape';
        if (eccRef.current) eccRef.current.innerText = data.ecc.toFixed(5);
        if (peRef.current) peRef.current.innerText = formatUnit(data.peAlt);
        if (apRef.current) apRef.current.innerText = data.apAlt > 0 ? formatUnit(data.apAlt) : 'Escape';
        if (altRef.current) altRef.current.innerText = formatUnit(data.alt);

        if (periodRef.current) {
          if (data.ecc >= 1.0 || data.sma <= 0) {
            periodRef.current.innerText = 'Escape';
          } else {
            periodRef.current.innerText = formatTime(data.period);
          }
        }
      } else {
        if (velNameRef.current) velNameRef.current.innerText = 'Velocity (Absolute)';
        if (smaRef.current) smaRef.current.innerText = 'Center of Universe';
        if (eccRef.current) eccRef.current.innerText = '0.000';
        if (peRef.current) peRef.current.innerText = '--';
        if (apRef.current) apRef.current.innerText = '--';
        if (altRef.current) altRef.current.innerText = '--';
        if (periodRef.current) periodRef.current.innerText = 'Center of Universe';
      }

      frameId = requestAnimationFrame(loop);
    };

    loop();
    return () => cancelAnimationFrame(frameId);
  }, [selectedBodyId, bodies, t]);

  if (selectedBodyId === null) return null;
  const selectedBody = bodies.find(b => b.id === selectedBodyId);
  if (!selectedBody) return null;

  return (
    <div
      ref={panelRef}
      className="floating-panel detail-panel"
      style={{ position: 'absolute', top: 350, left: window.innerWidth - 260, zIndex: 90 }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div>
        <div className="drag-handle">
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span className="item-color" style={{ backgroundColor: selectedBody.color, display: 'inline-block' }}></span>
            {t('ui.telemetry')} - {t(selectedBody.name)}
          </span>
          <button className="close-btn" onClick={() => setSelectedBody(null)} />
        </div>
        <div className="compact-form" style={{ padding: '10px 15px' }}>

          <div className="data-row"><span className="key">{t('ui.mass')}</span><span className="val">{selectedBody.MASS.toFixed(2)} kg</span></div>

          <div className="data-row"><span className="key">SMA</span><span className="val" ref={smaRef}>--</span></div>
          <div className="data-row"><span className="key" style={{ color: '#ffaaaa' }}>Apoapsis (Ap)</span><span className="val" ref={apRef}>--</span></div>
          <div className="data-row"><span className="key" style={{ color: '#aaffaa' }}>Periapsis (Pe)</span><span className="val" ref={peRef}>--</span></div>
          <div className="data-row"><span className="key">Eccentricity</span><span className="val" ref={eccRef}>--</span></div>
          <div className="data-row"><span className="key">Altitude</span><span className="val" ref={altRef}>--</span></div>
          <div className="data-row"><span className="key">Period</span><span className="val" ref={periodRef}>--</span></div>

          <div style={{ borderTop: '1px solid #334155', margin: '8px 0' }}></div>

          <div className="data-row"><span className="key" style={{ color: '#ff4444' }}>Pos X</span><span className="val" ref={xRef} style={{ fontWeight: 'bold' }}>--</span></div>
          <div className="data-row"><span className="key" style={{ color: '#44ff44' }}>Pos Y</span><span className="val" ref={yRef} style={{ fontWeight: 'bold' }}>--</span></div>
          <div className="data-row"><span className="key" style={{ color: '#4444ff' }}>Pos Z</span><span className="val" ref={zRef} style={{ fontWeight: 'bold' }}>--</span></div>
          <div className="data-row"><span className="key" style={{ color: '#00ff88' }} ref={velNameRef}>Velocity</span><span className="val" ref={velRef} style={{ fontWeight: 'bold', color: '#00ff88' }}>--</span></div>

          <div className="data-row" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', marginTop: '10px' }}>
            {selectedBody.type === 'VEHICLE' ? (
              <button
                onClick={() => useEngineStore.getState().toggleBurn(selectedBody.id)}
                style={{
                  background: selectedBody.isBurning ? '#ff2b2b' : '#00cc66',
                  border: 'none', color: '#fff', padding: '8px 12px',
                  borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold',
                  fontSize: '12px', transition: 'all 0.2s', width: '100%',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.5)'
                }}
              >
                {selectedBody.isBurning ? '[ 引擎工作中 ] (点击熄火)' : '[ 引擎已关闭 ] (点击点火)'}
              </button>
            ) : <span className="val" style={{ width: '100%', textAlign: 'center', color: '#666' }}>No Engine</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
