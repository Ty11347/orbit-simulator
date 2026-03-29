mod constants;

use constants::*;
use wasm_bindgen::prelude::*;

#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

// 引入 epoch 字段，彻底解决长时间运行的相位漂移和浮点精度灾难
#[derive(Clone, Copy)]
struct Body {
    mass: f64, 
    sma: f64, 
    ecc: f64, 
    inc: f64, 
    lan: f64, 
    aop: f64, 
    m0: f64,
    epoch: f64, 
    parent_index: i32, 
    soi_radius: f64, 
    is_simulated: bool, 
    is_burning: bool,     
}

#[wasm_bindgen]
pub struct PhysicsEngine {
    bodies: Vec<Body>,
    local_positions: Vec<f64>, 
    local_velocities: Vec<f64>,     
    absolute_positions: Vec<f64>, 
    absolute_velocities: Vec<f64>,
    parent_indices: Vec<i32>,
    time: f64,
}

impl PhysicsEngine {
    fn compute_analytical(&self, idx: usize, time: f64) -> (f64, f64, f64, f64, f64, f64) {
        let body = &self.bodies[idx];
        let p_idx = body.parent_index as usize;
        let parent_mass = self.bodies[p_idx].mass;
        let mu = G * parent_mass;

        let n = (mu / body.sma.abs().powi(3)).sqrt();
        // 核心修复：平近点角与 epoch 强绑定，消除绝对时间的浮点误差叠加
        let m = body.m0 + n * (time - body.epoch);
        
        let mut e_anomaly = m;
        let px; let py; let v_px; let v_py;

        if body.ecc < 1.0 {
            for _ in 0..MAX_NEWTON_ITERATIONS {
                let f_e = e_anomaly - body.ecc * e_anomaly.sin() - m;
                let f_prime_e = 1.0 - body.ecc * e_anomaly.cos();
                e_anomaly -= f_e / f_prime_e;
            }
            px = body.sma * (e_anomaly.cos() - body.ecc);
            py = body.sma * (1.0 - body.ecc * body.ecc).sqrt() * e_anomaly.sin();
            let r_inst = body.sma * (1.0 - body.ecc * e_anomaly.cos());
            let coeff = (mu * body.sma).sqrt() / r_inst;
            v_px = coeff * (-e_anomaly.sin());
            v_py = coeff * ((1.0 - body.ecc * body.ecc).sqrt() * e_anomaly.cos());
        } else {
            // 双曲线对数降维与钳制保护，防止高 warp 导致 cosh 溢出
            let mut f_anomaly = if m.abs() > HYPERBOLIC_M_THRESHOLD {
                m.signum() * (2.0 * m.abs() / body.ecc).ln()
            } else { 
                m 
            };

            for _ in 0..MAX_KEPLER_ITERATIONS {
                let sinh_f = f_anomaly.sinh();
                let cosh_f = f_anomaly.cosh();
                if cosh_f.is_infinite() || sinh_f.is_infinite() { break; }

                let f_e = body.ecc * sinh_f - f_anomaly - m;
                let f_prime_e = body.ecc * cosh_f - 1.0;
                if f_prime_e.abs() < EPSILON_MATH_DENOMINATOR { break; }
                
                let step = f_e / f_prime_e;
                f_anomaly -= step;
                if step.abs() < HYPERBOLIC_CONVERGENCE { break; }
            }
            e_anomaly = f_anomaly.clamp(-HYPERBOLIC_E_CLAMP, HYPERBOLIC_E_CLAMP);
            
            let cosh_e = e_anomaly.cosh();
            let sinh_e = e_anomaly.sinh();

            px = body.sma.abs() * (body.ecc - cosh_e);
            py = body.sma.abs() * (body.ecc * body.ecc - 1.0).sqrt() * sinh_e;
            let r_inst = body.sma.abs() * (body.ecc * cosh_e - 1.0);
            let r_safe = if r_inst < EPSILON_DISTANCE { EPSILON_DISTANCE } else { r_inst };
            
            let coeff = (mu * body.sma.abs()).sqrt() / r_safe;
            v_px = coeff * (-sinh_e);
            v_py = coeff * ((body.ecc * body.ecc - 1.0).sqrt() * cosh_e);
        }

        let cw = body.aop.cos(); let sw = body.aop.sin();
        let co = body.lan.cos(); let so = body.lan.sin();
        let ci = body.inc.cos(); let si = body.inc.sin();

        let x = px * (co * cw - so * sw * ci) - py * (co * sw + so * cw * ci);
        let y = px * (so * cw + co * sw * ci) + py * (co * cw * ci - so * sw);
        let z = px * (sw * si) + py * (cw * si);

        let vx = v_px * (co * cw - so * sw * ci) - v_py * (co * sw + so * cw * ci);
        let vy = v_px * (so * cw + co * sw * ci) + v_py * (co * cw * ci - so * sw);
        let vz = v_px * (sw * si) + v_py * (cw * si);

        (x, y, z, vx, vy, vz)
    }

