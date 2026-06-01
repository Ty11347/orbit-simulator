# Orbit Simulator

**中文** | [English](README.en.md)

<p align="left">
  <img src="https://img.shields.io/badge/Rust-CE422B?style=for-the-badge&logo=rust&logoColor=white" alt="Rust">
  <img src="https://img.shields.io/badge/WebAssembly-654FF0?style=for-the-badge&logo=webassembly&logoColor=white" alt="WebAssembly">
  <img src="https://img.shields.io/badge/React-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React">
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/Three.js-000000?style=for-the-badge&logo=threedotjs&logoColor=white" alt="Three.js">
  <img src="https://img.shields.io/badge/Zustand-443E38?style=for-the-badge&logo=react&logoColor=white" alt="Zustand">
  <img src="https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white" alt="Vite">
</p>

基于 **Patched Conic Approximation（圆锥曲线拼接近似）** 的轨道力学沙盒模拟器。物理引擎使用 Rust 编译为 WebAssembly，前端采用 React + Three.js 进行 3D 可视化渲染。

## 功能特性

- **真实轨道力学** — 解析求解开普勒方程（椭圆 / 抛物线 / 双曲线），支持万有引力常数 G 的精确计算
- **SOI 边界跨越** — 自动检测并处理引力作用球（Sphere of Influence）转移事件，使用 Brent 方法精确求根
- **轨道预测** — 对飞船进行多段 Patched Conic 路径推演，可视化未来轨道
- **[WIP] 飞船机动** — ~~支持~~飞船引擎点火 / 熄火，动态切换解析模式与数值积分
- **3D 可视化** — 基于 React Three Fiber 的天体渲染、轨道线绘制、自由视角控制
- **时间控制** — 可暂停，支持 0.1x ~ 1,000,000x 多级时间加速
- **实体管理** — 动态添加 / 删除行星、卫星、飞船，支持自定义轨道参数
- **遥测面板** — 实时显示选中天体的位置、速度、轨道参数（SMA / ECC / Pe / Ap / Period）
- **双语界面** — 支持中文 / English 切换
- **多星系配置** — 通过 JSON 配置文件切换预设星系（太阳系、KSP 星系）

---

## 文件结构

