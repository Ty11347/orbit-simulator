import { useEffect, useRef } from 'react';
import { useEngineStore } from '../../store/useEngineStore';
import { useTranslation } from '../../hooks/useTranslation';
import { useNativeDrag } from '../../hooks/useNativeDrag';
import { formatUnit, formatTime } from '../../utils/formatters';

// 物理学常数定义
const PHYSICS_CONSTANTS = {
  G: 6.67430e-11
};

// 遥测与轨道详情面板组件
export function DetailPanelWindow() {
  const { selectedBodyId, bodies, setSelectedBody } = useEngineStore();
  const { t } = useTranslation();
  const panelRef = useNativeDrag(selectedBodyId);

  // 集中声明所有用于直接操作 DOM 以避免 React 重绘的 Refs
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
    const bodyIndex = bodies.findIndex(b => b.id === selectedBodyId);
    if (bodyIndex === -1) return;

    let frameId: number;

    // 渲染循环：提取底层物理内存并反推轨道参数
    const loop = () => {
      const { engineData } = useEngineStore.getState();
      
      if (engineData.memory && engineData.memory.buffer && engineData.count > bodyIndex) {
        try {
          const posView = new Float64Array(engineData.memory.buffer, engineData.posPtr, engineData.count * 3);
          const localVelView = new Float64Array(engineData.memory.buffer, engineData.localVelPtr, engineData.count * 3);
          const parentView = new Int32Array(engineData.memory.buffer, engineData.parentPtr, engineData.count);

          const px = posView[bodyIndex * 3];
          const py = posView[bodyIndex * 3 + 1];
          const pz = posView[bodyIndex * 3 + 2];

          const vx_vis = localVelView[bodyIndex * 3];
          const vy_vis = localVelView[bodyIndex * 3 + 1];
          const vz_vis = localVelView[bodyIndex * 3 + 2];
          const speed = Math.sqrt(vx_vis * vx_vis + vy_vis * vy_vis + vz_vis * vz_vis);

          const currentParentId = parentView[bodyIndex];
          const parentBody = bodies.find(b => b.id === currentParentId);

          if (xRef.current) xRef.current.innerText = px.toFixed(2);
          if (yRef.current) yRef.current.innerText = py.toFixed(2);
          if (zRef.current) zRef.current.innerText = pz.toFixed(2);
          if (velRef.current) velRef.current.innerText = speed.toFixed(3) + " m/s";

          if (parentBody) {
            if (velNameRef.current) velNameRef.current.innerText = `Velocity (${t(parentBody.name)})`;

            const ppx = posView[currentParentId * 3];
            const ppy = posView[currentParentId * 3 + 1];
            const ppz = posView[currentParentId * 3 + 2];

            const rx = px - ppx;
            const ry = py - ppy;
            const rz = pz - ppz;
            const r = Math.sqrt(rx * rx + ry * ry + rz * rz);

            const vx = localVelView[bodyIndex * 3];
            const vy = localVelView[bodyIndex * 3 + 1];
            const vz = localVelView[bodyIndex * 3 + 2];

            const mu = PHYSICS_CONSTANTS.G * parentBody.MASS;
            const energy = speed * speed / 2.0 - mu / r;
            const sma = energy !== 0 ? -mu / (2.0 * energy) : 1e9;

            // 计算角动量向量 (Angular momentum vector)
            const hx = ry * vz - rz * vy;
            const hy = rz * vx - rx * vz;
            const hz = rx * vy - ry * vx;

            // 计算偏心率向量 (Eccentricity vector)
            const v_cross_hx = vy * hz - vz * hy;
            const v_cross_hy = vz * hx - vx * hz;
            const v_cross_hz = vx * hy - vy * hx;

            const ex = v_cross_hx / mu - rx / r;
            const ey = v_cross_hy / mu - ry / r;
            const ez = v_cross_hz / mu - rz / r;
            const ecc = Math.sqrt(ex * ex + ey * ey + ez * ez);

            // 轨道近点与远点计算
            const pe = Math.abs(sma) * Math.abs(1 - ecc);
            const ap = sma > 0 ? sma * (1 + ecc) : -1;

            const alt = r - parentBody.radius;
            const peAlt = pe - parentBody.radius;
            const apAlt = ap > 0 ? ap - parentBody.radius : -1;

            // 更新面板 DOM
            if (smaRef.current) smaRef.current.innerText = sma > 0 ? formatUnit(sma) : "Escape";
            if (eccRef.current) eccRef.current.innerText = ecc.toFixed(5);
            if (peRef.current) peRef.current.innerText = formatUnit(peAlt);
            if (apRef.current) apRef.current.innerText = apAlt > 0 ? formatUnit(apAlt) : "Escape";
            if (altRef.current) altRef.current.innerText = formatUnit(alt);

            if (periodRef.current) {
              if (ecc >= 1.0 || sma <= 0) {
                periodRef.current.innerText = "Escape";
              } else {
                const periodSeconds = 2 * Math.PI * Math.sqrt(Math.pow(sma, 3) / mu);
                periodRef.current.innerText = formatTime(periodSeconds);
              }
            }
          } else {
            // 当选中中心恒星时的清空处理
            if (velNameRef.current) velNameRef.current.innerText = "Velocity (Absolute)";
            if (smaRef.current) smaRef.current.innerText = "Center of Universe";
            if (eccRef.current) eccRef.current.innerText = "0.000";
            if (peRef.current) peRef.current.innerText = "--";
            if (apRef.current) apRef.current.innerText = "--";
            if (altRef.current) altRef.current.innerText = "--";
            if (periodRef.current) periodRef.current.innerText = "Center of Universe";
          }
        } catch (e) {
          // 忽略底层扩容导致的临时内存访问异常
        }
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