    fn get_absolute_state_at(&self, idx: usize, t: f64) -> (f64, f64, f64, f64, f64, f64) {
        let mut curr_idx = idx as i32;
        let mut abs_x = 0.0; let mut abs_y = 0.0; let mut abs_z = 0.0;
        let mut abs_vx = 0.0; let mut abs_vy = 0.0; let mut abs_vz = 0.0;
        
        while curr_idx != -1 {
            let c = curr_idx as usize;
            if self.bodies[c].parent_index != -1 {
                let (x, y, z, vx, vy, vz) = self.compute_analytical(c, t);
                abs_x += x; abs_y += y; abs_z += z;
                abs_vx += vx; abs_vy += vy; abs_vz += vz;
            }
            curr_idx = self.bodies[c].parent_index;
        }
        (abs_x, abs_y, abs_z, abs_vx, abs_vy, abs_vz)
    }

    fn update_keplerian_at(&mut self, idx: usize, current_time: f64) {
        let p_idx = self.bodies[idx].parent_index as usize;
        let mu = G * self.bodies[p_idx].mass;
        
        let r_vec = [self.local_positions[idx*3], self.local_positions[idx*3+1], self.local_positions[idx*3+2]];
        let v_vec = [self.local_velocities[idx*3], self.local_velocities[idx*3+1], self.local_velocities[idx*3+2]];

        let r = (r_vec[0]*r_vec[0] + r_vec[1]*r_vec[1] + r_vec[2]*r_vec[2]).sqrt();
        let v = (v_vec[0]*v_vec[0] + v_vec[1]*v_vec[1] + v_vec[2]*v_vec[2]).sqrt();
        
        if r < EPSILON_DISTANCE || v < EPSILON_VELOCITY { return; }

        let h_vec = [r_vec[1]*v_vec[2] - r_vec[2]*v_vec[1], r_vec[2]*v_vec[0] - r_vec[0]*v_vec[2], r_vec[0]*v_vec[1] - r_vec[1]*v_vec[0]];
        let h = (h_vec[0]*h_vec[0] + h_vec[1]*h_vec[1] + h_vec[2]*h_vec[2]).sqrt();
        
        let energy = v*v/2.0 - mu/r;
        let sma = if energy.abs() < EPSILON_ENERGY { 1e9 } else { -mu / (2.0 * energy) };
        
        let v_cross_h = [v_vec[1]*h_vec[2] - v_vec[2]*h_vec[1], v_vec[2]*h_vec[0] - v_vec[0]*h_vec[2], v_vec[0]*h_vec[1] - v_vec[1]*h_vec[0]];
        let e_vec = [v_cross_h[0]/mu - r_vec[0]/r, v_cross_h[1]/mu - r_vec[1]/r, v_cross_h[2]/mu - r_vec[2]/r];
        let ecc = (e_vec[0]*e_vec[0] + e_vec[1]*e_vec[1] + e_vec[2]*e_vec[2]).sqrt();
        
        let n_vec = [-h_vec[1], h_vec[0], 0.0];
        let n = (n_vec[0]*n_vec[0] + n_vec[1]*n_vec[1]).sqrt();
        
        let inc = (h_vec[2]/h).clamp(-1.0, 1.0).acos();
        
        // 数学奇点降维处理：共面与圆轨道的退化判断
        let mut lan = 0.0;
        if n > EPSILON_NODE {
            lan = (n_vec[0]/n).clamp(-1.0, 1.0).acos();
            if n_vec[1] < 0.0 { lan = 2.0 * std::f64::consts::PI - lan; }
        }
        
        let mut aop = 0.0;
        if ecc > EPSILON_ECCENTRICITY {
            if n > EPSILON_NODE {
                let dot = n_vec[0]*e_vec[0] + n_vec[1]*e_vec[1] + n_vec[2]*e_vec[2];
                aop = (dot / (n * ecc)).clamp(-1.0, 1.0).acos();
                if e_vec[2] < 0.0 { aop = 2.0 * std::f64::consts::PI - aop; }
            } else {
                aop = (e_vec[0]/ecc).clamp(-1.0, 1.0).acos();
                if e_vec[1] < 0.0 { aop = 2.0 * std::f64::consts::PI - aop; }
            }
        }

        let mut nu = 0.0;
        let dot_r_v = r_vec[0]*v_vec[0] + r_vec[1]*v_vec[1] + r_vec[2]*v_vec[2];
        
        if ecc > EPSILON_ECCENTRICITY {
            let dot_r_e = r_vec[0]*e_vec[0] + r_vec[1]*e_vec[1] + r_vec[2]*e_vec[2];
            nu = (dot_r_e / (r * ecc)).clamp(-1.0, 1.0).acos();
            if dot_r_v < 0.0 { nu = 2.0 * std::f64::consts::PI - nu; }
        } else {
            if n > EPSILON_NODE {
                let dot_n_r = n_vec[0]*r_vec[0] + n_vec[1]*r_vec[1] + n_vec[2]*r_vec[2];
                nu = (dot_n_r / (n * r)).clamp(-1.0, 1.0).acos();
                if r_vec[2] < 0.0 { nu = 2.0 * std::f64::consts::PI - nu; }
            } else {
                nu = r_vec[1].atan2(r_vec[0]);
                if nu < 0.0 { nu += 2.0 * std::f64::consts::PI; }
            }
        }

        let m0;
        if ecc < 1.0 {
            let ea_cos = (ecc + nu.cos()) / (1.0 + ecc * nu.cos());
            let mut ea = ea_cos.clamp(-1.0, 1.0).acos();
            if nu > std::f64::consts::PI { ea = 2.0 * std::f64::consts::PI - ea; }
            m0 = ea - ecc * ea.sin();
        } else {
            let cosh_f = (ecc + nu.cos()) / (1.0 + ecc * nu.cos());
            let mut f = if cosh_f >= 1.0 { (cosh_f + (cosh_f * cosh_f - 1.0).sqrt()).ln() } else { 0.0 };
            if dot_r_v < 0.0 { f = -f; }
            m0 = ecc * f.sinh() - f;
        }

        let body = &mut self.bodies[idx];
        body.sma = sma; body.ecc = ecc; body.inc = inc; body.lan = lan; body.aop = aop;
        
        // 核心修复：独立记录 m0 并强行锚定 epoch，从根本上阻断误差传递链
        body.m0 = m0;
        body.epoch = current_time; 
    }

