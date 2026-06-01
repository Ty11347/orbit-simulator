import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stars, Stats } from '@react-three/drei';
import { SolarSystem } from './components/SolarSystem';
import { useUIStore } from './store/useUIStore';
import { useSpacebarToggle } from './hooks/useSpacebarToggle';
import { useTranslation } from './hooks/useTranslation';

import { SettingsWindow } from './components/ui/SettingsWindow';
import { AddEntityWindow } from './components/ui/AddEntityWindow';
import { DetailPanelWindow } from './components/ui/DetailPanelWindow';
import { SidebarPanel } from './components/ui/SidebarPanel';
import { TimeControlBar } from './components/ui/TimeControlBar';

import './App.css';

function App() {
  const setSettingsWindowOpen = useUIStore(state => state.setSettingsWindowOpen);
  const { t } = useTranslation();

  // Register global spacebar pause/play listener
  useSpacebarToggle();

  return (
    <div style={{ width: '100vw', height: '100vh', backgroundColor: '#050505' }}>
      
      {/* UI overlay components */}
      <TimeControlBar />
      <SidebarPanel />
      <AddEntityWindow />
      <DetailPanelWindow />
      <SettingsWindow />

      {/* Settings toggle button (top-right) */}
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
          padding: '6px 10px',
          cursor: 'pointer',
          outline: 'none',
          fontSize: '12px',
          transition: 'all 0.2s'
        }}
        onMouseOver={(e) => e.currentTarget.style.background = '#4da8da'}
        onMouseOut={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.5)'}
      >
        {t('ui.settings.button')}
      </button>

      {/* R3F 3D rendering layer */}
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