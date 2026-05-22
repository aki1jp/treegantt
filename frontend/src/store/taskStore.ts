import { create } from 'zustand';
import type { Task, TaskStatus, ZoomLevel } from '../types/task';
import type { GanttPeriod } from '../utils/ganttCalc';

export type GanttHeaderLevels = { year: boolean; month: boolean; week: boolean; day: boolean };

interface TaskStore {
  tasks:              Task[];
  sortKey:            keyof Task | '';
  sortDir:            'asc' | 'desc';
  filterStatus:       TaskStatus | '';
  filterAssignee:     string;
  filterPriority:     string;
  zoomLevel:          ZoomLevel;
  ganttStartDate:     string;
  ganttPeriod:        GanttPeriod;
  showLightningLine:  boolean;
  ganttHeaderLevels:  GanttHeaderLevels;
  setTasks:               (tasks: Task[]) => void;
  setSortKey:             (key: keyof Task) => void;
  toggleSortDir:          () => void;
  setFilter:              (filter: Partial<Pick<TaskStore, 'filterStatus' | 'filterAssignee' | 'filterPriority'>>) => void;
  setZoomLevel:           (z: ZoomLevel) => void;
  setGanttRange:          (startDate: string, period: GanttPeriod) => void;
  setShowLightningLine:   (show: boolean) => void;
  setGanttHeaderLevels:   (levels: Partial<GanttHeaderLevels>) => void;
}

export const useTaskStore = create<TaskStore>((set) => ({
  tasks:              [],
  sortKey:            '',
  sortDir:            'asc',
  filterStatus:       '',
  filterAssignee:     '',
  filterPriority:     '',
  zoomLevel:          'week',
  ganttStartDate:     '',
  ganttPeriod:        '3m',
  showLightningLine:  true,
  ganttHeaderLevels:  { year: true, month: true, week: true, day: true },
  setTasks:               (tasks) => set({ tasks }),
  setSortKey:             (key) =>
    set((s) => ({
      sortKey: key,
      sortDir: s.sortKey === key && s.sortDir === 'asc' ? 'desc' : 'asc',
    })),
  toggleSortDir:          () => set((s) => ({ sortDir: s.sortDir === 'asc' ? 'desc' : 'asc' })),
  setFilter:              (filter) => set((s) => ({ ...s, ...filter })),
  setZoomLevel:           (zoomLevel) => set({ zoomLevel }),
  setGanttRange:          (ganttStartDate, ganttPeriod) => set({ ganttStartDate, ganttPeriod }),
  setShowLightningLine:   (showLightningLine) => set({ showLightningLine }),
  setGanttHeaderLevels:   (levels) => set((s) => ({
    ganttHeaderLevels: { ...s.ganttHeaderLevels, ...levels },
  })),
}));
