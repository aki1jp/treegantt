import { create } from 'zustand';

interface ConnectionStore {
  status: 'connected' | 'connecting' | 'disconnected';
  setStatus: (s: ConnectionStore['status']) => void;
}

export const useConnectionStore = create<ConnectionStore>((set) => ({
  status: 'disconnected',
  setStatus: (status) => set({ status }),
}));
