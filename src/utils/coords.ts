import * as THREE from 'three';

/**
 * Convert physics coordinates (Y-up, meters) to Three.js render coordinates (Z-up, scaled).
 * Physics: X right, Y up, Z toward viewer
 * Three.js: X right, Y toward viewer, Z up
 */
export function physicsToRender(px: number, py: number, pz: number, scale: number): [number, number, number] {
  return [px / scale, pz / scale, -py / scale];
}

export function physicsToRenderVec3(px: number, py: number, pz: number, scale: number, out?: THREE.Vector3): THREE.Vector3 {
  const target = out ?? new THREE.Vector3();
  return target.set(px / scale, pz / scale, -py / scale);
}
