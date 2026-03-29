import * as THREE from 'three';
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import { RENDER_SCALE } from './SolarSystem';

// =========================================================================
// 全局轨道渲染配置常量
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
// 基础组件：静态开普勒轨道渲染器 (支持 SOI 精确数学裁剪)
// =========================================================================
export function OrbitPathHelper({
  SMA,
  ECC,
  INC,
  LAN,
  AOP,
  color = ORBIT_CONFIG.COLOR_DEFAULT,
  segments = ORBIT_CONFIG.DEFAULT_SEGMENTS,
  soi = Infinity // 默认无限制（中心恒星）
}: OrbitPathHelperProps) {

  // 一次性在内存中申请够Vector3，避免轨道动态刷新导致每秒生成上万个Vector3撑爆GC
  const pointsPool = useRef(
    Array.from({ length: segments + 1 }, () => new THREE.Vector3())
  );

  const points = useMemo(() => {
    const points3d = [];
    const isHyperbola = ECC >= 1.0;

    const absA = Math.abs(SMA) / RENDER_SCALE; // 渲染尺寸
    const realAbsA = Math.abs(SMA); // 真实物理尺寸，用于对比 SOI

    // 近点距离 (无论椭圆还是双曲线都适用)
    const periapsis = realAbsA * Math.abs(1 - ECC);

    // 🛡️ 极端情况拦截：如果近点都已经超出了 SOI，说明轨道完全在球外，一根线都不要画！
    if (periapsis > soi) return [];

    // 计算允许渲染的最大角度界限 (Limit)
    let eLimit = Math.PI; // 默认椭圆画整圈 (E 从 -π 到 +π)
    let fLimit = ORBIT_CONFIG.HYPERBOLA_LIMIT; // 默认双曲线限制长度

    if (!isHyperbola) {
      if (ECC > 0.0001) {
        // 解算椭圆与 SOI 边界的交点: r = a(1 - e*cosE) => cosE = (a - r) / ae
        const cosE = (realAbsA - soi) / (realAbsA * ECC);
        if (cosE >= -1 && cosE <= 1) {
          eLimit = Math.acos(cosE); // 算出交点的 E 角！
        } else if (cosE > 1) {
          return []; // 再次兜底防御：完全在 SOI 外
        }
        // 若 cosE < -1，说明远点也在 SOI 内，保持 eLimit = Math.PI 画全圈
      } else {
        // 绝对圆轨道的特判
        if (realAbsA > soi) return [];
      }
    } else {
      // 解算双曲线与 SOI 边界的交点: r = a(e*coshF - 1) => coshF = (r + a) / ae
      const coshF = (soi + realAbsA) / (realAbsA * ECC);
      if (coshF >= 1) {
        // 如果与 SOI 边界相交，则在双曲线长度界限和交点之间取最小值
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

      pts[validCount].set(x, z, -y);
      validCount++;
    }

    return pts.slice(0, validCount);
  }, [SMA, ECC, INC, LAN, AOP, segments, soi]);

  // 如果点集为空（即该轨道段在作用球外），则不渲染任何元素
  if (points.length === 0) return null;

  return (
    <Line points={points} color={color} lineWidth={ORBIT_CONFIG.LINE_WIDTH} transparent={true} opacity={ORBIT_CONFIG.LINE_OPACITY} />
  );
}

// =========================================================================
// 复合组件：动态多段轨道预测管线渲染器
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

    // 动态提取这一段轨道所处的父天体 SOI
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