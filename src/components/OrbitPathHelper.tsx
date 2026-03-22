// src/components/OrbitPathHelper.tsx
import * as THREE from 'three';
import { useMemo } from 'react';

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
    
    // 遍历 0 到 2*PI 弧度，画出完整的椭圆曲线
    for (let i = 0; i <= segments; i++) {
      const E = (i / segments) * Math.PI * 2; // 偏近点角
      
      // 1. 在轨道平面内的 2D 坐标 (与 Rust 逻辑完全一致)
      const px = SMA * (Math.cos(E) - ECC);
      const py = SMA * Math.sqrt(1 - ECC * ECC) * Math.sin(E);

      // 2. 预计算三角函数
      const cw = Math.cos(AOP);
      const sw = Math.sin(AOP);
      const co = Math.cos(LAN);
      const so = Math.sin(LAN);
      const ci = Math.cos(INC);
      const si = Math.sin(INC);

      // 3. 应用 3D 空间旋转矩阵
      const x = px * (co * cw - so * sw * ci) - py * (co * sw + so * cw * ci);
      const y = px * (so * cw + co * sw * ci) + py * (so * sw - co * cw * ci);
      const z = px * (sw * si) + py * (cw * si);

      // 4. 映射到 Three.js (Y 轴向上)，完美对齐 Rust 的输出
      points3d.push(new THREE.Vector3(x, z, -y));
    }

    return new THREE.BufferGeometry().setFromPoints(points3d);
  }, [SMA, ECC, INC, LAN, AOP, segments]);

  return (
    <lineLoop geometry={geometry}>
      <lineBasicMaterial color={color} transparent opacity={0.3} depthWrite={false} />
    </lineLoop>
  );
}