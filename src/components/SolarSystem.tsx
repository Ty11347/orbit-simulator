// src/components/SolarSystem.tsx
import { useRef, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useEngineStore } from '../store/useEngineStore';
import init, { PhysicsEngine } from '../../physics-engine/pkg/physics_engine';
import { OrbitPathHelper, DynamicOrbitPath } from './OrbitPathHelper';

export const RENDER_SCALE = 1e6; // 1 WebGL 渲染单位 = 1000 公里 (10^6 米)

export function SolarSystem() {
  const bodies = useEngineStore(state => state.bodies);
  const selectedBodyId = useEngineStore(state => state.selectedBodyId);
  const setSelectedBody = useEngineStore(state => state.setSelectedBody);
  const systemVersion = useEngineStore(state => state.systemVersion);
  const setEngineData = useEngineStore(state => state.setEngineData);

  const [engine, setEngine] = useState<PhysicsEngine | null>(null);
  const [wasmMemory, setWasmMemory] = useState<WebAssembly.Memory | null>(null);

  const meshRefs = useRef<(THREE.Mesh | null)[]>([]);
  const helperRefs = useRef<(THREE.Group | null)[]>([]);

  const currentTrackingPos = useRef(new THREE.Vector3());
  const targetOffsetLength = useRef<number | null>(null);
  const prevSelectedId = useRef<number | null>(null);

  useEffect(() => {
    async function loadEngine() {
      const wasm = await init();
      const physics = new PhysicsEngine();
      setEngine(physics);
      setWasmMemory(wasm.memory);
    }
    loadEngine();
  }, []);

  useEffect(() => {
    if (!engine || !wasmMemory) return;

    engine.clear();
    const idToRustIndex = new Map<number, number>();

    bodies.forEach(b => {
      const rustParentIndex = b.parentId === -1 ? -1 : (idToRustIndex.get(b.parentId) ?? -1);
      const rustIdx = engine.add_body(
        b.MASS, b.SMA, b.ECC, b.INC, b.LAN, b.AOP, b.M0,
        rustParentIndex, b.soiRadius || 0, b.type === 'VEHICLE'
      );
      idToRustIndex.set(b.id, rustIdx);
    });
  }, [systemVersion, engine, wasmMemory]);

  useFrame((state, delta) => {
    const { timeScale, isPaused } = useEngineStore.getState();

    // ================= 1. 物理推进与模型更新 =================
    if (engine && wasmMemory && !isPaused) {
      // 1. 同步点火状态
      bodies.forEach((b, i) => {
        if (b.type === 'VEHICLE') {
          engine.set_burning(i, !!b.isBurning);
        }
      });

      // 2. 物理推进
      engine.update(delta * timeScale);

      const posPtr = engine.get_positions_ptr();
      const velPtr = engine.get_velocities_ptr();
      const localVelPtr = engine.get_local_velocities_ptr();
      const parentPtr = engine.get_parents_ptr();
      const count = engine.get_bodies_count();
      const posView = new Float64Array(wasmMemory.buffer, posPtr, count * 3);

      setEngineData({ posPtr, velPtr, localVelPtr, parentPtr, count, memory: wasmMemory });

      // 3. 更新坐标和组位置
      bodies.forEach((body, i) => {
        const mesh = meshRefs.current[body.id];
        if (mesh) {
          mesh.position.set(
            posView[i * 3] / RENDER_SCALE,
            posView[i * 3 + 2] / RENDER_SCALE,
            -posView[i * 3 + 1] / RENDER_SCALE
          );
        }
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

    // ================= 2. 电影级智能运镜系统 =================
    if (engine && wasmMemory && selectedBodyId !== null && meshRefs.current[selectedBodyId]) {
      const actualTargetPos = meshRefs.current[selectedBodyId]!.position;

      // 如果目标切换，计算目标视距
      if (selectedBodyId !== prevSelectedId.current) {
        prevSelectedId.current = selectedBodyId;
        const body = bodies.find(b => b.id === selectedBodyId);

        if (body) {
          const renderRadius = body.type === 'VEHICLE' ? 0.05 : body.radius / RENDER_SCALE;

          // 只有从列表点击 (JUMP) 时，才触发视距的平滑缩放
          if (useEngineStore.getState().focusMode === 'JUMP') {
            targetOffsetLength.current = body.type === 'VEHICLE' ? 0.5 : renderRadius * 20;
          } else {
            targetOffsetLength.current = null;
          }

          if (state.controls) {
            (state.controls as any).minDistance = renderRadius * 1.05;
          }
        }
      }

      // 🎬 运镜 1：丝滑平移 (Pan) 
      // 锚点以每帧 12% 的速度向真实星球飞行，带出平滑的抛物线追踪效果
      const lerpFactor = 0.12;
      const nextTrackingPos = currentTrackingPos.current.clone().lerp(actualTargetPos, lerpFactor);
      const moveDelta = new THREE.Vector3().subVectors(nextTrackingPos, currentTrackingPos.current);

      state.camera.position.add(moveDelta);
      if (state.controls) {
        (state.controls as any).target.copy(nextTrackingPos);
        (state.controls as any).update();
      }

      currentTrackingPos.current.copy(nextTrackingPos);

      // 🎬 运镜 2：丝滑缩放 (Zoom)
      if (targetOffsetLength.current !== null) {
        const currentOffset = state.camera.position.clone().sub(currentTrackingPos.current);
        if (currentOffset.lengthSq() < 0.001) currentOffset.set(0, 0, 1);

        const currentLen = currentOffset.length();
        // 距离以每帧 8% 的速度向目标视距逼近
        const nextLen = THREE.MathUtils.lerp(currentLen, targetOffsetLength.current, 0.08);

        currentOffset.setLength(nextLen);
        state.camera.position.copy(currentTrackingPos.current).add(currentOffset);

        // 到达目标视距后，解除运镜锁定，把控制权还给玩家滚轮
        if (Math.abs(nextLen - targetOffsetLength.current) < 0.01) {
          targetOffsetLength.current = null;
        }
      }

    } else if (selectedBodyId === null) {
      // 退出选中时：将追踪锚点留在此刻玩家的视线中心点
      // 保证下次点击天体时，相机会从当前凝视的位置起飞，而不是从 (0,0,0) 瞬移！
      prevSelectedId.current = null;
      if (state.controls) {
        currentTrackingPos.current.copy((state.controls as any).target);
      }
    }
  });

  return (
    <group>
      <group>
        {bodies.map((data, i) => (
          <mesh
            key={data.id}
            ref={(el) => (meshRefs.current[data.id] = el)}
            onClick={(e) => {
              e.stopPropagation();
              useEngineStore.getState().setFocusMode('TRACK');
              setSelectedBody(data.id);
            }}
            onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'crosshair'; }} onPointerOut={() => { document.body.style.cursor = 'default'; }}>
            <sphereGeometry
              args={[
                data.type === 'VEHICLE' ? 0.05 : data.radius / RENDER_SCALE,
                64, 64
              ]}
            />
            <meshStandardMaterial color={data.color} emissive={data.isStar ? data.color : '#000000'} emissiveIntensity={data.isStar ? 0.5 : 0} />
            {data.isStar && <pointLight intensity={2} distance={100} />}
          </mesh>
        ))}
      </group>
      <SolarSystemHelpers bodies={bodies} helperRefs={helperRefs} meshRefs={meshRefs} engine={engine} />
    </group>
  );
}

// 子组件保持最精简的状态，剥离重绘逻辑
function SolarSystemHelpers({ bodies, helperRefs, meshRefs, engine }: any) {
  return (
    <group>
      {bodies.map((body: any, i: number) => {
        if (body.parentId === -1) return null;
        return (
          <group key={`helper-${body.id}`} ref={(el) => (helperRefs.current[body.id] = el)}>
            {body.type === 'VEHICLE' && engine ? (
              // 👈 将所有的计算和渲染剥离为独立的子树，彻底解救主渲染线程
              <VehiclePredictor body={body} rustIdx={i} engine={engine} meshRefs={meshRefs} />
            ) : (
              <OrbitPathHelper SMA={body.SMA} ECC={body.ECC} INC={body.INC} LAN={body.LAN} AOP={body.AOP} color={body.color} />
            )}
          </group>
        );
      })}
    </group>
  );
}

// 全新的状态孤岛组件：自动从引擎抽取预测轨迹并自我渲染
function VehiclePredictor({ body, rustIdx, engine, meshRefs }: any) {
  const [patches, setPatches] = useState<Float64Array | null>(null);
  const frameCount = useRef(0);

  useFrame(() => {
    frameCount.current++;
    // 将预测频率降低至每 15 帧，并利用 Float64Array 地址规避无意义的重新渲染
    if (frameCount.current % 15 === 0) {
      const newPatches = engine.predict_patches(rustIdx);
      setPatches(prev => {
        if (!prev || prev.length !== newPatches.length || Math.abs(prev[1] - newPatches[1]) > 0.01) {
          return newPatches;
        }
        return prev;
      });
    }
  });

  if (!patches || patches.length === 0) return null;
  return <DynamicOrbitPath patches={patches} color={body.color} meshRefs={meshRefs} />;
}