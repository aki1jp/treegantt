import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Task, TaskStatus, ZoomLevel } from '../types/task';
import type { GanttPeriod, DepArrowStyle } from '../utils/ganttCalc';
import type { ThemeMode } from '../utils/theme';

export type GanttHeaderLevels = { year: boolean; month: boolean; week: boolean; day: boolean };

interface TaskStore {
  tasks:              Task[];
  needsReload:        boolean;
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
  wbsPanelOpen:       boolean;
  wbsHiddenCols:      string[];
  depArrowStyle:      DepArrowStyle;
  setTasks:               (tasks: Task[]) => void;
  setNeedsReload:         (v: boolean) => void;
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
  setWbsPanelOpen:        (open: boolean) => void;
  setWbsHiddenCols:       (cols: string[]) => void;
  setDepArrowStyle:       (s: DepArrowStyle) => void;
  resetUi:                () => void;
}

const uiInitialState = {
  zoomLevel:         'day' as ZoomLevel,
  ganttStartDate:    '',
  ganttPeriod:       '3m' as GanttPeriod,
  showLightningLine: true,
  showWeekend:       true,
  showCriticalPath:  false,
  showResourceView:  false,
  uiFontSize:        13,
  uiRowHeight:       36,
  ganttHeaderLevels: { year: false, month: true, week: false, day: true } as GanttHeaderLevels,
  depArrowStyle:     'bezier' as DepArrowStyle,
};

export const useTaskStore = create<TaskStore>()(
  persist(
    (set) => ({
      tasks:             [],
      needsReload:       false,
      filterStatus:      '' as TaskStatus | '' | '!done',
      filterAssignee:    '',
      filterPriority:    '',
      filterSearch:      '',
      theme:             'auto' as ThemeMode,
      ganttBarOpen:      true,
      wbsPanelOpen:      true,
      wbsHiddenCols:     [] as string[],
      ...uiInitialState,
      setTasks:               (tasks) => set({ tasks }),
      setNeedsReload:         (needsReload) => set({ needsReload }),
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
      setWbsPanelOpen:        (wbsPanelOpen) => set({ wbsPanelOpen }),
      setWbsHiddenCols:       (wbsHiddenCols) => set({ wbsHiddenCols }),
      setDepArrowStyle:       (depArrowStyle) => set({ depArrowStyle }),
      resetUi:                () => set(uiInitialState),
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
        wbsPanelOpen:      s.wbsPanelOpen,
        wbsHiddenCols:     s.wbsHiddenCols,
        depArrowStyle:     s.depArrowStyle,
      }),
    },
  ),
);
