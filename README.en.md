# Orbit Simulator

[中文](README.md) | **English**

<p align="left">
  <img src="https://img.shields.io/badge/Rust-CE422B?style=for-the-badge&logo=rust&logoColor=white" alt="Rust">
  <img src="https://img.shields.io/badge/WebAssembly-654FF0?style=for-the-badge&logo=webassembly&logoColor=white" alt="WebAssembly">
  <img src="https://img.shields.io/badge/React-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React">
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/Three.js-000000?style=for-the-badge&logo=threedotjs&logoColor=white" alt="Three.js">
  <img src="https://img.shields.io/badge/Zustand-443E38?style=for-the-badge&logo=react&logoColor=white" alt="Zustand">
  <img src="https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white" alt="Vite">
</p>

An orbital mechanics sandbox simulator based on the **Patched Conic Approximation**. The physics engine is built in Rust and compiled to WebAssembly, with a React + Three.js frontend for 3D visualization.

## Features

- **Realistic Orbital Mechanics** — Analytical solutions to Kepler's equation (elliptic / parabolic / hyperbolic), with precise gravitational constant G computation
- **SOI Boundary Crossing** — Automatic detection and handling of Sphere of Influence transition events, using Brent's method for precise root-finding
- **Orbit Prediction** — Multi-segment Patched Conic path projection for spacecraft, with future orbit visualization
- **[WIP] Spacecraft Maneuvers** — ~~Engine thrust on/off~~, with dynamic switching between analytical mode and numerical integration
- **3D Visualization** — React Three Fiber-based celestial body rendering, orbit line drawing, and free camera control
- **Time Control** — Pausable, with multi-level time acceleration from 0.1× to 1,000,000×
- **Entity Management** — Dynamically add / remove planets, moons, and spacecraft, with custom orbital parameters
- **Telemetry Panel** — Real-time display of selected body's position, velocity, and Keplerian elements (SMA / ECC / Pe / Ap / Period)
- **Bilingual UI** — Chinese / English toggle
- **Multi-system Configurations** — Switch between preset star systems (Solar System, KSP system) via JSON configuration files

---

## File Structure

