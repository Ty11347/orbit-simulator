// src/App.tsx
import { useState, useEffect, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stars, Stats } from '@react-three/drei';
import { SolarSystem } from './components/SolarSystem';
import { useEngineStore, TIME_TIERS } from './store/useEngineStore';
import { useTranslation, AVAILABLE_LANGUAGES } from './hooks/useTranslation';
import './App.css';


const rawDataModules = import.meta.glob('./data/*.json', { eager: true });
const AVAILABLE_SYSTEMS: Record<string, any> = {};

Object.keys(rawDataModules).forEach((path) => {
  // 从 "./data/solar_system.json" 中提取出 "solar_system" 作为 key
  const fileName = path.split('/').pop()?.replace('.json', '') || 'unknown';
  AVAILABLE_SYSTEMS[fileName] = (rawDataModules[path] as any).default;
});

// --- 全新的设置窗口组件 (SettingsWindow) ---
function SettingsWindow() {
  const { t, language } = useTranslation();
  const { isSettingsWindowOpen, setSettingsWindowOpen, loadSystem, setLanguage } = useEngineStore();

  const panelRef = useNativeDrag(isSettingsWindowOpen);

  if (!isSettingsWindowOpen) return null;

  return (
    <div
      ref={panelRef}
      className="floating-panel settings-panel"
      style={{
        position: 'absolute', zIndex: 110,
        top: '60px', left: window.innerWidth - 380
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Mac 风格红色关闭按钮 (右上角) */}
      <div className="drag-handle" style={{ padding: '0 12px', justifyContent: 'flex-end' }}>
        <button className="close-btn" onClick={() => setSettingsWindowOpen(false)} />
      </div>

      {/* === 系统与数据配置 === */}
      <div className="settings-category-title">{t('ui.settings.section.system')}</div>

      <div className="settings-row">
        <div className="label">{t('ui.settings.config.load')}</div>
        <div className="control">
          <select onChange={(e) => { loadSystem(AVAILABLE_SYSTEMS[e.target.value]); e.target.blur(); }}>
            {Object.keys(AVAILABLE_SYSTEMS).map((systemName) => (
              <option key={systemName} value={systemName}>{systemName}</option>
            ))}
          </select>
        </div>
      </div>

      {/* 分隔横线 */}
      <div className="settings-divider"></div>

      {/* === 界面与语言 === */}
      <div className="settings-category-title">{t('ui.settings.section.interface')}</div>

      <div className="settings-row">
        <div className="label">{t('ui.settings.lang')}</div>
        <div className="control">
          <select
            value={language}
            onChange={(e) => { setLanguage(e.target.value); e.target.blur(); }}
          >
            {AVAILABLE_LANGUAGES.map(lang => (
              <option key={lang} value={lang}>{lang}</option>
            ))}
          </select>
        </div>
      </div>

    </div>
  );
}

function useNativeDrag(active: any) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;

    // 只允许通过标题栏拖拽
    const handle = panel.querySelector('.drag-handle') as HTMLElement;
    if (!handle) return;

    let isDragging = false;
    let currentX = 0, currentY = 0;
    let initialMouseX = 0, initialMouseY = 0;

    const onMouseDown = (e: MouseEvent) => {
      isDragging = true;
      initialMouseX = e.clientX;
      initialMouseY = e.clientY;
      document.body.style.userSelect = 'none'; // 拖拽时防误触选中
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - initialMouseX;
      const dy = e.clientY - initialMouseY;
      // 直接修改底层 DOM 样式，绕过 React 渲染！
      panel.style.transform = `translate(${currentX + dx}px, ${currentY + dy}px)`;
    };

    const onMouseUp = (e: MouseEvent) => {
      if (!isDragging) return;
      isDragging = false;
      currentX += e.clientX - initialMouseX;
      currentY += e.clientY - initialMouseY;
      document.body.style.userSelect = '';
    };

    handle.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    return () => {
      handle.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [active]);

  return panelRef;
}