    fn update_keplerian(&mut self, idx: usize) {
        self.update_keplerian_at(idx, self.time);
    }

    fn handle_soi_transitions(&mut self, dt: f64) {
        let count = self.bodies.len();

        for idx in 0..count {
            if !self.bodies[idx].is_simulated { continue; }

            let current_parent = self.bodies[idx].parent_index as usize;
            let mut switched = false;
            let mut new_parent_i32 = current_parent as i32;
            let mut is_entry = false;
            let mut target_soi_radius = 0.0;
            let mut target_parent = 0;

            for target_idx in 0..count {
                if self.bodies[target_idx].parent_index == (current_parent as i32) && self.bodies[target_idx].soi_radius > 0.0 {
                    let dx = self.absolute_positions[idx * 3] - self.absolute_positions[target_idx * 3];
                    let dy = self.absolute_positions[idx * 3 + 1] - self.absolute_positions[target_idx * 3 + 1];
                    let dz = self.absolute_positions[idx * 3 + 2] - self.absolute_positions[target_idx * 3 + 2];
                    if (dx*dx + dy*dy + dz*dz).sqrt() < self.bodies[target_idx].soi_radius {
                        new_parent_i32 = target_idx as i32;
                        is_entry = true;
                        target_soi_radius = self.bodies[target_idx].soi_radius;
                        target_parent = target_idx;
                        switched = true; 
                        break;
                    }
                }
            }

            if !switched {
                let dist_to_parent = (self.local_positions[idx * 3].powi(2) + self.local_positions[idx * 3 + 1].powi(2) + self.local_positions[idx * 3 + 2].powi(2)).sqrt();
                if dist_to_parent > self.bodies[current_parent].soi_radius && self.bodies[current_parent].parent_index != -1 {
                    new_parent_i32 = self.bodies[current_parent].parent_index;
                    is_entry = false;
                    target_soi_radius = self.bodies[current_parent].soi_radius;
                    target_parent = current_parent;
                    switched = true;
                }
            }

            if switched {
                if self.bodies[idx].is_burning {
                    self.bodies[idx].parent_index = new_parent_i32;
                    let p_usize = new_parent_i32 as usize;
                    
                    let p_px = if new_parent_i32 == -1 { 0.0 } else { self.absolute_positions[p_usize * 3] };
                    let p_py = if new_parent_i32 == -1 { 0.0 } else { self.absolute_positions[p_usize * 3 + 1] };
                    let p_pz = if new_parent_i32 == -1 { 0.0 } else { self.absolute_positions[p_usize * 3 + 2] };
                    let p_vx = if new_parent_i32 == -1 { 0.0 } else { self.absolute_velocities[p_usize * 3] };
                    let p_vy = if new_parent_i32 == -1 { 0.0 } else { self.absolute_velocities[p_usize * 3 + 1] };
                    let p_vz = if new_parent_i32 == -1 { 0.0 } else { self.absolute_velocities[p_usize * 3 + 2] };

                    self.local_positions[idx * 3] = self.absolute_positions[idx * 3] - p_px;
                    self.local_positions[idx * 3 + 1] = self.absolute_positions[idx * 3 + 1] - p_py;
                    self.local_positions[idx * 3 + 2] = self.absolute_positions[idx * 3 + 2] - p_pz;
                    self.local_velocities[idx * 3] = self.absolute_velocities[idx * 3] - p_vx;
                    self.local_velocities[idx * 3 + 1] = self.absolute_velocities[idx * 3 + 1] - p_vy;
                    self.local_velocities[idx * 3 + 2] = self.absolute_velocities[idx * 3 + 2] - p_vz;
                    
                    self.update_keplerian_at(idx, self.time);
                } else {
                    let mut t_low = self.time - dt;
                    let mut t_high = self.time;
                    
                    for _ in 0..20 {
                        let t_mid = (t_low + t_high) / 2.0;
                        let s_body = self.get_absolute_state_at(idx, t_mid);
                        let s_target = self.get_absolute_state_at(target_parent, t_mid);
                        
                        let dx = s_body.0 - s_target.0;
                        let dy = s_body.1 - s_target.1;
                        let dz = s_body.2 - s_target.2;
                        let dist = (dx*dx + dy*dy + dz*dz).sqrt();
                        
                        if is_entry {
                            if dist < target_soi_radius { t_high = t_mid; } else { t_low = t_mid; }
                        } else {
                            if dist > target_soi_radius { t_high = t_mid; } else { t_low = t_mid; }
                        }
                    }
                    let t_cross = t_high;

                    let s_body = self.get_absolute_state_at(idx, t_cross);
                    let s_new_parent = if new_parent_i32 == -1 {
                        (0.0, 0.0, 0.0, 0.0, 0.0, 0.0)
                    } else {
                        self.get_absolute_state_at(new_parent_i32 as usize, t_cross)
                    };

                    self.local_positions[idx*3] = s_body.0 - s_new_parent.0;
                    self.local_positions[idx*3+1] = s_body.1 - s_new_parent.1;
                    self.local_positions[idx*3+2] = s_body.2 - s_new_parent.2;
                    self.local_velocities[idx*3] = s_body.3 - s_new_parent.3;
                    self.local_velocities[idx*3+1] = s_body.4 - s_new_parent.4;
                    self.local_velocities[idx*3+2] = s_body.5 - s_new_parent.5;

                    self.bodies[idx].parent_index = new_parent_i32;
                    
                    self.update_keplerian_at(idx, t_cross);

                    let (nx, ny, nz, nvx, nvy, nvz) = self.compute_analytical(idx, self.time);
                    self.local_positions[idx*3] = nx;
                    self.local_positions[idx*3+1] = ny;
                    self.local_positions[idx*3+2] = nz;
                    self.local_velocities[idx*3] = nvx;
                    self.local_velocities[idx*3+1] = nvy;
                    self.local_velocities[idx*3+2] = nvz;

                    let s_new_parent_now = if new_parent_i32 == -1 {
                        (0.0, 0.0, 0.0, 0.0, 0.0, 0.0)
                    } else {
                        let np = new_parent_i32 as usize;
                        (
                            self.absolute_positions[np*3], self.absolute_positions[np*3+1], self.absolute_positions[np*3+2],
                            self.absolute_velocities[np*3], self.absolute_velocities[np*3+1], self.absolute_velocities[np*3+2]
                        )
                    };
                    self.absolute_positions[idx*3] = s_new_parent_now.0 + nx;
                    self.absolute_positions[idx*3+1] = s_new_parent_now.1 + ny;
                    self.absolute_positions[idx*3+2] = s_new_parent_now.2 + nz;
                    self.absolute_velocities[idx*3] = s_new_parent_now.3 + nvx;
                    self.absolute_velocities[idx*3+1] = s_new_parent_now.4 + nvy;
                    self.absolute_velocities[idx*3+2] = s_new_parent_now.5 + nvz;
                }
            }
        }
    }
}

