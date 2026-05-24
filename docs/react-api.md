# React 组件与 API 参考

前端基于 **React 19 + TypeScript + Vite + Three.js (R3F)** 构建，状态管理使用 **Zustand**。

---

## 目录

- [Stores（状态管理）](#stores状态管理)
- [Components（组件）](#components组件)
- [Hooks（自定义 Hook）](#hooks自定义-hook)
- [Utilities（工具函数）](#utilities工具函数)
- [Data（数据）](#data数据)
- [Locales（国际化）](#locales国际化)

---

## Stores（状态管理）

### `useEngineStore` — 仿真状态

**文件**：`src/store/useEngineStore.ts`

管理所有物理仿真相关状态。

#### 状态字段

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `timeTierIndex` | `number` | `1` | 当前选中的时间倍率档位索引 |
| `timeScale` | `number` | `TIME_TIERS[1]` (1x) | 当前时间倍率 |
| `isPaused` | `boolean` | `false` | 是否暂停 |
| `bodies` | `CelestialBody[]` | 从 JSON 动态加载 | 所有天体数据 |
| `nextId` | `number` | 自动计算 | 下一个可分配的天体 ID |
| `systemVersion` | `number` | `0` | 系统版本号（天体增删时递增，触发 WASM 重同步） |
| `engineData` | `{ posPtr, velPtr, localVelPtr, parentPtr, count, memory }` | 零值初始化 | WASM 引擎指针与共享内存引用 |

#### 操作方法

| 方法 | 签名 | 说明 |
|------|------|------|
| `setTimeTierIndex` | `(index: number) => void` | 设置时间倍率档位，自动更新 timeScale |
| `setCustomTimeScale` | `(scale: number) => void` | 设置自定义时间倍率，timeTierIndex 置为 -1 |
| `togglePause` | `() => void` | 切换暂停/播放 |
| `addBody` | `(body: Omit<CelestialBody, 'id'>) => void` | 添加天体，自动分配 ID 和默认值 |
| `deleteBody` | `(id: number) => number \| null` | 删除天体及其所有子天体，返回被删根天体的 ID |
| `loadSystem` | `(newBodies: CelestialBody[]) => void` | 加载新星系配置，清空旧数据，重置选中状态 |
| `toggleBurn` | `(id: number) => void` | 切换天体引擎点火状态 |
| `syncBodyParent` | `(updates: Array<{...}>) => void` | SOI 过渡后批量同步父天体与 Kepler 参数（不触发 WASM 重建） |
| `setEngineData` | `(data: {...}) => void` | 更新 WASM 引擎数据（指针 + 内存） |

#### 导出

| 导出 | 类型 | 说明 |
|------|------|------|
| `CelestialBody` | `interface` | 天体数据结构（见下文） |
| `TIME_TIERS` | `number[]` | 预设时间倍率数组：`[0.1, 1, 5, 50, 200, 1000, 10000, 100000, 1000000]` |
| `AVAILABLE_SYSTEMS` | `Record<string, CelestialBody[]>` | 从 `data/*.json` 动态加载的所有预设星系 |

#### `CelestialBody` 接口

```typescript
interface CelestialBody {
  id: number;           // 唯一标识符
  name: string;         // 名称（对应 i18n key）
  radius: number;       // 渲染/物理半径
  color: string;        // CSS 颜色值
  isStar?: boolean;     // 是否为恒星（控制自发光）
  type: 'STAR' | 'PLANET' | 'SATELLITE' | 'VEHICLE';

  // 物理与轨道参数
  MASS: number;         // 质量 (kg)
  SMA: number;          // 半长轴 (m)
  ECC: number;          // 偏心率
  INC: number;          // 轨道倾角 (rad)
  LAN: number;          // 升交点赤经 (rad)
  AOP: number;          // 近心点幅角 (rad)
  M0: number;           // 初始平近点角 (rad)
  parentId: number;     // 父天体 ID (-1 = 根天体)
  soiRadius: number;    // SOI 半径 (m)
  isBurning?: boolean;  // 是否引擎点火中
}
```

---

### `useUIStore` — UI 状态

**文件**：`src/store/useUIStore.ts`

管理所有用户界面相关状态，与仿真状态完全分离。

#### 状态字段

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `selectedBodyId` | `number \| null` | `null` | 当前选中的天体 ID |
| `isCameraTransitioning` | `boolean` | `false` | 相机是否正在执行平滑过渡 |
| `isAddModalOpen` | `boolean` | `false` | 添加实体弹窗是否打开 |
| `language` | `string` | `'zh'` | 当前界面语言代码 |
| `isSettingsWindowOpen` | `boolean` | `false` | 设置窗口是否打开 |
| `focusMode` | `'JUMP' \| 'TRACK'` | `'JUMP'` | 相机聚焦模式 |

#### 操作方法

| 方法 | 签名 | 说明 |
|------|------|------|
| `setSelectedBody` | `(id: number \| null) => void` | 设置选中天体 |
| `setCameraTransitioning` | `(status: boolean) => void` | 设置相机过渡状态 |
| `setAddModalOpen` | `(isOpen: boolean) => void` | 开关添加实体弹窗 |
| `setLanguage` | `(lang: string) => void` | 设置界面语言 |
| `setSettingsWindowOpen` | `(isOpen: boolean) => void` | 开关设置窗口 |
| `setFocusMode` | `(mode: 'JUMP' \| 'TRACK') => void` | 设置聚焦模式 |

#### `focusMode` 语义

| 值 | 说明 |
|-----|------|
| `'JUMP'` | 列表点击模式：选中时自动调整相机到最佳观测距离 |
| `'TRACK'` | 3D 点击模式：选中时仅锁定目标，不改变当前视距 |

---

## Components（组件）

### `App` — 根组件

**文件**：`src/App.tsx`

- 注册全局空格键暂停监听（`useSpacebarToggle`）
- 布局结构：
  ```
  TimeControlBar (左上)
  SidebarPanel   (左侧)
  SettingsWindow (右上)
  AddEntityWindow (右侧)
  DetailPanelWindow (右侧)
  R3F Canvas     (全屏 3D 背景)
  ```
- Canvas 配置：
  - 相机：`position: [0, 800, 2000]`, `fov: 45`, `far: 1e10`
  - 对数深度缓冲 + 抗锯齿
  - OrbitControls（旋转/缩放/平移）

---

### `SolarSystem` — 核心 3D 组件

**文件**：`src/components/SolarSystem.tsx`

**职责**：
1. WASM 引擎生命周期管理（init / add_body / clear）
2. 每帧物理步进（`update_to_time`）
3. 网格坐标同步（WASM 内存 → Three.js mesh.position）
4. 遥测数据计算与发布（→ `telemetryRef`）
5. 天体点击交互（选中 + 追踪模式切换）
6. 相机追踪委托给 `useCameraTracking` hook

**导出常量**：

| 常量 | 值 | 说明 |
|------|-----|------|
| `RENDER_SCALE` | `1e6` | 物理米 → 渲染单位的缩放（1 渲染单位 = 1000 km） |

**内部常量**：
| 常量 | 值 | 说明 |
|------|-----|------|
| `VEHICLE_RENDER_RADIUS` | `0.05` | 飞船固定渲染半径 |

**Props**：无（直接读取全局 Store）。

**渲染输出**：
```jsx
<group>
  <group>
    {bodies.map(body =>
      <mesh onClick={选中并追踪}>
        <sphereGeometry args={[renderRadius, 64, 64]} />
        <meshStandardMaterial color={color} emissive={isStar ? color : '#000'} />
        {isStar && <pointLight />}
      </mesh>
    )}
  </group>
  <SolarSystemHelpers bodies helperRefs meshRefs engine />
</group>
```

---

### `SolarSystemHelpers` — 轨道辅助组件

**文件**：`src/components/SolarSystemHelpers.tsx`

**Props**：
| Prop | 类型 | 说明 |
|------|------|------|
| `bodies` | `CelestialBody[]` | 天体数据 |
| `helperRefs` | `RefObject<Group[]>` | 辅助元素 Group 引用 |
| `meshRefs` | `RefObject<Mesh[]>` | 天体 Mesh 引用 |
| `engine` | `PhysicsEngine \| null` | WASM 引擎实例 |

**逻辑**：
- 遍历所有非根天体（`parentId !== -1`）
- 有父天体：渲染静态 `OrbitPathHelper`（带 SOI 裁剪）
- 飞船 + 引擎可用：渲染动态 `VehiclePredictor`（调用 `engine.predict_patches()`）

**内部组件 `VehiclePredictor`**：
- 通过 `useFrame` 降频调用 `engine.predict_patches(idx)`（每 15 帧一次）
- 将 `patches: Float64Array` 传递给 `DynamicOrbitPath` 渲染

---

### `OrbitPathHelper` — 轨道线渲染器

**文件**：`src/components/OrbitPathHelper.tsx`

#### 静态轨道 `OrbitPathHelper`

**Props**：
| Prop | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `SMA` | `number` | — | 半长轴 (m) |
| `ECC` | `number` | — | 偏心率 |
| `INC` | `number` | — | 轨道倾角 (rad) |
| `LAN` | `number` | — | 升交点赤经 (rad) |
| `AOP` | `number` | — | 近心点幅角 (rad) |
| `color` | `string` | `'#4da8da'` | 轨道线颜色 |
| `segments` | `number` | `300` | 线段分段数 |
| `soi` | `number` | `Infinity` | SOI 半径用于裁剪 |

**SOI 裁剪逻辑**：
- 椭圆 + 近点距离 > SOI → 返回空（完全在球外）
- 椭圆 + 求解 `r = a(1 - e·cosE)` 与 SOI 交点 → 裁剪偏近点角范围
- 圆轨道 + SMA > SOI → 返回空
- 双曲线 + 求解 `r = a(e·coshF - 1)` → 裁剪 F 范围

**性能优化**：
- 使用 `pointsPool`（预分配的 `Vector3[]`）避免每帧分配 GC 压力
- 轨道参数不变时由 `useMemo` 缓存

#### 动态轨道 `DynamicOrbitPath`

**Props**：
| Prop | 类型 | 说明 |
|------|------|------|
| `patches` | `Float64Array` | `predict_patches()` 的输出 |
| `color` | `string` | 当前段颜色 |
| `meshRefs` | `RefObject<Mesh[]>` | 用于定位父天体 |
| `bodies` | `CelestialBody[]` | 用于查询父天体 SOI |

**渲染**：每 6 个 float 为一个轨道段 `[parentId, sma, ecc, inc, lan, aop]`，第一段用绿色，后续段用橙色。

**`PredictedOrbitPatch` 子组件**：通过 `useFrame` 将预测轨道 Group 跟随父天体移动。

**配置常量**：

| 常量 | 值 | 说明 |
|------|-----|------|
| `DEFAULT_SEGMENTS` | `300` | 默认线段分段数 |
| `HYPERBOLA_LIMIT` | `3.0` | 双曲线 F 值上限 |
| `LINE_WIDTH` | `1` | 轨道线宽度 |
| `COLOR_DEFAULT` | `'#4da8da'` | 默认轨道色 |
| `COLOR_PREDICT_CURRENT` | `'#00ff88'` | 预测轨道当前段色 |
| `COLOR_PREDICT_FUTURE` | `'#ffaa00'` | 预测轨道后续段色 |
| `PATCH_DATA_STRIDE` | `6` | 每段轨道数据长度 |

---

### `TimeControlBar` — 时间控制条

**文件**：`src/components/ui/TimeControlBar.tsx`

**Props**：无。

**UI 结构**：
```
[播放/暂停按钮] [▸▸▸▸▸▸▸▸▸] [T: _1.0_ x]
```

- 播放/暂停按钮：调用 `togglePause()`
- 三角形加速档位：9 档（0.1x ~ 1Mx），点击设置 `timeTierIndex`
- 自定义输入框：支持直接输入倍率，失焦/回车时提交

---

### `SidebarPanel` — 实体导航面板

**文件**：`src/components/ui/SidebarPanel.tsx`

**Props**：无。

**功能**：
- 双标签页切换：天体 / 载具
- 列表项显示：颜色圆点 + 名称
- 点击列表项：`setFocusMode('JUMP')` + `setSelectedBody(id)` → 相机跳转
- 删除按钮（`id !== 0`）：调用 `deleteBody()`，若删除的是当前选中天体则自动清除选中
- 底部 "+" 按钮 → 打开添加实体窗口
- 折叠/展开按钮

---

### `AddEntityWindow` — 添加实体窗口

**文件**：`src/components/ui/AddEntityWindow.tsx`

**Props**：无。

**表单字段**：

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| 名称 | `text` | `'新探测器'` | 实体名称 |
| 类型 | `select` | `'VEHICLE'` | 载具/卫星/行星 |
| 参考系 | `select` | 第一个非根天体 | 父天体 |
| SMA | `number` | `6` | 半长轴 |
| ECC | `number` | `0.5` | 偏心率 |
| INC | `number` | `45` | 轨道倾角 (°)，表单输入度，内部转弧度 |
| LAN | `number` | `0` | 升交点赤经 (°) |

**默认注入值**：
| 字段 | 载具 | 卫星 | 行星 |
|------|------|------|------|
| `radius` | `0.05` | `0.3` | `0.3` |
| `color` | `'#00ff88'` | `'#a855f7'` | `'#a855f7'` |
| `MASS` | `0.01` | `10` | `10` |
| `soiRadius` | `0` | `50000` | `50000` |

---

### `DetailPanelWindow` — 遥测详情面板

**文件**：`src/components/ui/DetailPanelWindow.tsx`

**Props**：无。

**数据来源**：`telemetryRef.current`（每帧由 `SolarSystem.useFrame` 写入，面板通过 `requestAnimationFrame` 轮询读取）。`useEffect` 仅依赖 `selectedBodyId`，`bodies` 在 rAF 循环内部实时从 store 读取，避免删除天体时重建循环导致闪动。

**显示数据**：

| 字段 | 说明 |
|------|------|
| 质量 (MASS) | 天体质量 (kg) |
| SMA | 半长轴（正 = 椭圆，负 = 双曲线逃逸，"Escape" = 逃逸轨道） |
| Apoapsis (Ap) | 远拱点高度（相对参考天体表面） |
| Periapsis (Pe) | 近拱点高度 |
| Eccentricity | 偏心率 |
| Altitude | 当前高度 |
| Period | 轨道周期（"Escape" = 逃逸轨道） |
| Pos X/Y/Z | 绝对位置 (m) |
| Velocity | 相对参考天体速度 (m/s) |

**飞船操作**：
- 引擎点火/熄火按钮（仅 `type === 'VEHICLE'` 时显示）
- 调用 `useEngineStore.getState().toggleBurn(selectedBody.id)`

**性能**：使用 `ref.current.innerText` 直接操作 DOM，避免 React 重渲染。面板通过 `useNativeDrag` 可拖拽。

---

### `SettingsWindow` — 设置窗口

**文件**：`src/components/ui/SettingsWindow.tsx`

**功能**：
- **星系配置文件**：下拉选择 `AVAILABLE_SYSTEMS` 中的预设星系，调用 `loadSystem()`
- **界面语言**：下拉切换 `zh` / `en`，调用 `setLanguage()`
- 关闭按钮 → `setSettingsWindowOpen(false)`

**Props**：无。

---

## Hooks（自定义 Hook）

### `useCameraTracking`

**文件**：`src/hooks/useCameraTracking.ts`

**签名**：
```typescript
function useCameraTracking(
  meshRefs: React.MutableRefObject<(THREE.Mesh | null)[]>,
): (state: R3FState, selectedBodyId: number | null, bodies: CelestialBody[], focusMode: 'JUMP' | 'TRACK') => void
```

**返回值**：`updateCamera` 函数，需在 `useFrame` 中每帧调用。

**配置常量**：

| 常量 | 值 | 说明 |
|------|-----|------|
| `VEHICLE_RENDER_RADIUS` | `0.05` | 飞船渲染半径 |
| `VEHICLE_VIEW_DISTANCE` | `0.5` | 飞船默认观测距离 |
| `PLANET_VIEW_MULTIPLIER` | `20` | 行星观测距离 = 半径 × 20 |
| `MIN_DISTANCE_MULTIPLIER` | `1.05` | 相机最小距离 = 半径 × 1.05（防穿模） |
| `CAMERA_PAN_LERP` | `0.12` | 平移插值系数 |
| `CAMERA_ZOOM_LERP` | `0.08` | 缩放插值系数 |
| `VECTOR_EPSILON` | `0.001` | 向量容差 |

**运镜两阶段**：

1. **平移阶段**（每帧执行）：跟踪天体轨道运动产生的物理位移（`orbitalDelta`），相机以 lerp 平滑追赶
2. **缩放阶段**（仅 JUMP 模式 + 目标切换时）：lerp 从当前视距过渡到目标视距，到达后释放控制权

**切换处理**：
- 选中切换时（`selectedBodyId !== prevSelectedId`）：JUMP 模式下计算目标视距，设置 `minDistance` 防穿模；`prevActualTargetPos` 对齐新目标，防止空间跳跃
- 取消选中时（`selectedBodyId === null`）：锚点固定在当前视角中心

---

### `useSpacebarToggle`

**文件**：`src/hooks/useSpacebarToggle.ts`

**功能**：全局键盘监听器。

- 按下空格键时暂停/播放（调用 `togglePause()`）
- 输入框防误触：`INPUT` / `TEXTAREA` 聚焦时不拦截空格
- 空格按下时自动 blur 当前焦点元素

**使用**：在 `App` 组件中调用一次即可。

---

### `useTranslation`

**文件**：`src/hooks/useTranslation.ts`

**签名**：
```typescript
function useTranslation(): { t: (key: string) => string; language: string }
```

**功能**：国际化翻译。

- 通过 `import.meta.glob` 动态加载 `locales/*.json`
- `t(key)` 从当前语言的字典查找翻译，找不到时返回原始 key
- `language` 为当前语言代码（从 `useUIStore` 读取）

**导出常量**：
- `AVAILABLE_LANGUAGES: string[]` — 所有可用语言代码（如 `['zh', 'en']`）

---

### `useNativeDrag`

**文件**：`src/hooks/useNativeDrag.ts`

**签名**：
```typescript
function useNativeDrag(active: any): React.RefObject<HTMLDivElement>
```

**功能**：为面板组件提供原生 DOM 级拖拽，绕过 React 渲染周期。

**用法**：
```tsx
const panelRef = useNativeDrag(isOpen);
return <div ref={panelRef} className="floating-panel">
  <div className="drag-handle">...</div>
  ...
</div>
```

**机制**：
- 监听 `.drag-handle` 元素的 `mousedown` → `mousemove` → `mouseup`
- 通过 `panel.style.transform = translate(dx, dy)` 直接操作 DOM
- 拖拽时设置 `userSelect: none` 防止误选文本

---

## Utilities（工具函数）

### `coords.ts` — 坐标变换

**文件**：`src/utils/coords.ts`

```typescript
function physicsToRender(px: number, py: number, pz: number, scale: number): [number, number, number]
function physicsToRenderVec3(px: number, py: number, pz: number, scale: number, out?: THREE.Vector3): THREE.Vector3
```

**变换规则**：
```
renderX = physX / scale
renderY = physZ / scale    // Y → Z
renderZ = -physY / scale   // Y 取反
```

**使用位置**：`SolarSystem.tsx`（网格坐标）、`OrbitPathHelper.tsx`（轨道点）。

---

### `telemetry.ts` — 遥测计算

**文件**：`src/utils/telemetry.ts`

#### 模块级 Ref

```typescript
const telemetryRef: { current: TelemetryData | null }
```

由 `SolarSystem.useFrame` 每帧写入，`DetailPanelWindow` 轮询读取。

#### `TelemetryData` 接口

```typescript
interface TelemetryData {
  px: number;      // 绝对位置 X (m)
  py: number;      // 绝对位置 Y (m)
  pz: number;      // 绝对位置 Z (m)
  speed: number;   // 相对速度 (m/s)
  sma: number;     // 半长轴 (m)，≤0 = 逃逸
  ecc: number;     // 偏心率
  peAlt: number;   // 近拱点高度 (m)
  apAlt: number;   // 远拱点高度 (m)
  alt: number;     // 当前高度 (m)
  period: number;  // 轨道周期 (s)
  parentId: number; // 父天体 ID
}
```

#### `computeTelemetry()`

```typescript
function computeTelemetry(
  bodyIndex: number,
  engineData: EngineData,
  bodies: CelestialBody[],
): TelemetryData | null
```

**计算流程**：
1. 从 WASM 内存读取位置、局部速度、父天体索引
2. 计算速度标量 `speed = sqrt(vx² + vy² + vz²)`
3. 计算相对位置向量 `(rx, ry, rz)`
4. 轨道比能量 `ε = v²/2 - μ/r`
5. SMA `= -μ / (2ε)`
6. 比角动量 `h = r × v`
7. 偏心率向量 `e = (v × h)/μ - r̂`
8. Pe = |a|·|1 - e|, Ap = a·(1 + e)
9. 轨道周期：`T = 2π√(a³/μ)`（仅椭圆轨道）

#### `clearTelemetry()`

```typescript
function clearTelemetry(): void
```
将 `telemetryRef.current` 置为 `null`。

---

### `formatters.ts` — 数值格式化

**文件**：`src/utils/formatters.ts`

#### `formatUnit(val: number): string`

距离格式化（航天标准）：
- `> 1e9` → `"X.XXX Gm"` （京米）
- `> 1e6` → `"X.XXX Mm"` （兆米）
- `> 1e3` → `"X.XXX km"` （千米）
- 否则 → `"X.XX m"`
- `-1` 或 `NaN` → `"Escape"`

#### `formatUnit(val: number): string`

距离格式化（米基准，≥ 10¹² m 切换科学记数法，底数用 Gm）：

| 量级 (m) | 单位 | 示例 |
|----------|------|------|
| < 10³ | `m` | `12.00 m` |
| 10³ ~ 10⁶ | `km` | `3.14 km` |
| 10⁶ ~ 10⁹ | `Mm` | `1.23 Mm` |
| 10⁹ ~ 10¹² | `Gm` | `5.97 Gm` |
| ≥ 10¹² | `×10ⁿ Gm`（科学记数法） | `1.5×10³ Gm` |
| -1 / NaN | `Escape` | — |

#### `formatSpeed(val: number): string`

速度格式化（m/s 基准，≥ 10⁹ m/s 切换科学记数法，底数用 Mm/s）：

| 量级 (m/s) | 单位 | 示例 |
|-----------|------|------|
| < 10³ | `m/s` | `299.8 m/s` |
| 10³ ~ 10⁶ | `km/s` | `7.8 km/s` |
| 10⁶ ~ 10⁹ | `Mm/s` | `1.23 Mm/s` |
| ≥ 10⁹ | `×10ⁿ Mm/s`（科学记数法） | `3×10⁵ Mm/s` |

#### `formatMass(val: number): string`

质量格式化（kg 起步，≥ 10²¹ kg 切换科学记数法，底数用 Pt）：

| 量级 (kg) | 单位 | 示例 |
|-----------|------|------|
| < 10³ | `kg` | `1.23 kg` |
| 10³ ~ 10⁶ | `t`（吨） | `500 t` |
| 10⁶ ~ 10⁹ | `Kt`（千吨） | `3.14 Kt` |
| 10⁹ ~ 10¹² | `Mt`（兆吨） | `5.97 Mt` |
| 10¹² ~ 10¹⁵ | `Gt`（吉吨） | … |
| 10¹⁵ ~ 10¹⁸ | `Tt`（太吨） | … |
| 10¹⁸ ~ 10²¹ | `Pt`（拍吨） | … |
| ≥ 10²¹ | `×10ⁿ Pt`（科学记数法） | `5×10³ Pt` |
| `Infinity` | `∞` | — |

**尾部零去除规则**：`1.230001` → 四舍五入到 4 位小数 `1.2300` → 去尾部零 `1.23`。

#### `formatTime(totalSeconds: number): string`

时间格式化（航天标准）：
- `≥ 1 年` → `"Xy Xd Xh"`
- `≥ 1 天` → `"Xd Xh Xm"`
- `≥ 1 小时` → `"Xh Xm Xs"`
- `≥ 1 分钟` → `"Xm Xs"`
- 否则 → `"Xs"`
- `Infinity` / `NaN` / 负数 → `"Escape"`

---

## Data（数据）

### 星系配置文件

**目录**：`src/data/`

JSON 数组格式，每个元素为 `CelestialBody` 对象。通过 `import.meta.glob` 自动扫描加载，无需手动注册。

**当前预设**：

| 文件 | 内容 |
|------|------|
| `solar_system.json` | 太阳系：太阳 / 地球 / 月球 / 极地探测器 |
| `ksp.json` | KSP 坎巴拉星系 |

**自定义星系**：在 `src/data/` 下新建 `.json` 文件，遵循 `CelestialBody[]` 格式即可自动出现在设置面板中。

**注意**：`id` 必须唯一，`parentId === -1` 表示根天体。根天体应放在数组首位（拓扑排序保证）。

---

## Locales（国际化）

**目录**：`src/locales/`

**文件**：`zh.json` / `en.json`（键值对格式）

**添加新语言**：在 `locales/` 下创建 `{langCode}.json`，复制现有语言包并翻译值即可。`AVAILABLE_LANGUAGES` 会自动更新。

**翻译 key 命名规范**：`ui.{功能模块}.{具体项}`，如 `ui.settings.lang`、`ui.addEntity`。天体名称直接用英文名作为 key（如 `"Sun"`、`"Earth"`）。