// --- 可拖拽的新建实体浮窗 ---
function AddEntityWindow() {
  const { isAddModalOpen, setAddModalOpen, addBody, bodies } = useEngineStore();
  const { t } = useTranslation();
  const panelRef = useNativeDrag(isAddModalOpen);

  const [name, setName] = useState('');
  const [type, setType] = useState<'PLANET' | 'SATELLITE' | 'VEHICLE'>('VEHICLE');
  const [parentId, setParentId] = useState(1);
  // 为了防止输入框被清空时引发 NaN 报错，这里统一使用字符串暂存状态
  const [SMA, setSMA] = useState("6");
  const [ECC, setECC] = useState("0.5");
  const [INC_deg, setINC_deg] = useState("45");
  const [LAN_deg, setLAN_deg] = useState("0");

  if (!isAddModalOpen) return null;

  const handleAdd = () => {
    addBody({
      name: name.trim() || 'New Probe',
      type,
      radius: type === 'VEHICLE' ? 0.05 : 0.3,
      color: type === 'VEHICLE' ? '#00ff88' : '#a855f7',
      MASS: type === 'VEHICLE' ? 0.01 : 10,
      SMA: parseFloat(SMA) || 0.1, // 安全回退，避免导致黑屏
      ECC: parseFloat(ECC) || 0,
      INC: (parseFloat(INC_deg) || 0) * (Math.PI / 180),
      LAN: (parseFloat(LAN_deg) || 0) * (Math.PI / 180),
      AOP: 0, M0: 0, parentId
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
        <div className="form-row"><label>{t('ui.name')}</label><input type="text" value={name} placeholder={t('ui.defaultProbeName')} onChange={e => setName(e.target.value)} /></div>
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

// --- 可拖拽的右侧详细数据面板 ---
function DetailPanelWindow() {
  const { selectedBodyId, bodies, setSelectedBody } = useEngineStore();
  const { t } = useTranslation();
  const panelRef = useNativeDrag(selectedBodyId);

  if (selectedBodyId === null) return null;
  const selectedBody = bodies.find(b => b.id === selectedBodyId);
  if (!selectedBody) return null;

  const parentBody = bodies.find(b => b.id === selectedBody.parentId);
  let periodStr = "N/A";
  let heightStr = "N/A";

  // 安全计算物理属性，防止引发黑屏
  if (parentBody) {
    const mu = parentBody.MASS * 1.0;
    if (mu > 0 && selectedBody.SMA > 0) {
      const T = 2 * Math.PI * Math.sqrt(Math.pow(selectedBody.SMA, 3) / mu);
      periodStr = T.toFixed(2) + " t";
    }
    const h = selectedBody.SMA - parentBody.radius;
    heightStr = h > 0 ? h.toFixed(2) + " m" : t('ui.height.ground');
  } else {
    periodStr = t('ui.height.center');
  }

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
          <div className="data-row"><span className="key">{t('ui.sma')}</span><span className="val">{selectedBody.SMA.toFixed(2)} m</span></div>
          <div className="data-row"><span className="key">{t('ui.altitude')}</span><span className="val">{heightStr}</span></div>
          <div className="data-row"><span className="key">{t('ui.ecc')}</span><span className="val">{selectedBody.ECC.toFixed(3)}</span></div>
          <div className="data-row"><span className="key">{t('ui.period')}</span><span className="val">{periodStr}</span></div>
        </div>
      </div>
    </div>
  );
}

// --- 紧凑版左侧边栏 ---
function SidebarPanel() {
  const { bodies, deleteBody, selectedBodyId, setSelectedBody, setAddModalOpen } = useEngineStore();
  const { t, language } = useTranslation();
  const [activeTab, setActiveTab] = useState<'ENTITIES' | 'VEHICLES'>('ENTITIES');
  const [isCollapsed, setIsCollapsed] = useState(false); // 收起状态

  const displayList = bodies.filter(b => {
    if (activeTab === 'ENTITIES') return b.type !== 'VEHICLE';
    if (activeTab === 'VEHICLES') return b.type === 'VEHICLE';
    return false;
  });

  return (
    <div className="sidebar-container">
      <div className={`floating-panel sidebar-panel ${isCollapsed ? 'collapsed' : ''}`}>

        <div className="tabs-header">
          <button className={`tab-btn ${activeTab === 'ENTITIES' ? 'active' : ''}`} onClick={() => setActiveTab('ENTITIES')}>{t('ui.tab.entities')}</button>
          <button className={`tab-btn ${activeTab === 'VEHICLES' ? 'active' : ''}`} onClick={() => setActiveTab('VEHICLES')}>{t('ui.tab.vehicles')}</button>
        </div>
        <div className="list-container">
          {displayList.length === 0 && <p className="empty-text">{t('ui.empty')}</p>}
          {displayList.map(body => (
            <div key={body.id} className={`list-item ${selectedBodyId === body.id ? 'selected' : ''}`} onClick={() => setSelectedBody(body.id)}>
              <div className="item-info">
                <span className="item-color" style={{ backgroundColor: body.color }}></span>
                <span className="item-name">{t(body.name)}</span>
              </div>
              {body.id !== 0 && (
                <button className="delete-btn" onClick={(e) => { e.stopPropagation(); deleteBody(body.id); }}>{t('ui.destroy')}</button>
              )}
            </div>
          ))}
          <button className="add-mini-btn" onClick={() => setAddModalOpen(true)}>+</button>
        </div>
      </div>
      <button className={`toggle-sidebar-btn ${isCollapsed ? 'collapsed' : ''}`} onClick={() => setIsCollapsed(!isCollapsed)}>
        {isCollapsed ? '⟩' : '⟨'}
      </button>
    </div>
  );
}

// --- 时间控制条 (逻辑未变，只是被移到了左上角) ---
function TimeControlBar() {
  const { timeScale, timeTierIndex, isPaused, togglePause, setTimeTierIndex, setCustomTimeScale } = useEngineStore();
  const [inputValue, setInputValue] = useState(timeScale.toString());

  useEffect(() => {
    setInputValue(timeScale.toString());
  }, [timeScale]);

  const handleScaleSubmit = () => {
    let val = parseFloat(inputValue);
    if (isNaN(val) || val < 0) val = 1;

    if (val >= 10) val = Math.round(val);
    else val = Math.round(val * 10) / 10;

    setInputValue(val.toString());

    const matchedIndex = TIME_TIERS.indexOf(val);
    if (matchedIndex !== -1) setTimeTierIndex(matchedIndex);
    else setCustomTimeScale(val);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') e.currentTarget.blur();
  };

  return (
    <div className="ksp-time-bar floating-panel" style={{ flexDirection: 'row' }}>
      <button className={`play-pause-square ${isPaused ? 'paused' : 'playing'}`} onClick={togglePause}>
        {isPaused ? '▶' : '⏸'}
      </button>

      <div className="warp-triangles">
        {TIME_TIERS.map((tier, idx) => (
          <div
            key={idx}
            className={`ksp-triangle ${idx <= timeTierIndex && !isPaused ? 'active' : ''}`}
            onClick={() => {
              if (isPaused) togglePause();
              setTimeTierIndex(idx);
            }}
            title={`${tier}x`}
          />
        ))}
      </div>

      <div className="time-input-wrapper">
        <span className="time-x">T: </span>
        <input
          type="text"
          className="time-scale-input"
          value={inputValue}
          onChange={(e) => {
            let val = e.target.value.replace(/[^0-9.]/g, '');
            if (val.length > 8) val = val.slice(0, 8);
            setInputValue(val);
          }}
          onBlur={handleScaleSubmit}
          onKeyDown={handleKeyDown}
        />
        <span className="time-x"> x</span>
      </div>
    </div>
  );
}

// --- 全局空格键监听器 (带有输入框防误触机制) ---
function useSpacebarToggle() {
  const togglePause = useEngineStore(state => state.togglePause);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        const activeTag = document.activeElement?.tagName;
        // 如果玩家正在输入轨道参数，绝对不能拦截空格
        if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') {
          return;
        }

        e.preventDefault();

        // 当前有任何 UI 元素（如下拉框）正霸占着焦点，强行一脚踢开
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }

        togglePause();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePause]);
}