#[wasm_bindgen]
impl PhysicsEngine {
    #[wasm_bindgen(constructor)]
    pub fn new() -> PhysicsEngine {
        PhysicsEngine { bodies: Vec::new(), local_positions: Vec::new(), local_velocities: Vec::new(), absolute_positions: Vec::new(), absolute_velocities: Vec::new(), parent_indices: Vec::new(), time: 0.0 }
    }

    pub fn add_body(&mut self, mass: f64, sma: f64, ecc: f64, inc: f64, lan: f64, aop: f64, m0: f64, parent_index: i32, soi_radius: f64, is_simulated: bool) -> i32 {
        // M0 直接赋值，epoch 设定为 0.0（与 JS 端时间一致），杜绝初始数据的偏移
        let body = Body { mass, sma, ecc, inc, lan, aop, m0, epoch: 0.0, parent_index, soi_radius, is_simulated, is_burning: false };
        self.bodies.push(body);
        self.parent_indices.push(parent_index);
        self.local_positions.extend_from_slice(&[0.0, 0.0, 0.0]); self.local_velocities.extend_from_slice(&[0.0, 0.0, 0.0]);
        self.absolute_positions.extend_from_slice(&[0.0, 0.0, 0.0]); self.absolute_velocities.extend_from_slice(&[0.0, 0.0, 0.0]);
        (self.bodies.len() - 1) as i32
    }

