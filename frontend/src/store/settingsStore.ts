import { create } from 'zustand';
import type { AppSettings } from '../types/task';
import { HARDCODED_CAPACITY_MINUTES, HARDCODED_WORKING_DAYS } from '../utils/duration';

// リソース設定（アプリ既定）は localStorage に載せず、サーバ（/settings）を真実として
// メモリに保持する。起動時に取得して満たす（失敗時はハードコード既定のまま）。
interface SettingsStore {
  appSettings: AppSettings;
  setAppSettings: (s: AppSettings) => void;
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  appSettings: {
    capacityMinutesPerDay: HARDCODED_CAPACITY_MINUTES,
    workingDays: HARDCODED_WORKING_DAYS,
  },
  setAppSettings: (appSettings) => set({ appSettings }),
}));
