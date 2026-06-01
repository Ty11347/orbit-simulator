import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { OrbitPathHelper, DynamicOrbitPath } from './OrbitPathHelper';

// Configuration constants
const CONFIG = {
  PREDICTION_THROTTLE_FRAMES: 15 // Frame interval for spacecraft orbit prediction updates (performance optimization)
};

export function SolarSystemHelpers({ bodies, helperRefs, meshRefs, engine }: any) {
  return (
    <group>
      {bodies.map((body: any, i: number) => {
        // Skip orbit rendering for the central body
        if (body.parentId === -1) return null;
        
        // Find the current body's parent to obtain its SOI radius
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
                bodies={bodies} // Pass body data through to the predictor
              />
            ) : (
              <OrbitPathHelper 
                SMA={body.SMA} 
                ECC={body.ECC} 
                INC={body.INC} 
                LAN={body.LAN} 
                AOP={body.AOP} 
                color={body.color} 
                soi={activeSoi} // Pass SOI radius for mathematical clipping
              />
            )}
          </group>
        );
      })}
    </group>
  );
}

// Isolated prediction computation island component
function VehiclePredictor({ body, rustIdx, engine, meshRefs, bodies }: any) {
  const [patches, setPatches] = useState<Float64Array | null>(null);
  const frameCount = useRef(0);

  useFrame(() => {
    frameCount.current++;
    
    // Throttled orbit projection to reduce compute cost at high time-warp
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
  
  // Pass bodies to the downstream dynamic orbit renderer
  return <DynamicOrbitPath patches={patches} color={body.color} meshRefs={meshRefs} bodies={bodies} />;
}