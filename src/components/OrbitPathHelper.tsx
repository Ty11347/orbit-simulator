import * as THREE from 'three';
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RENDER_SCALE } from './SolarSystem';

interface OrbitPathHelperProps {
  SMA: number;
  ECC: number;
  INC: number;
  LAN: number;
  AOP: number;
  color?: string;
  segments?: number;
}

export function OrbitPathHelper({ SMA, ECC, INC, LAN, AOP, color = '#4da8da', segments = 300 }: OrbitPathHelperProps) {
  const geometry = useMemo(() => {
    const points3d = [];
    const isHyperbola = ECC >= 1.0;
    // 🚨 核心：将百亿米的轨道半长轴按比例缩小到渲染尺寸
    const abs_a = Math.abs(SMA) / RENDER_SCALE;

    const cw = Math.cos(AOP); const sw = Math.sin(AOP);
    const co = Math.cos(LAN); const so = Math.sin(LAN);
    const ci = Math.cos(INC); const si = Math.sin(INC);

    for (let i = 0; i <= segments; i++) {
      let px, py;
      if (!isHyperbola) {
        const E = (i / segments) * Math.PI * 2; 
        px = abs_a * (Math.cos(E) - ECC);
        py = abs_a * Math.sqrt(1 - ECC * ECC) * Math.sin(E);
      } else {
        const limit = 3.0; // 逃逸线长度限制
        const F = ((i / segments) - 0.5) * 2 * limit; 
        px = abs_a * (ECC - Math.cosh(F));
        py = abs_a * Math.sqrt(ECC * ECC - 1) * Math.sinh(F);
      }

      const x = px * (co * cw - so * sw * ci) - py * (co * sw + so * cw * ci);
      const y = px * (so * cw + co * sw * ci) + py * (co * cw * ci - so * sw);
      const z = px * (sw * si) + py * (cw * si);

      points3d.push(new THREE.Vector3(x, z, -y));
    }
    return new THREE.BufferGeometry().setFromPoints(points3d);
  }, [SMA, ECC, INC, LAN, AOP, segments]);

  return (
    <line geometry={geometry}>
      <lineBasicMaterial color={color} transparent opacity={0.3} depthWrite={false} />
    </line>
  );
}

// =========================================================================
// 2. KSP 级多段轨道预测管线渲染器
// =========================================================================
export function DynamicOrbitPath({ patches, color = '#00ff88', meshRefs }: { patches?: Float64Array, color?: string, meshRefs: React.MutableRefObject<(THREE.Mesh | null)[]> }) {
  if (!patches || patches.length === 0) return null;

  // patches 的结构是：[parent_idx, sma, ecc, inc, lan, aop,  parent_idx2, sma2...]
  const segmentCount = patches.length / 6;
  const renderedSegments = [];

  for (let i = 0; i < segmentCount; i++) {
    const pId = patches[i * 6];
    const sma = patches[i * 6 + 1];
    const ecc = patches[i * 6 + 2];
    const inc = patches[i * 6 + 3];
    const lan = patches[i * 6 + 4];
    const aop = patches[i * 6 + 5];

    renderedSegments.push(
      <PredictedOrbitPatch 
        key={i} parentId={pId} 
        sma={sma} ecc={ecc} inc={inc} lan={lan} aop={aop} 
        color={i === 0 ? color : '#ffaa00'} // 未来的跨越轨道用醒目的橙色显示！
        meshRefs={meshRefs} 
      />
    );
  }

  return <>{renderedSegments}</>;
}

// 由于未来的轨道不在当前的坐标原点上（比如未来会绕月球飞，原点在月球上）
// 我们必须开一个 useFrame 把每一段预测轨道吸附到它对应的天体上！
function PredictedOrbitPatch({ parentId, sma, ecc, inc, lan, aop, color, meshRefs }: any) {
  const ref = useRef<THREE.Group>(null);
  
  useFrame(() => {
    const parentMesh = meshRefs.current[parentId];
    if (parentMesh && ref.current) {
      ref.current.position.copy(parentMesh.position);
    }
  });

  return (
    <group ref={ref}>
      <OrbitPathHelper SMA={sma} ECC={ecc} INC={inc} LAN={lan} AOP={aop} color={color} />
    </group>
  );
}