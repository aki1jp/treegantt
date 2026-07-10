import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import type { Task } from '../../types/task';
import { useTaskStore } from '../../store/taskStore';
import { filterTasks } from '../../utils/sort';
import {
  calcGanttRange, calcLightningPoints,
  ganttTotalWidth, ZOOM_CONFIG, calcCriticalPath, buildCollapsedCriticalParents,
  buildMultiLevelHeaders, dateToX, getUniqueAssignees,
  calcParentSpanMap, assignMilestoneLanes, isMilestoneXVisible, measureMilestoneLabel,
} from '../../utils/ganttCalc';
import { buildTree, flattenTree, buildRowNumberMap, calcAllEffectiveProgress, includeAncestors, resolveVisibleId } from '../../utils/taskTree';
import type { TreeNode } from '../../utils/taskTree';
import { milestoneColorOf } from '../../utils/taskColors';
import { mergeRefTasks } from '../../utils/refTasks';
import { calcVisibleRange } from '../../utils/virtualRange';
import { useDowLabels } from '../../i18n/dow';
import { ResourceView } from './ResourceView';
import { DependencyArrow } from './DependencyArrow';
import { TaskContextMenus, type DepCtxMenu } from './TaskContextMenus';
import { GanttTimelineHeader } from './GanttTimelineHeader';
import { GanttSvgBody } from './GanttSvgBody';
import { useRowDnd } from './useRowDnd';
import { useBarDrag } from './useBarDrag';
import { useLinkDrag } from './useLinkDrag';
import { WbsPanel } from './WbsPanel';
import { HEADER_ROW_H } from './ganttChartConstants';

// ── 左パネル列定義 ──────────────────────────────────
const LEFT_COLS = [
  { key: 'rowNumber', label: '行',       width: 36  },
  { key: 'order',     label: '#',        width: 36  },
  { key: 'title',     label: 'タイトル', width: 180 },
  { key: 'status',    label: 'ST',       width: 66  },
  { key: 'priority',  label: '優先',     width: 56  },
  { key: 'progress',  label: '進捗',     width: 76  },
  { key: 'assignee',  label: '担当',     width: 76  },
  { key: 'startDate', label: '開始',     width: 88  },
  { key: 'endDate',   label: '終了',     width: 88  },
  { key: 'duration',  label: '日数',     width: 50  },
] as const;

const COL_MIN_WIDTHS: Record<string, number> = { title: 80, assignee: 50 };

// バー移動/リサイズ/作成ドラッグ・依存リンクドラッグの状態は useBarDrag/useLinkDrag に分離（D4）。
// CREATE_DRAG_THRESHOLD_PX は既存の import 元（テスト等）互換のためここから再エクスポートする。
export { CREATE_DRAG_THRESHOLD_PX } from './useBarDrag';


// ── 階層展開ヘルパー ──────────────────────────────────
function collectCollapsedByDepth(nodes: TreeNode[], targetDepth: number, acc: Set<string>): void {
  for (const node of nodes) {
    if (node.depth >= targetDepth && node.children.length > 0) acc.add(node.task.id);
    collectCollapsedByDepth(node.children, targetDepth, acc);
  }
}

// ── メインコンポーネント ──────────────────────────────
interface Props {
  /** 現在のプロジェクトID。変化時にスクロールを先頭へリセットする（プロジェクト切替で先頭表示）。 */
  projectId?: string;
  onEditTask: (task: Task) => void;
  onDeleteTask: (id: string) => void;
  onInlineUpdate: (id: string, patch: Partial<Task>) => void;
  onQuickAdd: (title: string) => Promise<void>;
  onAddSubTask: (parentId: string) => void;
  onAddSubMilestone?: (parentId: string) => void;
  /** クロスプロジェクト参照（§5.8）: 右クリックメニュー「🔗 参照を追加」（parentId は使わない） */
  onAddRef?: () => void;
  onReorder: (orders: { id: string; order: number; parentId?: string | null }[]) => Promise<void>;
  onCopyInsert: (source: Task, parentId: string | null, afterTaskId: string | null, beforeTaskId?: string | null) => Promise<void>;
  /** リソースビュー稼働率の実効キャパ（分/稼働日） */
  capacityMinutesPerDay?: number;
  /** リソースビュー稼働率の実効稼働日（0=日…6=土） */
  workingDays?: number[];
  /**
   * クロスプロジェクト参照（§5.8）: 後続（ドロップ先）が参照タスクのときの専用更新経路。
   * onInlineUpdate（useTasks.updateTask）は楽観的更新で `tasks` スロットを汚染するため使えない。
   */
  onUpdateExternalDeps?: (id: string, patch: Partial<Task>) => void;
  /** 参照先プロジェクトへジャンプする（コンテキストメニュー「参照先プロジェクトを開く」） */
  onOpenRefProject?: (projectId: string) => void;
  /** 参照を解除する（コンテキストメニュー「参照を解除」） */
  onRemoveRef?: (refTaskId: string) => void;
  /** 参照を再読み込みする（コンテキストメニュー「参照を再読み込み」） */
  onRefreshRefs?: () => void;
}

