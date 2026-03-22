// src/App.tsx
import { useState, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';
import { SolarSystem } from './components/SolarSystem';
import { useEngineStore, TIME_TIERS } from './store/useEngineStore';
import './App.css';

// --- 新建实体弹窗面板 ---
function AddEntityModal() {
  const { isAddModalOpen, setAddModalOpen, addBody, bodies } = useEngineStore();
  
  const [name, setName] = useState('新探测器');
  const [type, setType] = useState<'PLANET' | 'SATELLITE' | 'VEHICLE'>('VEHICLE');
  const [parentId, setParentId] = useState(1);
  const [SMA, setSMA] = useState(6);
  const [ECC, setECC] = useState(0.5);
  const [INC_deg, setINC_deg] = useState(45);
  const [LAN_deg, setLAN_deg] = useState(0);

  if (!isAddModalOpen) return null;

  const handleAdd = () => {
    addBody({
      name, type,
      radius: type === 'VEHICLE' ? 0.05 : 0.3,
      color: type === 'VEHICLE' ? '#00ff88' : '#a855f7',
      MASS: type === 'VEHICLE' ? 0.01 : 10,
      SMA, ECC, 
      INC: INC_deg * (Math.PI / 180), 
      LAN: LAN_deg * (Math.PI / 180),
      AOP: 0, M0: 0, parentId
    });
    setAddModalOpen(false); // 发射后自动关闭
  };

  return (
    <div className="add-modal-overlay">
      <div className="add-modal">
        <div className="modal-header">
          <h3>🚀 航天发射与星体构建中心</h3>
          <button className="close-btn" onClick={() => setAddModalOpen(false)}>✖</button>
        </div>
        <div className="modal-body">
          <label>名称</label>
          <input value={name} onChange={e => setName(e.target.value)} />

          <label>类型</label>
          <select value={type} onChange={e => setType(e.target.value as any)}>
            <option value="VEHICLE">人造载具 (探测器/飞船)</option>
            <option value="SATELLITE">天然卫星</option>
            <option value="PLANET">行星</option>
          </select>
          
          <label>环绕目标 (引力参考系)</label>
          <select value={parentId} onChange={e => setParentId(Number(e.target.value))}>
            {bodies.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>

          <label>半长轴 (SMA): {SMA.toFixed(1)}</label>
          <input type="range" min="0.5" max="50" step="0.1" value={SMA} onChange={e => setSMA(parseFloat(e.target.value))} />

          <label>偏心率 (ECC): {ECC.toFixed(2)}</label>
          <input type="range" min="0" max="0.9" step="0.01" value={ECC} onChange={e => setECC(parseFloat(e.target.value))} />

          <label>轨道倾角 (INC): {INC_deg}°</label>
          <input type="range" min="0" max="180" step="1" value={INC_deg} onChange={e => setINC_deg(parseFloat(e.target.value))} />
          
          <button className="launch-btn" onClick={handleAdd}>点火发射入轨</button>
        </div>
      </div>
    </div>
  );
}

// --- 左侧列表面板 ---
function SidebarPanel() {
  const { bodies, deleteBody, selectedBodyId, setSelectedBody, setAddModalOpen } = useEngineStore();
  const [activeTab, setActiveTab] = useState<'ENTITIES' | 'VEHICLES'>('ENTITIES');

  const displayList = bodies.filter(b => {
    if (activeTab === 'ENTITIES') return b.type !== 'VEHICLE';
    if (activeTab === 'VEHICLES') return b.type === 'VEHICLE';
    return false;
  });

  return (
    <div className="sidebar-panel">
      <h1 className="panel-title">任务控制中心</h1>

      <div className="tabs-header">
        <button className={`tab-btn ${activeTab === 'ENTITIES' ? 'active' : ''}`} onClick={() => setActiveTab('ENTITIES')}>天体</button>
        <button className={`tab-btn ${activeTab === 'VEHICLES' ? 'active' : ''}`} onClick={() => setActiveTab('VEHICLES')}>载具</button>
      </div>

      <div className="list-container">
        {displayList.length === 0 && <p className="empty-text">当前分类暂无数据</p>}
        {displayList.map(body => (
          <div 
            key={body.id} 
            className={`list-item ${selectedBodyId === body.id ? 'selected' : ''}`}
            onClick={() => setSelectedBody(body.id)}
          >
            <div className="item-info">
              <span className="item-color" style={{ backgroundColor: body.color }}></span>
              <span className="item-name">{body.name}</span>
            </div>
            {body.id !== 0 && (
              <button className="delete-btn" onClick={(e) => { e.stopPropagation(); deleteBody(body.id); }}>销毁</button>
            )}
          </div>
        ))}
      </div>

      <button className="add-entity-btn" onClick={() => setAddModalOpen(true)}>＋ 注入新实体</button>
    </div>
  );
}

// --- KSP 风格独立时间控制条 ---
function TimeControlBar() {
  const { timeScale, timeTierIndex, isPaused, togglePause, setTimeTierIndex, setCustomTimeScale } = useEngineStore();
  const [inputValue, setInputValue] = useState(timeScale.toString());

  // 同步外部状态到输入框
  useEffect(() => {
    setInputValue(timeScale.toString());
  }, [timeScale]);

  // 处理极其严苛的格式化规则
  const handleScaleSubmit = () => {
    let val = parseFloat(inputValue);
    if (isNaN(val) || val < 0) val = 1; // 非法输入重置为 1

    if (val >= 10) {
      val = Math.round(val); // 大于 10，四舍五入到整数
    } else {
      val = Math.round(val * 10) / 10; // 小于 10，四舍五入到一位小数
    }

    setInputValue(val.toString());
    
    // 如果碰巧等于某个默认档位，点亮对应的三角形；否则全灭
    const matchedIndex = TIME_TIERS.indexOf(val);
    if (matchedIndex !== -1) {
      setTimeTierIndex(matchedIndex);
    } else {
      setCustomTimeScale(val);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur(); // 触发 onBlur 的提交逻辑
    }
  };

  return (
    <div className="ksp-time-bar">
      <button className={`play-pause-square ${isPaused ? 'paused' : 'playing'}`} onClick={togglePause}>
        {isPaused ? '▶' : '⏸'}
      </button>
      
      <div className="warp-triangles">
        {TIME_TIERS.map((tier, idx) => (
          <div 
            key={idx} 
            className={`ksp-triangle ${idx <= timeTierIndex && !isPaused ? 'active' : ''}`} 
            onClick={() => {
              if (isPaused) togglePause(); // 如果在暂停时点击档位，自动播放
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
          maxLength={8} // 限制最大输入长度，防止破坏 UI
          onChange={(e) => {
            let val = e.target.value.replace(/[^0-9.]/g, '');
            // 只允许输入数字和小数点
            if (val.length > 8) {
              val = val.slice(0, 8);
            }
            
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

function App() {
  return (
    <div style={{ width: '100vw', height: '100vh', backgroundColor: '#050505' }}>
      <SidebarPanel />
      <TimeControlBar />
      <AddEntityModal />
      
      <Canvas camera={{ position: [0, 10, 20], fov: 45 }}>
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