    pub fn clear(&mut self) { self.bodies.clear(); self.parent_indices.clear(); self.local_positions.clear(); self.local_velocities.clear(); self.absolute_positions.clear(); self.absolute_velocities.clear(); }

    #[wasm_bindgen]
    pub fn set_burning(&mut self, idx: usize, burning: bool) {
        if self.bodies[idx].is_burning && !burning {
            self.update_keplerian(idx);
        }
        self.bodies[idx].is_burning = burning;
    }

    #[wasm_bindgen]
    pub fn predict_patches(&mut self, target_idx: usize) -> Vec<f64> {
        if self.bodies[target_idx].is_burning {
            self.update_keplerian(target_idx); 
        }
        let mut sim = PhysicsEngine { bodies: self.bodies.clone(), local_positions: self.local_positions.clone(), local_velocities: self.local_velocities.clone(), absolute_positions: self.absolute_positions.clone(), absolute_velocities: self.absolute_velocities.clone(), parent_indices: self.parent_indices.clone(), time: self.time };
        sim.bodies[target_idx].is_burning = false;
        
        let mut patches = Vec::new();
        let b = &sim.bodies[target_idx];
        patches.extend_from_slice(&[b.parent_index as f64, b.sma, b.ecc, b.inc, b.lan, b.aop]);
        let mut current_parent = b.parent_index;
        
        for _ in 0..MAX_PREDICT_STEPS {
            let c_parent = sim.bodies[target_idx].parent_index as usize;
            let mut safe_dt = MAX_SAFE_DT;
            let s_px = sim.absolute_positions[target_idx*3]; let s_py = sim.absolute_positions[target_idx*3+1]; let s_pz = sim.absolute_positions[target_idx*3+2];
            let s_vx = sim.absolute_velocities[target_idx*3]; let s_vy = sim.absolute_velocities[target_idx*3+1]; let s_vz = sim.absolute_velocities[target_idx*3+2];

            for i in 0..sim.bodies.len() {
                if sim.bodies[i].parent_index == c_parent as i32 && sim.bodies[i].soi_radius > 0.0 {
                    let dx = s_px - sim.absolute_positions[i*3]; let dy = s_py - sim.absolute_positions[i*3+1]; let dz = s_pz - sim.absolute_positions[i*3+2];
                    let dist = (dx*dx + dy*dy + dz*dz).sqrt();
                    let soi = sim.bodies[i].soi_radius;
                    if dist > soi {
                        let dvx = s_vx - sim.absolute_velocities[i*3]; let dvy = s_vy - sim.absolute_velocities[i*3+1]; let dvz = s_vz - sim.absolute_velocities[i*3+2];
                        let rel_v = (dvx*dvx + dvy*dvy + dvz*dvz).sqrt().max(MIN_REL_VELOCITY);
                        let t = (dist - soi) / rel_v;
                        if t < safe_dt { safe_dt = t; }
                    }
                }
            }
            
            let parent_soi = sim.bodies[c_parent].soi_radius;
            if parent_soi > 0.0 {
                let dist_to_parent = (sim.local_positions[target_idx*3].powi(2) + sim.local_positions[target_idx*3+1].powi(2) + sim.local_positions[target_idx*3+2].powi(2)).sqrt();
                if dist_to_parent < parent_soi {
                    let v_local = (sim.local_velocities[target_idx*3].powi(2) + sim.local_velocities[target_idx*3+1].powi(2) + sim.local_velocities[target_idx*3+2].powi(2)).sqrt().max(MIN_REL_VELOCITY);
                    let t = (parent_soi - dist_to_parent) / v_local;
                    if t < safe_dt { safe_dt = t; }
                }
            }

            let mu = G * sim.bodies[c_parent].mass;
            let sma = sim.bodies[target_idx].sma.abs();
            let period = if sma > 0.0 { 2.0 * std::f64::consts::PI * (sma.powi(3) / mu).sqrt() } else { MAX_SAFE_DT };
            let orbit_dt = period / ORBIT_DT_DIVISOR; 
            let dt = if safe_dt < orbit_dt { safe_dt + SAFE_DT_PADDING } else { orbit_dt }.clamp(MIN_DT_CLAMP, MAX_SAFE_DT);
            
            sim.time += dt;
            let (x, y, z, vx, vy, vz) = sim.compute_analytical(target_idx, sim.time);
            sim.local_positions[target_idx * 3] = x; sim.local_positions[target_idx * 3 + 1] = y; sim.local_positions[target_idx * 3 + 2] = z;
            sim.local_velocities[target_idx * 3] = vx; sim.local_velocities[target_idx * 3 + 1] = vy; sim.local_velocities[target_idx * 3 + 2] = vz;
            
            for idx in 0..sim.bodies.len() {
                let p_idx = sim.bodies[idx].parent_index;
                if p_idx == -1 {
                    sim.absolute_positions[idx * 3] = 0.0; sim.absolute_positions[idx * 3 + 1] = 0.0; sim.absolute_positions[idx * 3 + 2] = 0.0;
                    sim.absolute_velocities[idx * 3] = 0.0; sim.absolute_velocities[idx * 3 + 1] = 0.0; sim.absolute_velocities[idx * 3 + 2] = 0.0;
                } else {
                    let p = p_idx as usize;
                    sim.absolute_positions[idx * 3] = sim.absolute_positions[p * 3] + sim.local_positions[idx * 3];
                    sim.absolute_positions[idx * 3 + 1] = sim.absolute_positions[p * 3 + 1] + sim.local_positions[idx * 3 + 1];
                    sim.absolute_positions[idx * 3 + 2] = sim.absolute_positions[p * 3 + 2] + sim.local_positions[idx * 3 + 2];
                    sim.absolute_velocities[idx * 3] = sim.absolute_velocities[p * 3] + sim.local_velocities[idx * 3];
                    sim.absolute_velocities[idx * 3 + 1] = self.absolute_velocities[p * 3 + 1] + self.local_velocities[idx * 3 + 1];
                    sim.absolute_velocities[idx * 3 + 2] = self.absolute_velocities[p * 3 + 2] + self.local_velocities[idx * 3 + 2];
                }
            }

            sim.handle_soi_transitions(dt);
            
            let new_parent = sim.bodies[target_idx].parent_index;
            if new_parent != current_parent {
                let nb = &sim.bodies[target_idx];
                patches.extend_from_slice(&[nb.parent_index as f64, nb.sma, nb.ecc, nb.inc, nb.lan, nb.aop]);
                current_parent = new_parent;
                if patches.len() > MAX_PATCHES { break; } 
            }
        }
        patches
    }

