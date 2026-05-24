// src/store/useEngineStore.ts
import { create } from 'zustand';

const rawDataModules = import.meta.glob('../data/*.json', { eager: true });

const defaultSystemKey = Object.keys(rawDataModules)[0];
const defaultSolarSystem = defaultSystemKey
  ? (rawDataModules[defaultSystemKey] as any).default
  : [];

export const AVAILABLE_SYSTEMS: Record<string, any> = {};

Object.keys(rawDataModules).forEach((path) => {
  const fileName = path.split('/').pop()?.replace('.json', '') || 'unknown';
  AVAILABLE_SYSTEMS[fileName] = (rawDataModules[path] as any).default;
});

export interface CelestialBody {
  id: number;
  name: string;
  radius: number;
  color: string;
  isStar?: boolean;
  type: 'STAR' | 'PLANET' | 'SATELLITE' | 'VEHICLE';

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

  setTimeTierIndex: (index: number) => void;
  setCustomTimeScale: (scale: number) => void;
  togglePause: () => void;
  addBody: (body: Omit<CelestialBody, 'id'>) => void;
  deleteBody: (id: number) => number | null;
  loadSystem: (newBodies: CelestialBody[]) => void;
  toggleBurn: (id: number) => void;
  syncBodyParent: (updates: Array<{ id: number; parentId: number; sma: number; ecc: number; inc: number; lan: number; aop: number }>) => void;

  engineData: { posPtr: number; velPtr: number; localVelPtr: number; parentPtr: number; count: number; memory: WebAssembly.Memory | null };
  setEngineData: (data: { posPtr: number; velPtr: number; localVelPtr: number; parentPtr: number; count: number; memory: WebAssembly.Memory | null }) => void;
}

export const useEngineStore = create<EngineState>((set) => ({
  timeTierIndex: 1,
  timeScale: TIME_TIERS[1],
  isPaused: false,

  bodies: defaultSolarSystem as CelestialBody[],
  nextId: Math.max(...(defaultSolarSystem as CelestialBody[]).map((b: CelestialBody) => b.id), 0) + 1,
  systemVersion: 0,

  setTimeTierIndex: (index) => set({
    timeTierIndex: index,
    timeScale: TIME_TIERS[index],
  }),

  setCustomTimeScale: (scale) => set({
    timeScale: scale,
    timeTierIndex: -1,
  }),

  togglePause: () => set((state) => ({ isPaused: !state.isPaused })),

  toggleBurn: (id) => set((state) => ({
    bodies: state.bodies.map(b => b.id === id ? { ...b, isBurning: !b.isBurning } : b),
  })),

  addBody: (bodyData) => set((state) => ({
    bodies: [...state.bodies, { ...bodyData, id: state.nextId, soiRadius: bodyData.soiRadius || 0, isBurning: false }],
    nextId: state.nextId + 1,
    systemVersion: state.systemVersion + 1,
  })),

  deleteBody: (targetId) => {
    let deletedSelectedId: number | null = null;
    set((state) => {
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
      deletedSelectedId = targetId;
      return {
        bodies: newBodies,
        systemVersion: state.systemVersion + 1,
      };
    });
    return deletedSelectedId;
  },

  loadSystem: (newBodies) => set((state) => ({
    bodies: newBodies,
    nextId: Math.max(...newBodies.map(b => b.id), 0) + 1,
    systemVersion: state.systemVersion + 1,
  })),

  syncBodyParent: (updates) => set((state) => {
    if (updates.length === 0) return state;
    const updateMap = new Map(updates.map(u => [u.id, u]));
    return {
      bodies: state.bodies.map(b => {
        const u = updateMap.get(b.id);
        if (!u) return b;
        return { ...b, parentId: u.parentId, SMA: u.sma, ECC: u.ecc, INC: u.inc, LAN: u.lan, AOP: u.aop };
      }),
    };
  }),

  engineData: { posPtr: 0, velPtr: 0, localVelPtr: 0, parentPtr: 0, count: 0, memory: null },
  setEngineData: (data) => set({ engineData: data }),
}));
