import { create } from 'zustand';

interface UIState {
  selectedBodyId: number | null;
  isCameraTransitioning: boolean;
  isAddModalOpen: boolean;
  language: string;
  isSettingsWindowOpen: boolean;
  focusMode: 'JUMP' | 'TRACK';

  setSelectedBody: (id: number | null) => void;
  setCameraTransitioning: (status: boolean) => void;
  setAddModalOpen: (isOpen: boolean) => void;
  setLanguage: (lang: string) => void;
  setSettingsWindowOpen: (isOpen: boolean) => void;
  setFocusMode: (mode: 'JUMP' | 'TRACK') => void;
}

export const useUIStore = create<UIState>((set) => ({
  selectedBodyId: null,
  isCameraTransitioning: false,
  isAddModalOpen: false,
  language: 'zh',
  isSettingsWindowOpen: false,
  focusMode: 'JUMP',

  setSelectedBody: (id) => set({ selectedBodyId: id }),
  setCameraTransitioning: (status) => set({ isCameraTransitioning: status }),
  setAddModalOpen: (isOpen) => set({ isAddModalOpen: isOpen }),
  setLanguage: (lang) => set({ language: lang }),
  setSettingsWindowOpen: (isOpen) => set({ isSettingsWindowOpen: isOpen }),
  setFocusMode: (mode) => set({ focusMode: mode }),
}));
