mod constants;

use constants::*;
use wasm_bindgen::prelude::*;

#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

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
    p: f64, 
}

#[derive(Clone, Copy)]
struct SOIEvent {
    time: f64,
    body_idx: usize,
    new_parent: i32,
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
        let mu = G * self.bodies[p_idx].mass;

        let mut e_safe = body.ecc;
        let is_parabola = (e_safe - 1.0).abs() < 1e-7;
        if is_parabola { e_safe = 1.0; }

        let n = if is_parabola {
            2.0 * (mu / (2.0 * body.p.powi(3))).sqrt()
        } else {
            (mu / body.sma.abs().powi(3)).sqrt()
        };

        let mut m = body.m0 + n * (time - body.epoch);

        if e_safe < 1.0 {
            m = m % (2.0 * std::f64::consts::PI);
            if m < 0.0 { m += 2.0 * std::f64::consts::PI; }
        }
        
        let px; let py; let v_px; let v_py;

        if is_parabola {
            let a_b = 1.5 * m;
            let b_b = (a_b + (a_b * a_b + 1.0).sqrt()).cbrt();
            let d = b_b - 1.0 / b_b;
            let nu = 2.0 * d.atan();
            let r_inst = body.p / (1.0 + nu.cos());
            
            px = r_inst * nu.cos();
            py = r_inst * nu.sin();
            let coeff = (mu / body.p).sqrt();
            v_px = coeff * (-nu.sin());
            v_py = coeff * (e_safe + nu.cos());
        } else if e_safe < 1.0 {
            let mut e_anomaly = m;
            let mut converged = false;
            for _ in 0..MAX_NEWTON_ITERATIONS {
                let f_e = e_anomaly - e_safe * e_anomaly.sin() - m;
                let f_prime_e = 1.0 - e_safe * e_anomaly.cos();
                
                if f_prime_e.abs() < 1e-10 { break; } 
                
                let step = f_e / f_prime_e;
                e_anomaly -= step;
                if step.abs() < 1e-8 { converged = true; break; }
            }
            if !converged {
                let mut low = m - e_safe;
                let mut high = m + e_safe;
                for _ in 0..30 {
                    e_anomaly = (low + high) / 2.0;
                    let f_e = e_anomaly - e_safe * e_anomaly.sin() - m;
                    if f_e > 0.0 { high = e_anomaly; } else { low = e_anomaly; }
                }
            }
            px = body.sma * (e_anomaly.cos() - e_safe);
            py = body.sma * (1.0 - e_safe * e_safe).sqrt() * e_anomaly.sin();
            let r_inst = body.sma * (1.0 - e_safe * e_anomaly.cos());
            let coeff = (mu * body.sma).sqrt() / r_inst;
            v_px = coeff * (-e_anomaly.sin());
            v_py = coeff * ((1.0 - e_safe * e_safe).sqrt() * e_anomaly.cos());
        } else {
            let mut f_anomaly = (m / e_safe).asinh();

            let mut converged = false;
            for _ in 0..MAX_KEPLER_ITERATIONS {
                let sinh_f = f_anomaly.sinh();
                let cosh_f = f_anomaly.cosh();
                if cosh_f.is_infinite() || sinh_f.is_infinite() { break; }

                let f_e = e_safe * sinh_f - f_anomaly - m;
                let f_prime_e = e_safe * cosh_f - 1.0;
                
                if f_prime_e.abs() < 1e-10 { break; }
                
                let step = f_e / f_prime_e;
                f_anomaly -= step;
                if step.abs() < HYPERBOLIC_CONVERGENCE { converged = true; break; }
            }
            
            if !converged {
                let mut low = -HYPERBOLIC_E_CLAMP;
                let mut high = HYPERBOLIC_E_CLAMP;
                for _ in 0..40 {
                    f_anomaly = (low + high) / 2.0;
                    let f_e = e_safe * f_anomaly.sinh() - f_anomaly - m;
                    if f_e > 0.0 { high = f_anomaly; } else { low = f_anomaly; }
                }
            }
            f_anomaly = f_anomaly.clamp(-HYPERBOLIC_E_CLAMP, HYPERBOLIC_E_CLAMP);
            
            let cosh_e = f_anomaly.cosh();
            let sinh_e = f_anomaly.sinh();

            px = body.sma.abs() * (e_safe - cosh_e);
            py = body.sma.abs() * (e_safe * e_safe - 1.0).sqrt() * sinh_e;
            let r_inst = body.sma.abs() * (e_safe * cosh_e - 1.0);
            let r_safe = if r_inst < EPSILON_DISTANCE { EPSILON_DISTANCE } else { r_inst };
            
            let coeff = (mu * body.sma.abs()).sqrt() / r_safe;
            v_px = coeff * (-sinh_e);
            v_py = coeff * ((e_safe * e_safe - 1.0).sqrt() * cosh_e);
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

    fn get_distance_between(&self, idx1: usize, idx2: usize, t: f64) -> f64 {
        let (x1, y1, z1, _, _, _) = self.compute_analytical(idx1, t);
        let (x2, y2, z2, _, _, _) = self.compute_analytical(idx2, t);
        let dx = x1 - x2; let dy = y1 - y2; let dz = z1 - z2;
        (dx*dx + dy*dy + dz*dz).sqrt()
    }

    fn get_rel_velocity_dot(&self, idx1: usize, idx2: usize, t: f64) -> f64 {
        let (x1, y1, z1, vx1, vy1, vz1) = self.compute_analytical(idx1, t);
        let (x2, y2, z2, vx2, vy2, vz2) = self.compute_analytical(idx2, t);
        let dx = x1 - x2; let dy = y1 - y2; let dz = z1 - z2;
        let dvx = vx1 - vx2; let dvy = vy1 - vy2; let dvz = vz1 - vz2; // 修复了这里拼写错误
        dx*dvx + dy*dvy + dz*dvz
    }

    fn brents_method<F>(&self, mut f: F, mut a: f64, mut b: f64) -> Option<f64>
    where F: FnMut(f64) -> f64 {
        let tol = 1e-8;
        let mut fa = f(a);
        let mut fb = f(b);
        
        if (fa > 0.0 && fb > 0.0) || (fa < 0.0 && fb < 0.0) { return None; } 
        if fa.abs() < fb.abs() { std::mem::swap(&mut a, &mut b); std::mem::swap(&mut fa, &mut fb); }
        
        let mut c = a;
        let mut fc = fa;
        let mut mflag = true;
        let mut d = 0.0;

        for _ in 0..50 {
            if fb.abs() < 1e-12 || (b - a).abs() < tol { break; }
            let mut s;
            if fa != fc && fb != fc { 
                s = a * fb * fc / ((fa - fb) * (fa - fc))
                  + b * fa * fc / ((fb - fa) * (fb - fc))
                  + c * fa * fb / ((fc - fa) * (fc - fb));
            } else { 
                s = b - fb * (b - a) / (fb - fa);
            }

            let cond1 = (s < (3.0 * a + b) / 4.0 && s > b) || (s > (3.0 * a + b) / 4.0 && s < b);
            let cond2 = mflag && (s - b).abs() >= (b - c).abs() / 2.0;
            let cond3 = !mflag && (s - b).abs() >= (c - d).abs() / 2.0;
            let cond4 = mflag && (b - c).abs() < tol;
            let cond5 = !mflag && (c - d).abs() < tol;

            if cond1 || cond2 || cond3 || cond4 || cond5 {
                s = (a + b) / 2.0; 
                mflag = true;
            } else {
                mflag = false;
            }

            let fs = f(s);
            d = c; c = b; fc = fb;

            if fa * fs < 0.0 { b = s; fb = fs; } else { a = s; fa = fs; }
            if fa.abs() < fb.abs() { std::mem::swap(&mut a, &mut b); std::mem::swap(&mut fa, &mut fb); }
        }
        Some(b)
    }

    fn find_tca(&self, idx1: usize, idx2: usize, a: f64, b: f64) -> f64 {
        let invphi = (5.0_f64.sqrt() - 1.0) / 2.0;
        let invphi2 = (3.0 - 5.0_f64.sqrt()) / 2.0;
        let tol = 1e-3; 

        let mut a_n = a;
        let mut b_n = b;
        let mut h = b_n - a_n;
        let mut c = a_n + invphi2 * h;
        let mut d = a_n + invphi * h;
        let mut fc = self.get_distance_between(idx1, idx2, c);
        let mut fd = self.get_distance_between(idx1, idx2, d);

        for _ in 0..30 {
            if h < tol { break; }
            if fc < fd {
                b_n = d; d = c; fd = fc;
                h = b_n - a_n;
                c = a_n + invphi2 * h;
                fc = self.get_distance_between(idx1, idx2, c);
            } else {
                a_n = c; c = d; fc = fd;
                h = b_n - a_n;
                d = a_n + invphi * h;
                fd = self.get_distance_between(idx1, idx2, d);
            }
        }
        (a_n + b_n) / 2.0
    }

    fn compute_all_absolute_states_at(&self, t: f64) -> (Vec<f64>, Vec<f64>) {
        let count = self.bodies.len();
        let mut abs_pos = vec![0.0; count * 3];
        let mut abs_vel = vec![0.0; count * 3];

        for i in 0..count {
            if self.bodies[i].is_burning {
                let p = self.bodies[i].parent_index as usize;
                abs_pos[i*3] = abs_pos[p*3] + self.local_positions[i*3];
                abs_pos[i*3+1] = abs_pos[p*3+1] + self.local_positions[i*3+1];
                abs_pos[i*3+2] = abs_pos[p*3+2] + self.local_positions[i*3+2];
                abs_vel[i*3] = abs_vel[p*3] + self.local_velocities[i*3];
                abs_vel[i*3+1] = abs_vel[p*3+1] + self.local_velocities[i*3+1];
                abs_vel[i*3+2] = abs_vel[p*3+2] + self.local_velocities[i*3+2];
                continue;
            }

            let p_idx = self.bodies[i].parent_index;
            if p_idx == -1 || self.bodies[i].sma == 0.0 {
                abs_pos[i*3] = 0.0; abs_pos[i*3+1] = 0.0; abs_pos[i*3+2] = 0.0;
                abs_vel[i*3] = 0.0; abs_vel[i*3+1] = 0.0; abs_vel[i*3+2] = 0.0;
            } else {
                let (lx, ly, lz, lvx, lvy, lvz) = self.compute_analytical(i, t);
                let p = p_idx as usize;
                abs_pos[i*3] = abs_pos[p*3] + lx;
                abs_pos[i*3+1] = abs_pos[p*3+1] + ly;
                abs_pos[i*3+2] = abs_pos[p*3+2] + lz;
                abs_vel[i*3] = abs_vel[p*3] + lvx;
                abs_vel[i*3+1] = abs_vel[p*3+1] + lvy;
                abs_vel[i*3+2] = abs_vel[p*3+2] + lvz;
            }
        }
        (abs_pos, abs_vel)
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
        let p = h * h / mu; 

        let v_cross_h = [v_vec[1]*h_vec[2] - v_vec[2]*h_vec[1], v_vec[2]*h_vec[0] - v_vec[0]*h_vec[2], v_vec[0]*h_vec[1] - v_vec[1]*h_vec[0]];
        let e_vec = [v_cross_h[0]/mu - r_vec[0]/r, v_cross_h[1]/mu - r_vec[1]/r, v_cross_h[2]/mu - r_vec[2]/r];
        let ecc = (e_vec[0]*e_vec[0] + e_vec[1]*e_vec[1] + e_vec[2]*e_vec[2]).sqrt();
        
        let sma = if (ecc - 1.0).abs() < 1e-7 { p } 
                  else if ecc < 1.0 { p / (1.0 - ecc*ecc) } 
                  else { p / (ecc*ecc - 1.0) };

        let n_vec = [-h_vec[1], h_vec[0], 0.0];
        let n = (n_vec[0]*n_vec[0] + n_vec[1]*n_vec[1]).sqrt();
        let inc = (h_vec[2]/h).clamp(-1.0, 1.0).acos();
        
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

        let dot_r_v = r_vec[0]*v_vec[0] + r_vec[1]*v_vec[1] + r_vec[2]*v_vec[2];
        let nu;
        if ecc > EPSILON_ECCENTRICITY {
            let sin_nu = (h * dot_r_v) / (r * mu * ecc);
            let cos_nu = (p / r - 1.0) / ecc;
            nu = sin_nu.atan2(cos_nu);
        } else {
            if n > EPSILON_NODE {
                let dot_n_r = n_vec[0]*r_vec[0] + n_vec[1]*r_vec[1] + n_vec[2]*r_vec[2];
                let mut temp_nu = (dot_n_r / (n * r)).clamp(-1.0, 1.0).acos();
                if r_vec[2] < 0.0 { temp_nu = 2.0 * std::f64::consts::PI - temp_nu; }
                nu = temp_nu;
            } else {
                let mut temp_nu = r_vec[1].atan2(r_vec[0]);
                if temp_nu < 0.0 { temp_nu += 2.0 * std::f64::consts::PI; }
                nu = temp_nu;
            }
        }

        let m0;
        if (ecc - 1.0).abs() < 1e-7 {
            let d = (nu / 2.0).tan();
            m0 = d + d*d*d / 3.0;
        } else if ecc < 1.0 {
            let sin_e = (1.0 - ecc*ecc).sqrt() * nu.sin() / (1.0 + ecc * nu.cos());
            let cos_e = (ecc + nu.cos()) / (1.0 + ecc * nu.cos());
            let ea = sin_e.atan2(cos_e);
            m0 = ea - ecc * ea.sin();
        } else {
            let sinh_f = (ecc*ecc - 1.0).sqrt() * nu.sin() / (1.0 + ecc * nu.cos());
            let cosh_f = (ecc + nu.cos()) / (1.0 + ecc * nu.cos());
            let f = sinh_f.signum() * (cosh_f.max(1.0) + (cosh_f.max(1.0).powi(2) - 1.0).sqrt()).ln();
            m0 = ecc * f.sinh() - f;
        }

        let body = &mut self.bodies[idx];
        body.sma = sma; body.ecc = ecc; body.inc = inc; body.lan = lan; body.aop = aop;
        body.m0 = m0;
        body.epoch = current_time; 
        body.p = p; 
    }

    fn analytical_escape_time(&self, idx: usize) -> Option<f64> {
        let body = &self.bodies[idx];
        let p_idx = body.parent_index;
        if p_idx == -1 { return None; }
        let parent_soi = self.bodies[p_idx as usize].soi_radius;
        if parent_soi <= 0.0 { return None; }

        let e = body.ecc;
        let p = body.p;

        let (rx, ry, rz, _, _, _) = self.compute_analytical(idx, self.time);
        let current_r = (rx*rx + ry*ry + rz*rz).sqrt();
        
        if current_r > parent_soi { return Some(self.time + 1e-6); }

        let cos_nu = (p / parent_soi - 1.0) / e;
        
        if cos_nu > 1.0 + 1e-5 { return None; } 
        // 🚨 这里就是修复瞬移 Bug 最关键的防线！远地点都不出球的轨道直接拒绝！
        if cos_nu < -1.0 - 1e-5 { return None; }
        
        let cos_nu_clamped = cos_nu.clamp(-1.0, 1.0);
        let nu_esc = cos_nu_clamped.acos(); 

        let m_esc;
        if (e - 1.0).abs() < 1e-7 {
            let d = (nu_esc / 2.0).tan();
            m_esc = d + d*d*d / 3.0;
        } else if e < 1.0 {
            let sin_e = (1.0 - e*e).sqrt() * nu_esc.sin() / (1.0 + e * nu_esc.cos());
            let cos_e = (e + nu_esc.cos()) / (1.0 + e * nu_esc.cos());
            let ea = sin_e.atan2(cos_e);
            m_esc = ea - e * ea.sin();
        } else {
            let sinh_f = (e*e - 1.0).sqrt() * nu_esc.sin() / (1.0 + e * nu_esc.cos());
            let cosh_f = (e + nu_esc.cos()) / (1.0 + e * nu_esc.cos());
            let f = sinh_f.signum() * (cosh_f.max(1.0) + (cosh_f.max(1.0).powi(2) - 1.0).sqrt()).ln();
            m_esc = e * f.sinh() - f;
        }

        let mu = G * self.bodies[p_idx as usize].mass;
        let n = if (e - 1.0).abs() < 1e-7 {
            2.0 * (mu / (2.0 * p.powi(3))).sqrt()
        } else {
            (mu / body.sma.abs().powi(3)).sqrt()
        };
        
        let mut current_m = body.m0 + n * (self.time - body.epoch);
        if e < 1.0 {
            current_m = current_m % (2.0 * std::f64::consts::PI);
            if current_m < 0.0 { current_m += 2.0 * std::f64::consts::PI; }
        }
        
        let mut dt = (m_esc - current_m) / n;
        
        if e < 1.0 {
            let period = 2.0 * std::f64::consts::PI / n;
            dt = dt % period;
            if dt < 0.0 { dt += period; }
        } else {
            if dt < 0.0 { return None; } 
        }
        
        if dt > 0.0 && dt < MAX_SAFE_DT {
            Some(self.time + dt) 
        } else {
            None
        }
    }

    fn find_first_soi_transition(&self, idx: usize, max_dt: f64) -> Option<SOIEvent> {
        let current_parent = self.bodies[idx].parent_index;
        let mut earliest_event: Option<SOIEvent> = None;
        let mut min_t = self.time + max_dt;

        if current_parent != -1 {
            if let Some(t_escape) = self.analytical_escape_time(idx) {
                if t_escape > self.time && t_escape < min_t {
                    min_t = t_escape;
                    earliest_event = Some(SOIEvent { time: t_escape, body_idx: idx, new_parent: self.bodies[current_parent as usize].parent_index });
                }
            }
        }

        let steps = 50;
        let dt_step = max_dt / (steps as f64);
        
        for t_idx in 0..self.bodies.len() {
            if self.bodies[t_idx].parent_index == current_parent && self.bodies[t_idx].soi_radius > 0.0 && t_idx != idx {
                let target_soi = self.bodies[t_idx].soi_radius;

                for step in 1..=steps {
                    let t_start = self.time + ((step - 1) as f64) * dt_step;
                    let t_end = self.time + (step as f64) * dt_step;
                    if t_start >= min_t { break; }

                    let d_start = self.get_distance_between(idx, t_idx, t_start) - target_soi;
                    let d_end = self.get_distance_between(idx, t_idx, t_end) - target_soi;
                    let dot_start = self.get_rel_velocity_dot(idx, t_idx, t_start);
                    let dot_end = self.get_rel_velocity_dot(idx, t_idx, t_end);

                    if d_start > 0.0 && d_end <= 0.0 {
                        if let Some(t_cross) = self.brents_method(|t| self.get_distance_between(idx, t_idx, t) - target_soi, t_start, t_end) {
                            if t_cross < min_t {
                                min_t = t_cross;
                                earliest_event = Some(SOIEvent { time: t_cross, body_idx: idx, new_parent: t_idx as i32 });
                            }
                        }
                    } 
                    else if d_start > 0.0 && d_end > 0.0 {
                        if dot_start < 0.0 && dot_end > 0.0 {
                            let t_min = self.find_tca(idx, t_idx, t_start, t_end);
                            let d_min = self.get_distance_between(idx, t_idx, t_min) - target_soi;

                            if d_min <= 0.0 {
                                if let Some(t_cross) = self.brents_method(|t| self.get_distance_between(idx, t_idx, t) - target_soi, t_start, t_min) {
                                    if t_cross < min_t {
                                        min_t = t_cross;
                                        earliest_event = Some(SOIEvent { time: t_cross, body_idx: idx, new_parent: t_idx as i32 });
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        earliest_event
    }

    fn execute_soi_transition(&mut self, idx: usize, new_parent: i32, t_cross: f64) {
        let (abs_pos, abs_vel) = self.compute_all_absolute_states_at(t_cross);
        let s_pos = (abs_pos[idx*3], abs_pos[idx*3+1], abs_pos[idx*3+2]);
        let s_vel = (abs_vel[idx*3], abs_vel[idx*3+1], abs_vel[idx*3+2]);
        
        let p_pos; let p_vel;
        if new_parent == -1 {
            p_pos = (0.0, 0.0, 0.0); p_vel = (0.0, 0.0, 0.0);
        } else {
            let np = new_parent as usize;
            p_pos = (abs_pos[np*3], abs_pos[np*3+1], abs_pos[np*3+2]);
            p_vel = (abs_vel[np*3], abs_vel[np*3+1], abs_vel[np*3+2]);
        }

        self.local_positions[idx*3] = s_pos.0 - p_pos.0;
        self.local_positions[idx*3+1] = s_pos.1 - p_pos.1;
        self.local_positions[idx*3+2] = s_pos.2 - p_pos.2;
        self.local_velocities[idx*3] = s_vel.0 - p_vel.0;
        self.local_velocities[idx*3+1] = s_vel.1 - p_vel.1;
        self.local_velocities[idx*3+2] = s_vel.2 - p_vel.2;

        self.bodies[idx].parent_index = new_parent;
        self.parent_indices[idx] = new_parent;
        
        self.update_keplerian_at(idx, t_cross);
    }
}

#[wasm_bindgen]
impl PhysicsEngine {
    #[wasm_bindgen(constructor)]
    pub fn new() -> PhysicsEngine {
        PhysicsEngine { bodies: Vec::new(), local_positions: Vec::new(), local_velocities: Vec::new(), absolute_positions: Vec::new(), absolute_velocities: Vec::new(), parent_indices: Vec::new(), time: 0.0 }
    }

    pub fn add_body(&mut self, mass: f64, sma: f64, ecc: f64, inc: f64, lan: f64, aop: f64, mut m0: f64, parent_index: i32, soi_radius: f64, is_simulated: bool) -> i32 {
        let current_index = self.bodies.len() as i32;
        
        if parent_index != -1 { assert!(parent_index < current_index, "Topo Sort Error: Parent MUST be added before child."); }

        let p = if (ecc - 1.0).abs() < 1e-7 { sma.abs() } else if ecc < 1.0 { sma.abs() * (1.0 - ecc*ecc) } else { sma.abs() * (ecc*ecc - 1.0) };

        if parent_index != -1 && sma != 0.0 {
            let p_idx = parent_index as usize;
            if p_idx < self.bodies.len() {
                let mu = G * self.bodies[p_idx].mass;
                let n_mean = if (ecc - 1.0).abs() < 1e-7 { 2.0 * (mu / (2.0 * p.powi(3))).sqrt() } else { (mu / sma.abs().powi(3)).sqrt() };
                m0 = m0 - n_mean * self.time;
            }
        }
        let body = Body { mass, sma, ecc, inc, lan, aop, m0, epoch: self.time, parent_index, soi_radius, is_simulated, is_burning: false, p };
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
            self.update_keplerian_at(idx, self.time);
        }
        self.bodies[idx].is_burning = burning;
    }

    #[wasm_bindgen]
    pub fn update_to_time(&mut self, target_global_time: f64) {
        let mut time_remaining = target_global_time - self.time;
        if time_remaining <= 0.0 { return; }
        
        let mut loop_count = 0;
        
        while time_remaining > 1e-6 && loop_count < 100 {
            loop_count += 1;
            let mut earliest_event: Option<SOIEvent> = None;
            let mut safe_dt = time_remaining;
            
            for idx in 0..self.bodies.len() {
                if !self.bodies[idx].is_simulated || self.bodies[idx].is_burning { continue; }
                if let Some(evt) = self.find_first_soi_transition(idx, time_remaining) {
                    let dt = evt.time - self.time;
                    if dt < safe_dt && dt >= 0.0 {
                        safe_dt = dt;
                        earliest_event = Some(evt);
                    }
                }
            }
            
            if let Some(evt) = earliest_event {
                self.execute_soi_transition(evt.body_idx, evt.new_parent, evt.time);
                self.time = evt.time + 1e-6; 
                time_remaining -= safe_dt + 1e-6;
            } else {
                self.time += safe_dt;
                time_remaining -= safe_dt;
            }
        }
        
        self.time = target_global_time;
        
        for idx in 0..self.bodies.len() {
            if self.bodies[idx].parent_index != -1 && (!self.bodies[idx].is_simulated || !self.bodies[idx].is_burning) {
                let (lx, ly, lz, lvx, lvy, lvz) = self.compute_analytical(idx, self.time);
                self.local_positions[idx*3] = lx; self.local_positions[idx*3+1] = ly; self.local_positions[idx*3+2] = lz;
                self.local_velocities[idx*3] = lvx; self.local_velocities[idx*3+1] = lvy; self.local_velocities[idx*3+2] = lvz;
            }
        }
        let (abs_p, abs_v) = self.compute_all_absolute_states_at(self.time);
        self.absolute_positions = abs_p;
        self.absolute_velocities = abs_v;
    }

    #[wasm_bindgen]
    pub fn predict_patches(&mut self, target_idx: usize) -> Vec<f64> {
        if self.bodies[target_idx].is_burning { self.update_keplerian_at(target_idx, self.time); }
        let mut sim = PhysicsEngine { bodies: self.bodies.clone(), local_positions: self.local_positions.clone(), local_velocities: self.local_velocities.clone(), absolute_positions: self.absolute_positions.clone(), absolute_velocities: self.absolute_velocities.clone(), parent_indices: self.parent_indices.clone(), time: self.time };
        sim.bodies[target_idx].is_burning = false;
        
        let mut patches = Vec::new();
        let b = &sim.bodies[target_idx];
        patches.extend_from_slice(&[b.parent_index as f64, b.sma, b.ecc, b.inc, b.lan, b.aop]);
        
        for _ in 0..MAX_PREDICT_STEPS {
            let p_idx = sim.bodies[target_idx].parent_index;
            let mu = if p_idx == -1 { G * 1.989e30 } else { G * sim.bodies[p_idx as usize].mass };
            let sma = sim.bodies[target_idx].sma.abs();
            let period = if sma > 0.0 { 2.0 * std::f64::consts::PI * (sma.powi(3) / mu).sqrt() } else { MAX_SAFE_DT };
            let lookahead = period.max(1000.0).min(MAX_SAFE_DT * 10.0);
            
            if let Some(evt) = sim.find_first_soi_transition(target_idx, lookahead) {
                sim.execute_soi_transition(evt.body_idx, evt.new_parent, evt.time);
                sim.time = evt.time + 1e-6; 
                let nb = &sim.bodies[target_idx];
                patches.extend_from_slice(&[nb.parent_index as f64, nb.sma, nb.ecc, nb.inc, nb.lan, nb.aop]);
                if patches.len() / 6 >= MAX_PATCHES { break; }
            } else {
                if sim.bodies[target_idx].ecc < 1.0 { break; }
                if sim.bodies[target_idx].parent_index == -1 && sim.bodies[target_idx].ecc >= 1.0 { break; }
                sim.time += lookahead; 
            }
        }
        patches
    }

    #[wasm_bindgen]
    pub fn get_specific_orbital_energy(&self, idx: usize) -> f64 {
        let p_idx = self.bodies[idx].parent_index;
        if p_idx == -1 { return 0.0; }
        let mu = G * self.bodies[p_idx as usize].mass;
        let vx = self.local_velocities[idx*3]; let vy = self.local_velocities[idx*3+1]; let vz = self.local_velocities[idx*3+2];
        let rx = self.local_positions[idx*3]; let ry = self.local_positions[idx*3+1]; let rz = self.local_positions[idx*3+2];
        let v_sq = vx*vx + vy*vy + vz*vz;
        let r = (rx*rx + ry*ry + rz*rz).sqrt();
        v_sq / 2.0 - mu / r
    }

    pub fn get_positions_ptr(&self) -> *const f64 { self.absolute_positions.as_ptr() }
    pub fn get_velocities_ptr(&self) -> *const f64 { self.absolute_velocities.as_ptr() }
    pub fn get_local_velocities_ptr(&self) -> *const f64 { self.local_velocities.as_ptr() }
    pub fn get_parents_ptr(&self) -> *const i32 { self.parent_indices.as_ptr() }
    pub fn get_bodies_count(&self) -> usize { self.bodies.len() }
}