```
orbit-simulator/
├── index.html                        # Vite entry HTML
├── package.json                      # Frontend dependencies & scripts
├── vite.config.ts                    # Vite build config (React + WASM plugins)
├── tsconfig.json                     # TypeScript config entry
├── tsconfig.app.json                 # App TypeScript config
├── tsconfig.node.json                # Node-side TypeScript config
├── eslint.config.js                  # ESLint rules config
│
├── public/                           # Static assets
│   ├── favicon.svg                   # Site favicon
│   └── icons.svg                     # SVG icon set
│
├── physics-engine/                   # Rust physics engine (WASM)
│   ├── Cargo.toml                    # Rust project config
│   ├── Cargo.lock                    # Dependency lock file
│   └── src/
│       ├── lib.rs                    # Physics engine core (~676 lines)
│       │   ├── Body struct           #   Celestial body data structure
│       │   ├── SOIEvent struct       #   Sphere of Influence transition event
│       │   ├── compute_analytical()  #   Analytical Kepler equation solver
│       │   ├── find_tca()            #   Golden-section search for closest approach
│       │   ├── brents_method()       #   Brent's root-finding algorithm
│       │   ├── analytical_escape_time() # Analytical SOI escape time prediction
│       │   ├── find_first_soi_transition() # SOI transition detection main loop
│       │   ├── execute_soi_transition()    # Execute SOI transition (coordinate transform)
│       │   ├── update_keplerian_at()       # Derive Keplerian params from position/velocity
│       │   ├── compute_all_absolute_states_at() # Recursively compute absolute coordinates
│       │   ├── update_to_time()       #   WASM entry: advance to target time
│       │   ├── predict_patches()      #   WASM entry: spacecraft orbit prediction
│       │   └── get_specific_orbital_energy() # WASM entry: specific orbital energy
│       └── constants.rs              #   Gravitational constant G, iteration params, tolerances
│
├── src/                              # React frontend source
│   ├── main.tsx                      # React app entry
│   ├── App.tsx                       # Root component: 3D canvas + UI overlay layout
│   ├── App.css                       # Global stylesheet (CSS custom properties)
│   ├── index.css                     # Base style reset
│   │
│   ├── store/                        # Zustand state management
│   │   ├── useEngineStore.ts         # Simulation state: bodies, time control, engine refs, AVAILABLE_SYSTEMS
│   │   └── useUIStore.ts             # UI state: selection, modal toggles, language, focus mode
│   │
│   ├── components/                   # React components
│   │   ├── SolarSystem.tsx           # Core 3D: WASM init, physics stepping, mesh sync, telemetry
│   │   ├── SolarSystemHelpers.tsx    # Orbit helpers: static ellipse orbits + spacecraft dynamic prediction
│   │   ├── OrbitPathHelper.tsx       # Orbit line renderer: Keplerian orbit visualization with SOI clipping
│   │   └── ui/                       # UI panel components
│   │       ├── TimeControlBar.tsx    # Top time-rate control bar (pause/play/acceleration)
│   │       ├── SidebarPanel.tsx      # Left entity navigation panel (celestial/vehicle tabs)
│   │       ├── AddEntityWindow.tsx   # Add celestial body / spacecraft form modal
│   │       ├── DetailPanelWindow.tsx # Right telemetry detail panel (Keplerian elements display)
│   │       └── SettingsWindow.tsx    # Settings panel (system switch / language switch)
│   │
│   ├── hooks/                        # Custom React Hooks
│   │   ├── useCameraTracking.ts      # Smooth camera tracking (pan/zoom two-phase interpolation)
│   │   ├── useSpacebarToggle.ts      # Global spacebar pause/play (avoids input focus conflicts)
│   │   ├── useTranslation.ts         # i18n translation hook (dynamic locale loading)
│   │   └── useNativeDrag.ts          # Native DOM panel drag (bypasses React render cycle)
│   │
│   ├── utils/                        # Utility functions
│   │   ├── coords.ts                 # Physics ↔ Three.js rendering coordinate transforms
│   │   ├── telemetry.ts              # Orbital telemetry computation (Kepler params from WASM memory)
│   │   └── formatters.ts             # Numeric formatting (aerospace-standard distance/time)
│   │
│   ├── data/                         # Star system config files (JSON)
│   │   ├── solar_system.json         # Solar System preset (Sun / Earth / Moon / polar probe)
│   │   └── ksp.json                  # KSP Kerbal Space Program system preset
│   │
│   └── locales/                      # i18n language packs
│       ├── zh.json                   # Chinese translation
│       └── en.json                   # English translation
│
├── VERSION                           # Project version
├── CHANGELOG.md                      # Changelog
│
└── docs/                             # Project documentation
    ├── rust-api.md                   # Rust physics engine API reference
    └── react-api.md                  # React component & Hooks API reference
```

---

## Quick Start

### Prerequisites

