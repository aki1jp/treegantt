import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import type { Task } from '../../types/task';
import { useTaskStore } from '../../store/taskStore';
import { filterTasks } from '../../utils/sort';
import {
  calcGanttRange, calcLightningPoints,
  ganttTotalWidth, ZOOM_CONFIG, calcCriticalPath, buildCollapsedCriticalParents, isAncestorOrDescendant,
  addDays, buildMultiLevelHeaders, xToDateStr, wouldCreateDepCycle, dateToX, getUniqueAssignees,
  calcParentSpanMap, assignMilestoneLanes, isMilestoneXVisible,
} from '../../utils/ganttCalc';
import { buildTree, flattenTree, calcAllEffectiveProgress, includeAncestors, resolveVisibleId } from '../../utils/taskTree';
import type { TreeNode } from '../../utils/taskTree';
import { milestoneColorOf } from '../../utils/taskColors';
import { textStartX, INDENT } from '../../utils/wbsLayout';
import { calcVisibleRange } from '../../utils/virtualRange';
import { GanttBar } from './GanttBar';
import { ResourceView } from './ResourceView';
import { DependencyArrow } from './DependencyArrow';
import { LightningLine, TodayLine } from './LightningLine';
import { ContextMenu, AddChildMenuItem } from './GanttContextMenu';
import { GanttLeftRow } from './GanttLeftRow';

const HEADER_ROW_H = 26;

// ── 左パネル列定義 ──────────────────────────────────
const LEFT_COLS = [
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

const HIDEABLE_COLS = [
  { key: 'status',    label: 'ステータス' },
  { key: 'priority',  label: '優先度'    },
  { key: 'progress',  label: '進捗率'    },
  { key: 'assignee',  label: '担当者'    },
  { key: 'startDate', label: '開始日'    },
  { key: 'endDate',   label: '終了日'    },
  { key: 'duration',  label: '日数'      },
] as const;

const RESIZABLE_COL_KEYS = new Set(['title', 'assignee']);
const COL_MIN_WIDTHS: Record<string, number> = { title: 80, assignee: 50 };

// ── ドラッグ状態 ────────────────────────────────────
// 作成ドラッグの開始閾値（px）。mousedown 位置からこの距離以上動いて初めて
// 作成対象になる。クリックの手ぶれによる日付の誤作成を防ぐ（§9.4）。
export const CREATE_DRAG_THRESHOLD_PX = 4;

type DragType = 'move' | 'resize-left' | 'resize-right' | 'create';
interface DragState {
  taskId: string;
  type: DragType;
  startClientX: number;
  origStart: string;
  origEnd: string;
  anchorRelX?: number;  // create ドラッグ用：クリック時の絶対 relX
}
interface DragPreview {
  taskId: string;
  startDate: string;
  endDate: string;
}

// ── リンクドラッグ状態（先行・後続タスク設定） ──────
interface LinkDragState {
  fromTaskId: string;
  startSvgX: number; startSvgY: number;
  currentX: number;  currentY: number;
  targetTaskId: string | null;
}
interface DepCtxMenu { x: number; y: number; fromTaskId: string; toTaskId: string; }

// ── クイック追加行 ──────────────────────────────────
function QuickAddRow({ onAdd, titleWidth, assigneeWidth, dateColWidth }: { onAdd: (title: string) => Promise<void>; titleWidth: number; assigneeWidth: number; dateColWidth: number }) {
  const { uiRowHeight, uiFontSize } = useTaskStore();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.focus();
  }, [editing]);

  async function submit() {
    const t = title.trim();
    if (t) { await onAdd(t); setTitle(''); }
    setEditing(false);
  }

  const CELL: React.CSSProperties = {
    height: uiRowHeight, display: 'flex', alignItems: 'center',
    padding: '0 6px', fontSize: uiFontSize, overflow: 'hidden', boxSizing: 'border-box',
  };

  return (
    <div style={{
      display: 'flex', background: 'var(--th-bg2)',
      height: uiRowHeight, boxSizing: 'border-box',
      borderTop: '1px dashed var(--th-border)',
    }}>
      <div style={{ ...CELL, width: 36 }} />
      <div style={{ ...CELL, width: titleWidth }}>
        {editing ? (
          <input ref={inputRef}
            style={{ width: '100%', padding: '2px 4px', border: '1px solid #4f46e5', borderRadius: 3, fontSize: uiFontSize, outline: 'none' }}
            value={title}
            onChange={e => setTitle(e.target.value)}
            onBlur={submit}
            onKeyDown={e => {
              if (e.key === 'Enter') submit();
              if (e.key === 'Escape') { setTitle(''); setEditing(false); }
            }}
          />
        ) : (
          <span onClick={() => setEditing(true)}
            style={{ color: 'var(--th-text-dim)', cursor: 'text', fontSize: uiFontSize, userSelect: 'none' }}>
            ＋ タスクを追加…
          </span>
        )}
      </div>
      {[66, 56, 76, assigneeWidth, dateColWidth, dateColWidth, 50].map((w, i) => <div key={i} style={{ ...CELL, width: w }} />)}
    </div>
  );
}

// ── 階層展開ヘルパー ──────────────────────────────────
function collectCollapsedByDepth(nodes: TreeNode[], targetDepth: number, acc: Set<string>): void {
  for (const node of nodes) {
    if (node.depth >= targetDepth && node.children.length > 0) acc.add(node.task.id);
    collectCollapsedByDepth(node.children, targetDepth, acc);
  }
}

// ── 色パレット ───────────────────────────────────────
const COLOR_PALETTE: (string | null)[] = [
  null,
  '#000000', '#6b7280', '#ffffff',
  '#ef4444', '#f97316', '#eab308',
  '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899',
];

// ── コンテキストメニュー共通スタイル ─────────────────
const MENU_BTN: React.CSSProperties = {
  display: 'block', width: '100%', padding: '8px 14px', border: 'none',
  background: 'none', textAlign: 'left', cursor: 'pointer', fontSize: 13, color: 'var(--th-text2)',
};
const onMenuEnter = (e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.background = 'var(--th-bg2)'; };
const onMenuLeave = (e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.background = 'none'; };

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
  onReorder: (orders: { id: string; order: number; parentId?: string | null }[]) => Promise<void>;
  onCopyInsert: (source: Task, parentId: string | null, afterTaskId: string | null, beforeTaskId?: string | null) => Promise<void>;
  /** リソースビュー稼働率の実効キャパ（分/稼働日） */
  capacityMinutesPerDay?: number;
  /** リソースビュー稼働率の実効稼働日（0=日…6=土） */
  workingDays?: number[];
}

