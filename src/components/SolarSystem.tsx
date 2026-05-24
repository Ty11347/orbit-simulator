import { useRef, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useEngineStore } from '../store/useEngineStore';
import { useUIStore } from '../store/useUIStore';
import init, { PhysicsEngine } from '../../physics-engine/pkg/physics_engine';
import { SolarSystemHelpers } from './SolarSystemHelpers';
import { physicsToRenderVec3 } from '../utils/coords';
import { computeTelemetry, clearTelemetry, telemetryRef } from '../utils/telemetry';
import { useCameraTracking } from '../hooks/useCameraTracking';

// 全局渲染比例常数
export const RENDER_SCALE = 1e6; // 1 WebGL 渲染单位 = 1000 公里 (10^6 米)

const VEHICLE_RENDER_RADIUS = 0.05;

export function SolarSystem() {
  // --- 全局状态 ---
  const bodies = useEngineStore(state => state.bodies);
  const systemVersion = useEngineStore(state => state.systemVersion);
  const setEngineData = useEngineStore(state => state.setEngineData);
  const selectedBodyId = useUIStore(state => state.selectedBodyId);
  const setSelectedBody = useUIStore(state => state.setSelectedBody);

  // --- 局部状态 ---
  const [engine, setEngine] = useState<PhysicsEngine | null>(null);
  const [wasmMemory, setWasmMemory] = useState<WebAssembly.Memory | null>(null);

  // --- 引用定义 ---
  const meshRefs = useRef<(THREE.Mesh | null)[]>([]);
  const helperRefs = useRef<(THREE.Group | null)[]>([]);
  const engineDataInitialized = useRef(false);
  const prevBodyCount = useRef(0);
  const universeTime = useRef(0);
  const lastStableSystemVersion = useRef(systemVersion);

  const updateCamera = useCameraTracking(meshRefs);

  // 初始化物理引擎
  useEffect(() => {
    async function loadEngine() {
      const wasm = await init();
      const physics = new PhysicsEngine();
      setEngine(physics);
      setWasmMemory(wasm.memory);
    }
    loadEngine();
  }, []);

  // 同步天体数据到物理引擎
  useEffect(() => {
    if (!engine || !wasmMemory) return;

    engine.clear();
    const idToRustIndex = new Map<number, number>();

    // 按拓扑深度排序：确保父天体总是在子天体之前注册，防止 Rust 侧 assert 崩溃
    const computeDepth = (id: number, depthMap: Map<number, number>): number => {
      if (depthMap.has(id)) return depthMap.get(id)!;
      const body = bodies.find(b => b.id === id);
      if (!body) return 0;
      const depth = body.parentId === -1 ? 0 : computeDepth(body.parentId, depthMap) + 1;
      depthMap.set(id, depth);
      return depth;
    };
    const depthMap = new Map<number, number>();
    const sorted = [...bodies].sort((a, b) => computeDepth(a.id, depthMap) - computeDepth(b.id, depthMap));

    sorted.forEach(b => {
      const rustParentIndex = b.parentId === -1 ? -1 : (idToRustIndex.get(b.parentId) ?? -1);
      const rustIdx = engine.add_body(
        b.MASS, b.SMA, b.ECC, b.INC, b.LAN, b.AOP, b.M0,
        rustParentIndex, b.soiRadius || 0, b.type === 'VEHICLE'
      );
      idToRustIndex.set(b.id, rustIdx);
    });

    // 强制下一帧刷新 engineData 指针，避免遥测读到已失效的旧内存
    engineDataInitialized.current = false;
    // 清空遥测残值，确保面板等待新引擎数据就绪后再渲染
    clearTelemetry();
    // 标记引擎已与当前 systemVersion 同步
    lastStableSystemVersion.current = systemVersion;
  }, [systemVersion, engine, wasmMemory]);

  useFrame((state, delta) => {
    const { timeScale, isPaused } = useEngineStore.getState();

    // ================= 1. 物理推进与网格坐标同步 =================
    if (engine && wasmMemory && !isPaused) {
      // 同步飞船引擎点火状态
      bodies.forEach((b, i) => {
        if (b.type === 'VEHICLE') {
          engine.set_burning(i, !!b.isBurning);
        }
      });

      // 现在的引擎是纯解析方程求根，免疫穿模，我们直接给它喂”绝对宇宙时间”！
      universeTime.current += delta * timeScale;
      engine.update_to_time(universeTime.current);

      // ================= 1a. 刷新引擎指针（必须在遥测计算之前，避免读到失效内存） =================
      const posPtr = engine.get_positions_ptr();
      const count = engine.get_bodies_count();
      if (!engineDataInitialized.current || prevBodyCount.current !== count) {
        setEngineData({
          posPtr: engine.get_positions_ptr(),
          velPtr: engine.get_velocities_ptr(),
          localVelPtr: engine.get_local_velocities_ptr(),
          parentPtr: engine.get_parents_ptr(),
          count: count,
          memory: wasmMemory
        });
        engineDataInitialized.current = true;
        prevBodyCount.current = count;
      }

      // ================= 1b. 遥测数据更新（仅在引擎与 store 状态严格一致时执行） =================
      const currentSystemVersion = useEngineStore.getState().systemVersion;
      const currentBodies = useEngineStore.getState().bodies;
      // 三重校验：版本匹配 + 引擎已初始化 + WASM 天体数与 JS 一致（防止索引错位读取错误天体的数据）
      if (currentSystemVersion === lastStableSystemVersion.current
          && engineDataInitialized.current
          && engine.get_bodies_count() === currentBodies.length) {
        const currentSelectedId = useUIStore.getState().selectedBodyId;
        if (currentSelectedId !== null) {
          const bodyIndex = currentBodies.findIndex(b => b.id === currentSelectedId);
          if (bodyIndex !== -1) {
            const { engineData } = useEngineStore.getState();
            telemetryRef.current = computeTelemetry(bodyIndex, engineData, currentBodies);
          }
        } else {
          clearTelemetry();
        }
      }

      const posView = new Float64Array(wasmMemory.buffer, posPtr, count * 3);

      // 同步 3D 渲染网格的坐标
      bodies.forEach((body, i) => {
        const mesh = meshRefs.current[body.id];
        if (mesh) {
          physicsToRenderVec3(
            posView[i * 3], posView[i * 3 + 1], posView[i * 3 + 2],
            RENDER_SCALE, mesh.position
          );
        }
        
        // 同步辅助元素（如轨道线）的位置到父天体中心
        if (body.parentId !== -1 && helperRefs.current[body.id]) {
          if (body.type !== 'VEHICLE') {
            const parentMesh = meshRefs.current[body.parentId];
            if (parentMesh) {
              helperRefs.current[body.id]!.position.copy(parentMesh.position);
            }
          }
        }
      });
    }

    // ================= 2. SOI 过渡后同步父天体与轨道参数 =================
    if (engine && wasmMemory && engineDataInitialized.current) {
      const syncCount = engine.get_bodies_count();
      const parentView = new Int32Array(wasmMemory.buffer, engine.get_parents_ptr(), syncCount);
      const parentChanges: Array<{ id: number; parentId: number; sma: number; ecc: number; inc: number; lan: number; aop: number }> = [];

      bodies.forEach((body, i) => {
        if (body.type !== 'VEHICLE') return;
        const rustParent = parentView[i];
        if (rustParent !== body.parentId) {
          const kepler = engine.get_body_kepler(i);
          parentChanges.push({
            id: body.id,
            parentId: rustParent,
            sma: kepler[1],
            ecc: kepler[2],
            inc: kepler[3],
            lan: kepler[4],
            aop: kepler[5],
          });
        }
      });

      if (parentChanges.length > 0) {
        useEngineStore.getState().syncBodyParent(parentChanges);
      }
    }

    // ================= 3. 智能相机调度与平滑运镜系统 =================
    const currentFocusMode = useUIStore.getState().focusMode;
    updateCamera(state, selectedBodyId, bodies, currentFocusMode);
  });

  return (
    <group>
      <group>
        {bodies.map((data) => (
          <mesh
            key={data.id}
            ref={(el) => (meshRefs.current[data.id] = el)}
            onClick={(e) => {
              e.stopPropagation();
              useUIStore.getState().setFocusMode('TRACK');
              setSelectedBody(data.id);
            }}
            onPointerOver={(e) => { 
              e.stopPropagation(); 
              document.body.style.cursor = 'crosshair'; 
            }} 
            onPointerOut={() => { 
              document.body.style.cursor = 'default'; 
            }}
          >
            <sphereGeometry
              args={[
                data.type === 'VEHICLE' ? VEHICLE_RENDER_RADIUS : data.radius / RENDER_SCALE,
                64, 
                64
              ]}
            />
            <meshStandardMaterial 
              color={data.color} 
              emissive={data.isStar ? data.color : '#000000'} 
              emissiveIntensity={data.isStar ? 0.5 : 0} 
            />
            {data.isStar && <pointLight intensity={2} distance={100} />}
          </mesh>
        ))}
      </group>
      
      <SolarSystemHelpers 
        bodies={bodies} 
        helperRefs={helperRefs} 
        meshRefs={meshRefs} 
        engine={engine} 
      />
    </group>
  );
}