```
orbit-simulator/
├── index.html                        # Vite 入口 HTML
├── package.json                      # 前端依赖与脚本
├── vite.config.ts                    # Vite 构建配置（React + WASM 插件）
├── tsconfig.json                     # TypeScript 配置入口
├── tsconfig.app.json                 # 应用 TypeScript 配置
├── tsconfig.node.json                # Node 端 TypeScript 配置
├── eslint.config.js                  # ESLint 规则配置
│
├── public/                           # 静态资源
│   ├── favicon.svg                   # 网站图标
│   └── icons.svg                     # SVG 图标集
│
├── physics-engine/                   # Rust 物理引擎（WASM）
│   ├── Cargo.toml                    # Rust 项目配置
│   ├── Cargo.lock                    # 依赖锁定文件
│   └── src/
│       ├── lib.rs                    # 物理引擎主逻辑（~676 行）
│       │   ├── Body 结构体           #   天体数据结构
│       │   ├── SOIEvent 结构体       #   引力作用球转移事件
│       │   ├── compute_analytical()  #   解析开普勒方程求解
│       │   ├── find_tca()            #   黄金分割搜索最近点
│       │   ├── brents_method()       #   Brent 求根算法
│       │   ├── analytical_escape_time() # 解析预测 SOI 逃逸时间
│       │   ├── find_first_soi_transition() # SOI 转移检测主循环
│       │   ├── execute_soi_transition()    # 执行 SOI 转移（坐标变换）
│       │   ├── update_keplerian_at()       # 从位置/速度反推开普勒参数
│       │   ├── compute_all_absolute_states_at() # 递归计算绝对坐标
│       │   ├── update_to_time()       #   WASM 入口：推进到目标时间
│       │   ├── predict_patches()      #   WASM 入口：飞船轨道预测
│       │   └── get_specific_orbital_energy() # WASM 入口：轨道比能量
│       └── constants.rs              #   万有引力常数 G、迭代参数、数值容差
│
├── src/                              # React 前端源码
│   ├── main.tsx                      # React 应用入口
│   ├── App.tsx                       # 根组件：布局 3D 画布 + UI 叠加层
│   ├── App.css                       # 全局样式表（CSS 变量体系）
│   ├── index.css                     # 基础样式重置
│   │
│   ├── store/                        # Zustand 状态管理
│   │   ├── useEngineStore.ts         # 仿真状态：天体数据、时间控制、引擎指针、AVAILABLE_SYSTEMS 导出
│   │   └── useUIStore.ts             # UI 状态：选中天体、模态框开关、语言、焦点模式
│   │
│   ├── components/                   # React 组件
│   │   ├── SolarSystem.tsx           # 核心 3D 组件：WASM 初始化、物理步进、网格同步、遥测计算
│   │   ├── SolarSystemHelpers.tsx    # 轨道辅助组件：静态椭圆轨道 + 飞船动态预测轨道调度
│   │   ├── OrbitPathHelper.tsx       # 轨道线渲染器：支持 SOI 精确裁剪的开普勒轨道可视化
│   │   └── ui/                       # UI 面板组件
│   │       ├── TimeControlBar.tsx    # 顶部时间流速控制条（暂停/播放/加速）
│   │       ├── SidebarPanel.tsx      # 左侧实体导航面板（天体/载具分页）
│   │       ├── AddEntityWindow.tsx   # 添加天体/飞船的表单弹窗
│   │       ├── DetailPanelWindow.tsx # 右侧遥测详情面板（轨道六要素实时显示）
│   │       └── SettingsWindow.tsx    # 设置面板（星系切换/语言切换）
│   │
│   ├── hooks/                        # 自定义 React Hooks
│   │   ├── useCameraTracking.ts      # 相机平滑追踪（Pan/Zoom 双阶段插值）
│   │   ├── useSpacebarToggle.ts      # 全局空格键暂停/播放（防输入框误触）
│   │   ├── useTranslation.ts         # i18n 翻译 hook（动态加载语言包）
│   │   └── useNativeDrag.ts          # 原生 DOM 面板拖拽（绕过 React 渲染周期）
│   │
│   ├── utils/                        # 工具函数
│   │   ├── coords.ts                 # 物理坐标系 ↔ Three.js 渲染坐标系变换
│   │   ├── telemetry.ts              # 轨道遥测数据计算（从 WASM 内存推导 Kepler 参数）
│   │   └── formatters.ts             # 数值格式化（距离/时间航天标准格式）
│   │
│   ├── data/                         # 星系配置文件（JSON）
│   │   ├── solar_system.json         # 太阳系预设（太阳/地球/月球/极地探测器）
│   │   └── ksp.json                  # KSP 坎巴拉星系预设
│   │
│   └── locales/                      # 国际化语言包
│       ├── zh.json                   # 中文翻译
│       └── en.json                   # English translation
│
├── VERSION                           # 项目版本号
├── CHANGELOG.md                      # 变更日志
│
└── docs/                             # 项目文档
    ├── rust-api.md                   # Rust 物理引擎 API 参考
    └── react-api.md                  # React 组件与 Hooks API 参考
```

---

## 快速开始

### 环境要求

