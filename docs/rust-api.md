# Rust 物理引擎 API 参考

`physics-engine/` 是基于 `wasm-bindgen` 的 Rust crate，编译为 WebAssembly 供前端调用。引擎采用**纯解析方法**求解开普勒轨道方程，支持椭圆、抛物线、双曲线三种圆锥曲线。

---

## 文件结构

```
physics-engine/src/
├── lib.rs         # 主逻辑（~676 行）
└── constants.rs   # 物理常数与算法参数
```

---

## 数据结构

### `Body`

```rust
struct Body {
    mass: f64,             // 质量 (kg)
    sma: f64,              // 半长轴 (m) — 双曲线时为负值的绝对值
    ecc: f64,              // 偏心率
    inc: f64,              // 轨道倾角 (rad)
    lan: f64,              // 升交点赤经 (rad)
    aop: f64,              // 近心点幅角 (rad)
    m0: f64,               // 初始平近点角 (rad)
    epoch: f64,            // m0 对应的历元时间 (s)
    parent_index: i32,     // 父天体在 bodies 数组中的索引 (-1 = 无父天体)
    soi_radius: f64,       // 引力作用球半径 (m)，≤0 表示无限制
    is_simulated: bool,    // 是否参与 SOI 转移检测
    is_burning: bool,      // 是否正在引擎点火（点火时使用数值积分）
    p: f64,                // 半通径 (semi-latus rectum)
}
```

### `SOIEvent`

```rust
struct SOIEvent {
    time: f64,        // SOI 转移发生的绝对时间 (s)
    body_idx: usize,  // 发生转移的天体索引
    new_parent: i32,  // 转移后的父天体索引
}
```

### `PhysicsEngine`

```rust
pub struct PhysicsEngine {
    bodies: Vec<Body>,
    local_positions: Vec<f64>,    // 相对父天体的位置 (x, y, z) × N
    local_velocities: Vec<f64>,   // 相对父天体的速度 (x, y, z) × N
    absolute_positions: Vec<f64>, // 绝对位置（递归累加）
    absolute_velocities: Vec<f64>, // 绝对速度（递归累加）
    parent_indices: Vec<i32>,     // 父天体索引（平铺数组，供 JS 直接读取）
    time: f64,                    // 当前模拟时间 (s)
}
```

---

## 公共 API（`#[wasm_bindgen]`）

以下方法暴露给 JavaScript 前端。

### `new() -> PhysicsEngine`

```rust
#[wasm_bindgen(constructor)]
pub fn new() -> PhysicsEngine
```

**说明**：创建空的物理引擎实例。所有向量初始化为空。

**JS 调用**：
```typescript
const engine = new PhysicsEngine();
```

---

### `add_body(…) -> i32`

```rust
pub fn add_body(
    mass: f64,
    sma: f64,
    ecc: f64,
    inc: f64,
    lan: f64,
    aop: f64,
    m0: f64,
    parent_index: i32,
    soi_radius: f64,
    is_simulated: bool,
) -> i32
```

**说明**：向引擎注册一个天体。

**参数**：

| 参数 | 类型 | 说明 |
|------|------|------|
| `mass` | `f64` | 质量 (kg) |
| `sma` | `f64` | 半长轴 (m) |
| `ecc` | `f64` | 偏心率 |
| `inc` | `f64` | 轨道倾角 (rad) |
| `lan` | `f64` | 升交点赤经 (rad) |
| `aop` | `f64` | 近心点幅角 (rad) |
| `m0` | `f64` | 初始平近点角 (rad) |
| `parent_index` | `i32` | 父天体索引（-1 表示根天体） |
| `soi_radius` | `f64` | SOI 半径 (m)，0 表示无限制 |
| `is_simulated` | `bool` | 是否参与 SOI 转移检测（通常 `type === 'VEHICLE'` 时为 true） |

**返回值**：新天体的索引（`i32`）。

**约束**：`parent_index` 必须小于当前索引（拓扑排序保证），否则触发 Rust `assert!`。

**内部处理**：
- 计算半通径 `p`
- 根据父天体的引力常数调整 `m0`：`body.m0 = json_m0 + n_mean * self.time`，使 `body.epoch = self.time` 时刻天体处于正确的轨道位置
- 在 `local_positions`、`local_velocities` 等数组中追加 3 个零值占位
- 返回 `bodies.len() - 1`

---

### `clear()`

```rust
pub fn clear()
```

**说明**：清空引擎中所有天体数据和位置/速度缓存。通常在切换星系时调用。

