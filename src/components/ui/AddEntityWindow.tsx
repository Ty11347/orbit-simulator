import { useState } from 'react';
import { useEngineStore } from '../../store/useEngineStore';
import { useTranslation } from '../../hooks/useTranslation';
import { useNativeDrag } from '../../hooks/useNativeDrag';

// 添加新天体/飞船的交互面板
export function AddEntityWindow() {
  const { isAddModalOpen, setAddModalOpen, addBody, bodies } = useEngineStore();
  const { t } = useTranslation();
  const panelRef = useNativeDrag(isAddModalOpen);

  // 集中管理表单状态
  const [name, setName] = useState('');
  const [type, setType] = useState<'PLANET' | 'SATELLITE' | 'VEHICLE'>('VEHICLE');
  const [parentId, setParentId] = useState(1);
  const [SMA, setSMA] = useState("6");
  const [ECC, setECC] = useState("0.5");
  const [INC_deg, setINC_deg] = useState("45");
  const [LAN_deg, setLAN_deg] = useState("0");

  if (!isAddModalOpen) return null;

  // 处理实体发射逻辑
  const handleAdd = () => {
    // 确保父节点存在，否则回退到中心天体
    const actualParentId = bodies.some(b => b.id === parentId) ? parentId : bodies[0].id;
    
    addBody({
      name: name.trim() || 'New Probe',
      type,
      radius: type === 'VEHICLE' ? 0.05 : 0.3,
      color: type === 'VEHICLE' ? '#00ff88' : '#a855f7',
      MASS: type === 'VEHICLE' ? 0.01 : 10,
      SMA: parseFloat(SMA) || 0.1,
      ECC: parseFloat(ECC) || 0,
      INC: (parseFloat(INC_deg) || 0) * (Math.PI / 180),
      LAN: (parseFloat(LAN_deg) || 0) * (Math.PI / 180),
      AOP: 0, 
      M0: 0, 
      parentId: actualParentId,
      soiRadius: type === 'VEHICLE' ? 0 : 50000
    });
    
    setName('');
    setAddModalOpen(false);
  };

  return (
    <div
      ref={panelRef}
      className="floating-panel"
      style={{ position: 'absolute', top: 60, left: window.innerWidth - 260, zIndex: 100, width: 220 }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="drag-handle">
        <span>{t('ui.addEntity')}</span>
        <button className="close-btn" onClick={() => setAddModalOpen(false)} />
      </div>
      <div className="compact-form">
        <div className="form-row">
          <label>{t('ui.name')}</label>
          <input type="text" value={name} placeholder={t('ui.defaultProbeName')} onChange={e => setName(e.target.value)} />
        </div>
        <div className="form-row">
          <label>{t('ui.type')}</label>
          <select value={type} onChange={e => setType(e.target.value as any)}>
            <option value="VEHICLE">{t('ui.type.vehicle')}</option>
            <option value="SATELLITE">{t('ui.type.satellite')}</option>
            <option value="PLANET">{t('ui.type.planet')}</option>
          </select>
        </div>
        <div className="form-row">
          <label>{t('ui.reference')}</label>
          <select value={parentId} onChange={e => setParentId(Number(e.target.value))}>
            {bodies.map(b => <option key={b.id} value={b.id}>{t(b.name)}</option>)}
          </select>
        </div>
        <div className="form-row"><label>{t('ui.sma')}</label><input type="number" step="0.1" value={SMA} onChange={e => setSMA(e.target.value)} /></div>
        <div className="form-row"><label>{t('ui.ecc')}</label><input type="number" step="0.01" value={ECC} onChange={e => setECC(e.target.value)} /></div>
        <div className="form-row"><label>{t('ui.inc')}</label><input type="number" step="1" value={INC_deg} onChange={e => setINC_deg(e.target.value)} /></div>
        <div className="form-row"><label>{t('ui.lan')}</label><input type="number" step="1" value={LAN_deg} onChange={e => setLAN_deg(e.target.value)} /></div>
        <button className="launch-btn" onClick={handleAdd}>{t('ui.launch')}</button>
      </div>
    </div>
  );
}