export function GanttChart({ projectId, onEditTask, onDeleteTask, onInlineUpdate, onQuickAdd, onAddSubTask, onAddSubMilestone, onReorder, onCopyInsert, capacityMinutesPerDay, workingDays }: Props) {
  const {
    tasks, filterStatus, filterAssignee, filterPriority, filterSearch,
    zoomLevel, ganttStartDate, ganttPeriod,
    showLightningLine, showWeekend, showCriticalPath, showResourceView, showTodayLine, showMilestones, milestoneHighlightColor, uiFontSize, uiRowHeight, ganttHeaderLevels, depArrowStyle,
    wbsPanelOpen, wbsHiddenCols,
    resourceViewHeight, setResourceViewHeight,
    setWbsPanelOpen, setWbsHiddenCols,
  } = useTaskStore();

  // マイルストーン行・本体の菱形は常に表示する。`showMilestones`（「マイル」トグル）は
  // ヘッダーのマイルストーン表示（◆マーカー行・日付セル強調・列ハイライト帯＝milestoneItems）のみ制御する。
  const sorted = useMemo(
    () => filterTasks(tasks, filterStatus, filterAssignee, filterPriority, filterSearch),
    [tasks, filterStatus, filterAssignee, filterPriority, filterSearch],
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
  const { roots, childCount } = useMemo(
    () => buildTree(includeAncestors(sorted, tasks)),
    [sorted, tasks],
  );
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
  const headerRows = useMemo(
    () => buildMultiLevelHeaders(min, max, zoomLevel, ganttHeaderLevels),
    [min, max, zoomLevel, ganttHeaderLevels],
  );

  const taskIndex = useMemo(() => new Map(flatRows.map(({ task }, i) => [task.id, i])), [flatRows]);
  const taskById  = useMemo(() => new Map(sorted.map(t => [t.id, t])), [sorted]);
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
    11,
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

  // クリティカルパス
  const criticalSet = useMemo(
    () => (showCriticalPath ? calcCriticalPath(sorted) : new Set<string>()),
    [showCriticalPath, sorted],
  );
  const collapsedCriticalParents = useMemo(
    () => (showCriticalPath
      ? buildCollapsedCriticalParents(sorted, criticalSet, collapsed)
      : new Set<string>()),
    [showCriticalPath, sorted, criticalSet, collapsed],
  );


  // ── ドラッグ状態（バー移動・リサイズ） ──────────────
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null);
  const dragPreviewRef = useRef<DragPreview | null>(null);
  const dragStateRef  = useRef<DragState | null>(null);
  // 作成ドラッグが開始閾値（CREATE_DRAG_THRESHOLD_PX）を超えたか。超えるまでプレビューを作らない。
  const createArmedRef = useRef(false);
  const [barCtxMenu, setBarCtxMenu] = useState<{ x: number; y: number; taskId: string } | null>(null);
  const [rowCtxMenu, setRowCtxMenu] = useState<{ x: number; y: number; taskId: string } | null>(null);
  const [titleHeaderCtxMenu, setTitleHeaderCtxMenu] = useState<{ x: number; y: number } | null>(null);

  // ── リンクドラッグ状態 ─────────────────────────────
  const [linkDragState, setLinkDragState] = useState<LinkDragState | null>(null);
  const linkDragStateRef = useRef<LinkDragState | null>(null);
  useEffect(() => { linkDragStateRef.current = linkDragState; }, [linkDragState]);
  const [hoveredBarId, setHoveredBarId] = useState<string | null>(null);
  const [depCtxMenu, setDepCtxMenu] = useState<DepCtxMenu | null>(null);
  const [wbsColMenuPos, setWbsColMenuPos] = useState<{ x: number; y: number } | null>(null);

  // ── 行 D&D（ソートなし時の並び替え） ─────────────────
  const wbsPanelRef  = useRef<HTMLDivElement>(null);
  const [rowDragId,    setRowDragId]    = useState<string | null>(null);
  const [rowDropIdx,   setRowDropIdx]   = useState<number | null>(null);
  const [rowDropDepth, setRowDropDepth] = useState<number | null>(null);
  const [rowDropTarget, setRowDropTarget] = useState<string | null>(null);
  const isDragCopyRef = useRef(false);
  const [copiedTask,   setCopiedTask]   = useState<Task | null>(null);

  function clearDrop() {
    setRowDragId(null);
    setRowDropIdx(null);
    setRowDropDepth(null);
    setRowDropTarget(null);
    isDragCopyRef.current = false;
  }

  function handleRowDragStart(e: React.DragEvent, taskId: string) {
    const tag = document.activeElement?.tagName ?? '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
      e.preventDefault();
      return;
    }
    // 'all' を明示設定しないと Chrome が 'uninitialized' を 'none' 扱いし早期 dragEnd を発火する
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'all';
    setRowDragId(taskId);
  }

  function handleRowDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault();
    const isCopy = e.ctrlKey || e.metaKey;
    isDragCopyRef.current = isCopy;
    if (e.dataTransfer) e.dataTransfer.dropEffect = isCopy ? 'copy' : 'move';

    // ── Y位置で子採用ゾーンか判定（行の下端70%）──
    const rowRect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const relY = e.clientY - rowRect.top;
    const isAdoptZone = rowRect.height > 0 && relY / rowRect.height > 0.3;

    const candidate = flatRows[idx];
    if (isAdoptZone && candidate?.task.id !== rowDragId && !candidate?.task.isMilestone) {
      setRowDropTarget(candidate.task.id);
      setRowDropIdx(null);
      setRowDropDepth(null);
      return;
    }

    // ── バー挿入モード ──
    setRowDropTarget(null);
    const rowAbove = idx > 0 ? flatRows[idx - 1] : null;
    const rowBelow = flatRows[idx];

    let depth: number;
    if (!rowAbove || rowAbove.depth === rowBelow.depth) {
      // 同階層同士: 深さ固定（X軸不要）
      depth = rowBelow.depth;
    } else {
      // 親子の境目: X軸で深さを選択
      const panelLeft = wbsPanelRef.current?.getBoundingClientRect().left ?? 0;
      const mouseX = e.clientX - panelLeft;
      const maxDepth = rowBelow.depth <= rowAbove.depth ? rowAbove.depth : rowAbove.depth + 1;
      depth = Math.min(Math.max(0, Math.floor((mouseX - textStartX(0)) / INDENT)), maxDepth);
    }

    setRowDropIdx(idx);
    setRowDropDepth(depth);
  }

  function handleRowDrop(e: React.DragEvent, dropIdx: number) {
    e.preventDefault();
    if (!rowDragId) return;
    const dragIdx = flatRows.findIndex(r => r.task.id === rowDragId);
    if (dragIdx === -1) { clearDrop(); return; }

    // ── 共通: parentId 計算 ──
    const moved = flatRows[dragIdx].task;
    const d = rowDropDepth ?? 0;
    const targetParentId: string | null = (() => {
      if (d === 0) return null;
      for (let i = dropIdx - 1; i >= 0; i--) {
        if (flatRows[i].task.id === rowDragId) continue;
        if (flatRows[i].depth === d - 1) return flatRows[i].task.id;
        if (flatRows[i].depth < d - 1) break;
      }
      return null;
    })();

    // ── 子採用モード ──
    if (rowDropTarget) {
      const siblings = flatRows.filter(r => r.task.parentId === rowDropTarget);
      const maxSibOrder = siblings.length > 0
        ? Math.max(...siblings.map(r => r.task.order))
        : 0;
      if (isDragCopyRef.current) {
        onCopyInsert(moved, rowDropTarget, null);
      } else {
        onReorder([{ id: moved.id, order: maxSibOrder + 1, parentId: rowDropTarget }]);
      }
      clearDrop();
      return;
    }

    // ── バー挿入モード ──
    if (dragIdx === dropIdx) { clearDrop(); return; }

    const newParentId: string | null =
      moved.isMilestone || targetParentId === moved.id ? moved.parentId : targetParentId;

    if (isDragCopyRef.current) {
      // コピーはソース行が残るため移動用の dragIdx 補正を使わない。
      // ドロップ位置から上方向に走査し、同一親の直上の兄弟を afterTaskId とする
      // （直上のフラット行は別タスクの子孫でありうるため不可）
      let copyAfterId: string | null = null;
      for (let i = dropIdx - 1; i >= 0; i--) {
        if (flatRows[i].task.parentId === newParentId) { copyAfterId = flatRows[i].task.id; break; }
      }
      if (copyAfterId) {
        onCopyInsert(moved, newParentId, copyAfterId);
      } else {
        // 上に兄弟がいない＝先頭へのドロップ: 先頭兄弟の前に挿入
        const firstSibling = flatRows.find(r => r.task.parentId === newParentId);
        onCopyInsert(moved, newParentId, null, firstSibling?.task.id ?? null);
      }
      clearDrop();
      return;
    }

    const insertAt = dropIdx > dragIdx ? dropIdx - 1 : dropIdx;
    const parentIdChanged = newParentId !== moved.parentId;
    const newRows = [...flatRows.map(r => r.task)];
    const [removed] = newRows.splice(dragIdx, 1);
    newRows.splice(insertAt, 0, removed);

    if (insertAt === dragIdx && !parentIdChanged) { clearDrop(); return; }

    const orders = newRows.map((t, i) => ({
      id: t.id, order: i + 1,
      ...(t.id === moved.id && parentIdChanged ? { parentId: newParentId } : {}),
    }));
    onReorder(orders);
    clearDrop();
  }

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
  }, []);

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

  useEffect(() => {
    if (!wbsColMenuPos) return;
    const close = () => setWbsColMenuPos(null);
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [wbsColMenuPos]);

  useEffect(() => { dragPreviewRef.current = dragPreview; }, [dragPreview]);
  useEffect(() => { dragStateRef.current  = dragState;   }, [dragState]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!dragState) return;
    const delta = Math.round((e.clientX - dragState.startClientX) / dayWidth);
    let newStart = dragState.origStart;
    let newEnd   = dragState.origEnd;

    if (dragState.type === 'move') {
      newStart = addDays(dragState.origStart, delta);
      newEnd   = addDays(dragState.origEnd,   delta);
    } else if (dragState.type === 'resize-right') {
      newEnd = addDays(dragState.origEnd, delta);
      if (newEnd < newStart) newEnd = newStart;
    } else if (dragState.type === 'resize-left') {
      newStart = addDays(dragState.origStart, delta);
      if (newStart > newEnd) newStart = newEnd;
    } else if (dragState.type === 'create') {
      // 開始閾値を超えるまではプレビューを作らない（クリックの手ぶれによる誤作成防止）。
      // 一度超えたら以降は閾値内に戻っても追従する（スティッキー）。
      if (!createArmedRef.current && Math.abs(e.clientX - dragState.startClientX) < CREATE_DRAG_THRESHOLD_PX) return;
      createArmedRef.current = true;
      const cursorRelX = Math.max(0, (dragState.anchorRelX ?? 0) + (e.clientX - dragState.startClientX));
      const currentDate = xToDateStr(cursorRelX, min, dayWidth);
      newStart = currentDate <= dragState.origStart ? currentDate : dragState.origStart;
      newEnd   = currentDate >= dragState.origStart ? currentDate : dragState.origStart;
    }

    setDragPreview({ taskId: dragState.taskId, startDate: newStart, endDate: newEnd });
  }, [dragState, dayWidth]);

  const handleMouseUp = useCallback(() => {
    const preview = dragPreviewRef.current;
    if (dragState) {
      if (dragState.type === 'create') {
        if (preview) {
          onInlineUpdate(preview.taskId, { startDate: preview.startDate, endDate: preview.endDate });
        }
      } else if (preview && (preview.startDate !== dragState.origStart || preview.endDate !== dragState.origEnd)) {
        // 移動・リサイズ（通常バーのみ。マイルストーン/親はドラッグ入口を持たない）
        onInlineUpdate(preview.taskId, { startDate: preview.startDate, endDate: preview.endDate });
      }
    }
    createArmedRef.current = false;
    setDragState(null);
    setDragPreview(null);
  }, [dragState, onInlineUpdate]);

  useEffect(() => {
    if (!dragState) return;
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragState, handleMouseMove, handleMouseUp]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (dragStateRef.current) {
          dragStateRef.current = null;
          createArmedRef.current = false;
          setDragState(null);
          setDragPreview(null);
        }
        if (linkDragStateRef.current) {
          linkDragStateRef.current = null;
          setLinkDragState(null);
        }
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);


  const startDrag = useCallback((e: React.MouseEvent, taskId: string, type: DragType) => {
    if (e.button !== 0) return;
    if (linkDragStateRef.current) return; // リンクドラッグ中は move/resize を無効化
    if ((childCountRef.current.get(taskId) ?? 0) > 0) return; // 親バーは移動・リサイズ不可
    e.preventDefault();
    const task = taskByIdRef.current.get(taskId);
    if (!task?.startDate) return;
    setDragState({
      taskId, type,
      startClientX: e.clientX,
      origStart: task.startDate,
      origEnd: task.endDate ?? task.startDate,
    });
  }, []);
  const handleBarMoveStart        = useCallback((e: React.MouseEvent, id: string) => startDrag(e, id, 'move'),         [startDrag]);
  const handleBarResizeLeftStart  = useCallback((e: React.MouseEvent, id: string) => startDrag(e, id, 'resize-left'),  [startDrag]);
  const handleBarResizeRightStart = useCallback((e: React.MouseEvent, id: string) => startDrag(e, id, 'resize-right'), [startDrag]);

  function startLinkDrag(e: React.MouseEvent, taskId: string) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const svgEl = svgRef.current;
    if (!svgEl) return;
    const svgRect = svgEl.getBoundingClientRect();
    const svgX = e.clientX - svgRect.left;
    const svgY = e.clientY - svgRect.top;
    setLinkDragState({ fromTaskId: taskId, startSvgX: svgX, startSvgY: svgY, currentX: svgX, currentY: svgY, targetTaskId: null });
  }

  const handleLinkMouseMove = useCallback((e: MouseEvent) => {
    if (!linkDragStateRef.current) return;
    const svgEl = svgRef.current;
    if (!svgEl) return;
    const svgRect = svgEl.getBoundingClientRect();
    const svgX = e.clientX - svgRect.left;
    const svgY = e.clientY - svgRect.top;
    const rowIdx = Math.floor(svgY / uiRowHeight);
    const candidate = flatRowsRef.current[rowIdx];
    const fromId = linkDragStateRef.current.fromTaskId;
    let targetTaskId: string | null = null;
    if (candidate && candidate.task.id !== fromId) {
      const tgt = candidate.task;
      const tbr = taskByIdRef.current;
      // 親タスクは表示スパンの開始日を実効開始日とみなす（DB 日付未設定でも接続可）
      const tgtStart = (childCountRef.current.get(tgt.id) ?? 0) > 0
        ? (parentSpanMapRef.current.get(tgt.id)?.startDate ?? tgt.startDate)
        : tgt.startDate;
      // マイルストーンは後続（終点）にのみ接続可。先行（始点＝コネクタドット）にはなれない（§9.4）
      if (
        tgtStart &&
        !tgt.predecessors.includes(fromId) &&
        !isAncestorOrDescendant(fromId, tgt.id, tbr) &&
        !wouldCreateDepCycle(fromId, tgt.id, tbr)
      ) {
        targetTaskId = tgt.id;
      }
    }
    setLinkDragState(prev => prev ? { ...prev, currentX: svgX, currentY: svgY, targetTaskId } : null);
  }, [uiRowHeight]);

  const handleLinkMouseUp = useCallback(() => {
    const ld = linkDragStateRef.current;
    if (ld?.targetTaskId && ld.targetTaskId !== ld.fromTaskId) {
      // fromTaskId = 先行タスク（右端ドットからドラッグ開始）、targetTaskId = 後続タスク（ドロップ先）
      // 親子階層チェック + 循環チェック
      if (
        !isAncestorOrDescendant(ld.fromTaskId, ld.targetTaskId, taskByIdRef.current) &&
        !wouldCreateDepCycle(ld.fromTaskId, ld.targetTaskId, taskByIdRef.current)
      ) {
        const target = taskByIdRef.current.get(ld.targetTaskId);
        if (target && !target.predecessors.includes(ld.fromTaskId)) {
          onInlineUpdate(ld.targetTaskId, { predecessors: [...target.predecessors, ld.fromTaskId] });
        }
      }
    }
    setLinkDragState(null);
    setHoveredBarId(null);
  }, [onInlineUpdate]);

  const isLinkDragging = linkDragState !== null;
  useEffect(() => {
    if (!isLinkDragging) return;
    window.addEventListener('mousemove', handleLinkMouseMove);
    window.addEventListener('mouseup', handleLinkMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleLinkMouseMove);
      window.removeEventListener('mouseup', handleLinkMouseUp);
    };
  }, [isLinkDragging, handleLinkMouseMove, handleLinkMouseUp]);

  function startCreateDrag(e: React.MouseEvent, taskId: string) {
    if (e.button !== 0) return;
    e.preventDefault();
    const scrollLeft = ganttPanelRef.current?.scrollLeft ?? 0;
    const panelRect  = ganttPanelRef.current?.getBoundingClientRect();
    if (!panelRect) return;
    const relX = e.clientX - panelRect.left + scrollLeft;
    const anchorDate = xToDateStr(relX, min, dayWidth);
    createArmedRef.current = false; // 閾値判定をリセット
    setDragState({ taskId, type: 'create', startClientX: e.clientX, anchorRelX: relX, origStart: anchorDate, origEnd: anchorDate });
  }

  const toggleCollapse = useCallback((id: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const TH: React.CSSProperties = {
    height: HEADER_ROW_H, display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 11, fontWeight: 700, color: 'var(--th-text-muted)',
    borderRight: '1px solid var(--th-border)', cursor: 'default', userSelect: 'none',
    boxSizing: 'border-box', padding: '0 4px',
  };

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden',
      cursor: dragState ? 'grabbing' : colResize ? 'col-resize' : 'default',
    }}>

    {/* ── メインエリア（WBS + ガント）── */}
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 120 }}>

      {/* ── WBS 左パネル（スクロールバーなし） ── */}
      <div data-testid="wbs-panel" ref={wbsPanelRef} onWheel={handleWbsWheel} style={{
        flexShrink: 0, width: LEFT_TOTAL, display: 'flex', flexDirection: 'column',
        overflow: 'hidden', borderRight: '2px solid var(--th-border-strong)', background: 'var(--th-bg)',
        transition: 'width 0.15s ease',
      }}>
        {/* WBS ヘッダー（高さをガントヘッダーに合わせる） */}
        <div data-testid="wbs-header" style={{
          flexShrink: 0, height: ganttHeaderH || totalHeaderH,
          minHeight: 26,
          display: 'flex', alignItems: 'flex-end', background: 'var(--th-bg2)', borderBottom: '2px solid var(--th-border)',
          position: 'relative',
        }}>
          {/* WBS 閉じているとき: # セル全体が ▷ ボタン */}
          {!wbsPanelOpen && (
            <div
              title="WBSを表示"
              onClick={() => setWbsPanelOpen(true)}
              style={{ ...TH, width: 36, cursor: 'pointer', alignSelf: 'stretch', height: 'auto', justifyContent: 'center' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#e0e7ff'; (e.currentTarget as HTMLElement).style.color = '#4f46e5'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; (e.currentTarget as HTMLElement).style.color = 'var(--th-text-muted)'; }}
            >
              ▷
            </div>
          )}

          {/* WBS 開いているとき: 各列ヘッダーを描画 */}
          {wbsPanelOpen && visibleLeftCols.map(col => {
            const w = (col.key === 'startDate' || col.key === 'endDate')
              ? dateColWidth
              : (colWidths[col.key as keyof typeof colWidths] ?? col.width);
            const resizable = RESIZABLE_COL_KEYS.has(col.key);
            const isTitleCol = col.key === 'title';
            return (
              <div
                key={col.key}
                style={{ ...TH, width: w,
                  position: resizable ? 'relative' : undefined,
                  justifyContent: isTitleCol ? 'flex-start' : 'center', gap: 2 }}
                onContextMenu={isTitleCol ? e => { e.preventDefault(); setTitleHeaderCtxMenu({ x: e.clientX, y: e.clientY }); } : undefined}
              >
                {isTitleCol && childCount.size > 0 && (
                  <div style={{ display: 'flex', gap: 1, paddingRight: 4 }}>
                    {([
                      { label: '⊟', title: '全て折りたたむ', action: collapseAll },
                      { label: '1',  title: '1段目まで展開',  action: () => expandToDepth(1) },
                      { label: '2',  title: '2段目まで展開',  action: () => expandToDepth(2) },
                      { label: '3',  title: '3段目まで展開',  action: () => expandToDepth(3) },
                      { label: '⊞', title: '全て展開',        action: expandAll },
                    ] as const).map(({ label, title, action }) => (
                      <button key={label} title={title}
                        onClick={e => { e.stopPropagation(); action(); }}
                        style={{ border: 'none', background: 'none', cursor: 'pointer',
                          fontSize: 11, color: 'var(--th-text-dim)', padding: '1px 3px', borderRadius: 2,
                          lineHeight: 1, fontWeight: 600, fontFamily: 'monospace' }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#e0e7ff'; e.currentTarget.style.color = '#4f46e5'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--th-text-dim)'; }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
                {col.label}
                {resizable && (
                  <div
                    style={{ position: 'absolute', right: 0, top: 4, bottom: 4, width: 4,
                      cursor: 'col-resize', background: '#c7d2fe', borderRadius: 2, zIndex: 1 }}
                    onMouseDown={e => {
                      e.preventDefault(); e.stopPropagation();
                      setColResize({ key: col.key, startX: e.clientX, startWidth: w });
                    }}
                    onClick={e => e.stopPropagation()}
                  />
                )}
              </div>
            );
          })}

          {/* WBS 開いているとき: 右端に列設定・閉じるボタン群（絶対配置・上下全体） */}
          {wbsPanelOpen && (
            <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, display: 'flex' }}>
              <button
                title="WBS列の表示設定"
                onMouseDown={e => e.stopPropagation()}
                onClick={e => {
                  const r = e.currentTarget.getBoundingClientRect();
                  setWbsColMenuPos(wbsColMenuPos ? null : { x: r.left, y: r.bottom + 2 });
                }}
                style={{
                  border: 'none', background: 'none', cursor: 'pointer',
                  fontSize: 11, color: 'var(--th-text-dim)', padding: '0 6px',
                  borderRadius: 0, lineHeight: 1, display: 'flex', alignItems: 'center',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = '#e0e7ff'; e.currentTarget.style.color = '#4f46e5'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--th-text-dim)'; }}
              >
                列
              </button>
              <button
                title="WBSを隠す"
                onClick={() => setWbsPanelOpen(false)}
                style={{
                  border: 'none', background: 'none', cursor: 'pointer',
                  fontSize: 12, color: 'var(--th-text-dim)', padding: '0 6px',
                  borderRadius: 0, lineHeight: 1, display: 'flex', alignItems: 'center',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = '#e0e7ff'; e.currentTarget.style.color = '#4f46e5'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--th-text-dim)'; }}
              >
                ◁
              </button>
            </div>
          )}
        </div>

        {/* WBS ボディ（垂直スクロールはガントパネルと同期） */}
        <div ref={wbsBodyRef} style={{ flex: 1, overflowY: 'hidden' }}>
          {/* 仮想化: 可視範囲外は上下スペーサで高さのみ確保（スクロール同期を維持） */}
          <div style={{ height: vStart * uiRowHeight, flexShrink: 0 }} />
          {(() => {
            const dragIdx = rowDragId ? flatRows.findIndex(r => r.task.id === rowDragId) : -1;
            return flatRows.slice(vStart, vEnd).map(({ task, depth }, sliceIdx) => {
              const idx = vStart + sliceIdx; // D&D は絶対インデックスで処理する
              const isNoOp = dragIdx !== -1 && (rowDropIdx === dragIdx || rowDropIdx === dragIdx + 1);
              const showDropLine = rowDropIdx === idx && !!rowDragId && !isNoOp;
              return (
                <div
                  key={task.id}
                  draggable
                  onDragStart={(e) => handleRowDragStart(e, task.id)}
                  onDragOver={(e) => handleRowDragOver(e, idx)}
                  onDrop={(e) => handleRowDrop(e, idx)}
                  onDragEnd={clearDrop}
                  style={{
                    opacity: rowDragId === task.id ? 0.4 : 1,
                    cursor: 'grab',
                    position: 'relative',
                    outline: rowDropTarget === task.id ? '2px solid #4f46e5' : undefined,
                    outlineOffset: '-1px',
                    zIndex: rowDropTarget === task.id ? 1 : undefined,
                  }}
                >
                  {showDropLine && (
                    <div data-drop-line style={{
                      position: 'absolute',
                      left: textStartX(rowDropDepth ?? 0),
                      right: 0, top: -2,
                      height: 3, background: '#4f46e5',
                      borderRadius: 2, boxShadow: '0 0 6px rgba(79,70,229,0.5)',
                      pointerEvents: 'none', zIndex: 5,
                    }} />
                  )}
                  <GanttLeftRow
                    task={task}
                    depth={depth}
                    hasChildren={(childCount.get(task.id) ?? 0) > 0}
                    isCollapsed={collapsed.has(task.id)}
                    effectiveProgress={progressMap.get(task.id) ?? task.progress}
                    fontSize={uiFontSize}
                    rowHeight={uiRowHeight}
                    titleWidth={colWidths.title}
                    assigneeWidth={colWidths.assignee}
                    dateColWidth={dateColWidth}
                    isDragging={rowDragId !== null}
                    hiddenCols={wbsHiddenCols}
                    wbsPanelOpen={wbsPanelOpen}
                    assigneeOptions={assigneeOptions}
                    displayStart={(childCount.get(task.id) ?? 0) > 0 ? (parentSpanMap.get(task.id)?.startDate ?? null) : undefined}
                    displayEnd={(childCount.get(task.id) ?? 0) > 0   ? (parentSpanMap.get(task.id)?.endDate   ?? null) : undefined}
                    onToggleCollapse={toggleCollapse}
                    onInlineUpdate={handleInlineUpdate}
                    onRowContextMenu={handleRowContextMenu}
                  />
                </div>
              );
            });
          })()}
          <div style={{ height: (flatRows.length - vEnd) * uiRowHeight, flexShrink: 0 }} />
          <QuickAddRow onAdd={onQuickAdd} titleWidth={colWidths.title} assigneeWidth={colWidths.assignee} dateColWidth={dateColWidth} />
          {/* 横スクロールバー分の高さを補完してガントとのスクロール同期ズレを防止 */}
          <div style={{ height: hScrollbarH, flexShrink: 0 }} />
        </div>
      </div>

      {/* ── ガント右パネル（横スクロールバーあり） ── */}
      <div data-testid="gantt-panel" ref={ganttPanelRef} style={{ flex: 1, overflow: 'auto' }} onScroll={handleScroll}>
        <div style={{ width: totalWidth }}>

          {/* ガントヘッダー（マルチレベル・sticky） */}
          <div data-testid="gantt-header" ref={ganttHeaderRef} style={{
            position: 'sticky', top: 0, zIndex: 20,
            borderBottom: '2px solid var(--th-border)', background: 'var(--th-bg2)',
            minHeight: HEADER_ROW_H,
          }}>
            {headerRows.map((row, ri) => (
              <div key={row.level} data-level={row.level} style={{
                width: totalWidth, position: 'relative',
                height: HEADER_ROW_H, boxSizing: 'border-box',
                background: 'var(--th-bg2)',
                borderTop: ri > 0 ? '1px solid var(--th-border)' : undefined,
              }}>
                {row.cells.map((cell, ci) => {
                  const isSat = (row.level === 'day' || row.level === 'dow') && cell.dow === 6;
                  const isSun = (row.level === 'day' || row.level === 'dow') && cell.dow === 0;
                  // マイルストーン強調は日（day）・曜日（dow）行のセルのみ。
                  // week/month/year セルは週頭・月初・年初の x が一致しても色づけない。
                  const isMilestoneDate = (row.level === 'day' || row.level === 'dow')
                    && milestoneXSet.has(cell.x);
                  const bg = isMilestoneDate
                    ? (milestoneColorByX.get(cell.x) ?? milestoneHighlightColor) + '55'
                    : isSat
                      ? 'rgba(59,130,246,0.18)'
                      : isSun
                        ? 'rgba(239,68,68,0.18)'
                        : ci % 2 === 0 ? 'var(--th-bg2)' : 'var(--th-bg3)';
                  return (
                    <div
                      key={ci}
                      data-dow={row.level === 'dow' ? cell.dow : undefined}
                      style={{
                        position: 'absolute', left: cell.x, width: cell.width, height: HEADER_ROW_H,
                        background: bg,
                        borderRight: '1px solid var(--th-border)',
                        display: 'flex', alignItems: 'center',
                        justifyContent: (row.level === 'day' || row.level === 'dow') ? 'center' : undefined,
                        paddingLeft: (row.level === 'day' || row.level === 'dow') ? 0 : 4,
                        fontSize: 10,
                        fontWeight: row.level === 'year' ? 800 : 600,
                        color: row.level === 'dow'
                          ? (isSat ? '#3b82f6' : isSun ? '#ef4444' : 'var(--th-text-muted)')
                          : row.level === 'year' ? 'var(--th-text2)' : 'var(--th-text-muted)',
                        boxSizing: 'border-box', overflow: 'hidden',
                      }}
                    >
                      {cell.label}
                    </div>
                  );
                })}
              </div>
            ))}
            {/* マイルストーンヘッダー行（多段レーン対応） */}
            {milestoneItems.length > 0 && (
              <div data-milestone-marker style={{
                position: 'relative', width: totalWidth, height: milestoneHeaderH,
                boxSizing: 'border-box',
                borderTop: '1px solid var(--th-border)',
                background: 'var(--th-bg2)', overflow: 'hidden',
              }}>
                {milestoneItems.map((m, i) => (
                  <div key={i} style={{
                    position: 'absolute', left: m.x + dayWidth / 2,
                    display: 'flex', alignItems: 'center', gap: 2,
                    fontSize: 11, fontWeight: 600, color: m.color,
                    whiteSpace: 'nowrap',
                    top: m.lane * milestoneLaneH + 2,
                    height: milestoneLaneH - 2,
                  }}>
                    <span style={{ transform: 'translateX(-50%)' }}>◆</span>
                    {m.title}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ガント SVG */}
          <svg ref={svgRef} width={totalWidth} height={Math.max(totalHeight, 1)} style={{ display: 'block' }}
            onMouseMove={e => {
              if (dragState || linkDragState) return;
              const svgRect = svgRef.current?.getBoundingClientRect();
              if (!svgRect) return;
              const rowIdx = Math.floor((e.clientY - svgRect.top) / uiRowHeight);
              setHoveredBarId(flatRows[rowIdx]?.task.id ?? null);
            }}
            onMouseLeave={() => setHoveredBarId(null)}
          >
            <defs>
              <marker id="arrowhead" markerWidth="6" markerHeight="6" refX="6" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6 Z" fill="#378ADD" />
              </marker>
              <marker id="arrowhead-critical" markerWidth="7" markerHeight="7" refX="7" refY="3.5" orient="auto">
                <path d="M0,0 L7,3.5 L0,7 Z" fill="#6366f1" />
              </marker>
              <filter id="critical-glow" x="-20%" y="-50%" width="140%" height="200%">
                <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#6366f1" floodOpacity="0.65" />
              </filter>
            </defs>

            {/* 縞背景（仮想化: 可視範囲のみ・Y座標は絶対インデックス） */}
            {flatRows.slice(vStart, vEnd).map(({ task, depth }, sliceIdx) => {
              const i = vStart + sliceIdx;
              const isParent    = (childCount.get(task.id) ?? 0) > 0;
              const isRootParent = depth === 0 && isParent;
              const canCreate   = !task.startDate && !isParent && !task.isMilestone;
              return (
                <rect key={task.id} x={0} y={i * uiRowHeight} width={totalWidth} height={uiRowHeight}
                  style={{ fill: task.titleBgColor ?? (isRootParent ? 'var(--th-bg-parent)' : (i % 2 === 0 ? 'var(--th-bg)' : 'var(--th-bg-alt)')), cursor: canCreate ? 'crosshair' : undefined }}
                  onMouseDown={canCreate ? (e) => startCreateDrag(e, task.id) : undefined}
                />
              );
            })}

            {/* QuickAddRow に対応する背景（WBSとの視覚的整合） */}
            <rect
              x={0}
              y={flatRows.length * uiRowHeight}
              width={totalWidth}
              height={uiRowHeight}
              style={{ fill: 'var(--th-bg2)' }}
            />

            {/* 土日背景 */}
            {weekendXs.map((x, i) => (
              <rect key={i} x={x} y={0} width={dayWidth} height={Math.max(totalHeight, 1)}
                fill="rgba(148,163,184,0.18)" />
            ))}

            {/* マイルストーン列背景 */}
            {milestoneItems.map((m, i) => (
              <rect key={i} x={m.x} y={0} width={dayWidth} height={Math.max(totalHeight, 1)}
                fill={m.color + '33'} />
            ))}

            {/* タスクバー（仮想化: 可視範囲のみ・rowIndex は絶対インデックス） */}
            {flatRows.slice(vStart, vEnd).map(({ task }, sliceIdx) => {
              const i = vStart + sliceIdx;
              const preview = dragPreview?.taskId === task.id ? dragPreview : null;
              const isParent = (childCount.get(task.id) ?? 0) > 0;
              return (
                <GanttBar
                  key={task.id}
                  task={task}
                  minDate={min}
                  zoom={zoomLevel}
                  rowIndex={i}
                  isCritical={criticalSet.has(task.id) || collapsedCriticalParents.has(task.id)}
                  dragPreview={preview}
                  rowHeight={uiRowHeight}
                  isParent={isParent}
                  isCollapsed={collapsed.has(task.id)}
                  effectiveProgress={isParent ? progressMap.get(task.id) : undefined}
                  displayStart={isParent ? (parentSpanMap.get(task.id)?.startDate ?? null) : undefined}
                  displayEnd={isParent   ? (parentSpanMap.get(task.id)?.endDate   ?? null) : undefined}
                  milestoneColor={task.isMilestone ? milestoneColorOf(task.titleColor, milestoneHighlightColor) : undefined}
                  onMoveStart={handleBarMoveStart}
                  onResizeLeftStart={handleBarResizeLeftStart}
                  onResizeRightStart={handleBarResizeRightStart}
                  onClick={handleBarClick}
                />
              );
            })}

            {/* 依存関係矢印（折りたたみ時は可視祖先へリダイレクト） */}
            {dependencyArrows}

            {/* ホバー中バーの右端コネクタドット（リンクドラッグ開始点） */}
            {hoveredBarId && !linkDragState && (() => {
              const hTask = taskById.get(hoveredBarId);
              const hEnd = hTask ? effEndDate(hTask) : null;
              if (!hTask || hTask.isMilestone || !hEnd) return null;
              const cx = dateToX(hEnd, min, zoomLevel) + dayWidth + 6;
              const cy = (taskIndex.get(hTask.id) ?? 0) * uiRowHeight + uiRowHeight / 2;
              return (
                <circle
                  data-connector-dot
                  cx={cx} cy={cy} r={6}
                  fill="#378ADD" stroke="white" strokeWidth={1.5}
                  style={{ cursor: 'crosshair' }}
                  onMouseDown={e => { if (e.button !== 0) return; e.stopPropagation(); startLinkDrag(e, hoveredBarId); }}
                />
              );
            })()}

            {/* リンクドラッグ中：ターゲットバー左端ドット */}
            {linkDragState?.targetTaskId && (() => {
              const tgt = taskById.get(linkDragState.targetTaskId!);
              const tgtStart = tgt ? effStartDate(tgt) : null;
              if (!tgt || !tgtStart) return null;
              const cx = dateToX(tgtStart, min, zoomLevel) - 6;
              const cy = (taskIndex.get(tgt.id) ?? 0) * uiRowHeight + uiRowHeight / 2;
              return <circle data-link-target-dot cx={cx} cy={cy} r={6} fill="#378ADD" stroke="white" strokeWidth={1.5} pointerEvents="none" />;
            })()}

            {/* リンクドラッグ中のプレビュー破線（fromTask の右端 → マウス位置） */}
            {linkDragState && (() => {
              const fromTask = taskById.get(linkDragState.fromTaskId);
              const fromEnd = fromTask ? effEndDate(fromTask) : null;
              if (!fromTask || !fromEnd) return null;
              const x1 = dateToX(fromEnd, min, zoomLevel) + dayWidth + 6;
              const y1 = (taskIndex.get(fromTask.id) ?? 0) * uiRowHeight + uiRowHeight / 2;
              return (
                <line
                  x1={x1} y1={y1}
                  x2={linkDragState.currentX} y2={linkDragState.currentY}
                  stroke="#378ADD" strokeWidth={2} strokeDasharray="5,3"
                  pointerEvents="none"
                />
              );
            })()}

            {/* 今日ライン */}
            {showTodayLine && (
              <TodayLine
                min={min}
                zoomLevel={zoomLevel}
                height={Math.max(totalHeight, 1)}
              />
            )}

            {/* イナズマライン */}
            {showLightningLine && lightningPoints && (
              <LightningLine points={lightningPoints} color="#7c3aed" />
            )}
          </svg>
        </div>
      </div>

      {/* コンテキストメニュー（position: fixed なのでどこに置いても動作する） */}
      {[
        barCtxMenu && { menu: barCtxMenu, close: () => setBarCtxMenu(null) },
        rowCtxMenu && { menu: rowCtxMenu, close: () => setRowCtxMenu(null) },
      ].map((entry, i) => {
        if (!entry) return null;
        const { menu, close } = entry;
        const task = taskById.get(menu.taskId);
        if (!task) return null;
        return (
          <ContextMenu key={i} x={menu.x} y={menu.y}
            onMouseDown={e => e.stopPropagation()}
            onClick={e => e.stopPropagation()}
          >
            {!task.isMilestone && (
              <>
                <AddChildMenuItem
                  onAddTask={() => { onAddSubTask(task.id); close(); }}
                  onAddMilestone={() => { onAddSubMilestone?.(task.id); close(); }}
                />
                <div style={{ height: 1, background: 'var(--th-border)' }} />
              </>
            )}
            <button onClick={() => { onEditTask(task); close(); }}
              style={MENU_BTN} onMouseEnter={onMenuEnter} onMouseLeave={onMenuLeave}>
              編集（詳細）
            </button>
            <div style={{ height: 1, background: 'var(--th-border)' }} />
            {/* 色パレット */}
            <div style={{ padding: '6px 10px' }}>
              {([
                { label: '文字色', field: 'titleColor' as const },
                { label: '背景色', field: 'titleBgColor' as const },
              ] as { label: string; field: 'titleColor' | 'titleBgColor' }[]).map(({ label, field }) => (
                <div key={field} style={{ marginBottom: 4 }}>
                  <div style={{ fontSize: 10, color: 'var(--th-text-dim)', marginBottom: 3 }}>{label}</div>
                  <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                    {COLOR_PALETTE.map((c, ci) => (
                      <button
                        key={ci}
                        title={c ?? 'リセット'}
                        onClick={() => { onInlineUpdate(task.id, { [field]: c }); close(); }}
                        style={{
                          width: 18, height: 18, borderRadius: '50%', border: '1px solid #9ca3af',
                          background: c ?? '#ffffff', cursor: 'pointer', padding: 0, flexShrink: 0,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 10, color: '#9ca3af', lineHeight: 1,
                        }}
                      >
                        {c === null ? '✕' : ''}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ height: 1, background: 'var(--th-border)' }} />
            <div style={{ height: 1, background: 'var(--th-border)' }} />
            <button onClick={() => { setCopiedTask(task); close(); }}
              style={MENU_BTN} onMouseEnter={onMenuEnter} onMouseLeave={onMenuLeave}>
              コピー
            </button>
            {copiedTask && (
              <button onClick={() => { onCopyInsert(copiedTask, task.parentId, null, task.id); close(); }}
                style={MENU_BTN} onMouseEnter={onMenuEnter} onMouseLeave={onMenuLeave}>
                上に挿入
              </button>
            )}
            <div style={{ height: 1, background: 'var(--th-border)' }} />
            <button onClick={() => { onDeleteTask(task.id); close(); }}
              style={{ ...MENU_BTN, color: '#ef4444' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#fef2f2')}
              onMouseLeave={onMenuLeave}>
              削除
            </button>
          </ContextMenu>
        );
      })}

      {/* 依存矢印右クリック: 依存を解除 */}
      {depCtxMenu && (
        <ContextMenu x={depCtxMenu.x} y={depCtxMenu.y}
          onMouseDown={e => e.stopPropagation()}
          onClick={e => e.stopPropagation()}
        >
          <div style={{ padding: '4px 14px 2px', fontSize: 11, color: 'var(--th-text-muted)' }}>依存関係</div>
          <button
            onClick={() => {
              const target = taskById.get(depCtxMenu.toTaskId);
              if (target) {
                onInlineUpdate(depCtxMenu.toTaskId, { predecessors: target.predecessors.filter(p => p !== depCtxMenu.fromTaskId) });
              }
              setDepCtxMenu(null);
            }}
            style={{ ...MENU_BTN, color: '#ef4444' }}
            onMouseEnter={e => (e.currentTarget.style.background = '#fef2f2')}
            onMouseLeave={onMenuLeave}
          >
            依存を解除
          </button>
        </ContextMenu>
      )}

      {/* タイトル列ヘッダー右クリック: 全タスク色一括リセット */}
      {titleHeaderCtxMenu && (
        <ContextMenu x={titleHeaderCtxMenu.x} y={titleHeaderCtxMenu.y}
          onMouseDown={e => e.stopPropagation()}
          onClick={e => e.stopPropagation()}
        >
          <div style={{ padding: '6px 10px' }}>
            <div style={{ fontSize: 10, color: 'var(--th-text-dim)', marginBottom: 4 }}>展開 / 折りたたみ</div>
            <div style={{ display: 'flex', gap: 2 }}>
              {([
                { label: '⊟', title: '全て折りたたむ', action: collapseAll },
                { label: '1',  title: '1段目まで展開',  action: () => expandToDepth(1) },
                { label: '2',  title: '2段目まで展開',  action: () => expandToDepth(2) },
                { label: '3',  title: '3段目まで展開',  action: () => expandToDepth(3) },
                { label: '⊞', title: '全て展開',        action: expandAll },
              ] as const).map(({ label, title, action }) => (
                <button key={label} title={title}
                  onClick={() => { action(); setTitleHeaderCtxMenu(null); }}
                  style={{
                    flex: 1, padding: '4px 0', border: '1px solid var(--th-border)',
                    background: 'var(--th-bg2)', cursor: 'pointer', fontSize: 12,
                    color: 'var(--th-text2)', borderRadius: 3, fontFamily: 'monospace', fontWeight: 600,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#e0e7ff'; e.currentTarget.style.color = '#4f46e5'; e.currentTarget.style.borderColor = '#a5b4fc'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'var(--th-bg2)'; e.currentTarget.style.color = 'var(--th-text2)'; e.currentTarget.style.borderColor = 'var(--th-border)'; }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div style={{ height: 1, background: 'var(--th-border)', margin: '2px 0' }} />
          <button
            onClick={async () => {
              const colored = tasks.filter(t => t.titleColor !== null || t.titleBgColor !== null);
              await Promise.all(colored.map(t => onInlineUpdate(t.id, { titleColor: null, titleBgColor: null })));
              setTitleHeaderCtxMenu(null);
            }}
            style={MENU_BTN} onMouseEnter={onMenuEnter} onMouseLeave={onMenuLeave}>
            全タスクの色をリセット
          </button>
        </ContextMenu>
      )}

      {/* WBS列表示設定ポップアップ */}
      {wbsColMenuPos && (
        <div
          onMouseDown={e => e.stopPropagation()}
          style={{
            position: 'fixed', left: wbsColMenuPos.x, top: wbsColMenuPos.y,
            background: 'var(--th-bg)', border: '1px solid var(--th-border)',
            borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            padding: '8px 12px', zIndex: 9999,
            display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12,
          }}
        >
          {HIDEABLE_COLS.map(col => (
            <label key={col.key} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none', color: 'var(--th-text2)' }}>
              <input
                type="checkbox"
                checked={!wbsHiddenCols.includes(col.key)}
                onChange={e => setWbsHiddenCols(
                  e.target.checked
                    ? wbsHiddenCols.filter(k => k !== col.key)
                    : [...wbsHiddenCols, col.key]
                )}
                style={{ accentColor: '#4f46e5', cursor: 'pointer' }}
              />
              {col.label}
            </label>
          ))}
        </div>
      )}
    </div>{/* メインエリア終了 */}

    {/* ── 担当者別スイムレーン（リソースビュー）── */}
    {showResourceView && (
      <ResourceView
        tasks={sorted}
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