---

### `set_burning(idx: usize, burning: bool)`

```rust
pub fn set_burning(idx: usize, burning: bool)
```

**说明**：设置天体的引擎点火状态。

**行为**：
- 从点火 → 熄火时：调用 `update_keplerian_at()` 将当前笛卡尔坐标反算回 Kepler 轨道参数
- 从熄火 → 点火时：不作特殊处理，后续 `update_to_time()` 会直接读取 `local_positions` 值加增量

---

### `update_to_time(target_global_time: f64)`

```rust
pub fn update_to_time(target_global_time: f64)
```

**说明**：将模拟推进到目标绝对时间。这是**每帧调用的核心入口**。

**算法流程**：

1. 计算 `time_remaining = target_global_time - self.time`
2. 进入循环（最多 100 次迭代，防止无限循环）：
   a. 对所有 `is_simulated == true` 且 `is_burning == false` 的天体调用 `find_first_soi_transition()`
   b. 找出最早的 SOI 转移事件
   c. 如果找到事件：执行 `execute_soi_transition()`，时间推进到事件时刻
   d. 如果没找到：直接推进剩余时间
3. 对所有非根天体（`parent_index != -1`），重新计算解析位置/速度
4. 调用 `compute_all_absolute_states_at()` 更新绝对坐标

**复杂度**：O(N² × steps)，其中 steps = 50（SOI 检测采样步数），N 为天体数量。

---

### `predict_patches(target_idx: usize) -> Vec<f64>`

```rust
pub fn predict_patches(target_idx: usize) -> Vec<f64>
```

**说明**：预测指定天体的未来轨道段（Patched Conic 拼接）。用于飞船轨道预测可视化。

**算法**：

1. 如果目标正在点火，先调用 `update_keplerian_at()` 转换为 Kepler 元素
2. 克隆当前引擎状态到独立模拟器
3. 锁定目标天体的 `is_burning = false`
4. 添加当前轨道段（父天体 id + SMA/ECC/INC/LAN/AOP）
5. 循环（最多 `MAX_PREDICT_STEPS = 15000` 步）：
   a. 调用 `find_first_soi_transition()` 探测下一个 SOI 事件
   b. 如果找到事件：执行转移，追加新轨道段
   c. 如果没找到且偏心率 < 1（椭圆）：停止（闭合轨道无更多转移）
   d. 如果没找到且偏心率 ≥ 1（双曲线）且父天体非根：继续推进
   e. 最多收集 `MAX_PATCHES = 24` 段轨道

**返回值**：`Vec<f64>`，每 6 个元素为一组：
```
[parentId, SMA, ECC, INC, LAN, AOP, parentId, SMA, ECC, ...]
```

**JS 端解析**：
```typescript
const STRIDE = 6;
for (let i = 0; i < patches.length / STRIDE; i++) {
  const parentId = patches[i * STRIDE];
  const sma = patches[i * STRIDE + 1];
  const ecc = patches[i * STRIDE + 2];
  // ...
}
```

---

### `get_body_kepler(idx: usize) -> Vec<f64>`

```rust
pub fn get_body_kepler(idx: usize) -> Vec<f64>
```

**说明**：返回指定天体的当前 Kepler 轨道参数与父天体索引。用于 SOI 过渡后将 Rust 侧的轨道状态同步回 JS 端。

**返回值**：`Vec<f64>`，包含 6 个元素：
```
[parent_index, SMA, ECC, INC, LAN, AOP]
```

**JS 调用**：
```typescript
const k = engine.get_body_kepler(idx);
const parentId = k[0];
const sma = k[1];
// ... k[2]=ECC, k[3]=INC, k[4]=LAN, k[5]=AOP
```

---

### `get_specific_orbital_energy(idx: usize) -> f64`

```rust
pub fn get_specific_orbital_energy(idx: usize) -> f64
```

**说明**：计算指定天体的轨道比能量 ε = v²/2 - μ/r。

**公式**：
```
ε = v²/2 - μ/r
```
- 椭圆轨道：ε < 0
- 抛物线轨道：ε = 0
- 双曲线轨道：ε > 0

SOI 跨越前后 ε 应严格守恒（不变的物理量），是验证引擎正确性的关键指标。

---

### 内存指针访问方法

```rust
pub fn get_positions_ptr()        -> *const f64   // 绝对位置数组指针
pub fn get_velocities_ptr()       -> *const f64   // 绝对速度数组指针
pub fn get_local_velocities_ptr() -> *const f64   // 局部速度数组指针
pub fn get_parents_ptr()          -> *const i32   // 父天体索引数组指针
pub fn get_bodies_count()         -> usize         // 天体总数
```

