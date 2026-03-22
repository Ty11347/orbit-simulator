// src/components/SolarSystem.tsx
import { useRef, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useEngineStore } from '../store/useEngineStore';
import init, { PhysicsEngine } from '../../physics-engine/pkg/physics_engine';
import { OrbitPathHelper } from './OrbitPathHelper';

export function SolarSystem() {
  const bodies = useEngineStore(state => state.bodies);
  const selectedBodyId = useEngineStore(state => state.selectedBodyId);
  const setSelectedBody = useEngineStore(state => state.setSelectedBody);
  const systemVersion = useEngineStore(state => state.systemVersion); 

  const [engine, setEngine] = useState<PhysicsEngine | null>(null);
  const [wasmMemory, setWasmMemory] = useState<WebAssembly.Memory | null>(null);
  const [positionsView, setPositionsView] = useState<Float64Array | null>(null);

  const meshRefs = useRef<(THREE.Mesh | null)[]>([]);
  const helperRefs = useRef<(THREE.Group | null)[]>([]); 

  // --- 极其核心的伴飞记忆变量 ---
  const prevTargetPos = useRef(new THREE.Vector3());
  const virtualTarget = useRef(new THREE.Vector3()); // 摄像机真正盯住的“虚拟平滑点”

  // 1. 初始化引擎
  useEffect(() => {
    async function loadEngine() {
      const wasm = await init();
      const physics = new PhysicsEngine();
      setEngine(physics);
      setWasmMemory(wasm.memory);
    }
    loadEngine();
  }, []);

  // 2. 监听数据增删，重建物理树
  useEffect(() => {
    if (!engine || !wasmMemory) return;

    engine.clear();
    const idToRustIndex = new Map<number, number>();

    bodies.forEach(b => {
      const rustParentIndex = b.parentId === -1 ? -1 : (idToRustIndex.get(b.parentId) ?? -1);
      const rustIdx = engine.add_body(b.MASS, b.SMA, b.ECC, b.INC, b.LAN, b.AOP, b.M0, rustParentIndex);
      idToRustIndex.set(b.id, rustIdx);
    });

    const ptr = engine.get_positions_ptr();
    const count = engine.get_bodies_count();
    setPositionsView(new Float64Array(wasmMemory.buffer, ptr, count * 3));
    
  }, [systemVersion, engine, wasmMemory]); 

  // 3. 【状态机核心】：当用户切换星体时，只更新位移基准点，保留虚拟点不动！
  useEffect(() => {
    if (selectedBodyId !== null && meshRefs.current[selectedBodyId]) {
      const newIdealTarget = meshRefs.current[selectedBodyId]!.position;
      // 瞬间同步旧坐标基准，防止产生不合理的距离跳变
      prevTargetPos.current.copy(newIdealTarget);

      // 如果这是第一次点星体，给虚拟点一个初始位置
      if (virtualTarget.current.lengthSq() === 0) {
          virtualTarget.current.copy(newIdealTarget);
      }
    }
  }, [selectedBodyId]);

  // 4. 高频物理计算管线
  useFrame((state, delta) => {
    const { timeScale, isPaused } = useEngineStore.getState();
    
    if (engine && positionsView && !isPaused) {
      engine.update(delta * timeScale);
      
      // 更新星体 Mesh
      bodies.forEach((_, i) => {
        const mesh = meshRefs.current[i];
        if (mesh) {
          mesh.position.set(positionsView[i * 3], positionsView[i * 3 + 1], positionsView[i * 3 + 2]);
        }
      });

      // 更新轨道线
      bodies.forEach((body, i) => {
        if (body.parentId !== -1 && helperRefs.current[i]) {
          const parentMesh = meshRefs.current[body.parentId];
          if (parentMesh) {
            helperRefs.current[i]!.position.copy(parentMesh.position);
          }
        }
      });
    }

    // --- 完美的无缝伴飞算法 ---
    if (selectedBodyId !== null && meshRefs.current[selectedBodyId]) {
      const idealTarget = meshRefs.current[selectedBodyId]!.position;

      // 1. 获取星体在这一帧真实的物理位移距离 (继承绝对速度)
      const moveDelta = new THREE.Vector3().subVectors(idealTarget, prevTargetPos.current);

      // 2. 摄像机本体和“虚拟观察点”无条件叠加这个位移，保证和星体并排飞行
      state.camera.position.add(moveDelta);
      virtualTarget.current.add(moveDelta);

      // 3. 在“同速并排飞行”的前提下，柔和地闭合它们之间的坐标差距 (这就是丝滑切换的秘密)
      virtualTarget.current.lerp(idealTarget, 0.1);

      // 4. 聚焦给虚拟点
      if (state.controls) {
        const controls = state.controls as any; 
        controls.target.copy(virtualTarget.current); 
        controls.update();
      }

      // 5. 记录当前真实坐标，留给下一帧算位移
      prevTargetPos.current.copy(idealTarget);
    }
  });

  return (
    <group>
      <group>
        {bodies.map((data, i) => (
          <mesh 
            key={data.id} 
            ref={(el) => (meshRefs.current[i] = el)}
            onClick={(e) => {
              e.stopPropagation();
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
            <sphereGeometry args={[data.radius, 64, 64]} />
            <meshStandardMaterial 
              color={data.color} 
              emissive={data.isStar ? data.color : '#000000'} 
              emissiveIntensity={data.isStar ? 0.5 : 0} 
            />
            {data.isStar && <pointLight intensity={2} distance={100} />}
          </mesh>
        ))}
      </group>
      <SolarSystemHelpers bodies={bodies} helperRefs={helperRefs} />
    </group>
  );
}

// 子组件保持最精简的状态
function SolarSystemHelpers({ bodies, helperRefs }: { bodies: any[], helperRefs: React.MutableRefObject<(THREE.Group | null)[]> }) {
    return (
        <group>
            {bodies.map((body, i) => {
                if (body.parentId === -1) return null;
                return (
                    <group key={`helper-${body.id}`} ref={(el) => (helperRefs.current[i] = el)}>
                        <OrbitPathHelper SMA={body.SMA} ECC={body.ECC} INC={body.INC} LAN={body.LAN} AOP={body.AOP} color={body.color} />
                    </group>
                );
            })}
        </group>
    );
}