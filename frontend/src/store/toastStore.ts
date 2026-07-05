import { create } from 'zustand';

export type ToastType = 'error' | 'success' | 'info';

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
}

// 種別ごとの自動消滅までの表示時間（ms）。§9.9 参照。
const TOAST_DURATION_MS: Record<ToastType, number> = {
  error:   6000,
  success: 3000,
  info:    4000,
};

interface ToastStore {
  toasts: ToastItem[];
  addToast: (message: string, type?: ToastType) => string;
  removeToast: (id: string) => void;
  clearToasts: () => void;
}

let nextId = 0;

export const useToastStore = create<ToastStore>()((set, get) => ({
  toasts: [],
  addToast: (message, type = 'error') => {
    const id = `toast-${++nextId}-${Date.now()}`;
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }));
    setTimeout(() => get().removeToast(id), TOAST_DURATION_MS[type]);
    return id;
  },
  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter(t => t.id !== id) })),
  clearToasts: () => set({ toasts: [] }),
}));

// コンポーネント外（hooks/util 層）から手軽に通知するためのヘルパー。
// useTaskStore.getState() 相当のパターンに合わせる。
export function showToast(message: string, type: ToastType = 'error'): void {
  useToastStore.getState().addToast(message, type);
}