**说明**：返回 WASM 线性内存中数组的原始指针，前端通过 `Float64Array` / `Int32Array` 直接读写，**零拷贝**。

**JS 端使用**：
```typescript
const posPtr = engine.get_positions_ptr();
const parentPtr = engine.get_parents_ptr();
const count = engine.get_bodies_count();
const posView = new Float64Array(wasmMemory.buffer, posPtr, count * 3);
// posView[bodyIndex * 3]     = x
// posView[bodyIndex * 3 + 1] = y
// posView[bodyIndex * 3 + 2] = z
```

**注意**：指针在 `add_body()` / `clear()` 后可能失效（Vec 重新分配），前端通过 `systemVersion` 变化检测重建 Float64Array 视图。

---

## 内部方法（非 wasm-bindgen 导出）

### `compute_analytical(idx: usize, time: f64) -> (f64, f64, f64, f64, f64, f64)`

**核心**：解析求解开普勒方程，返回相对父天体的位置和速度 `(x, y, z, vx, vy, vz)`。

**分支逻辑**：

| 偏心率范围 | 轨道类型 | 求解方法 |
|-----------|---------|---------|
| `ecc < 1.0` | 椭圆 | Newton-Raphson 迭代（`MAX_NEWTON_ITERATIONS = 10`），失败时回退二分法（30 步） |
| `\|ecc - 1.0\| < 1e-7` | 抛物线 | Barker 方程解析解 |
| `ecc > 1.0` | 双曲线 | Newton-Raphson 迭代（`MAX_KEPLER_ITERATIONS = 15`），失败时回退二分法（40 步） |

**坐标变换**：轨道平面 (px, py) → 惯性系 (x, y, z)，使用 3-1-3 欧拉角旋转序列（LAN → INC → AOP）。

---

### `compute_all_absolute_states_at(t: f64) -> (Vec<f64>, Vec<f64>)`

递归计算所有天体在时间 `t` 的绝对位置和速度。

- 根天体（`parent_index == -1` 或 `sma == 0`）：位置 = (0,0,0)，速度 = (0,0,0)
- 点火天体：直接从 `local_positions` / `local_velocities` 累加（数值模式）
- 其他天体：调用 `compute_analytical()` 获取相对坐标 + 父天体绝对坐标 = 自身绝对坐标

---

### `analytical_escape_time(idx: usize) -> Option<f64>`

解析预测天体脱离当前父天体 SOI 的精确时间。

**算法**：
1. 检查当前距离是否已超出 SOI（返回 `Some(time + 1e-6)`）
2. 计算真近点角 `cos(nu_esc) = (p / soi - 1) / e`
3. 如果 `cos_nu_esc > 1`：近点已在 SOI 外，返回 `None`
4. 如果 `cos_nu_esc < -1`：远点仍在 SOI 内，返回 `None`（永不逃逸）
5. 求解对应位置的平近点角 `m_esc`
6. 计算 `dt = (m_esc - m_current) / n`
7. 椭圆轨道：取模到单周期内

**返回值**：逃逸时间 `t_escape`，或 `None` 表示永不逃逸 / dt 超过 `MAX_SAFE_DT`。

---

### `find_first_soi_transition(idx: usize, max_dt: f64) -> Option<SOIEvent>`

在时间窗口 `[time, time + max_dt]` 内检测天体 `idx` 的第一个 SOI 转移事件。

**双通道检测**：

**通道一**：解析逃逸检测
- 调用 `analytical_escape_time(idx)` 快速判断是否脱离当前父天体 SOI
- O(1) 复杂度

**通道二**：采样 + 求根检测
- 将 `max_dt` 分为 50 个步长，逐段检测
- 对同级父天体的每个有 SOI 的其他天体 `t_idx`：
  - 计算 `d_start` 和 `d_end`（与 `t_idx` 的距离减去 `t_idx.soi_radius`）
  - 符号变化（进入 SOI）：Brent 法精确求根
  - 均 > 0 但速度点积换号（最近距离在段内）：黄金分割搜索 TCA + Brent 验证
- O(N × steps) 复杂度

**返回值**：最早的 `SOIEvent`，或 `None` 表示窗口内无转移。

---

### `execute_soi_transition(idx: usize, new_parent: i32, t_cross: f64)`