- **Node.js** ≥ 18
- **Rust** 工具链（[rustup](https://rustup.rs/)）
- **wasm-pack** — `cargo install wasm-pack`

### 1. 构建 WASM 物理引擎

```bash
cd physics-engine
wasm-pack build --target web
cd ..
```

### 2. 安装前端依赖

```bash
npm install
```

### 3. 启动开发服务器

```bash
npm run dev
```

浏览器访问 `http://localhost:5173/`

### 生产构建

```bash
npm run build    # TypeScript 编译 + Vite 打包
npm run preview  # 预览构建产物
```

---

## 使用指南

### 相机操作

| 操作 | 方式 |
|------|------|
| 旋转视角 | 鼠标左键拖拽 |
| 缩放 | 鼠标滚轮 |
| 平移 | 鼠标右键拖拽 |

### 时间控制

- 点击左侧 **▶ / ⏸** 按钮或按**空格键**暂停 / 继续
- 点击三角形加速档位（0.1x → 1,000,000x）切换时间倍率
- 直接在输入框输入自定义倍率

### 天体导航

- 左侧面板显示所有天体与载具，点击列表项跳转追踪
- 直接点击 3D 场景中的天体进入追踪模式
- 追踪模式下相机会自动跟随天体运动

### 添加实体

- 点击左侧面板 **+** 按钮或通过设置面板打开添加窗口
- 选择类型（载具 / 卫星 / 行星）、参考天体、设置轨道参数
- 点击「点火入轨」添加到模拟

### 飞船操作

- 选中飞船后在右侧遥测面板可点火 / 熄火引擎
- 点火后飞船会进行连续推力机动，熄火后恢复纯 Kepler 轨道

### 遥测面板

选中天体后右侧面板实时显示：

| 数据 | 说明 |
|------|------|
| Mass | 质量（kg → t → Kt → Mt → … → Yt → 科学记数法） |
| SMA | 半长轴（负值 = 双曲线逃逸轨道） |
| Apoapsis (Ap) | 远拱点高度 |
| Periapsis (Pe) | 近拱点高度 |
| Eccentricity | 轨道偏心率（≥1 = 逃逸） |
| Altitude | 当前相对参考天体表面高度 |
| Period | 轨道周期 |
| Pos X/Y/Z | 绝对位置坐标（米） |
| Velocity | 相对参考天体速度（m/s） |

---

## 技术架构

```
┌──────────────────────────────────────────────────────────┐
│                    React 前端 (TypeScript)                 │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐ │
│  │  UI 面板层   │  │  3D 渲染层   │  │  状态管理 (Zustand) │ │
│  │  TimeControl │  │  R3F Canvas  │  │  useEngineStore   │ │
│  │  Sidebar     │  │  SolarSystem │  │  useUIStore       │ │
│  │  Telemetry   │  │  OrbitPath   │  └────────┬─────────┘ │
│  └─────────────┘  └──────┬───────┘           │           │
│                          │                    │           │
│               ┌──────────▼────────────────────▼───┐       │
│               │         WASM 共享内存缓冲区         │       │
│               │  Float64Array (pos/vel)            │       │
│               │  Int32Array  (parent indices)      │       │
│               └──────────┬─────────────────────────┘       │
└──────────────────────────┼─────────────────────────────────┘
                           │
┌──────────────────────────▼─────────────────────────────────┐
│              Rust 物理引擎 (wasm-bindgen)                    │
│  ┌─────────────────┐  ┌──────────────────────────────┐     │
│  │ 开普勒方程求解器  │  │  SOI 转移检测与执行           │     │
│  │ - 椭圆 Newton    │  │  - analytical_escape_time()   │     │
│  │ - 双曲线 Newton  │  │  - Brent 法精确求根           │     │
│  │ - 抛物线 Barker  │  │  - 相对坐标 ↔ 绝对坐标转换    │     │
│  └─────────────────┘  └──────────────────────────────┘     │
│  ┌──────────────────────────────────────────────────┐      │
│  │  轨道预测 (predict_patches)                        │      │
│  │  - Patched Conic 多段拼接                         │      │
│  │  - 最多 24 段 × 15000 推演步                      │      │
│  └──────────────────────────────────────────────────┘      │
└────────────────────────────────────────────────────────────┘
```

---

## ⚖️ License & Disclaimer

**Orbit Simulator** is an open-source, non-commercial fan project and educational tool.

### License

The source code is licensed under [Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International (CC BY-NC-SA 4.0)](https://creativecommons.org/licenses/by-nc-sa/4.0/). You are free to download, run locally, study, and modify the code for personal or educational use. **Commercial use is strictly prohibited.** Modified versions must be released under this exact same license.

### Disclaimer

"Kerbal Space Program", "KSP", and all related planetary names (e.g., Kerbin, Mun, Jool), orbital parameters, and terminology are trademarks and copyrights of Take-Two Interactive Software, Inc. and Squad.

This project is an independent creation and is **in no way affiliated with, authorized, maintained, sponsored, or endorsed by Take-Two Interactive or Squad.** All KSP-related data and references are strictly for non-commercial, educational, and transformative purposes to demonstrate orbital mechanics computing.
