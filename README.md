# Orbit Simulator

## Prerequisites
Ensure you have the following installed on your system:
- **Node.js** (v18 or higher)
- **Rust** & **Cargo** (for the physics engine)
- **wasm-pack** (install via `cargo install wasm-pack`)

## Getting Started

Follow these steps to build the WebAssembly module and start the local development server:

**1. Build the Physics Engine (WASM)**
Navigate to the directory containing your Rust `Cargo.toml` and build the WebAssembly module:

```bash
# Assuming the rust code is in a folder named 'physics-engine'
# cd physics-engine 
wasm-pack build --target web
```

**2. Install Frontend Dependencies**
Return to the root directory of the frontend project and install the required npm packages:

```bash
npm install
```

**3. Start the Development Server**
Launch the Vite development server:

```bash
npm run dev
```

The application will now be running at `http://localhost:5173/` 

## ⚖️ License & Disclaimer

**Orbit Simulator** is an open-source, non-commercial fan project and educational tool.

### License
The source code of this project is licensed under the [Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International License (CC BY-NC-SA 4.0)](https://creativecommons.org/licenses/by-nc-sa/4.0/). 
You are totally free to download, run locally, study, and modify the code for personal or educational use. However, **commercial use of this engine or its source code is strictly prohibited.** If you distribute modified versions, you must release them under this exact same license.

### Disclaimer
"Kerbal Space Program", "KSP", and all related planetary names (e.g., Kerbin, Mun, Jool), orbital parameters, and terminology are trademarks and copyrights of Take-Two Interactive Software, Inc. and Squad. 

This project is an independent creation and is **in no way affiliated with, authorized, maintained, sponsored, or endorsed by Take-Two Interactive or Squad.** All KSP-related data and references used within this sandbox are strictly for non-commercial, educational, and transformative purposes to demonstrate orbital mechanics computing.