import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stars, Stats } from '@react-three/drei';
import { SolarSystem } from './components/SolarSystem';
import { useEngineStore } from './store/useEngineStore';
import { useSpacebarToggle } from './hooks/useSpacebarToggle';

import { SettingsWindow } from './components/ui/SettingsWindow';
import { AddEntityWindow } from './components/ui/AddEntityWindow';
import { DetailPanelWindow } from './components/ui/DetailPanelWindow';
import { SidebarPanel } from './components/ui/SidebarPanel';
import { TimeControlBar } from './components/ui/TimeControlBar';

import './App.css';

function App() {
  const setSettingsWindowOpen = useEngineStore(state => state.setSettingsWindowOpen);

  // 注册全局空格键暂停监听器
  useSpacebarToggle();

  return (
    <div style={{ width: '100vw', height: '100vh', backgroundColor: '#050505' }}>
      
      {/* 所有的 UI 覆盖层组件 */}
      <TimeControlBar />
      <SidebarPanel />
      <AddEntityWindow />
      <DetailPanelWindow />
      <SettingsWindow />

      {/* 右上角独立配置唤出按钮 */}
      <button
        className="settings-toggle-btn"
        onClick={() => setSettingsWindowOpen(true)}
        style={{
          position: 'absolute',
          top: '20px', 
          right: '20px', 
          zIndex: 100, 
          background: 'rgba(0,0,0,0.5)', 
          borderRadius: '4px',
          color: '#fff', 
          border: '1px solid rgba(77, 168, 218, 0.3)',
          width: '32px', 
          height: '32px', 
          cursor: 'pointer', 
          outline: 'none',
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          fontSize: '12px', 
          transition: 'all 0.2s'
        }}
        onMouseOver={(e) => e.currentTarget.style.background = '#4da8da'}
        onMouseOut={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.5)'}
      >
        设置
      </button>

      {/* R3F 核心 3D 渲染图层 */}
      <Canvas 
        camera={{ position: [0, 800, 2000], fov: 45, far: 1e10 }} 
        gl={{ logarithmicDepthBuffer: true, antialias: true }} 
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 0 }}
      >
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