export function GanttChart({
  projectId, onEditTask, onDeleteTask, onInlineUpdate, onQuickAdd, onAddSubTask, onAddSubMilestone, onAddRef, onReorder, onCopyInsert,
  capacityMinutesPerDay, workingDays,
  onUpdateExternalDeps, onOpenRefProject, onRemoveRef, onRefreshRefs,
}: Props) {
  const {
    tasks, refTasks, refProjects, filterStatus, filterAssignee, filterPriority, filterColor, filterSearch,
    zoomLevel, ganttStartDate, ganttPeriod,
    showLightningLine, showWeekend, showCriticalPath, showResourceView, showTodayLine, showMilestones, milestoneHighlightColor, uiFontSize, uiRowHeight, ganttHeaderLevels, depArrowStyle,
    wbsPanelOpen, wbsHiddenCols,
    resourceViewHeight, setResourceViewHeight,
    setWbsPanelOpen, setWbsHiddenCols,
  } = useTaskStore();

  // クロスプロジェクト参照（§5.8）: 参照タスク＋合成グループ行を現プロジェクトのタスクに合成する。
  // displayTasks は filterTasks/includeAncestors の入力として使い、ツリー描画・依存矢印に反映する。
  // calcCriticalPath / ResourceView / 担当者候補は現プロジェクトのみ（`tasks`）を入力のまま保つ（§5.8 明記）。
  const displayTasks = useMemo(
    () => mergeRefTasks(tasks, refTasks, refProjects),
    [tasks, refTasks, refProjects],
  );

  // No. 列（表示専用の通し番号, §9.2）: 全展開・フィルタなしの displayTasks 基準で固定する。
  // filterStatus 等の他の状態には依存させず、フィルタ/折りたたみで詰め直さない。
  const rowNumberMap = useMemo(() => buildRowNumberMap(displayTasks), [displayTasks]);

  // マイルストーン行・本体の菱形は常に表示する。`showMilestones`（「マイル」トグル）は
  // ヘッダーのマイルストーン表示（◆マーカー行・日付セル強調・列ハイライト帯＝milestoneItems）のみ制御する。
  const sorted = useMemo(
    () => filterTasks(displayTasks, filterStatus, filterAssignee, filterPriority, filterSearch, filterColor),
    [displayTasks, filterStatus, filterAssignee, filterPriority, filterSearch, filterColor],
  );
  // 現プロジェクトのみの絞り込み結果（クリティカルパス・リソースビュー用, §5.8）
  const sortedOwn = useMemo(
    () => filterTasks(tasks, filterStatus, filterAssignee, filterPriority, filterSearch, filterColor),
    [tasks, filterStatus, filterAssignee, filterPriority, filterSearch, filterColor],
  );
  // tasks が変わっても内容が同じなら前回の配列参照を維持する
  // （全行に渡る props のため、参照が変わると React.memo が全行で無効化される）
  const assigneeOptionsRaw = useMemo(() => getUniqueAssignees(tasks), [tasks]);
  const assigneeOptionsRef = useRef(assigneeOptionsRaw);
  if (
    assigneeOptionsRaw.length !== assigneeOptionsRef.current.length ||
    assigneeOptionsRaw.some((a, i) => a !== assigneeOptionsRef.current[i])
  ) {
    assigneeOptionsRef.current = assigneeOptionsRaw;
  }
  const assigneeOptions = assigneeOptionsRef.current;

  // 列幅（タイトル・担当者はドラッグでリサイズ可）
  const [colWidths, setColWidths] = useState({ title: 180, assignee: 76 });
  const [colResize, setColResize] = useState<{ key: string; startX: number; startWidth: number } | null>(null);
  const colResizeRef = useRef<typeof colResize>(null);
  useEffect(() => { colResizeRef.current = colResize; }, [colResize]);

  // フォントサイズに連動した日付列幅 (YYYY-MM-DD の10文字が収まる幅)
  const dateColWidth = 80 + (uiFontSize - 11) * 5; // 11px→80, 13px→90, 15px→100

  const visibleLeftCols = LEFT_COLS.filter(c => !wbsHiddenCols.includes(c.key));
  const LEFT_TOTAL = wbsPanelOpen
    ? visibleLeftCols.reduce((s, c) => {
        if (c.key === 'startDate' || c.key === 'endDate') return s + dateColWidth;
        return s + (colWidths[c.key as keyof typeof colWidths] ?? c.width);
      }, 0)
    : 36;

  const handleColMouseMove = useCallback((e: MouseEvent) => {
    const cr = colResizeRef.current;
    if (!cr) return;
    const minW = COL_MIN_WIDTHS[cr.key] ?? 40;
    setColWidths(prev => ({
      ...prev,
      [cr.key]: Math.max(minW, cr.startWidth + e.clientX - cr.startX),
    }));
  }, []);

  const handleColMouseUp = useCallback(() => setColResize(null), []);

  useEffect(() => {
    if (!colResize) return;
    window.addEventListener('mousemove', handleColMouseMove);
    window.addEventListener('mouseup', handleColMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleColMouseMove);
      window.removeEventListener('mouseup', handleColMouseUp);
    };
  }, [colResize, handleColMouseMove, handleColMouseUp]);

  const [collapsed, setCollapsed] = useState(new Set<string>());
  // フィルタ一致タスク＋ツリー構造保持のための表示専用祖先（§9.3）。折りたたみ状態には依存しない
  // 「概念上のツリー全ノード」であり、resolveVisibleId の親チェーン遡り（§8.5）は折りたたみで
  // 隠れているノードも辿る必要があるため、taskById もここから構築する（flatRows からは作らない）。
  const treeTasks = useMemo(() => includeAncestors(sorted, displayTasks), [sorted, displayTasks]);
  const { roots, childCount } = useMemo(() => buildTree(treeTasks), [treeTasks]);
  const flatRows = useMemo(() => flattenTree(roots, collapsed), [roots, collapsed]);

  const collapseAll    = () => setCollapsed(new Set(childCount.keys()));
  const expandAll      = () => setCollapsed(new Set());
  const expandToDepth  = (depth: number) => {
    const acc = new Set<string>();
    collectCollapsedByDepth(roots, depth, acc);
    setCollapsed(acc);
  };

  const start  = ganttStartDate || undefined;
  const period = ganttPeriod    || undefined;
  // range の min/max は Date オブジェクトで全 GanttBar に渡るため、
  // 値（時刻）が同じなら前回の参照を維持して React.memo の無効化を防ぐ
  const rangeRaw = useMemo(
    () => calcGanttRange(sorted, start, period, zoomLevel),
    [sorted, start, period, zoomLevel],
  );
  const rangeRef = useRef(rangeRaw);
  if (
    rangeRaw.min.getTime() !== rangeRef.current.min.getTime() ||
    rangeRaw.max.getTime() !== rangeRef.current.max.getTime()
  ) {
    rangeRef.current = rangeRaw;
  }
  const { min, max } = rangeRef.current;
  const totalWidth = useMemo(
    () => ganttTotalWidth(sorted, zoomLevel, start, period),
    [sorted, zoomLevel, start, period],
  );
  const dowLabels = useDowLabels();
  const headerRows = useMemo(
    () => buildMultiLevelHeaders(min, max, zoomLevel, ganttHeaderLevels, dowLabels),
    [min, max, zoomLevel, ganttHeaderLevels, dowLabels],
  );

  const taskIndex = useMemo(() => new Map(flatRows.map(({ task }, i) => [task.id, i])), [flatRows]);
  // sorted（フィルタ結果）だけから作ると、フィルタで一致しないがツリー構造保持のため表示される
  // 祖先（includeAncestors）が抜け落ち、resolveVisibleId が解決した ID がここに存在しない事態に
  // なる（§8.5）。treeTasks は折りたたみに依存しないため、折りたたみで隠れた祖先チェーンの遡りにも使える。
  const taskById  = useMemo(() => new Map(treeTasks.map(t => [t.id, t])), [treeTasks]);
  const totalHeight = (flatRows.length + 1) * uiRowHeight;

  const { dayWidth } = ZOOM_CONFIG[zoomLevel];

  // 土日列
  const weekendXs = useMemo(() => {
    const xs: number[] = [];
    if (!showWeekend) return xs;
    let curTime = min.getTime();
    const endTime = max.getTime();
    while (curTime < endTime) {
      const dow = new Date(curTime).getDay();
      if (dow === 0 || dow === 6) {
        xs.push(Math.round((curTime - min.getTime()) / 86400000) * dayWidth);
      }
      curTime += 86400000;
    }
    return xs;
  }, [showWeekend, min, max, dayWidth]);

  // ヘッダーのマイルストーン表示（◆マーカー行・日付セル強調・列ハイライト帯）。
  // 「マイル」トグル（showMilestones）が OFF のときは空にして一式を非表示にする。
  const milestoneItems = useMemo(() => !showMilestones ? [] : assignMilestoneLanes(
    sorted
      .filter(t => t.isMilestone && !!t.startDate)
      .map(t => ({
        x: dateToX(t.startDate!, min, zoomLevel),
        title: t.title,
        color: milestoneColorOf(t.titleColor, milestoneHighlightColor),
      }))
      // 開始日変更・表示期間で描画範囲外（見切れ）になったものは多段から除外する。
      .filter(m => isMilestoneXVisible(m.x, dayWidth, totalWidth)),
    (title) => measureMilestoneLabel(title, 11),
  ), [sorted, min, zoomLevel, showMilestones, milestoneHighlightColor, dayWidth, totalWidth]);
  const milestoneXSet = useMemo(() => new Set(milestoneItems.map(m => m.x)), [milestoneItems]);
  // 日付セル強調用に x→色（個別優先）を引けるようにする。同一 x に複数ある場合は後勝ち。
  const milestoneColorByX = useMemo(
    () => new Map(milestoneItems.map(m => [m.x, m.color])),
    [milestoneItems],
  );
  const milestoneLaneH = 20;
  const milestoneLaneCount = milestoneItems.length > 0
    ? Math.max(...milestoneItems.map(m => m.lane)) + 1
    : 0;
  const milestoneHeaderH = milestoneLaneCount > 0 ? milestoneLaneCount * milestoneLaneH : 0;
  const totalHeaderH = headerRows.length * HEADER_ROW_H + milestoneHeaderH + 2;

  // 親タスクの進捗・表示スパン事前計算（O(N) 1パス版）
  const progressMap   = useMemo(() => calcAllEffectiveProgress(sorted), [sorted]);
  const parentSpanMap = useMemo(() => calcParentSpanMap(sorted), [sorted]);

  // 実効日付ヘルパー: 親タスク（子を持つ）は表示スパン（parentSpanMap）、葉は生値を返す。
  // ガントバー・依存矢印・コネクタドット等の座標を親サマリーバーの描画位置と一致させる。
  const effStartDate = useCallback((t: Task): string | null =>
    (childCount.get(t.id) ?? 0) > 0 ? (parentSpanMap.get(t.id)?.startDate ?? t.startDate) : t.startDate,
    [childCount, parentSpanMap]);
  const effEndDate = useCallback((t: Task): string | null =>
    (childCount.get(t.id) ?? 0) > 0 ? (parentSpanMap.get(t.id)?.endDate ?? t.endDate) : t.endDate,
    [childCount, parentSpanMap]);

  // イナズマライン
  const lightningPoints = useMemo(() => calcLightningPoints(
    flatRows.map(r => ({
      task: r.task,
      effectiveProgress: progressMap.get(r.task.id) ?? 0,
      hasChildren: (childCount.get(r.task.id) ?? 0) > 0,
      isCollapsed: collapsed.has(r.task.id),
      effectiveStart: effStartDate(r.task),
      effectiveEnd:   effEndDate(r.task),
    })),
    min,
    zoomLevel,
    uiRowHeight,
  ), [flatRows, progressMap, childCount, collapsed, effStartDate, effEndDate, min, zoomLevel, uiRowHeight]);

  // クリティカルパス（現プロジェクトのみ, §5.8）
  const criticalSet = useMemo(
    () => (showCriticalPath ? calcCriticalPath(sortedOwn) : new Set<string>()),
    [showCriticalPath, sortedOwn],
  );
  const collapsedCriticalParents = useMemo(
    () => (showCriticalPath
      ? buildCollapsedCriticalParents(sorted, criticalSet, collapsed)
      : new Set<string>()),
    [showCriticalPath, sorted, criticalSet, collapsed],
  );


  // バー移動/リサイズ/作成ドラッグ・依存リンクドラッグの状態は useBarDrag/useLinkDrag に分離（下記）。
  const [barCtxMenu, setBarCtxMenu] = useState<{ x: number; y: number; taskId: string } | null>(null);
  const [rowCtxMenu, setRowCtxMenu] = useState<{ x: number; y: number; taskId: string } | null>(null);
  const [titleHeaderCtxMenu, setTitleHeaderCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const [depCtxMenu, setDepCtxMenu] = useState<DepCtxMenu | null>(null);

  // ── 行 D&D（ソートなし時の並び替え） ─────────────────
  const {
    wbsPanelRef, rowDragId, rowDropIdx, rowDropDepth, rowDropTarget,
    copiedTask, setCopiedTask,
    clearDrop, handleRowDragStart, handleRowDragOver, handleRowDrop,
  } = useRowDnd({ flatRows, onReorder, onCopyInsert, currentProjectId: projectId });

  const svgRef = useRef<SVGSVGElement>(null);
  const wbsBodyRef      = useRef<HTMLDivElement>(null);
  const ganttPanelRef   = useRef<HTMLDivElement>(null);
  const ganttHeaderRef  = useRef<HTMLDivElement>(null);
  const workloadScrollRef = useRef<HTMLDivElement>(null);

  // flatRows / taskById / childCount の最新値を ref に保持（安定コールバックの stale closure 防止）
  const flatRowsRef   = useRef(flatRows);
  const taskByIdRef   = useRef(taskById);
  const childCountRef = useRef(childCount);
  const parentSpanMapRef = useRef(parentSpanMap);
  useEffect(() => { flatRowsRef.current     = flatRows;     }, [flatRows]);
  useEffect(() => { taskByIdRef.current     = taskById;     }, [taskById]);
  useEffect(() => { childCountRef.current   = childCount;   }, [childCount]);
  useEffect(() => { parentSpanMapRef.current = parentSpanMap; }, [parentSpanMap]);

  // ── 依存リンクドラッグ（コネクタドット→別バーへドロップ） ──
  const {
    linkDragState, linkDragStateRef, hoveredBarId, setHoveredBarId,
    startLinkDrag, cancelLinkDrag,
  } = useLinkDrag({
    svgRef, uiRowHeight, flatRowsRef, taskByIdRef, childCountRef, parentSpanMapRef,
    onInlineUpdate, onUpdateExternalDeps, currentProjectId: projectId,
  });

  // ── バー移動・左右リサイズ・作成ドラッグ ──
  const {
    dragState, dragPreview, dragStateRef,
    handleBarMoveStart, handleBarResizeLeftStart, handleBarResizeRightStart,
    startCreateDrag, cancelDrag,
  } = useBarDrag({ dayWidth, min, onInlineUpdate, childCountRef, taskByIdRef, linkDragStateRef, ganttPanelRef, currentProjectId: projectId });

  // App から渡るコールバックは再レンダリングごとに再生成されるため、
  // 最新値 ref + 安定 useCallback に変換して React.memo 行コンポーネントへ渡す
  const onEditTaskRef     = useRef(onEditTask);
  const onInlineUpdateRef = useRef(onInlineUpdate);
  useEffect(() => {
    onEditTaskRef.current     = onEditTask;
    onInlineUpdateRef.current = onInlineUpdate;
  });
  const handleInlineUpdate = useCallback(
    (id: string, patch: Partial<Task>) => onInlineUpdateRef.current(id, patch),
    [],
  );
  const handleRowContextMenu = useCallback((x: number, y: number, taskId: string) => {
    setRowCtxMenu({ x, y, taskId });
    setBarCtxMenu(null);
  }, []);
  const handleBarClick = useCallback((task: Task) => {
    if (!dragStateRef.current && !linkDragStateRef.current) onEditTaskRef.current(task);
  }, [dragStateRef, linkDragStateRef]);

  // ガントパネルの水平スクロールバー高さを検出してWBSスクロール同期ズレを防止
  const [hScrollbarH, setHScrollbarH] = useState(0);
  useEffect(() => {
    const el = ganttPanelRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const update = () => setHScrollbarH(el.offsetHeight - el.clientHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ガントヘッダーの実際の高さを計測して WBS ヘッダーに同期
  const [ganttHeaderH, setGanttHeaderH] = useState(0);
  useEffect(() => {
    const el = ganttHeaderRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const update = () => setGanttHeaderH(el.offsetHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── 行仮想化（v2.64）: スクロール位置とビューポート高さを state 化 ──
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(800); // ResizeObserver 非対応環境のフォールバック
  const pendingScrollTopRef = useRef(0);
  const scrollRafRef = useRef<number | null>(null);

  useEffect(() => {
    const el = ganttPanelRef.current;
    if (!el) return;
    const update = () => setViewportH(el.clientHeight || 800);
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // プロジェクト切替時はスクロールを先頭へ戻す。新しいプロジェクトを先頭から表示し、
  // 旧プロジェクトの過大な scrollTop が残って可視範囲が空＝白画面になるのも防ぐ。
  useEffect(() => {
    if (ganttPanelRef.current) ganttPanelRef.current.scrollTop = 0;
    if (wbsBodyRef.current)    wbsBodyRef.current.scrollTop = 0;
    pendingScrollTopRef.current = 0;
    setScrollTop(0);
  }, [projectId]);

  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    if (wbsBodyRef.current) wbsBodyRef.current.scrollTop = e.currentTarget.scrollTop;
    if (workloadScrollRef.current) workloadScrollRef.current.scrollLeft = e.currentTarget.scrollLeft;
    // 可視範囲更新は rAF でスロットル（非対応環境は即時反映）
    pendingScrollTopRef.current = e.currentTarget.scrollTop;
    if (typeof requestAnimationFrame !== 'function') {
      setScrollTop(pendingScrollTopRef.current);
    } else if (scrollRafRef.current === null) {
      scrollRafRef.current = requestAnimationFrame(() => {
        scrollRafRef.current = null;
        setScrollTop(pendingScrollTopRef.current);
      });
    }
  }

  const { start: vStart, end: vEnd } = useMemo(
    () => calcVisibleRange(scrollTop, viewportH, uiRowHeight, flatRows.length),
    [scrollTop, viewportH, uiRowHeight, flatRows.length],
  );

  // 依存関係矢印（折りたたみ時は可視祖先へリダイレクト・可視範囲と交差するもののみ描画）
  const dependencyArrows = useMemo(() => {
    const seen = new Set<string>();
    return sorted.flatMap(task =>
      task.predecessors.flatMap(predId => {
        const fromId = resolveVisibleId(predId, taskIndex, taskById);
        const toId   = resolveVisibleId(task.id, taskIndex, taskById);
        if (!fromId || !toId || fromId === toId) return [];
        const key = `${fromId}->${toId}`;
        if (seen.has(key)) return [];
        seen.add(key);
        const fromIdx = taskIndex.get(fromId)!;
        const toIdx   = taskIndex.get(toId)!;
        if (Math.max(fromIdx, toIdx) < vStart || Math.min(fromIdx, toIdx) >= vEnd) return [];
        const fromTask = taskById.get(fromId)!;
        const toTask   = taskById.get(toId)!;
        // 端点が親（子を持つ）の場合は親バーと同じ表示スパン（parentSpanMap）で端点を計算する
        return [
          <DependencyArrow key={key}
            fromTask={fromTask} toTask={toTask} minDate={min}
            fromEndDate={effEndDate(fromTask)} toStartDate={effStartDate(toTask)}
            zoom={zoomLevel} taskIndex={taskIndex} rowHeight={uiRowHeight}
            isCritical={criticalSet.has(fromId) && criticalSet.has(toId)}
            style={depArrowStyle} />,
        ];
      })
    );
  }, [sorted, taskIndex, taskById, effStartDate, effEndDate, min, zoomLevel, uiRowHeight, criticalSet, depArrowStyle, vStart, vEnd]);

  // WBSパネル上のホイール操作をガントパネルに転送（WBSはoverflow:hiddenのため）
  function handleWbsWheel(e: React.WheelEvent<HTMLDivElement>) {
    if (ganttPanelRef.current) {
      ganttPanelRef.current.scrollTop  += e.deltaY;
      ganttPanelRef.current.scrollLeft += e.deltaX;
    }
  }

  // SVG へのネイティブ contextmenu リスナー（React 合成イベントは SVG で不安定なため）
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    function handleContextMenu(e: MouseEvent) {
      e.preventDefault();
      // 依存矢印の右クリック判定を先に行う
      const depEl = (e.target as Element).closest('[data-dep-from]');
      if (depEl) {
        const fromId = depEl.getAttribute('data-dep-from')!;
        const toId   = depEl.getAttribute('data-dep-to')!;
        setDepCtxMenu({ x: e.clientX, y: e.clientY, fromTaskId: fromId, toTaskId: toId });
        setBarCtxMenu(null);
        setRowCtxMenu(null);
        return;
      }
      const el = (e.target as Element).closest('[data-task-id]');
      if (!el) return;
      const taskId = el.getAttribute('data-task-id');
      if (taskId) { setBarCtxMenu({ x: e.clientX, y: e.clientY, taskId }); setRowCtxMenu(null); }
    }
    svg.addEventListener('contextmenu', handleContextMenu);
    return () => svg.removeEventListener('contextmenu', handleContextMenu);
  }, []);

  // どちらかのコンテキストメニューが開いている間、mousedown で両方を閉じる
  useEffect(() => {
    if (!barCtxMenu && !rowCtxMenu) return;
    const close = () => { setBarCtxMenu(null); setRowCtxMenu(null); };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [barCtxMenu, rowCtxMenu]);

  useEffect(() => {
    if (!depCtxMenu) return;
    const close = () => setDepCtxMenu(null);
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [depCtxMenu]);

  useEffect(() => {
    if (!titleHeaderCtxMenu) return;
    const close = () => setTitleHeaderCtxMenu(null);
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [titleHeaderCtxMenu]);

  // Escape キーでバー移動/リサイズ・リンクドラッグ双方をキャンセル（各フックの cancel* に委譲）
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        cancelDrag();
        cancelLinkDrag();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [cancelDrag, cancelLinkDrag]);

  const toggleCollapse = useCallback((id: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const canStartLink = !!hoveredBarId && !linkDragState && !dragState;

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden',
      cursor: dragState ? 'grabbing' : colResize ? 'col-resize' : 'default',
    }}>

    {/* ── メインエリア（WBS + ガント）── */}
    <div data-testid="gantt-chart-body" style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 120 }}>

      {/* ── WBS 左パネル（スクロールバーなし） ── */}
      <WbsPanel
        currentProjectId={projectId}
        wbsPanelOpen={wbsPanelOpen}
        setWbsPanelOpen={setWbsPanelOpen}
        leftTotal={LEFT_TOTAL}
        visibleLeftCols={visibleLeftCols}
        colWidths={colWidths}
        setColResize={setColResize}
        dateColWidth={dateColWidth}
        ganttHeaderH={ganttHeaderH}
        totalHeaderH={totalHeaderH}
        wbsHiddenCols={wbsHiddenCols}
        setWbsHiddenCols={setWbsHiddenCols}
        childCount={childCount}
        collapseAll={collapseAll}
        expandToDepth={expandToDepth}
        expandAll={expandAll}
        setTitleHeaderCtxMenu={setTitleHeaderCtxMenu}
        handleWbsWheel={handleWbsWheel}
        wbsPanelRef={wbsPanelRef}
        wbsBodyRef={wbsBodyRef}
        vStart={vStart}
        vEnd={vEnd}
        uiRowHeight={uiRowHeight}
        uiFontSize={uiFontSize}
        flatRows={flatRows}
        rowNumberMap={rowNumberMap}
        collapsed={collapsed}
        progressMap={progressMap}
        parentSpanMap={parentSpanMap}
        assigneeOptions={assigneeOptions}
        toggleCollapse={toggleCollapse}
        handleInlineUpdate={handleInlineUpdate}
        handleRowContextMenu={handleRowContextMenu}
        rowDragId={rowDragId}
        rowDropIdx={rowDropIdx}
        rowDropDepth={rowDropDepth}
        rowDropTarget={rowDropTarget}
        handleRowDragStart={handleRowDragStart}
        handleRowDragOver={handleRowDragOver}
        handleRowDrop={handleRowDrop}
        clearDrop={clearDrop}
        onQuickAdd={onQuickAdd}
        hScrollbarH={hScrollbarH}
      />

      {/* ── ガント右パネル（横スクロールバーあり） ── */}
      <div data-testid="gantt-panel" ref={ganttPanelRef} tabIndex={0} aria-label="ガントチャート"
        style={{ flex: 1, overflow: 'auto' }} onScroll={handleScroll}>
        <div style={{ width: totalWidth }}>

          {/* ガントヘッダー（マルチレベル・sticky） */}
          <GanttTimelineHeader
            ganttHeaderRef={ganttHeaderRef}
            headerRows={headerRows}
            totalWidth={totalWidth}
            milestoneXSet={milestoneXSet}
            milestoneColorByX={milestoneColorByX}
            milestoneHighlightColor={milestoneHighlightColor}
            milestoneItems={milestoneItems}
            milestoneHeaderH={milestoneHeaderH}
            milestoneLaneH={milestoneLaneH}
            dayWidth={dayWidth}
          />

          {/* ガント SVG */}
          <GanttSvgBody
            svgRef={svgRef}
            totalWidth={totalWidth}
            totalHeight={totalHeight}
            uiRowHeight={uiRowHeight}
            min={min}
            zoomLevel={zoomLevel}
            dayWidth={dayWidth}
            currentProjectId={projectId}
            flatRows={flatRows}
            vStart={vStart}
            vEnd={vEnd}
            childCount={childCount}
            collapsed={collapsed}
            progressMap={progressMap}
            parentSpanMap={parentSpanMap}
            taskById={taskById}
            taskIndex={taskIndex}
            effStartDate={effStartDate}
            effEndDate={effEndDate}
            criticalSet={criticalSet}
            collapsedCriticalParents={collapsedCriticalParents}
            weekendXs={weekendXs}
            milestoneItems={milestoneItems}
            milestoneHighlightColor={milestoneHighlightColor}
            showTodayLine={showTodayLine}
            showLightningLine={showLightningLine}
            lightningPoints={lightningPoints}
            dependencyArrows={dependencyArrows}
            dragState={dragState}
            dragPreview={dragPreview}
            linkDragState={linkDragState}
            canStartLink={canStartLink}
            hoveredBarId={hoveredBarId}
            setHoveredBarId={setHoveredBarId}
            startCreateDrag={startCreateDrag}
            startLinkDrag={startLinkDrag}
            handleBarMoveStart={handleBarMoveStart}
            handleBarResizeLeftStart={handleBarResizeLeftStart}
            handleBarResizeRightStart={handleBarResizeRightStart}
            handleBarClick={handleBarClick}
          />
        </div>
      </div>

      {/* 右クリックメニュー群（バー/行/依存矢印/タイトル列見出し） */}
      <TaskContextMenus
        barCtxMenu={barCtxMenu}
        rowCtxMenu={rowCtxMenu}
        depCtxMenu={depCtxMenu}
        titleHeaderCtxMenu={titleHeaderCtxMenu}
        closeBarCtxMenu={() => setBarCtxMenu(null)}
        closeRowCtxMenu={() => setRowCtxMenu(null)}
        closeDepCtxMenu={() => setDepCtxMenu(null)}
        closeTitleHeaderCtxMenu={() => setTitleHeaderCtxMenu(null)}
        taskById={taskById}
        tasks={tasks}
        copiedTask={copiedTask}
        setCopiedTask={setCopiedTask}
        onEditTask={onEditTask}
        onDeleteTask={onDeleteTask}
        onInlineUpdate={onInlineUpdate}
        onAddSubTask={onAddSubTask}
        onAddSubMilestone={onAddSubMilestone}
        onAddRef={onAddRef}
        onCopyInsert={onCopyInsert}
        collapseAll={collapseAll}
        expandToDepth={expandToDepth}
        expandAll={expandAll}
        currentProjectId={projectId}
        onOpenRefProject={onOpenRefProject}
        onRemoveRef={onRemoveRef}
        onRefreshRefs={onRefreshRefs}
      />

    </div>{/* メインエリア終了 */}

    {/* ── 担当者別スイムレーン（リソースビュー）── */}
    {showResourceView && (
      <ResourceView
        tasks={sortedOwn}
        min={min}
        zoomLevel={zoomLevel}
        totalWidth={totalWidth}
        labelWidth={LEFT_TOTAL}
        scrollRef={workloadScrollRef}
        onEditTask={onEditTask}
        capacityMinutesPerDay={capacityMinutesPerDay}
        workingDays={workingDays}
        height={resourceViewHeight}
        onHeightChange={setResourceViewHeight}
      />
    )}
    </div>
  );
}
