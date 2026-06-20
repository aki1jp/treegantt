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
  showTodayLine:      boolean;
  showMilestones:     boolean;
  milestoneHighlightColor: string;
  uiFontSize:         number;
  uiRowHeight:        number;
  resourceViewHeight: number;
  ganttHeaderLevels:  GanttHeaderLevels;
  theme:              ThemeMode;
  ganttBarOpen:       boolean;
  wbsPanelOpen:       boolean;
  wbsHiddenCols:      string[];
  depArrowStyle:      DepArrowStyle;
  setTasks:               (tasks: Task[]) => void;
  upsertTask:             (task: Task) => void;
  removeTasks:            (ids: string[]) => void;
  applyOrders:            (orders: { id: string; order: number; parentId?: string | null }[]) => void;
  setNeedsReload:         (v: boolean) => void;
  setFilter:              (filter: Partial<Pick<TaskStore, 'filterStatus' | 'filterAssignee' | 'filterPriority' | 'filterSearch'>>) => void;
  setZoomLevel:           (z: ZoomLevel) => void;
  setGanttRange:          (startDate: string, period: GanttPeriod) => void;
  setShowLightningLine:   (show: boolean) => void;
  setShowWeekend:         (show: boolean) => void;
  setShowCriticalPath:    (show: boolean) => void;
  setShowResourceView:    (show: boolean) => void;
  setShowTodayLine:       (show: boolean) => void;
  setShowMilestones:      (show: boolean) => void;
  setMilestoneHighlightColor:  (color: string) => void;
  setUiFontSize:          (size: number) => void;
  setUiRowHeight:         (height: number) => void;
  setResourceViewHeight:  (height: number) => void;
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
  showTodayLine:     true,
  showMilestones:    true,
  milestoneHighlightColor: '#8b5cf6',
  uiFontSize:        13,
  uiRowHeight:       36,
  resourceViewHeight: 220,
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
      // 差分適用アクション（v2.63）: 全置換を避け、未変更タスクの参照を維持して
      // React.memo 行コンポーネントの再レンダリングを最小化する
      upsertTask:             (task) => set((s) => ({
        tasks: s.tasks.some(t => t.id === task.id)
          ? s.tasks.map(t => (t.id === task.id ? task : t))
          : [...s.tasks, task],
      })),
      removeTasks:            (ids) => set((s) => {
        const removed = new Set(ids);
        return {
          tasks: s.tasks
            .filter(t => !removed.has(t.id))
            // 削除タスクへの依存（predecessors）も残存タスクから除去（DB側は CASCADE 済み）
            .map(t => t.predecessors.some(p => removed.has(p))
              ? { ...t, predecessors: t.predecessors.filter(p => !removed.has(p)) }
              : t),
        };
      }),
      applyOrders:            (orders) => set((s) => {
        const orderMap  = new Map(orders.map(o => [o.id, o.order]));
        const parentMap = new Map(orders.filter(o => o.parentId !== undefined).map(o => [o.id, o.parentId ?? null]));
        return {
          tasks: s.tasks.map(t => {
            if (!orderMap.has(t.id)) return t;
            const updated: Task = { ...t, order: orderMap.get(t.id)! };
            if (parentMap.has(t.id)) updated.parentId = parentMap.get(t.id) ?? null;
            return updated;
          }),
        };
      }),
      setNeedsReload:         (needsReload) => set({ needsReload }),
      setFilter:              (filter) => set((s) => ({ ...s, ...filter })),
      setZoomLevel:           (zoomLevel) => set({ zoomLevel }),
      setGanttRange:          (ganttStartDate, ganttPeriod) => set({ ganttStartDate, ganttPeriod }),
      setShowLightningLine:   (showLightningLine) => set({ showLightningLine }),
      setShowWeekend:         (showWeekend) => set({ showWeekend }),
      setShowCriticalPath:    (showCriticalPath) => set({ showCriticalPath }),
      setShowResourceView:    (showResourceView) => set({ showResourceView }),
      setShowTodayLine:       (showTodayLine) => set({ showTodayLine }),
      setShowMilestones:      (showMilestones) => set({ showMilestones }),
      setMilestoneHighlightColor:  (milestoneHighlightColor) => set({ milestoneHighlightColor }),
      setUiFontSize:          (uiFontSize) => set({ uiFontSize }),
      setUiRowHeight:         (uiRowHeight) => set({ uiRowHeight }),
      setResourceViewHeight:  (resourceViewHeight) => set({ resourceViewHeight }),
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
        showTodayLine:      s.showTodayLine,
        showMilestones:     s.showMilestones,
        milestoneHighlightColor: s.milestoneHighlightColor,
        uiFontSize:        s.uiFontSize,
        uiRowHeight:       s.uiRowHeight,
        resourceViewHeight: s.resourceViewHeight,
        ganttHeaderLevels: s.ganttHeaderLevels,
        ganttBarOpen:      s.ganttBarOpen,
        wbsPanelOpen:      s.wbsPanelOpen,
        wbsHiddenCols:     s.wbsHiddenCols,
        depArrowStyle:     s.depArrowStyle,
      }),
    },
  ),
);
