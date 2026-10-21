import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Task, TaskStatus, ZoomLevel, RefProject } from '../types/task';
import type { GanttPeriod, DepArrowStyle } from '../utils/ganttCalc';
import type { ThemeMode } from '../utils/theme';
import { DEFAULT_WBS_COL_WIDTHS, sanitizeWbsColWidths } from '../utils/wbsLayout';

export type GanttHeaderLevels = { year: boolean; month: boolean; week: boolean; day: boolean };

interface TaskStore {
  tasks:              Task[];
  // `tasks` が「どのプロジェクトのタスクか」。全置換（setTasks に ownerProjectId を渡す）と同時に更新し、
  // 省略時・upsert 等の部分更新では変えない。読み出し側（useProjectTaskData）は現在プロジェクトと一致するときだけ
  // 実データを使う（切替中に旧タスクが参照扱いで描画される問題の対策）。非永続（partialize に含めない）。
  tasksOwnerProjectId: string | null;
  // クロスプロジェクト参照（§5.8）: 現プロジェクトの `tasks` とは分離した非永続スロット。
  // setTasks の全置換・WS 反映・フィルタ処理との干渉を避けるため（partialize に含めない）。
  refTasks:           Task[];
  refProjects:        RefProject[];
  // refTasks/refProjects が「どのプロジェクトのために取得したデータか」。setRefData と必ず同時更新し、
  // 読み出し側（useRefData）は現在プロジェクトと一致するときだけ実データを使う（stale データ混入対策）。
  refOwnerProjectId:  string | null;
  needsReload:        boolean;
  filterStatus:       TaskStatus | '' | '!done';
  filterAssignee:     string;
  filterPriority:     string;
  filterColor:        string;
  filterOverdue:      '' | 'overdue';
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
  locale:             'ja' | 'en';
  ganttBarOpen:       boolean;
  wbsPanelOpen:       boolean;
  wbsHiddenCols:      string[];
  // 担当者フィルタ候補のピン留め（§9.3）: projectId -> ピン留めされた担当者名。
  // フィルタ値ではなく UI 設定として扱うため uiInitialState には入れず resetUi の対象外にする。
  pinnedAssignees:    Record<string, string[]>;
  depArrowStyle:      DepArrowStyle;
  // WBS のタイトル・担当者列の幅。GanttChart がプロジェクト切替でアンマウントされても維持するため store に置く。永続化（全プロジェクト共通）し、resetUi で既定値に戻す。
  wbsColWidths:       { title: number; assignee: number };
  setWbsColWidths:    (updater: (prev: { title: number; assignee: number }) => { title: number; assignee: number }) => void;
  setTasks:               (tasks: Task[], ownerProjectId?: string | null) => void;
  upsertTask:             (task: Task) => void;
  setRefData:             (refTasks: Task[], refProjects: RefProject[], ownerProjectId: string | null) => void;
  upsertRefTask:          (task: Task) => void;
  removeTasks:            (ids: string[]) => void;
  applyOrders:            (orders: { id: string; order: number; parentId?: string | null }[]) => void;
  setNeedsReload:         (v: boolean) => void;
  setFilter:              (filter: Partial<Pick<TaskStore, 'filterStatus' | 'filterAssignee' | 'filterPriority' | 'filterColor' | 'filterOverdue' | 'filterSearch'>>) => void;
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
  setLocale:              (locale: 'ja' | 'en') => void;
  setGanttBarOpen:        (open: boolean) => void;
  setWbsPanelOpen:        (open: boolean) => void;
  setWbsHiddenCols:       (cols: string[]) => void;
  toggleAssigneePin:      (projectId: string, name: string) => void;
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
  wbsColWidths:      { ...DEFAULT_WBS_COL_WIDTHS } as { title: number; assignee: number },
};

export const useTaskStore = create<TaskStore>()(
  persist(
    (set) => ({
      tasks:             [],
      tasksOwnerProjectId: null as string | null,
      refTasks:          [] as Task[],
      refProjects:       [] as RefProject[],
      refOwnerProjectId: null as string | null,
      needsReload:       false,
      filterStatus:      '' as TaskStatus | '' | '!done',
      filterAssignee:    '',
      filterPriority:    '',
      filterColor:       '',
      filterOverdue:     '' as '' | 'overdue',
      filterSearch:      '',
      theme:             'auto' as ThemeMode,
      locale:            'ja' as 'ja' | 'en',
      ganttBarOpen:      true,
      wbsPanelOpen:      true,
      wbsHiddenCols:     [] as string[],
      pinnedAssignees:   {} as Record<string, string[]>,
      ...uiInitialState,
      setTasks:               (tasks, ownerProjectId) => set(ownerProjectId === undefined ? { tasks } : { tasks, tasksOwnerProjectId: ownerProjectId }),
      // 差分適用アクション（v2.63）: 全置換を避け、未変更タスクの参照を維持して
      // React.memo 行コンポーネントの再レンダリングを最小化する
      upsertTask:             (task) => set((s) => ({
        tasks: s.tasks.some(t => t.id === task.id)
          ? s.tasks.map(t => (t.id === task.id ? task : t))
          : [...s.tasks, task],
      })),
      setRefData:             (refTasks, refProjects, ownerProjectId) => set({ refTasks, refProjects, refOwnerProjectId: ownerProjectId }),
      upsertRefTask:          (task) => set((s) => ({
        refTasks: s.refTasks.some(t => t.id === task.id)
          ? s.refTasks.map(t => (t.id === task.id ? task : t))
          : [...s.refTasks, task],
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
      setLocale:              (locale) => set({ locale }),
      setGanttBarOpen:        (ganttBarOpen) => set({ ganttBarOpen }),
      setWbsPanelOpen:        (wbsPanelOpen) => set({ wbsPanelOpen }),
      setWbsHiddenCols:       (wbsHiddenCols) => set({ wbsHiddenCols }),
      toggleAssigneePin:      (projectId, name) => set((s) => {
        if (!projectId || !name) return s;
        const current = s.pinnedAssignees[projectId] ?? [];
        const next = current.includes(name)
          ? current.filter(n => n !== name)
          : [...current, name];
        const pinnedAssignees = { ...s.pinnedAssignees };
        if (next.length === 0) {
          delete pinnedAssignees[projectId];
        } else {
          pinnedAssignees[projectId] = next;
        }
        return { pinnedAssignees };
      }),
      setDepArrowStyle:       (depArrowStyle) => set({ depArrowStyle }),
      setWbsColWidths:        (updater) => set((s) => ({ wbsColWidths: updater(s.wbsColWidths) })),
      resetUi:                () => set(uiInitialState),
    }),
    {
      name: 'treegantt-ui',
      partialize: (s) => ({
        theme:             s.theme,
        locale:            s.locale,
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
        pinnedAssignees:   s.pinnedAssignees,
        depArrowStyle:     s.depArrowStyle,
        wbsColWidths:      s.wbsColWidths,
      }),
      // 既定の浅いマージを保ち、wbsColWidths だけ復元値を検証して不正な列を既定値に戻す
      merge: (persisted, current) => {
        const p = (typeof persisted === 'object' && persisted !== null ? persisted : {}) as Partial<TaskStore>;
        return { ...current, ...p, wbsColWidths: sanitizeWbsColWidths(p.wbsColWidths) };
      },
    },
  ),
);
