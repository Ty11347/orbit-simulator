// Newtonian gravitational constant (SI units: m^3 kg^-1 s^-2)
pub const G: f64 = 6.67430e-11;

// --- Numerical tolerance thresholds ---
// Guard values against floating-point errors and division-by-zero
pub const EPSILON_DISTANCE: f64 = 1e-6;          // Minimum distance threshold
pub const EPSILON_VELOCITY: f64 = 1e-6;          // Minimum velocity threshold
pub const EPSILON_ECCENTRICITY: f64 = 1e-8;      // Minimum eccentricity threshold
pub const EPSILON_NODE: f64 = 1e-8;              // Minimum ascending node vector threshold
// pub const EPSILON_ENERGY: f64 = 1e-9;         // Minimum specific orbital energy threshold
// pub const EPSILON_MATH_DENOMINATOR: f64 = 1e-12; // Minimum math denominator threshold
// pub const EPSILON_GRAVITY_DISTANCE: f64 = 1e-9;  // Minimum gravity distance threshold

// --- Kepler equation iteration parameters ---
pub const MAX_NEWTON_ITERATIONS: usize = 10;     // Max Newton iterations for elliptic orbits
pub const MAX_KEPLER_ITERATIONS: usize = 15;     // Max iterations for hyperbolic Kepler equation
// pub const HYPERBOLIC_M_THRESHOLD: f64 = 50.0;  // Hyperbolic mean anomaly threshold
pub const HYPERBOLIC_E_CLAMP: f64 = 150.0;       // Hyperbolic eccentric anomaly clamp bound
pub const HYPERBOLIC_CONVERGENCE: f64 = 1e-7;    // Hyperbolic iteration convergence threshold

// --- Prediction pipeline & integrator parameters ---
pub const MAX_PREDICT_STEPS: usize = 15000;      // Max orbit prediction steps
pub const MAX_PATCHES: usize = 24;               // Max patched conic segments
// pub const PHYSICS_SUBSTEPS: u32 = 200;         // Physics sub-steps per frame
pub const MAX_SAFE_DT: f64 = 100000.0;           // Max safe time span for ray marching
// pub const MIN_REL_VELOCITY: f64 = 0.01;        // Minimum relative velocity guard
// pub const ORBIT_DT_DIVISOR: f64 = 50.0;        // Orbit base step divisor ratio
// pub const SAFE_DT_PADDING: f64 = 0.05;         // Safe time-step padding margin
// pub const MIN_DT_CLAMP: f64 = 0.01;            // Minimum time-step clamp
