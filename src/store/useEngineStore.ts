// src/store/useEngineStore.ts
import { create } from 'zustand';
// 使用 Vite 特性自动导入 data 目录下所有的 .json 文件 (eager: true 表示直接解析 JSON 内容)
const rawDataModules = import.meta.glob('../data/*.json', { eager: true });

// 随便抓取扫描到的第一个 JSON 作为默认的初始宇宙，如果没有就给个空数组
const defaultSystemKey = Object.keys(rawDataModules)[0];
const defaultSolarSystem = defaultSystemKey 
  ? (rawDataModules[defaultSystemKey] as any).default 
  : [];

// 采用严格航天命名规范的接口
export interface CelestialBody {
  id: number;
  name: string;
  radius: number;
  color: string;
  isStar?: boolean;
  type: 'STAR' | 'PLANET' | 'SATELLITE' | 'VEHICLE';

  // 核心物理与开普勒参数
  MASS: number;  
  SMA: number;   
  ECC: number;   
  INC: number;   
  LAN: number;   
  AOP: number;   
  M0: number;    
  parentId: number; 
  soiRadius: number;
  isBurning?: boolean;
}

export const TIME_TIERS = [0.1, 1, 5, 50, 200, 1000, 10000, 100000, 1000000];

interface EngineState {
  timeTierIndex: number; 
  timeScale: number;     
  isPaused: boolean;
  bodies: CelestialBody[];
  nextId: number;        
  systemVersion: number; 
  selectedBodyId: number | null;
  isCameraTransitioning: boolean;
  isAddModalOpen: boolean;
  language: string; 
  isSettingsWindowOpen: boolean;
  focusMode: 'JUMP' | 'TRACK';
  

  setTimeTierIndex: (index: number) => void; 
  setCustomTimeScale: (scale: number) => void; 
  togglePause: () => void;
  addBody: (body: Omit<CelestialBody, 'id'>) => void;
  deleteBody: (id: number) => void; 
  setSelectedBody: (id: number | null) => void;
  setCameraTransitioning: (status: boolean) => void;
  setAddModalOpen: (isOpen: boolean) => void; 
  loadSystem: (newBodies: CelestialBody[]) => void;
  setLanguage: (lang: string) => void;
  setSettingsWindowOpen: (isOpen: boolean) => void;
  toggleBurn: (id: number) => void;
  setFocusMode: (mode: 'JUMP' | 'TRACK') => void;

  engineData: { posPtr: number, velPtr: number, localVelPtr: number, parentPtr: number, count: number, memory: WebAssembly.Memory | null };
  setEngineData: (data: { posPtr: number, velPtr: number, localVelPtr: number, parentPtr: number, count: number, memory: WebAssembly.Memory | null }) => void;
}

export const useEngineStore = create<EngineState>((set) => ({
  timeTierIndex: 1, 
  timeScale: TIME_TIERS[1],
  isPaused: false,

  // 动态读取 JSON，并自动计算出安全的 nextId
  bodies: defaultSolarSystem as CelestialBody[],
  nextId: Math.max(...(defaultSolarSystem as CelestialBody[]).map(b => b.id), 0) + 1,
  systemVersion: 0,

  selectedBodyId: null,
  isCameraTransitioning: false,
  isAddModalOpen: false,
  language: 'zh',
  isSettingsWindowOpen: false,
  focusMode: 'JUMP',
  setFocusMode: (mode) => set({ focusMode: mode }),
  

  setTimeTierIndex: (index) => set({
    timeTierIndex: index,
    timeScale: TIME_TIERS[index]
  }),

  setCustomTimeScale: (scale) => set({
    timeScale: scale,
    timeTierIndex: -1 
  }),
  setLanguage: (lang) => set({ language: lang }),

  togglePause: () => set((state) => ({ isPaused: !state.isPaused })),

  toggleBurn: (id) => set((state) => ({
    bodies: state.bodies.map(b => b.id === id ? { ...b, isBurning: !b.isBurning } : b)
  })),

  addBody: (bodyData) => set((state) => ({
    bodies: [...state.bodies, { ...bodyData, id: state.nextId, soiRadius: bodyData.soiRadius || 0, isBurning: false }],
    nextId: state.nextId + 1,
    systemVersion: state.systemVersion + 1
  })),

  setSettingsWindowOpen: (isOpen) => set({ isSettingsWindowOpen: isOpen }),

  deleteBody: (targetId) => set((state) => {
    if (targetId === 0) return state; 
    const idsToDelete = new Set<number>([targetId]);
    let lastSize = 0;
    while (idsToDelete.size > lastSize) {
      lastSize = idsToDelete.size;
      state.bodies.forEach(b => {
        if (idsToDelete.has(b.parentId)) idsToDelete.add(b.id);
      });
    }
    const newBodies = state.bodies.filter(b => !idsToDelete.has(b.id));
    const newSelected = idsToDelete.has(state.selectedBodyId as number) ? null : state.selectedBodyId;

    return {
      bodies: newBodies,
      selectedBodyId: newSelected,
      systemVersion: state.systemVersion + 1 
    };
  }),

  setSelectedBody: (id) => set({ selectedBodyId: id }),
  setCameraTransitioning: (status) => set({ isCameraTransitioning: status }),
  setAddModalOpen: (isOpen) => set({ isAddModalOpen: isOpen }),

  // 【新增逻辑】：清空现有宇宙，强行注入新数据，并重置焦点
  loadSystem: (newBodies) => set((state) => ({
    bodies: newBodies,
    selectedBodyId: null,
    nextId: Math.max(...newBodies.map(b => b.id), 0) + 1,
    systemVersion: state.systemVersion + 1
  })),

  engineData: { posPtr: 0, velPtr: 0, localVelPtr: 0, parentPtr: 0, count: 0, memory: null },
  setEngineData: (data) => set({ engineData: data }),
}));