import { create } from 'zustand';
import type { Task, TaskStatus, ZoomLevel } from '../types/task';

interface TaskStore {
  tasks:          Task[];
  sortKey:        keyof Task | '';
  sortDir:        'asc' | 'desc';
  filterStatus:   TaskStatus | '';
  filterAssignee: string;
  filterPriority: string;
  zoomLevel:      ZoomLevel;
  setTasks:       (tasks: Task[]) => void;
  setSortKey:     (key: keyof Task) => void;
  toggleSortDir:  () => void;
  setFilter:      (filter: Partial<Pick<TaskStore, 'filterStatus' | 'filterAssignee' | 'filterPriority'>>) => void;
  setZoomLevel:   (z: ZoomLevel) => void;
}

export const useTaskStore = create<TaskStore>((set) => ({
  tasks:          [],
  sortKey:        '',
  sortDir:        'asc',
  filterStatus:   '',
  filterAssignee: '',
  filterPriority: '',
  zoomLevel:      'week',
  setTasks:       (tasks) => set({ tasks }),
  setSortKey:     (key) =>
    set((s) => ({
      sortKey: key,
      sortDir: s.sortKey === key && s.sortDir === 'asc' ? 'desc' : 'asc',
    })),
  toggleSortDir:  () => set((s) => ({ sortDir: s.sortDir === 'asc' ? 'desc' : 'asc' })),
  setFilter:      (filter) => set((s) => ({ ...s, ...filter })),
  setZoomLevel:   (zoomLevel) => set({ zoomLevel }),
}));
