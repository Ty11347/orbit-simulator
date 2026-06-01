import * as THREE from 'three';
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import { RENDER_SCALE } from './SolarSystem';
import { physicsToRender } from '../utils/coords';

// =========================================================================
// Global orbit rendering configuration
// =========================================================================
const ORBIT_CONFIG = {
  DEFAULT_SEGMENTS: 300,
  HYPERBOLA_LIMIT: 3.0,
  LINE_WIDTH: 1,
  LINE_OPACITY: 0.8,
  COLOR_DEFAULT: '#4da8da',
  COLOR_PREDICT_CURRENT: '#00ff88',
  COLOR_PREDICT_FUTURE: '#ffaa00',
  PATCH_DATA_STRIDE: 6,
};

export interface OrbitPathHelperProps {
  SMA: number;
  ECC: number;
  INC: number;
  LAN: number;
  AOP: number;
  color?: string;
  segments?: number;
  soi?: number;
}

// =========================================================================
// Base component: static Keplerian orbit renderer (with SOI-accurate mathematical clipping)
// =========================================================================
export function OrbitPathHelper({
  SMA,
  ECC,
  INC,
  LAN,
  AOP,
  color = ORBIT_CONFIG.COLOR_DEFAULT,
  segments = ORBIT_CONFIG.DEFAULT_SEGMENTS,
  soi = Infinity // Default: no limit (central star)
}: OrbitPathHelperProps) {

  // Pre-allocate Vector3 pool in memory to avoid generating tens of thousands of objects per second during orbit refresh and overwhelming GC
  const pointsPool = useRef(
    Array.from({ length: segments + 1 }, () => new THREE.Vector3())
  );

  const points = useMemo(() => {
    const isHyperbola = ECC >= 1.0;

    const absA = Math.abs(SMA) / RENDER_SCALE; // Render scale
    const realAbsA = Math.abs(SMA); // Real physical size for SOI comparison

    // Periapsis distance (valid for both ellipse and hyperbola)
    const periapsis = realAbsA * Math.abs(1 - ECC);

    // Edge case guard: if periapsis is already outside the SOI, the entire orbit lies outside — draw nothing
    if (periapsis > soi) return [];

    // Compute the maximum allowed angular bounds for rendering
    let eLimit = Math.PI; // Default: full ellipse (E from -π to +π)
    let fLimit = ORBIT_CONFIG.HYPERBOLA_LIMIT; // Default: hyperbola length limit

    if (!isHyperbola) {
      if (ECC > 0.0001) {
        // Solve ellipse-SOI boundary intersection: r = a(1 - e*cosE) => cosE = (a - r) / ae
        const cosE = (realAbsA - soi) / (realAbsA * ECC);
        if (cosE >= -1 && cosE <= 1) {
          eLimit = Math.acos(cosE); // Eccentric anomaly at intersection
        } else if (cosE > 1) {
          return []; // Redundant guard: entirely outside SOI
        }
        // If cosE < -1 the apoapsis is also inside SOI; keep eLimit = Math.PI to draw full circle
      } else {
        // Special case: perfectly circular orbit
        if (realAbsA > soi) return [];
      }
    } else {
      // Solve hyperbola-SOI boundary intersection: r = a(e*coshF - 1) => coshF = (r + a) / ae
      const coshF = (soi + realAbsA) / (realAbsA * ECC);
      if (coshF >= 1) {
        // If intersecting the SOI boundary, take the minimum of the hyperbola length limit and the intersection
        fLimit = Math.min(ORBIT_CONFIG.HYPERBOLA_LIMIT, Math.acosh(coshF));
      }
    }

    const cw = Math.cos(AOP); const sw = Math.sin(AOP);
    const co = Math.cos(LAN); const so = Math.sin(LAN);
    const ci = Math.cos(INC); const si = Math.sin(INC);

    const pts = pointsPool.current;
    let validCount = 0;

    for (let i = 0; i <= segments; i++) {
      let px, py;

      if (!isHyperbola) {
        const E = -eLimit + (i / segments) * (2 * eLimit);
        px = absA * (Math.cos(E) - ECC);
        py = absA * Math.sqrt(1 - ECC * ECC) * Math.sin(E);
      } else {
        const F = -fLimit + (i / segments) * (2 * fLimit);
        px = absA * (ECC - Math.cosh(F));
        py = absA * Math.sqrt(ECC * ECC - 1) * Math.sinh(F);
      }

      const x = px * (co * cw - so * sw * ci) - py * (co * sw + so * cw * ci);
      const y = px * (so * cw + co * sw * ci) + py * (co * cw * ci - so * sw);
      const z = px * (sw * si) + py * (cw * si);

      const [rx, ry, rz] = physicsToRender(x, y, z, 1);
      pts[validCount].set(rx, ry, rz);
      validCount++;
    }

    return pts.slice(0, validCount);
  }, [SMA, ECC, INC, LAN, AOP, segments, soi]);

  // If the point set is empty (i.e. this orbit segment lies outside the SOI), render nothing
  if (points.length === 0) return null;

  return (
    <Line points={points} color={color} lineWidth={ORBIT_CONFIG.LINE_WIDTH} transparent={true} opacity={ORBIT_CONFIG.LINE_OPACITY} />
  );
}