function App() {
  // 激活引擎级全局快捷键
  const setSettingsWindowOpen = useEngineStore(state => state.setSettingsWindowOpen);

  useSpacebarToggle();

  return (
    <div style={{ width: '100vw', height: '100vh', backgroundColor: '#050505' }}>
      <TimeControlBar />
      <SidebarPanel />
      <AddEntityWindow />
      <DetailPanelWindow />

      <SettingsWindow />

      <button
        className="settings-toggle-btn"
        onClick={() => setSettingsWindowOpen(true)}
        style={{
          position: 'absolute',
          top: '20px', right: '20px', zIndex: 100, // 位于所有窗口上方
          background: 'rgba(0,0,0,0.5)', borderRadius: '4px',
          color: '#fff', border: '1px solid rgba(77, 168, 218, 0.3)',
          width: '32px', height: '32px', cursor: 'pointer', outline: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '16px', transition: 'all 0.2s'
        }}
        onMouseOver={(e) => e.currentTarget.style.background = '#4da8da'}
        onMouseOut={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.5)'}
      >
        ⚙
      </button>

      <Canvas camera={{ position: [0, 10, 20], fov: 45 }} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 0 }}>
        <Stats className="perf-radar" />
        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} intensity={1} />
        <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
        <OrbitControls makeDefault />
        <SolarSystem />
      </Canvas>
    </div>
  );
}

export default App;