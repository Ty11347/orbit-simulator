// 真实的万有引力常数 (国际单位制: m^3 kg^-1 s^-2)
pub const G: f64 = 6.67430e-11;

// --- 数值容差边界值 ---
// 用于避免浮点数计算错误或除零异常
pub const EPSILON_DISTANCE: f64 = 1e-6;          // 距离极小值容差
pub const EPSILON_VELOCITY: f64 = 1e-6;          // 速度极小值容差
pub const EPSILON_ECCENTRICITY: f64 = 1e-8;      // 偏心率极小值容差
pub const EPSILON_NODE: f64 = 1e-8;              // 升交点向量计算极小值容差
// pub const EPSILON_ENERGY: f64 = 1e-9;            // 轨道比能量极小值容差
// pub const EPSILON_MATH_DENOMINATOR: f64 = 1e-12; // 数学运算分母极小值容差
// pub const EPSILON_GRAVITY_DISTANCE: f64 = 1e-9;  // 万有引力计算距离容差

// --- 开普勒轨道方程迭代参数 ---
pub const MAX_NEWTON_ITERATIONS: usize = 10;     // 椭圆轨道牛顿迭代最大次数
pub const MAX_KEPLER_ITERATIONS: usize = 15;     // 双曲线轨道方程迭代最大次数
// pub const HYPERBOLIC_M_THRESHOLD: f64 = 50.0;    // 双曲线平近点角阈值界限
pub const HYPERBOLIC_E_CLAMP: f64 = 150.0;       // 双曲线偏近点角裁剪界限
pub const HYPERBOLIC_CONVERGENCE: f64 = 1e-7;    // 双曲线迭代收敛判定阈值

// --- 预测管线与积分器参数 ---
pub const MAX_PREDICT_STEPS: usize = 15000;      // 轨道预测最大推演步数
pub const MAX_PATCHES: usize = 24;               // 最大允许的圆锥曲线拼接段数
// pub const PHYSICS_SUBSTEPS: u32 = 200;           // 引擎每帧执行的物理子步数
pub const MAX_SAFE_DT: f64 = 100000.0;           // 射线步进算法最大允许时间跨度
// pub const MIN_REL_VELOCITY: f64 = 0.01;          // 相对速度极小值保护
// pub const ORBIT_DT_DIVISOR: f64 = 50.0;          // 轨道基础步长分割比例
// pub const SAFE_DT_PADDING: f64 = 0.05;           // 安全时间步长填充余量
// pub const MIN_DT_CLAMP: f64 = 0.01;              // 时间跨度最小钳制值