// =========================================================================
// Composite component: dynamic multi-segment orbit prediction pipeline renderer
// =========================================================================
interface DynamicOrbitPathProps {
  patches?: Float64Array;
  color?: string;
  meshRefs: React.MutableRefObject<(THREE.Mesh | null)[]>;
  bodies: any[];
}

export function DynamicOrbitPath({ patches, color = ORBIT_CONFIG.COLOR_PREDICT_CURRENT, meshRefs, bodies }: DynamicOrbitPathProps) {
  if (!patches || patches.length === 0) return null;

  const segmentCount = patches.length / ORBIT_CONFIG.PATCH_DATA_STRIDE;
  const renderedSegments = [];

  for (let i = 0; i < segmentCount; i++) {
    const baseIndex = i * ORBIT_CONFIG.PATCH_DATA_STRIDE;
    const parentId = patches[baseIndex];
    const sma = patches[baseIndex + 1];
    const ecc = patches[baseIndex + 2];
    const inc = patches[baseIndex + 3];
    const lan = patches[baseIndex + 4];
    const aop = patches[baseIndex + 5];

    const segmentColor = i === 0 ? color : ORBIT_CONFIG.COLOR_PREDICT_FUTURE;

    // Dynamically extract the parent body SOI for this orbit segment
    const parentBody = bodies.find(b => b.id === parentId);
    const activeSoi = parentBody && parentBody.soiRadius > 0 ? parentBody.soiRadius : Infinity;

    renderedSegments.push(
      <PredictedOrbitPatch
        key={i} parentId={parentId}
        sma={sma} ecc={ecc} inc={inc} lan={lan} aop={aop}
        color={segmentColor} meshRefs={meshRefs} soi={activeSoi}
      />
    );
  }

  return <>{renderedSegments}</>;
}

interface PredictedOrbitPatchProps {
  parentId: number; SMA?: number; sma: number; ecc: number; inc: number; lan: number; aop: number; color: string;
  meshRefs: React.MutableRefObject<(THREE.Mesh | null)[]>;
  soi: number;
}

function PredictedOrbitPatch({ parentId, sma, ecc, inc, lan, aop, color, meshRefs, soi }: PredictedOrbitPatchProps) {
  const groupRef = useRef<THREE.Group>(null);
  useFrame(() => {
    const parentMesh = meshRefs.current[parentId];
    if (parentMesh && groupRef.current) groupRef.current.position.copy(parentMesh.position);
  });
  return (
    <group ref={groupRef}>
      <OrbitPathHelper SMA={sma} ECC={ecc} INC={inc} LAN={lan} AOP={aop} color={color} soi={soi} />
    </group>
  );
}