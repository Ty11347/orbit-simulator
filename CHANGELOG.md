# Changelog

All notable changes to this project will be documented in this file.

---

## [0.3.1] - 2026-05-24

### Changed
- 非载具天体（行星/卫星/恒星）轨道参数直接从 JS body 读取 JSON 存储值，不再每帧从 WASM 位置/速度反推，彻底消除浮点反推导致的帧间数值微跳

## [0.3.0] - 2026-05-24

### Fixed
- **Rust 物理引擎 m0 符号错误**：`add_body` 中对平近点角的历元调整为减号 `m0 - n*t`，应为加号 `m0 + n*t`。每次 `clear()`+`add_body()` 重建引擎后，所有天体轨道位置偏移 `-2*n*t` 弧度。删除天体后父天体 Pe/Ap 因此出现微小但可见的变化

## [0.2.9] - 2026-05-24

### Fixed
- 删除天体后遥测索引错位：新增 `engine.get_bodies_count() === currentBodies.length` 一致性校验。删除后 JS 数组立即缩短但 WASM 引擎未重建，JS bodyIndex 指向 WASM 中不同天体，导致选中天体的遥测显示其他天体的数据（"闪动"的根源）

## [0.2.8] - 2026-05-24

### Fixed
- 回退 memo+getElementById 方案，恢复普通 ref + JSX "--" 子元素。React VDOM reconciliation 不会覆盖未变化的 `"--"` → `"--"`，rAF innerText 修改可安全持久化。挂载时同步读取 telemetryRef 零延迟填充

## [0.2.7] - 2026-05-24

### Fixed
- 遥测闪动根因：null→挂载路径。值 span 改为 `React.memo(…, ()=>true)` 永不重渲染，"--" 仅首次挂载写入；挂载时同步读取 telemetryRef 零延迟填充（若已就绪），消除空→数据跳变

## [0.2.6] - 2026-05-24

### Fixed
- 遥测闪动全面加固：WASM 重建后 clearTelemetry 清空残值；systemVersion 版本锁校验引擎一致性；engineDataInitialized 双重校验

## [0.2.5] - 2026-05-24

### Fixed
- useFrame 遥测计算改为从 store 实时读取 selectedBodyId 和 bodies（getState），消除 React 闭包滞后

## [0.2.4] - 2026-05-24

### Fixed
- 遥测面板闪动根因修复：JSX 中 telemetry span 改为空元素，杜绝 React 重渲染覆盖 rAF 写入值

## [0.2.3] - 2026-05-24

### Fixed
- 删除天体后立即切换目标遥测面板闪动：切换时立即重置所有 DOM ref 为占位符（该方案已由 0.2.4 替代）

## [0.2.2] - 2026-05-24

### Fixed
- 删除天体后切换选中目标时遥测面板概率闪动：`TelemetryData` 新增 `bodyId` 字段，rAF 循环校验数据归属后再渲染

---

## [0.2.1] - 2026-05-24

### Changed
- 新增 `formatSpeed`：速度动态单位（m/s → km/s → Mm/s → 科学记数法）
- 质量单位精简：移除 Yt / Zt / Et，≥ 10²¹ 使用科学记数法（底数基于 Pt）
- 距离 `formatUnit`：≥ 10¹² m 新增科学记数法（底数基于 Gm）
- 科学记数法统一：底数基于最高层级单位（速度用 Mm/s，质量用 Pt，距离用 Gm），Unicode 上标表示指数

---

## [0.2.0] - 2026-05-24

### Changed
- 全面 i18n 覆盖：所有 UI 文本元素均通过 `t()` 读取语言包
- 语言包扩展至 55 个 key，覆盖遥测标签、轨道参数名、引擎按钮、时间控制、设置按钮
- DetailPanelWindow：JSX 标签 + innerText 动态值均国际化；静态翻译字符串通过 `i18nRef` 注入 rAF 循环
- TimeControlBar 播放/暂停按钮国际化
- App.tsx 设置按钮国际化

---

## [0.1.1] - 2026-05-24

### Fixed
- 删除天体后遥测面板属性闪动：`engineData` 指针刷新顺序修正（先刷新指针再计算遥测），WASM 重建后重置 `engineDataInitialized` 标志位

---

## [0.1.0] - 2026-05-24

### Added
- 项目版本号文件 `VERSION` 与变更日志 `CHANGELOG.md`
- Rust `get_body_kepler` 方法，暴露天体当前 Kepler 参数
- `useEngineStore.syncBodyParent` action，支持 SOI 过渡后同步父天体与轨道参数
- `formatMass` 质量格式化函数，SI 前缀 + 科学记数法动态单位

### Changed
- 质量显示从固定 `toFixed(2) kg` 改为动态单位（kg → t → Kt → Mt → Gt → Tt → Pt → Et → Zt → Yt → 科学记数法）
- 遥测面板 `useEffect` 不再依赖 `bodies` 数组，避免删除天体时数据闪动

### Fixed
- SOI 过渡后 JS 端 `parentId` 与 Kepler 参数不再与 WASM 引擎不同步
- 遥测面板删除天体后切换到其他天体时显示数据闪动
