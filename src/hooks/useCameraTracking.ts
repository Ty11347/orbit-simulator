import { useRef } from 'react';
import * as THREE from 'three';
import type { CelestialBody } from '../store/useEngineStore';
import { RENDER_SCALE } from '../components/SolarSystem';

const CONFIG = {
  VEHICLE_RENDER_RADIUS: 0.05,
  VEHICLE_VIEW_DISTANCE: 0.5,
  PLANET_VIEW_MULTIPLIER: 20,
  MIN_DISTANCE_MULTIPLIER: 1.05,
  CAMERA_PAN_LERP: 0.12,
  CAMERA_ZOOM_LERP: 0.08,
  VECTOR_EPSILON: 0.001,
};

interface R3FState {
  camera: THREE.Camera;
  controls: any;
}

export function useCameraTracking(
  meshRefs: React.MutableRefObject<(THREE.Mesh | null)[]>,
) {
  const currentTrackingPos = useRef(new THREE.Vector3());
  const targetOffsetLength = useRef<number | null>(null);
  const prevSelectedId = useRef<number | null>(null);
  const prevActualTargetPos = useRef(new THREE.Vector3());

  function updateCamera(state: R3FState, selectedBodyId: number | null, bodies: CelestialBody[], focusMode: 'JUMP' | 'TRACK') {
    if (selectedBodyId !== null && meshRefs.current[selectedBodyId]) {
      const actualTargetPos = meshRefs.current[selectedBodyId]!.position;

      if (selectedBodyId !== prevSelectedId.current) {
        prevSelectedId.current = selectedBodyId;
        const body = bodies.find(b => b.id === selectedBodyId);

        if (body) {
          const renderRadius = body.type === 'VEHICLE'
            ? CONFIG.VEHICLE_RENDER_RADIUS
            : body.radius / RENDER_SCALE;

          if (focusMode === 'JUMP') {
            targetOffsetLength.current = body.type === 'VEHICLE'
              ? CONFIG.VEHICLE_VIEW_DISTANCE
              : renderRadius * CONFIG.PLANET_VIEW_MULTIPLIER;
          } else {
            targetOffsetLength.current = null;
          }

          if (state.controls) {
            state.controls.minDistance = renderRadius * CONFIG.MIN_DISTANCE_MULTIPLIER;
          }
        }
        prevActualTargetPos.current.copy(actualTargetPos);
      }

      const orbitalDelta = new THREE.Vector3().subVectors(actualTargetPos, prevActualTargetPos.current);
      currentTrackingPos.current.add(orbitalDelta);
      state.camera.position.add(orbitalDelta);

      const nextTrackingPos = currentTrackingPos.current.clone().lerp(actualTargetPos, CONFIG.CAMERA_PAN_LERP);
      const moveDelta = new THREE.Vector3().subVectors(nextTrackingPos, currentTrackingPos.current);

      state.camera.position.add(moveDelta);
      if (state.controls) {
        state.controls.target.copy(nextTrackingPos);
        state.controls.update();
      }

      currentTrackingPos.current.copy(nextTrackingPos);
      prevActualTargetPos.current.copy(actualTargetPos);

      if (targetOffsetLength.current !== null) {
        const currentOffset = state.camera.position.clone().sub(currentTrackingPos.current);

        if (currentOffset.lengthSq() < CONFIG.VECTOR_EPSILON) {
          currentOffset.set(0, 0, 1);
        }

        const currentLen = currentOffset.length();
        const nextLen = THREE.MathUtils.lerp(currentLen, targetOffsetLength.current, CONFIG.CAMERA_ZOOM_LERP);

        currentOffset.setLength(nextLen);
        state.camera.position.copy(currentTrackingPos.current).add(currentOffset);

        if (Math.abs(nextLen - targetOffsetLength.current) < 0.01) {
          targetOffsetLength.current = null;
        }
      }

    } else if (selectedBodyId === null) {
      prevSelectedId.current = null;
      if (state.controls) {
        currentTrackingPos.current.copy(state.controls.target);
      }
    }
  }

  return updateCamera;
}
