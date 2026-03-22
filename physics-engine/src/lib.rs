// physics-engine/src/lib.rs
use wasm_bindgen::prelude::*;

#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

const G: f64 = 1.0; // 模拟环境下的引力常数

#[allow(non_snake_case)]
#[derive(Clone, Copy)]
struct Body {
    MASS: f64,
    SMA: f64,
    ECC: f64,
    INC: f64,
    LAN: f64,
    AOP: f64,
    M0: f64,
    PARENT_INDEX: i32,
}

#[wasm_bindgen]
pub struct PhysicsEngine {
    bodies: Vec<Body>,
    local_positions: Vec<f64>,
    absolute_positions: Vec<f64>,
    time: f64,
}

#[wasm_bindgen]
#[allow(non_snake_case)] // 允许接口参数使用大写缩写
impl PhysicsEngine {
    #[wasm_bindgen(constructor)]
    pub fn new() -> PhysicsEngine {
        PhysicsEngine {
            bodies: Vec::new(),
            local_positions: Vec::new(),
            absolute_positions: Vec::new(),
            time: 0.0,
        }
    }

    pub fn add_body(
        &mut self, 
        MASS: f64, 
        SMA: f64, 
        ECC: f64, 
        INC: f64, 
        LAN: f64, 
        AOP: f64, 
        M0: f64, 
        PARENT_INDEX: i32
    ) -> i32 {
        let body = Body { MASS, SMA, ECC, INC, LAN, AOP, M0, PARENT_INDEX };
        self.bodies.push(body);
        
        self.local_positions.extend_from_slice(&[0.0, 0.0, 0.0]);
        self.absolute_positions.extend_from_slice(&[0.0, 0.0, 0.0]);
        
        (self.bodies.len() - 1) as i32
    }

    pub fn clear(&mut self) {
        self.bodies.clear();
        self.local_positions.clear();
        self.absolute_positions.clear();
    }

    pub fn update(&mut self, delta_time: f64) {
        self.time += delta_time;
        let count = self.bodies.len();

        for idx in 0..count {
            let body = &self.bodies[idx];
            
            if body.SMA == 0.0 || body.PARENT_INDEX == -1 {
                self.local_positions[idx * 3] = 0.0;
                self.local_positions[idx * 3 + 1] = 0.0;
                self.local_positions[idx * 3 + 2] = 0.0;
                continue;
            }

            let parent_mass = self.bodies[body.PARENT_INDEX as usize].MASS;
            let mu = G * parent_mass;

            // n = sqrt(mu / a^3)
            let n = (mu / body.SMA.powi(3)).sqrt();

            // M = M0 + n * t
            let m = body.M0 + n * self.time;
            
            // 牛顿迭代求解 E
            let mut e_anomaly = m;
            for _ in 0..10 {
                let f_e = e_anomaly - body.ECC * e_anomaly.sin() - m;
                let f_prime_e = 1.0 - body.ECC * e_anomaly.cos();
                let delta_e = f_e / f_prime_e;
                e_anomaly -= delta_e;
                if delta_e.abs() < 1e-6 { break; }
            }

            // 1. 轨道平面内坐标
            let px = body.SMA * (e_anomaly.cos() - body.ECC);
            let py = body.SMA * (1.0 - body.ECC * body.ECC).sqrt() * e_anomaly.sin();

            // 2. 3D 空间旋转 (应用 AOP, LAN, INC)
            let cw = body.AOP.cos();
            let sw = body.AOP.sin();
            let co = body.LAN.cos();
            let so = body.LAN.sin();
            let ci = body.INC.cos();
            let si = body.INC.sin();

            let x = px * (co * cw - so * sw * ci) - py * (co * sw + so * cw * ci);
            let y = px * (so * cw + co * sw * ci) + py * (so * sw - co * cw * ci);
            let z = px * (sw * si) + py * (cw * si);

            // 3. 映射到 Three.js (Y 轴向上)
            self.local_positions[idx * 3] = x;
            self.local_positions[idx * 3 + 1] = z;  // 物理 Z 映射为视觉 Y (高度)
            self.local_positions[idx * 3 + 2] = -y; // 物理 Y 映射为视觉 -Z (深度)
        }

        // 绝对坐标叠加
        for idx in 0..count {
            let p_idx = self.bodies[idx].PARENT_INDEX;
            if p_idx == -1 {
                self.absolute_positions[idx * 3] = self.local_positions[idx * 3];
                self.absolute_positions[idx * 3 + 1] = self.local_positions[idx * 3 + 1];
                self.absolute_positions[idx * 3 + 2] = self.local_positions[idx * 3 + 2];
            } else {
                let p = p_idx as usize;
                self.absolute_positions[idx * 3] = self.absolute_positions[p * 3] + self.local_positions[idx * 3];
                self.absolute_positions[idx * 3 + 1] = self.absolute_positions[p * 3 + 1] + self.local_positions[idx * 3 + 1];
                self.absolute_positions[idx * 3 + 2] = self.absolute_positions[p * 3 + 2] + self.local_positions[idx * 3 + 2];
            }
        }
    }

    pub fn get_positions_ptr(&self) -> *const f64 { self.absolute_positions.as_ptr() }
    pub fn get_bodies_count(&self) -> usize { self.bodies.len() }
}