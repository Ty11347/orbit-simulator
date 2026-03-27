import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { OrbitPathHelper, DynamicOrbitPath } from './OrbitPathHelper';

// 配置常量
const CONFIG = {
  PREDICTION_THROTTLE_FRAMES: 15 // 飞船轨道预测的更新间隔帧数，用于优化性能
};

export function SolarSystemHelpers({ bodies, helperRefs, meshRefs, engine }: any) {
  return (
    <group>
      {bodies.map((body: any, i: number) => {
        // 忽略中心天体的轨道渲染
        if (body.parentId === -1) return null;
        
        // 核心修复：找到当前天体的父天体，获取它的引力作用球大小
        const parentBody = bodies.find((b: any) => b.id === body.parentId);
        const activeSoi = parentBody && parentBody.soiRadius > 0 ? parentBody.soiRadius : Infinity;

        return (
          <group key={`helper-${body.id}`} ref={(el) => (helperRefs.current[body.id] = el)}>
            {body.type === 'VEHICLE' && engine ? (
              <VehiclePredictor 
                body={body} 
                rustIdx={i} 
                engine={engine} 
                meshRefs={meshRefs} 
                bodies={bodies} // 核心修复：将星体数据透传给预测器
              />
            ) : (
              <OrbitPathHelper 
                SMA={body.SMA} 
                ECC={body.ECC} 
                INC={body.INC} 
                LAN={body.LAN} 
                AOP={body.AOP} 
                color={body.color} 
                soi={activeSoi} // 核心修复：传入 SOI 半径进行数学裁剪
              />
            )}
          </group>
        );
      })}
    </group>
  );
}

// 独立的预测计算孤岛组件
function VehiclePredictor({ body, rustIdx, engine, meshRefs, bodies }: any) {
  const [patches, setPatches] = useState<Float64Array | null>(null);
  const frameCount = useRef(0);

  useFrame(() => {
    frameCount.current++;
    
    // 降频执行轨道推演，优化高倍数时间加速时的运算开销
    if (frameCount.current % CONFIG.PREDICTION_THROTTLE_FRAMES === 0) {
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
  
  // 核心修复：将 bodies 传递给下级动态轨道渲染器
  return <DynamicOrbitPath patches={patches} color={body.color} meshRefs={meshRefs} bodies={bodies} />;
}