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

// Global render scale constant
export const RENDER_SCALE = 1e6; // 1 WebGL unit = 1000 km (1e6 meters)

const VEHICLE_RENDER_RADIUS = 0.05;

export function SolarSystem() {
  // --- Global state ---
  const bodies = useEngineStore(state => state.bodies);
  const systemVersion = useEngineStore(state => state.systemVersion);
  const setEngineData = useEngineStore(state => state.setEngineData);
  const selectedBodyId = useUIStore(state => state.selectedBodyId);
  const setSelectedBody = useUIStore(state => state.setSelectedBody);

  // --- Local state ---
  const [engine, setEngine] = useState<PhysicsEngine | null>(null);
  const [wasmMemory, setWasmMemory] = useState<WebAssembly.Memory | null>(null);

  // --- Refs ---
  const meshRefs = useRef<(THREE.Mesh | null)[]>([]);
  const helperRefs = useRef<(THREE.Group | null)[]>([]);
  const engineDataInitialized = useRef(false);
  const prevBodyCount = useRef(0);
  const universeTime = useRef(0);
  const lastStableSystemVersion = useRef(systemVersion);

  const updateCamera = useCameraTracking(meshRefs);

  // Initialize physics engine
  useEffect(() => {
    async function loadEngine() {
      const wasm = await init();
      const physics = new PhysicsEngine();
      setEngine(physics);
      setWasmMemory(wasm.memory);
    }
    loadEngine();
  }, []);

  // Sync body data to the physics engine
  useEffect(() => {
    if (!engine || !wasmMemory) return;

    engine.clear();
    const idToRustIndex = new Map<number, number>();

    // Topological sort by depth: ensures parents are registered before children to prevent Rust-side assertion failure
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

    // Force engineData pointer refresh next frame to prevent telemetry from reading stale memory
    engineDataInitialized.current = false;
    // Clear residual telemetry so the panel waits for fresh engine data before rendering
    clearTelemetry();
    // Mark engine as synchronized with current systemVersion
    lastStableSystemVersion.current = systemVersion;
  }, [systemVersion, engine, wasmMemory]);

  useFrame((state, delta) => {
    const { timeScale, isPaused } = useEngineStore.getState();

    // ================= 1. Physics Stepping & Mesh Coordinate Sync =================
    if (engine && wasmMemory && !isPaused) {
      // Sync spacecraft engine burn state
      bodies.forEach((b, i) => {
        if (b.type === 'VEHICLE') {
          engine.set_burning(i, !!b.isBurning);
        }
      });

      // Pure analytical equation root-finding -- immune to clipping. Feed it absolute universe time directly.
      universeTime.current += delta * timeScale;
      engine.update_to_time(universeTime.current);

      // ================= 1a. Refresh engine pointers (must precede telemetry to avoid stale memory reads) =================
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

      // ================= 1b. Telemetry update (only when engine & store state are strictly consistent) =================
      const currentSystemVersion = useEngineStore.getState().systemVersion;
      const currentBodies = useEngineStore.getState().bodies;
      // Triple check: version match + engine initialized + WASM body count equals JS count (prevents index misalignment from reading wrong body data)
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

      // Sync 3D mesh positions
      bodies.forEach((body, i) => {
        const mesh = meshRefs.current[body.id];
        if (mesh) {
          physicsToRenderVec3(
            posView[i * 3], posView[i * 3 + 1], posView[i * 3 + 2],
            RENDER_SCALE, mesh.position
          );
        }
        
        // Sync auxiliary element (e.g. orbit lines) positions to parent body center
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

    // ================= 2. Post-SOI-Transition Parent & Kepler Sync =================
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

    // ================= 3. Smart Camera Scheduling & Smooth Tracking =================
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