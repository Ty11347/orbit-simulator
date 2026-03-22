// src/components/SolarSystem.tsx
import { useRef, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import gsap from 'gsap';
import { useEngineStore } from '../store/useEngineStore';
import init, { PhysicsEngine } from '../../physics-engine/pkg/physics_engine';
import { OrbitPathHelper } from './OrbitPathHelper';

export function SolarSystem() {
  const bodies = useEngineStore(state => state.bodies);
  const selectedBodyId = useEngineStore(state => state.selectedBodyId);
  const setSelectedBody = useEngineStore(state => state.setSelectedBody);
  const isCameraTransitioning = useEngineStore(state => state.isCameraTransitioning);
  const setCameraTransitioning = useEngineStore(state => state.setCameraTransitioning);

  const [engine, setEngine] = useState<PhysicsEngine | null>(null);
  const [wasmMemory, setWasmMemory] = useState<WebAssembly.Memory | null>(null);
  const [positionsView, setPositionsView] = useState<Float64Array | null>(null);

  const meshRefs = useRef<(THREE.Mesh | null)[]>([]);
  const helperRefs = useRef<(THREE.Group | null)[]>([]);
  // 记录上一次同步给 WASM 的实体数量，避免重复添加
  const syncedCountRef = useRef(0);

  // 用于记录上一帧目标的位置，计算位移增量
  const prevTargetPos = useRef(new THREE.Vector3());

  // 1. 只执行一次的初始化：加载 WASM 模块
  useEffect(() => {
    async function loadEngine() {
      const wasm = await init();
      const physics = new PhysicsEngine();
      setEngine(physics);
      setWasmMemory(wasm.memory);
    }
    loadEngine();
  }, []);

  // 监听 systemVersion，只要发生增删，立刻在 WASM 中重建物理树
  const systemVersion = useEngineStore(state => state.systemVersion);

  // 2. 动态同步核心逻辑：当 Zustand 里的 bodies 增加时，同步给 Rust
  useEffect(() => {
    if (!engine || !wasmMemory) return;

    // 1. 清空引擎的旧内存
    engine.clear();

    // 2. 建立【React ID】到【Rust 数组 Index】的映射表
    const idToRustIndex = new Map<number, number>();

    // 3. 重新将当前存活的天体注入 WASM
    bodies.forEach(b => {
      // 在 Rust 中找到它真正挂载的父节点 Index
      const rustParentIndex = b.parentId === -1 ? -1 : (idToRustIndex.get(b.parentId) ?? -1);

      const rustIdx = engine.add_body(b.MASS, b.SMA, b.ECC, b.INC, b.LAN, b.AOP, b.M0, rustParentIndex);

      // 记录这个映射关系
      idToRustIndex.set(b.id, rustIdx);
    });

    // 4. 重绑指针
    const ptr = engine.get_positions_ptr();
    const count = engine.get_bodies_count();
    setPositionsView(new Float64Array(wasmMemory.buffer, ptr, count * 3));

  }, [systemVersion, engine, wasmMemory]);

  // 当用户点击切换目标时，重置上一帧位置，防止摄像机发生瞬移
  useEffect(() => {
    if (selectedBodyId !== null && meshRefs.current[selectedBodyId] && window.SolarSimulatorControls) {
      const controls = window.SolarSimulatorControls as any;
      const targetMesh = meshRefs.current[selectedBodyId]!;

      // 1. 开启过渡状态
      setCameraTransitioning(true);

      // 2. 创建一个临时的 dummy 对象，存放在内存中
      const dummyTarget = new THREE.Vector3().copy(controls.target);

      // 3. 呼叫 GSAP 进行缓动飞越
      gsap.to(dummyTarget, {
        x: targetMesh.position.x,
        y: targetMesh.position.y,
        z: targetMesh.position.z,
        duration: 0.8, // 柔和的 0.8 秒飞越动画
        ease: 'power2.out', // 使用标准的“减速”缓动公式，极具工业美感
        onUpdate: () => {
          // 在动画的每一帧，强行将摄像机焦点锁在 dummy 对象上
          controls.target.copy(dummyTarget);
          controls.update();
        },
        onComplete: () => {
          // 4. 动画完成，关闭过渡状态
          setCameraTransitioning(false);
          // 销毁 dummy
        }
      });

      // 更新上一帧位置基准
      prevTargetPos.current.copy(targetMesh.position);
    }
  }, [selectedBodyId]);

  useFrame((state, delta) => {
    const { timeScale, isPaused } = useEngineStore.getState();

    // 把 OrbitControls 挂载到全局，方便 useEffect 读取
    if (!window.SolarSimulatorControls && state.controls) {
      window.SolarSimulatorControls = state.controls;
    }

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

    // 摄像机伴飞逻辑 (仅在非过渡状态下执行物理锁定)
    if (selectedBodyId !== null && meshRefs.current[selectedBodyId] && !isCameraTransitioning) {
      const targetPos = meshRefs.current[selectedBodyId]!.position;
      const moveDelta = new THREE.Vector3().subVectors(targetPos, prevTargetPos.current);

      // 位移严格同步叠加，防漂移
      state.camera.position.add(moveDelta);

      if (state.controls) {
        const controls = state.controls as any;
        // 物理坐标硬核强转，严丝合缝
        controls.target.copy(targetPos);
        controls.update();
      }
      prevTargetPos.current.copy(targetPos);
    }
  });

  return (
    <group>
      <group>
        {bodies.map((data, i) => (
          <mesh
            key={data.id}
            ref={(el) => (meshRefs.current[i] = el)}
            // --- 新增交互逻辑 ---
            onClick={(e) => {
              e.stopPropagation(); // 防止点击穿透到背后的星体
              setSelectedBody(data.id);
            }}
            onPointerOver={(e) => {
              e.stopPropagation();
              document.body.style.cursor = 'crosshair'; // 鼠标悬停变成瞄准星，极客感拉满
            }}
            onPointerOut={() => {
              document.body.style.cursor = 'default';
            }}
          >
            <sphereGeometry args={[data.radius, 16, 16]} />
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

declare global {
  interface Window {
    SolarSimulatorControls: any;
  }
}

// 动态 Helper 挂载器
function SolarSystemHelpers({ bodies, helperRefs }: { bodies: any[], helperRefs: React.MutableRefObject<(THREE.Group | null)[]> }) {
  return (
    <group>
      {bodies.map((body, i) => {
        // 中心恒星（没有 parent）不需要画轨道线
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