    pub fn update(&mut self, delta_time: f64) {
        let substeps = PHYSICS_SUBSTEPS; 
        let dt = delta_time / (substeps as f64);

        for _ in 0..substeps {
            self.time += dt;
            let count = self.bodies.len();

            for idx in 0..count {
                let body = self.bodies[idx];
                if body.sma == 0.0 || body.parent_index == -1 { continue; }
                
                if !body.is_simulated || !body.is_burning {
                    let (x, y, z, vx, vy, vz) = self.compute_analytical(idx, self.time);
                    self.local_positions[idx * 3] = x; self.local_positions[idx * 3 + 1] = y; self.local_positions[idx * 3 + 2] = z;
                    self.local_velocities[idx * 3] = vx; self.local_velocities[idx * 3 + 1] = vy; self.local_velocities[idx * 3 + 2] = vz;
                } else {
                    let p_idx = body.parent_index as usize;
                    let mass = self.bodies[p_idx].mass;
                    
                    let cur_pos = (self.local_positions[idx*3], self.local_positions[idx*3+1], self.local_positions[idx*3+2]);
                    let r_sq = cur_pos.0*cur_pos.0 + cur_pos.1*cur_pos.1 + cur_pos.2*cur_pos.2;
                    let r = r_sq.sqrt();
                    let f1 = if r < EPSILON_GRAVITY_DISTANCE { 0.0 } else { -G * mass / (r_sq * r) };
                    let a1 = (f1 * cur_pos.0, f1 * cur_pos.1, f1 * cur_pos.2);

                    let next_pos = (
                        cur_pos.0 + self.local_velocities[idx*3] * dt + 0.5 * a1.0 * dt * dt,
                        cur_pos.1 + self.local_velocities[idx*3+1] * dt + 0.5 * a1.1 * dt * dt,
                        cur_pos.2 + self.local_velocities[idx*3+2] * dt + 0.5 * a1.2 * dt * dt,
                    );

                    let next_r_sq = next_pos.0*next_pos.0 + next_pos.1*next_pos.1 + next_pos.2*next_pos.2;
                    let next_r = next_r_sq.sqrt();
                    let f2 = if next_r < EPSILON_GRAVITY_DISTANCE { 0.0 } else { -G * mass / (next_r_sq * next_r) };
                    let a2 = (f2 * next_pos.0, f2 * next_pos.1, f2 * next_pos.2);

                    self.local_velocities[idx * 3] += 0.5 * (a1.0 + a2.0) * dt;
                    self.local_velocities[idx * 3 + 1] += 0.5 * (a1.1 + a2.1) * dt;
                    self.local_velocities[idx * 3 + 2] += 0.5 * (a1.2 + a2.2) * dt;
                    
                    self.local_positions[idx * 3] = next_pos.0;
                    self.local_positions[idx * 3 + 1] = next_pos.1;
                    self.local_positions[idx * 3 + 2] = next_pos.2;
                }
            }

            for idx in 0..count {
                let p_idx = self.bodies[idx].parent_index;
                if p_idx == -1 {
                    self.absolute_positions[idx * 3] = 0.0; self.absolute_positions[idx * 3 + 1] = 0.0; self.absolute_positions[idx * 3 + 2] = 0.0;
                    self.absolute_velocities[idx * 3] = 0.0; self.absolute_velocities[idx * 3 + 1] = 0.0; self.absolute_velocities[idx * 3 + 2] = 0.0;
                } else {
                    let p = p_idx as usize;
                    self.absolute_positions[idx * 3] = self.absolute_positions[p * 3] + self.local_positions[idx * 3];
                    self.absolute_positions[idx * 3 + 1] = self.absolute_positions[p * 3 + 1] + self.local_positions[idx * 3 + 1];
                    self.absolute_positions[idx * 3 + 2] = self.absolute_positions[p * 3 + 2] + self.local_positions[idx * 3 + 2];
                    self.absolute_velocities[idx * 3] = self.absolute_velocities[p * 3] + self.local_velocities[idx * 3];
                    self.absolute_velocities[idx * 3 + 1] = self.absolute_velocities[p * 3 + 1] + self.local_velocities[idx * 3 + 1];
                    self.absolute_velocities[idx * 3 + 2] = self.absolute_velocities[p * 3 + 2] + self.local_velocities[idx * 3 + 2];
                }
            }

            self.handle_soi_transitions(dt);
            
            for idx in 0..count {
                self.parent_indices[idx] = self.bodies[idx].parent_index;
            }
        }
    }

    pub fn get_positions_ptr(&self) -> *const f64 { self.absolute_positions.as_ptr() }
    pub fn get_velocities_ptr(&self) -> *const f64 { self.absolute_velocities.as_ptr() }
    pub fn get_local_velocities_ptr(&self) -> *const f64 { self.local_velocities.as_ptr() }
    pub fn get_parents_ptr(&self) -> *const i32 { self.parent_indices.as_ptr() }
    pub fn get_bodies_count(&self) -> usize { self.bodies.len() }
}