- **Node.js** ≥ 18
- **Rust** toolchain ([rustup](https://rustup.rs/))
- **wasm-pack** — `cargo install wasm-pack`

### 1. Build the WASM Physics Engine

```bash
cd physics-engine
wasm-pack build --target web
cd ..
```

### 2. Install Frontend Dependencies

```bash
npm install
```

### 3. Start the Dev Server

```bash
npm run dev
```

Open `http://localhost:5173/` in your browser.

### Production Build

```bash
npm run build    # TypeScript compilation + Vite bundling
npm run preview  # Preview the production build
```

---

## Usage Guide

### Camera Controls

| Action | Input |
|--------|-------|
| Rotate view | Left mouse drag |
| Zoom | Mouse wheel |
| Pan | Right mouse drag |

### Time Control

- Click the left **▶ / ⏸** button or press **Space** to pause / play
- Click the acceleration tiers (0.1× → 1,000,000×) to switch time scale
- Type a custom scale directly into the input field

### Body Navigation

- The left panel lists all celestial bodies and vehicles — click to jump and track
- Click a body in the 3D scene to enter tracking mode
- In tracking mode, the camera automatically follows the body's motion

### Adding Entities

- Click the **+** button in the left panel or open the add window via the settings panel
- Select type (Vehicle / Moon / Planet), reference body, and set orbital parameters
- Click "Ignite & Insert" to add to the simulation

### Spacecraft Operations

- After selecting a spacecraft, use the right telemetry panel to ignite / cut off the engine
- While thrusting, the spacecraft performs continuous-burn maneuvers; cutting off restores a pure Keplerian orbit

### Telemetry Panel

The right panel displays real-time data for the selected body:

| Data | Description |
|------|-------------|
| Mass | Mass (kg → t → Kt → Mt → … → Yt → scientific notation) |
| SMA | Semi-major axis (negative = hyperbolic escape trajectory) |
| Apoapsis (Ap) | Apoapsis altitude |
| Periapsis (Pe) | Periapsis altitude |
| Eccentricity | Orbital eccentricity (≥1 = escape) |
| Altitude | Current altitude above reference body surface |
| Period | Orbital period |
| Pos X/Y/Z | Absolute position coordinates (meters) |
| Velocity | Velocity relative to reference body (m/s) |

---

## Technical Architecture

```
┌──────────────────────────────────────────────────────────┐
│                  React Frontend (TypeScript)               │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐ │
│  │  UI Panels   │  │  3D Render   │  │  State (Zustand) │ │
│  │  TimeControl │  │  R3F Canvas  │  │  useEngineStore  │ │
│  │  Sidebar     │  │  SolarSystem │  │  useUIStore      │ │
│  │  Telemetry   │  │  OrbitPath   │  └────────┬─────────┘ │
│  └─────────────┘  └──────┬───────┘           │           │
│                          │                    │           │
│               ┌──────────▼────────────────────▼───┐       │
│               │       WASM Shared Memory Buffer     │       │
│               │  Float64Array (pos/vel)             │       │
│               │  Int32Array  (parent indices)       │       │
│               └──────────┬──────────────────────────┘       │
└──────────────────────────┼─────────────────────────────────┘
                           │
┌──────────────────────────▼─────────────────────────────────┐
│              Rust Physics Engine (wasm-bindgen)              │
│  ┌─────────────────┐  ┌──────────────────────────────┐     │
│  │ Kepler Solver    │  │  SOI Transition Detection    │     │
│  │ - Elliptic Newton│  │  - analytical_escape_time()  │     │
│  │ - Hyperbolic N.  │  │  - Brent's root-finding      │     │
│  │ - Parabolic Bark.│  │  - Relative ↔ Absolute coords│     │
│  └─────────────────┘  └──────────────────────────────┘     │
│  ┌──────────────────────────────────────────────────┐      │
│  │  Orbit Prediction (predict_patches)                │      │
│  │  - Patched Conic multi-segment stitching           │      │
│  │  - Up to 24 segments × 15,000 projection steps     │      │
│  └──────────────────────────────────────────────────┘      │
└────────────────────────────────────────────────────────────┘
```

---

## License & Disclaimer

**Orbit Simulator** is an open-source, non-commercial fan project and educational tool.

### License

The source code is licensed under [Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International (CC BY-NC-SA 4.0)](https://creativecommons.org/licenses/by-nc-sa/4.0/). You are free to download, run locally, study, and modify the code for personal or educational use. **Commercial use is strictly prohibited.** Modified versions must be released under this exact same license.

### Disclaimer

"Kerbal Space Program", "KSP", and all related planetary names (e.g., Kerbin, Mun, Jool), orbital parameters, and terminology are trademarks and copyrights of Take-Two Interactive Software, Inc. and Squad.

This project is an independent creation and is **in no way affiliated with, authorized, maintained, sponsored, or endorsed by Take-Two Interactive or Squad.** All KSP-related data and references are strictly for non-commercial, educational, and transformative purposes to demonstrate orbital mechanics computing.