执行 SOI 转移：

1. 在 `t_cross` 时刻计算所有天体的绝对坐标
2. 计算目标天体与新旧父天体的相对位置/速度差
3. 更新 `local_positions[idx]` 和 `local_velocities[idx]` 为新父体系下的值
4. 更新 `parent_index` 和 `parent_indices`
5. 调用 `update_keplerian_at()` 从新的笛卡尔状态反推 Kepler 参数

---

### `update_keplerian_at(idx: usize, current_time: f64)`

从当前位置/速度反推 Kepler 轨道六要素：

1. 计算比角动量向量 `h = r × v`
2. 计算偏心率向量 `e = (v × h)/μ - r/r`
3. 从 `h` 推导倾角 `inc`
4. 从 `h` 推导升交点赤经 `lan`
5. 从 `e` 推导近心点幅角 `aop`
6. 从 `r·v` 推导真近点角 `nu`
7. 从 `nu` 反向计算平近点角 `m0`

**更新字段**：`sma`、`ecc`、`inc`、`lan`、`aop`、`m0`、`epoch`、`p`。

---

### `get_distance_between(idx1, idx2, t) -> f64`

计算两个天体在时间 `t` 的 3D 欧几里得距离。

---

### `get_rel_velocity_dot(idx1, idx2, t) -> f64`

计算两个天体相对速度向量与相对位置向量的点积。用于判断两体是正在接近（dot < 0）还是远离（dot > 0）。

---

### `brents_method(f, a, b) -> Option<f64>`

Brent-Dekker 混合求根算法。结合二分法、割线法和逆二次插值，在区间 `[a, b]` 内寻找 `f(x) = 0` 的根。

**用途**：精确计算 SOI 边界的跨越时间（距离差 = 0）。

**参数**：`f` 为闭包，`a`/`b` 为区间端点（需要满足 `f(a)·f(b) < 0`）。

**容差**：`1e-8`。

---

### `find_tca(idx1, idx2, a, b) -> f64`

黄金分割搜索（Golden Section Search）查找两体距离的极小值点。

**用途**：当 SOI 边界被完整跨越（两端点距离均 > 0 但中间距离 < SOI 半径）时，先找最短距离点 TCA（Time of Closest Approach），再用 Brent 法在子区间求根。

**常数**：
- `invphi = (√5 - 1) / 2` ≈ 0.618
- `invphi2 = (3 - √5) / 2` ≈ 0.382
- 容差：`1e-3`

---

## 常量 (`constants.rs`)

| 常量 | 值 | 说明 |
|------|-----|------|
| `G` | `6.67430e-11` | 万有引力常数 (m³ kg⁻¹ s⁻²) |
| `EPSILON_DISTANCE` | `1e-6` | 距离极小值容差 |
| `EPSILON_VELOCITY` | `1e-6` | 速度极小值容差 |
| `EPSILON_ECCENTRICITY` | `1e-8` | 偏心率极小值容差 |
| `EPSILON_NODE` | `1e-8` | 升交点向量容差 |
| `MAX_NEWTON_ITERATIONS` | `10` | 椭圆轨道 Newton 迭代次数 |
| `MAX_KEPLER_ITERATIONS` | `15` | 双曲线迭代次数 |
| `HYPERBOLIC_E_CLAMP` | `150.0` | 双曲线偏近点角裁剪上限 |
| `HYPERBOLIC_CONVERGENCE` | `1e-7` | 双曲线收敛判定阈值 |
| `MAX_PREDICT_STEPS` | `15000` | 轨道预测最大推演步数 |
| `MAX_PATCHES` | `24` | 最大圆锥曲线拼接段数 |
| `MAX_SAFE_DT` | `100000.0` | 安全时间步长上限 (s) |

---

## 坐标系约定

- **物理坐标系**（Rust 内部）：右手系，X 向右，Y 向上，Z 指向观察者
- **渲染坐标系**（Three.js）：右手系，X 向右，Y 指向观察者，Z 向上
- **变换**：`render(x, y, z) = (phys_x / scale, phys_z / scale, -phys_y / scale)`

---

## 调用顺序

```
1. new()           → 创建引擎
2. add_body() × N  → 注册所有天体（必须拓扑排序，父在子前）
3. set_burning()   → 可选，设置飞船点火状态
4. update_to_time() → 每帧调用，推进物理
5. get_positions_ptr() / get_velocities_ptr() / get_parents_ptr() → 读取状态
6. predict_patches() → 可选，预测飞船轨道
```
