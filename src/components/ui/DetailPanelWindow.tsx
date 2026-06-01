import { useEffect, useRef } from 'react';
import { useEngineStore } from '../../store/useEngineStore';
import { useUIStore } from '../../store/useUIStore';
import { useTranslation } from '../../hooks/useTranslation';
import { useNativeDrag } from '../../hooks/useNativeDrag';
import { formatUnit, formatTime, formatMass, formatSpeed } from '../../utils/formatters';
import { telemetryRef } from '../../utils/telemetry';

const DASH = '--';

export function DetailPanelWindow() {
  const bodies = useEngineStore(state => state.bodies);
  const { selectedBodyId, setSelectedBody } = useUIStore();
  const { t } = useTranslation();
  const panelRef = useNativeDrag(selectedBodyId);

  const refs = {
    sma: useRef<HTMLSpanElement>(null),
    ap:   useRef<HTMLSpanElement>(null),
    pe:   useRef<HTMLSpanElement>(null),
    ecc:  useRef<HTMLSpanElement>(null),
    alt:  useRef<HTMLSpanElement>(null),
    period: useRef<HTMLSpanElement>(null),
    px:   useRef<HTMLSpanElement>(null),
    py:   useRef<HTMLSpanElement>(null),
    pz:   useRef<HTMLSpanElement>(null),
    vel:  useRef<HTMLSpanElement>(null),
    velName: useRef<HTMLSpanElement>(null),
  };

  const i18nRef = useRef({ velocity: '', escape: '', centerOfUniverse: '', zeroEcc: '0.000' });
  i18nRef.current = {
    velocity: t('ui.telemetry.velocity'),
    escape: t('ui.telemetry.escape'),
    centerOfUniverse: t('ui.telemetry.centerOfUniverse'),
    zeroEcc: '0.000',
  };

  const G = 6.67430e-11;

  const writeTelemetry = (data: any, currentBodies: any[], selBody: any) => {
    const i18n = i18nRef.current;
    const w = (r: React.RefObject<HTMLSpanElement | null>, v: string) => { if (r.current) r.current.innerText = v; };

    w(refs.px, data.px.toFixed(2));
    w(refs.py, data.py.toFixed(2));
    w(refs.pz, data.pz.toFixed(2));
    w(refs.vel, formatSpeed(data.speed));

    const parentBody = currentBodies.find((b: any) => b.id === data.parentId);
    if (parentBody) {
      w(refs.velName, `${i18n.velocity} (${t(parentBody.name)})`);

      // Static bodies (non-vehicle) use the Kepler parameters stored in JSON directly, avoiding per-frame floating-point back-computation drift
      if (selBody && selBody.type !== 'VEHICLE') {
        const sma = selBody.SMA;
        const ecc = selBody.ECC;
        const peAlt = sma * (1 - ecc) - parentBody.radius;
        const apAlt = sma * (1 + ecc) - parentBody.radius;
        const mu = G * parentBody.MASS;
        const period = 2 * Math.PI * Math.sqrt(Math.pow(sma, 3) / mu);

        w(refs.sma, formatUnit(sma));
        w(refs.ecc, ecc.toFixed(5));
        w(refs.pe, formatUnit(peAlt));
        w(refs.ap, formatUnit(apAlt));
        w(refs.alt, formatUnit(data.alt));
        w(refs.period, formatTime(period));
      } else {
        w(refs.sma, data.sma > 0 ? formatUnit(data.sma) : i18n.escape);
        w(refs.ecc, data.ecc.toFixed(5));
        w(refs.pe, formatUnit(data.peAlt));
        w(refs.ap, data.apAlt > 0 ? formatUnit(data.apAlt) : i18n.escape);
        w(refs.alt, formatUnit(data.alt));
        w(refs.period, (data.ecc >= 1.0 || data.sma <= 0) ? i18n.escape : formatTime(data.period));
      }
    } else {
      w(refs.velName, '');
      w(refs.sma, i18n.centerOfUniverse);
      w(refs.ecc, i18n.zeroEcc);
      w(refs.pe, DASH);
      w(refs.ap, DASH);
      w(refs.alt, DASH);
      w(refs.period, i18n.centerOfUniverse);
    }
  };

  useEffect(() => {
    if (selectedBodyId === null) return;

    let frameId: number;

    // Immediate sync on mount: if telemetry is cached and matches the current body, fill with zero latency to eliminate first-mount flash from empty to data
    const cached = telemetryRef.current;
    if (cached && cached.bodyId === selectedBodyId) {
      const sel = useEngineStore.getState().bodies.find((b: any) => b.id === selectedBodyId);
      writeTelemetry(cached, useEngineStore.getState().bodies, sel);
    }

    const loop = () => {
      const currentBodies = useEngineStore.getState().bodies;
      if (!currentBodies.find(b => b.id === selectedBodyId)) return;

      const data = telemetryRef.current;
      if (!data || data.bodyId !== selectedBodyId) {
        frameId = requestAnimationFrame(loop);
        return;
      }
      const sel = currentBodies.find((b: any) => b.id === selectedBodyId);
      writeTelemetry(data, currentBodies, sel);
      frameId = requestAnimationFrame(loop);
    };

    frameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameId);
  }, [selectedBodyId]);

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
          <div className="data-row"><span className="key">{t('ui.mass')}</span><span className="val">{formatMass(selectedBody.MASS)}</span></div>
          <div className="data-row"><span className="key">{t('ui.telemetry.sma')}</span><span className="val" ref={refs.sma}>{DASH}</span></div>
          <div className="data-row"><span className="key" style={{ color: '#ffaaaa' }}>{t('ui.telemetry.ap')}</span><span className="val" ref={refs.ap}>{DASH}</span></div>
          <div className="data-row"><span className="key" style={{ color: '#aaffaa' }}>{t('ui.telemetry.pe')}</span><span className="val" ref={refs.pe}>{DASH}</span></div>
          <div className="data-row"><span className="key">{t('ui.telemetry.ecc')}</span><span className="val" ref={refs.ecc}>{DASH}</span></div>
          <div className="data-row"><span className="key">{t('ui.telemetry.alt')}</span><span className="val" ref={refs.alt}>{DASH}</span></div>
          <div className="data-row"><span className="key">{t('ui.telemetry.period')}</span><span className="val" ref={refs.period}>{DASH}</span></div>
          <div style={{ borderTop: '1px solid #334155', margin: '8px 0' }}></div>
          <div className="data-row"><span className="key" style={{ color: '#ff4444' }}>{t('ui.telemetry.posX')}</span><span className="val" ref={refs.px} style={{ fontWeight: 'bold' }}>{DASH}</span></div>
          <div className="data-row"><span className="key" style={{ color: '#44ff44' }}>{t('ui.telemetry.posY')}</span><span className="val" ref={refs.py} style={{ fontWeight: 'bold' }}>{DASH}</span></div>
          <div className="data-row"><span className="key" style={{ color: '#4444ff' }}>{t('ui.telemetry.posZ')}</span><span className="val" ref={refs.pz} style={{ fontWeight: 'bold' }}>{DASH}</span></div>
          <div className="data-row"><span className="key" style={{ color: '#00ff88' }} ref={refs.velName}>{t('ui.telemetry.velocity')}</span><span className="val" ref={refs.vel} style={{ fontWeight: 'bold', color: '#00ff88' }}>{DASH}</span></div>
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
                {selectedBody.isBurning ? t('ui.engine.burning') : t('ui.engine.idle')}
              </button>
            ) : <span className="val" style={{ width: '100%', textAlign: 'center', color: '#666' }}>{t('ui.telemetry.noEngine')}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
