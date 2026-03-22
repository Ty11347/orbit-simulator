// src/store/useEngineStore.ts
import { create } from 'zustand';

// 采用严格航天命名规范的接口
export interface CelestialBody {
  id: number;
  name: string;
  radius: number;
  color: string;
  isStar?: boolean;
  type: 'STAR' | 'PLANET' | 'SATELLITE' | 'VEHICLE';

  // 核心物理与开普勒参数
  MASS: number;  // 质量
  SMA: number;   // 半长轴 (Semi-Major Axis)
  ECC: number;   // 偏心率 (Eccentricity)
  INC: number;   // 轨道倾角 (Inclination)
  LAN: number;   // 升交点赤经 (Longitude of Ascending Node)
  AOP: number;   // 近星点幅角 (Argument of Periapsis)
  M0: number;    // 初始平近点角 (Mean Anomaly at Epoch)

  parentId: number; // -1 表示为系统中心
}

const defaultBodies: CelestialBody[] = [
  { id: 0, name: '太阳', type: 'STAR', radius: 1.5, color: '#ffcc00', MASS: 10000, SMA: 0, ECC: 0, INC: 0, LAN: 0, AOP: 0, M0: 0, parentId: -1, isStar: true },
  { id: 1, name: '地球', type: 'PLANET', radius: 0.5, color: '#2b52ff', MASS: 100, SMA: 25, ECC: 0.1, INC: 0, LAN: 0, AOP: 0, M0: 0, parentId: 0 },
  { id: 2, name: '月球', type: 'SATELLITE', radius: 0.2, color: '#cccccc', MASS: 1, SMA: 4, ECC: 0.05, INC: 0.2, LAN: 0, AOP: 0, M0: 0, parentId: 1 },
  { id: 3, name: '极地探测器', type: 'VEHICLE', radius: 0.05, color: '#ff2b2b', MASS: 0.01, SMA: 1.2, ECC: 0, INC: 1.57, LAN: 0, AOP: 0, M0: 0, parentId: 2 },
];

export const TIME_TIERS = [0.1, 1, 5, 50, 200, 1000, 10000, 100000, 1000000];

interface EngineState {
  timeTierIndex: number; // 当前处于第几档
  timeScale: number;     // 具体的倍数
  isPaused: boolean;

  bodies: CelestialBody[];
  nextId: number;        // 严格递增的序列号
  systemVersion: number; // 数据版本号，用于通知渲染器触发重构

  selectedBodyId: number | null;
  isCameraTransitioning: boolean;

  isAddModalOpen: boolean;

  setTimeTierIndex: (index: number) => void; // 直接设置档位 (点击三角形)
  setCustomTimeScale: (scale: number) => void; // 自定义输入倍数
  togglePause: () => void;
  addBody: (body: Omit<CelestialBody, 'id'>) => void;
  deleteBody: (id: number) => void; // 新增：级联删除
  setSelectedBody: (id: number | null) => void;
  setCameraTransitioning: (status: boolean) => void;
  setAddModalOpen: (isOpen: boolean) => void; // 新增：开关面板方法
}

export const useEngineStore = create<EngineState>((set) => ({
  timeTierIndex: 1, // 默认 1x
  timeScale: TIME_TIERS[1],
  isPaused: false,

  bodies: defaultBodies,
  nextId: 4, // 已经用掉了 0,1,2,3
  systemVersion: 0,

  selectedBodyId: null,
  isCameraTransitioning: false,

  isAddModalOpen: false,

  setTimeTierIndex: (index) => set({
    timeTierIndex: index,
    timeScale: TIME_TIERS[index]
  }),

  // 【新增】：自定义输入时间倍率
  setCustomTimeScale: (scale) => set({
    timeScale: scale,
    timeTierIndex: -1 // -1 表示当前为自定义倍率，三角形全灭或特殊显示
  }),

  togglePause: () => set((state) => ({ isPaused: !state.isPaused })),

  addBody: (bodyData) => set((state) => ({
    bodies: [...state.bodies, { ...bodyData, id: state.nextId }],
    nextId: state.nextId + 1,
    systemVersion: state.systemVersion + 1
  })),

  // 【极其硬核的算法】：级联删除
  deleteBody: (targetId) => set((state) => {
    if (targetId === 0) return state; // 保护机制：太阳不能删！

    // 1. 找出所有需要被连坐删除的后代 ID (广度优先遍历思想)
    const idsToDelete = new Set<number>([targetId]);
    let lastSize = 0;
    while (idsToDelete.size > lastSize) {
      lastSize = idsToDelete.size;
      state.bodies.forEach(b => {
        if (idsToDelete.has(b.parentId)) idsToDelete.add(b.id);
      });
    }

    // 2. 过滤掉这些天体
    const newBodies = state.bodies.filter(b => !idsToDelete.has(b.id));

    // 3. 如果当前摄像机锁定的天体被炸了，解除锁定
    const newSelected = idsToDelete.has(state.selectedBodyId as number) ? null : state.selectedBodyId;

    return {
      bodies: newBodies,
      selectedBodyId: newSelected,
      systemVersion: state.systemVersion + 1 // 触发底层重建
    };
  }),

  setSelectedBody: (id) => set({ selectedBodyId: id }),
  setCameraTransitioning: (status) => set({ isCameraTransitioning: status }),
  setAddModalOpen: (isOpen) => set({ isAddModalOpen: isOpen }),
}));