import { useRef, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useEngineStore } from '../store/useEngineStore';
import init, { PhysicsEngine } from '../../physics-engine/pkg/physics_engine';
import { SolarSystemHelpers } from './SolarSystemHelpers';

// 全局渲染比例常数
export const RENDER_SCALE = 1e6; // 1 WebGL 渲染单位 = 1000 公里 (10^6 米)

// 相机运镜与渲染配置常量
const CONFIG = {
  VEHICLE_RENDER_RADIUS: 0.05,        // 飞船的默认渲染半径
  VEHICLE_VIEW_DISTANCE: 0.5,         // 飞船的默认观测距离
  PLANET_VIEW_MULTIPLIER: 20,         // 行星默认观测距离（半径的倍数）
  MIN_DISTANCE_MULTIPLIER: 1.05,      // 相机最小允许距离（防穿模，半径的倍数）
  CAMERA_PAN_LERP: 0.12,              // 相机平移插值系数 (影响追焦平滑度)
  CAMERA_ZOOM_LERP: 0.08,             // 相机缩放插值系数 (影响视距缩放平滑度)
  VECTOR_EPSILON: 0.001               // 向量微小值容差
};

export function SolarSystem() {
  // --- 全局状态 ---
  const bodies = useEngineStore(state => state.bodies);
  const selectedBodyId = useEngineStore(state => state.selectedBodyId);
  const setSelectedBody = useEngineStore(state => state.setSelectedBody);
  const systemVersion = useEngineStore(state => state.systemVersion);
  const setEngineData = useEngineStore(state => state.setEngineData);

  // --- 局部状态 ---
  const [engine, setEngine] = useState<PhysicsEngine | null>(null);
  const [wasmMemory, setWasmMemory] = useState<WebAssembly.Memory | null>(null);

  // --- 引用定义 ---
  const meshRefs = useRef<(THREE.Mesh | null)[]>([]);
  const helperRefs = useRef<(THREE.Group | null)[]>([]);
  
  // 运镜系统专用的位置与状态追踪
  const currentTrackingPos = useRef(new THREE.Vector3());
  const targetOffsetLength = useRef<number | null>(null);
  const prevSelectedId = useRef<number | null>(null);
  // 目标天体上一帧的真实物理位置
  const prevActualTargetPos = useRef(new THREE.Vector3());
  // 记录低通滤波平滑后的帧间隔
  const smoothedDelta = useRef(1 / 60);
  // 缓存引擎状态，去除60Hz状态派发导致的CPU空转
  const engineDataInitialized = useRef(false);
  const prevBodyCount = useRef(0);
  const universeTime = useRef(0);

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
    const { timeScale, isPaused, focusMode } = useEngineStore.getState();

    // ================= 1. 物理推进与网格坐标同步 =================
    if (engine && wasmMemory && !isPaused) {
      // 同步飞船引擎点火状态
      bodies.forEach((b, i) => {
        if (b.type === 'VEHICLE') {
          engine.set_burning(i, !!b.isBurning);
        }
      });

      // 现在的引擎是纯解析方程求根，免疫穿模，我们直接给它喂“绝对宇宙时间”！
      universeTime.current += delta * timeScale;
      engine.update_to_time(universeTime.current);

      // 如果当前选中了飞船，在控制台高频打印它的轨道比能量
      if (selectedBodyId !== null) {
        const targetBody = bodies.find(b => b.id === selectedBodyId);
        if (targetBody && targetBody.type === 'VEHICLE') {
          // Rust 引擎中的索引即为飞船在 bodies 数组中的顺序
          const rustIdx = bodies.findIndex(b => b.id === selectedBodyId);
          if (rustIdx !== -1) {
            const energy = engine.get_specific_orbital_energy(rustIdx);
            // 正常滑行和跨越 SOI 时，这个数值应该像钉子一样死死钉住，绝对不变！
            console.log(`[能量测谎仪] 飞船 ${targetBody.name || targetBody.id} 比能量 (ε): ${energy.toFixed(8)}`);
          }
        }
      }

      // 获取物理引擎内存指针数据
      const posPtr = engine.get_positions_ptr();
      const velPtr = engine.get_velocities_ptr();
      const localVelPtr = engine.get_local_velocities_ptr();
      const parentPtr = engine.get_parents_ptr();
      // WASM 底层不发生天体数量增减时内存指针的地址是绝对固定的
      // 只需在系统刚加载，或者新增/销毁天体时，派发一次
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

      const posView = new Float64Array(wasmMemory.buffer, posPtr, count * 3);

      setEngineData({ posPtr, velPtr, localVelPtr, parentPtr, count, memory: wasmMemory });

      // 同步 3D 渲染网格的坐标
      bodies.forEach((body, i) => {
        const mesh = meshRefs.current[body.id];
        if (mesh) {
          mesh.position.set(
            posView[i * 3] / RENDER_SCALE,
            posView[i * 3 + 2] / RENDER_SCALE,
            -posView[i * 3 + 1] / RENDER_SCALE
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

    // ================= 2. 智能相机调度与平滑运镜系统 =================
    // 确保引擎计算完成且目标网格存在后再执行运镜，避免获取到初始空坐标导致画面跳跃
    if (engine && wasmMemory && selectedBodyId !== null && meshRefs.current[selectedBodyId]) {
      const actualTargetPos = meshRefs.current[selectedBodyId]!.position;

      // 目标发生切换时的初始化处理
      if (selectedBodyId !== prevSelectedId.current) {
        prevSelectedId.current = selectedBodyId;
        const body = bodies.find(b => b.id === selectedBodyId);

        if (body) {
          const renderRadius = body.type === 'VEHICLE' 
            ? CONFIG.VEHICLE_RENDER_RADIUS 
            : body.radius / RENDER_SCALE;

          // 仅在列表点击模式 (JUMP) 下触发相机视距的自动调整
          if (focusMode === 'JUMP') {
            targetOffsetLength.current = body.type === 'VEHICLE' 
              ? CONFIG.VEHICLE_VIEW_DISTANCE 
              : renderRadius * CONFIG.PLANET_VIEW_MULTIPLIER;
          } else {
            targetOffsetLength.current = null;
          }

          // 设置滚轮最小距离限制，防止相机穿模进入天体内部
          if (state.controls) {
            (state.controls as any).minDistance = renderRadius * CONFIG.MIN_DISTANCE_MULTIPLIER;
          }
        }
        // 将上一帧位置对齐新目标，防止算出极大的空间跨度差值
        prevActualTargetPos.current.copy(actualTargetPos);
      }

      // 运镜阶段一：平滑移动 (Pan)
      // 天体在这一帧由于轨道运动产生的纯物理位移
      const orbitalDelta = new THREE.Vector3().subVectors(actualTargetPos, prevActualTargetPos.current);
      // 将物理位移加到追踪锚点和相机 (解决高倍速偏移/滞后)
      currentTrackingPos.current.add(orbitalDelta);
      state.camera.position.add(orbitalDelta);
      // 追踪锚点以抛物线插值向目标的真实坐标移动
      const nextTrackingPos = currentTrackingPos.current.clone().lerp(actualTargetPos, CONFIG.CAMERA_PAN_LERP);
      const moveDelta = new THREE.Vector3().subVectors(nextTrackingPos, currentTrackingPos.current);

      state.camera.position.add(moveDelta);
      if (state.controls) {
        (state.controls as any).target.copy(nextTrackingPos);
        (state.controls as any).update();
      }

      currentTrackingPos.current.copy(nextTrackingPos);
      prevActualTargetPos.current.copy(actualTargetPos);

      // 运镜阶段二：平滑缩放 (Zoom)
      if (targetOffsetLength.current !== null) {
        const currentOffset = state.camera.position.clone().sub(currentTrackingPos.current);
        
        // 防止向量重合导致无法计算方向
        if (currentOffset.lengthSq() < CONFIG.VECTOR_EPSILON) {
          currentOffset.set(0, 0, 1);
        }

        // 以插值逐步逼近目标观测距离
        const currentLen = currentOffset.length();
        const nextLen = THREE.MathUtils.lerp(currentLen, targetOffsetLength.current, CONFIG.CAMERA_ZOOM_LERP);

        currentOffset.setLength(nextLen);
        state.camera.position.copy(currentTrackingPos.current).add(currentOffset);

        // 抵达目标视距后释放缩放控制权，允许用户自由滚动滚轮
        if (Math.abs(nextLen - targetOffsetLength.current) < 0.01) {
          targetOffsetLength.current = null;
        }
      }

    } else if (selectedBodyId === null) {
      // 取消选中目标时，将追踪锚点固定在当前玩家视角的中心点
      // 避免下次选中目标时相机从原点进行突兀的位移
      prevSelectedId.current = null;
      if (state.controls) {
        currentTrackingPos.current.copy((state.controls as any).target);
      }
    }
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
              useEngineStore.getState().setFocusMode('TRACK');
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
                data.type === 'VEHICLE' ? CONFIG.VEHICLE_RENDER_RADIUS : data.radius / RENDER_SCALE,
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