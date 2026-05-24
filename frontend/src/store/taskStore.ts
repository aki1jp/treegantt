import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Task, TaskStatus, ZoomLevel } from '../types/task';
import type { GanttPeriod } from '../utils/ganttCalc';
import type { ThemeMode } from '../utils/theme';

export type GanttHeaderLevels = { year: boolean; month: boolean; week: boolean; day: boolean };

interface TaskStore {
  tasks:              Task[];
  needsReload:        boolean;
  sortKey:            keyof Task | '';
  sortDir:            'asc' | 'desc';
  filterStatus:       TaskStatus | '' | '!done';
  filterAssignee:     string;
  filterPriority:     string;
  filterSearch:       string;
  zoomLevel:          ZoomLevel;
  ganttStartDate:     string;
  ganttPeriod:        GanttPeriod;
  showLightningLine:  boolean;
  showWeekend:        boolean;
  showCriticalPath:   boolean;
  showResourceView:   boolean;
  uiFontSize:         number;
  uiRowHeight:        number;
  ganttHeaderLevels:  GanttHeaderLevels;
  theme:              ThemeMode;
  ganttBarOpen:       boolean;
  setTasks:               (tasks: Task[]) => void;
  setNeedsReload:         (v: boolean) => void;
  setSortKey:             (key: keyof Task) => void;
  toggleSortDir:          () => void;
  setFilter:              (filter: Partial<Pick<TaskStore, 'filterStatus' | 'filterAssignee' | 'filterPriority' | 'filterSearch'>>) => void;
  setZoomLevel:           (z: ZoomLevel) => void;
  setGanttRange:          (startDate: string, period: GanttPeriod) => void;
  setShowLightningLine:   (show: boolean) => void;
  setShowWeekend:         (show: boolean) => void;
  setShowCriticalPath:    (show: boolean) => void;
  setShowResourceView:    (show: boolean) => void;
  setUiFontSize:          (size: number) => void;
  setUiRowHeight:         (height: number) => void;
  setGanttHeaderLevels:   (levels: Partial<GanttHeaderLevels>) => void;
  setTheme:               (theme: ThemeMode) => void;
  setGanttBarOpen:        (open: boolean) => void;
}

export const useTaskStore = create<TaskStore>()(
  persist(
    (set) => ({
      tasks:              [],
      needsReload:        false,
      sortKey:            '',
      sortDir:            'asc',
      filterStatus:       '' as TaskStatus | '' | '!done',
      filterAssignee:     '',
      filterPriority:     '',
      filterSearch:       '',
      zoomLevel:          'week',
      ganttStartDate:     '',
      ganttPeriod:        '3m',
      showLightningLine:  true,
      showWeekend:        true,
      showCriticalPath:   false,
      showResourceView:   true,
      uiFontSize:         13,
      uiRowHeight:        36,
      ganttHeaderLevels:  { year: true, month: true, week: true, day: true },
      theme:              'auto' as ThemeMode,
      ganttBarOpen:       true,
      setTasks:               (tasks) => set({ tasks }),
      setNeedsReload:         (needsReload) => set({ needsReload }),
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
      setShowWeekend:         (showWeekend) => set({ showWeekend }),
      setShowCriticalPath:    (showCriticalPath) => set({ showCriticalPath }),
      setShowResourceView:    (showResourceView) => set({ showResourceView }),
      setUiFontSize:          (uiFontSize) => set({ uiFontSize }),
      setUiRowHeight:         (uiRowHeight) => set({ uiRowHeight }),
      setGanttHeaderLevels:   (levels) => set((s) => ({
        ganttHeaderLevels: { ...s.ganttHeaderLevels, ...levels },
      })),
      setTheme:               (theme) => set({ theme }),
      setGanttBarOpen:        (ganttBarOpen) => set({ ganttBarOpen }),
    }),
    {
      name: 'treegantt-ui',
      partialize: (s) => ({
        theme:             s.theme,
        zoomLevel:         s.zoomLevel,
        ganttStartDate:    s.ganttStartDate,
        ganttPeriod:       s.ganttPeriod,
        showLightningLine: s.showLightningLine,
        showWeekend:       s.showWeekend,
        showCriticalPath:  s.showCriticalPath,
        showResourceView:  s.showResourceView,
        uiFontSize:        s.uiFontSize,
        uiRowHeight:       s.uiRowHeight,
        ganttHeaderLevels: s.ganttHeaderLevels,
        ganttBarOpen:      s.ganttBarOpen,
      }),
    },
  ),
);
