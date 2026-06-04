import { useState, useRef, useEffect, useCallback } from 'react';
import type { Task } from '../../types/task';
import { useTaskStore } from '../../store/taskStore';
import { filterTasks } from '../../utils/sort';
import {
  calcGanttRange, calcLightningPoints,
  ganttTotalWidth, ZOOM_CONFIG, calcCriticalPath,
  addDays, buildMultiLevelHeaders,
} from '../../utils/ganttCalc';
import { buildTree, flattenTree, calcEffectiveProgress, includeAncestors } from '../../utils/taskTree';
import type { TreeNode } from '../../utils/taskTree';
import { textStartX, INDENT } from '../../utils/wbsLayout';
import { GanttBar } from './GanttBar';
import { ResourceView } from './ResourceView';
import { DependencyArrow } from './DependencyArrow';
import { LightningLine, TodayLine } from './LightningLine';
import { ContextMenu } from './GanttContextMenu';
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

const RESIZABLE_COL_KEYS = new Set(['title', 'assignee']);
const COL_MIN_WIDTHS: Record<string, number> = { title: 80, assignee: 50 };

// ── ドラッグ状態 ────────────────────────────────────
type DragType = 'move' | 'resize-left' | 'resize-right';
interface DragState {
  taskId: string;
  type: DragType;
  startClientX: number;
  origStart: string;
  origEnd: string;
}
interface DragPreview {
  taskId: string;
  startDate: string;
  endDate: string;
}



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

// ── メインコンポーネント ──────────────────────────────
interface Props {
  onEditTask: (task: Task) => void;
  onDeleteTask: (id: string) => void;
  onInlineUpdate: (id: string, patch: Partial<Task>) => void;
  onQuickAdd: (title: string) => Promise<void>;
  onAddSubTask: (parentId: string) => void;
  onReorder: (orders: { id: string; order: number; parentId?: string | null }[]) => Promise<void>;
}

export function GanttChart({ onEditTask, onDeleteTask, onInlineUpdate, onQuickAdd, onAddSubTask, onReorder }: Props) {
  const {
    tasks, filterStatus, filterAssignee, filterPriority, filterSearch,
    zoomLevel, ganttStartDate, ganttPeriod,
    showLightningLine, showWeekend, showCriticalPath, showResourceView, uiFontSize, uiRowHeight, ganttHeaderLevels,
  } = useTaskStore();

  const sorted = filterTasks(tasks, filterStatus, filterAssignee, filterPriority, filterSearch);

  // 列幅（タイトル・担当者はドラッグでリサイズ可）
  const [colWidths, setColWidths] = useState({ title: 180, assignee: 76 });
  const [colResize, setColResize] = useState<{ key: string; startX: number; startWidth: number } | null>(null);
  const colResizeRef = useRef<typeof colResize>(null);
  useEffect(() => { colResizeRef.current = colResize; }, [colResize]);

  // フォントサイズに連動した日付列幅 (YYYY-MM-DD の10文字が収まる幅)
  const dateColWidth = 80 + (uiFontSize - 11) * 5; // 11px→80, 13px→90, 15px→100

  const LEFT_TOTAL = LEFT_COLS.reduce((s, c) => {
    if (c.key === 'startDate' || c.key === 'endDate') return s + dateColWidth;
    return s + (colWidths[c.key as keyof typeof colWidths] ?? c.width);
  }, 0);

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
  const withAncestors = includeAncestors(sorted, tasks);
  const { roots, childCount } = buildTree(withAncestors);
  const flatRows = flattenTree(roots, collapsed);

  const collapseAll    = () => setCollapsed(new Set(childCount.keys()));
  const expandAll      = () => setCollapsed(new Set());
  const expandToDepth  = (depth: number) => {
    const acc = new Set<string>();
    collectCollapsedByDepth(roots, depth, acc);
    setCollapsed(acc);
  };

  const start  = ganttStartDate || undefined;
  const period = ganttPeriod    || undefined;
  const range  = calcGanttRange(sorted, start, period, zoomLevel);
  const { min, max } = range;
  const totalWidth  = ganttTotalWidth(sorted, zoomLevel, start, period);
  const headerRows  = buildMultiLevelHeaders(min, max, zoomLevel, ganttHeaderLevels);

  const taskIndex = new Map(flatRows.map(({ task }, i) => [task.id, i]));

  function resolveVisibleId(id: string): string | null {
    let cur: string | undefined = id;
    while (cur) {
      if (taskIndex.has(cur)) return cur;
      cur = taskById.get(cur)?.parentId ?? undefined;
    }
    return null;
  }
  const taskById  = new Map(sorted.map(t => [t.id, t]));
  const totalHeight = (flatRows.length + 1) * uiRowHeight;

  const { dayWidth } = ZOOM_CONFIG[zoomLevel];

  // 土日列
  const weekendXs: number[] = [];
  if (showWeekend) {
    let curTime = min.getTime();
    const endTime = max.getTime();
    while (curTime < endTime) {
      const dow = new Date(curTime).getDay();
      if (dow === 0 || dow === 6) {
        weekendXs.push(Math.round((curTime - min.getTime()) / 86400000) * dayWidth);
      }
      curTime += 86400000;
    }
  }

  // 親タスクの進捗事前計算
  const progressMap = new Map(
    sorted.map(t => [t.id, calcEffectiveProgress(t.id, childCount, sorted)])
  );

  // イナズマライン
  const lightningPoints = calcLightningPoints(
    flatRows.map(r => ({
      task: r.task,
      effectiveProgress: progressMap.get(r.task.id) ?? 0,
      hasChildren: (childCount.get(r.task.id) ?? 0) > 0,
      isCollapsed: collapsed.has(r.task.id),
    })),
    min,
    zoomLevel,
    uiRowHeight,
  );

  // クリティカルパス
  const criticalSet = showCriticalPath ? calcCriticalPath(sorted) : new Set<string>();

  // ── ドラッグ状態（バー移動・リサイズ） ──────────────
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null);
  const dragPreviewRef = useRef<DragPreview | null>(null);
  const [barCtxMenu, setBarCtxMenu] = useState<{ x: number; y: number; taskId: string } | null>(null);
  const [rowCtxMenu, setRowCtxMenu] = useState<{ x: number; y: number; taskId: string } | null>(null);
  const [titleHeaderCtxMenu, setTitleHeaderCtxMenu] = useState<{ x: number; y: number } | null>(null);

  // ── 行 D&D（ソートなし時の並び替え） ─────────────────
  const wbsPanelRef  = useRef<HTMLDivElement>(null);
  const [rowDragId,    setRowDragId]    = useState<string | null>(null);
  const [rowDropIdx,   setRowDropIdx]   = useState<number | null>(null);
  const [rowDropDepth, setRowDropDepth] = useState<number | null>(null);
  const [rowDropTarget, setRowDropTarget] = useState<string | null>(null);

  function clearDrop() {
    setRowDragId(null);
    setRowDropIdx(null);
    setRowDropDepth(null);
    setRowDropTarget(null);
  }

  function handleRowDragStart(e: React.DragEvent, taskId: string) {
    const tag = document.activeElement?.tagName ?? '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
      e.preventDefault();
      return;
    }
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
    setRowDragId(taskId);
  }

  function handleRowDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';

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

    // ── 子採用モード ──
    if (rowDropTarget) {
      const moved = flatRows[dragIdx].task;
      const siblings = flatRows.filter(r => r.task.parentId === rowDropTarget);
      const maxSibOrder = siblings.length > 0
        ? Math.max(...siblings.map(r => r.task.order))
        : 0;
      onReorder([{ id: moved.id, order: maxSibOrder + 1, parentId: rowDropTarget }]);
      clearDrop();
      return;
    }

    // ── バー挿入モード ──
    if (dragIdx === dropIdx) { clearDrop(); return; }

    const moved = flatRows[dragIdx].task;
    const d = rowDropDepth ?? 0;

    // 深さ → 新しい parentId を逆引き
    const targetParentId: string | null = (() => {
      if (d === 0) return null;
      for (let i = dropIdx - 1; i >= 0; i--) {
        if (flatRows[i].task.id === rowDragId) continue;
        if (flatRows[i].depth === d - 1) return flatRows[i].task.id;
        if (flatRows[i].depth < d - 1) break;
      }
      return null;
    })();
    // 循環参照防止・マイルストーン保護
    const newParentId: string | null =
      moved.isMilestone || targetParentId === moved.id ? moved.parentId : targetParentId;
    const parentIdChanged = newParentId !== moved.parentId;

    const newRows = [...flatRows.map(r => r.task)];
    const [removed] = newRows.splice(dragIdx, 1);
    const insertAt = dropIdx > dragIdx ? dropIdx - 1 : dropIdx;
    newRows.splice(insertAt, 0, removed);

    if (insertAt === dragIdx && !parentIdChanged) { clearDrop(); return; }

    const orders = newRows.map((t, i) => ({
      id: t.id, order: i + 1,
      ...(t.id === moved.id && parentIdChanged ? { parentId: newParentId } : {}),
    }));
    onReorder(orders);
    clearDrop();
  }

  function handleRowDragEnd() {
    clearDrop();
  }
  const svgRef = useRef<SVGSVGElement>(null);
  const wbsBodyRef      = useRef<HTMLDivElement>(null);
  const ganttPanelRef   = useRef<HTMLDivElement>(null);
  const workloadScrollRef = useRef<HTMLDivElement>(null);

  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    if (wbsBodyRef.current) wbsBodyRef.current.scrollTop = e.currentTarget.scrollTop;
    if (workloadScrollRef.current) workloadScrollRef.current.scrollLeft = e.currentTarget.scrollLeft;
  }

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
    if (!titleHeaderCtxMenu) return;
    const close = () => setTitleHeaderCtxMenu(null);
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [titleHeaderCtxMenu]);

  useEffect(() => {
    dragPreviewRef.current = dragPreview;
  }, [dragPreview]);

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
    } else {
      newStart = addDays(dragState.origStart, delta);
      if (newStart > newEnd) newStart = newEnd;
    }

    setDragPreview({ taskId: dragState.taskId, startDate: newStart, endDate: newEnd });
  }, [dragState, dayWidth]);

  const handleMouseUp = useCallback(() => {
    const preview = dragPreviewRef.current;
    if (preview && dragState) {
      if (preview.startDate !== dragState.origStart || preview.endDate !== dragState.origEnd) {
        const patch: Partial<Task> = { startDate: preview.startDate, endDate: preview.endDate };
        // マイルストーンは startDate のみ（endDate は同日）
        const task = taskById.get(preview.taskId);
        if (task?.isMilestone) patch.endDate = preview.startDate;
        onInlineUpdate(preview.taskId, patch);
      }
    }
    setDragState(null);
    setDragPreview(null);
  }, [dragState, taskById, onInlineUpdate]);

  useEffect(() => {
    if (!dragState) return;
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragState, handleMouseMove, handleMouseUp]);


  function startDrag(e: React.MouseEvent, taskId: string, type: DragType) {
    if (e.button !== 0) return;
    e.preventDefault();
    const task = taskById.get(taskId);
    if (!task?.startDate) return;
    setDragState({
      taskId, type,
      startClientX: e.clientX,
      origStart: task.startDate,
      origEnd: task.endDate ?? task.startDate,
    });
  }

  function toggleCollapse(id: string) {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

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
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

      {/* ── WBS 左パネル（スクロールバーなし） ── */}
      <div data-testid="wbs-panel" ref={wbsPanelRef} onWheel={handleWbsWheel} style={{
        flexShrink: 0, width: LEFT_TOTAL, display: 'flex', flexDirection: 'column',
        overflow: 'hidden', borderRight: '2px solid var(--th-border-strong)', background: 'var(--th-bg)',
      }}>
        {/* WBS ヘッダー（高さをガントヘッダーに合わせる） */}
        <div data-testid="wbs-header" style={{
          flexShrink: 0, height: headerRows.length * HEADER_ROW_H + 2,
          display: 'flex', alignItems: 'flex-end', background: 'var(--th-bg2)', borderBottom: '2px solid var(--th-border)',
        }}>
          {LEFT_COLS.map(col => {
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
        </div>

        {/* WBS ボディ（垂直スクロールはガントパネルと同期） */}
        <div ref={wbsBodyRef} style={{ flex: 1, overflowY: 'hidden' }}>
          {(() => {
            const dragIdx = rowDragId ? flatRows.findIndex(r => r.task.id === rowDragId) : -1;
            return flatRows.map(({ task, depth }, idx) => {
              const isNoOp = dragIdx !== -1 && (rowDropIdx === dragIdx || rowDropIdx === dragIdx + 1);
              const showDropLine = rowDropIdx === idx && !!rowDragId && !isNoOp;
              return (
                <div
                  key={task.id}
                  draggable
                  onDragStart={(e) => handleRowDragStart(e, task.id)}
                  onDragOver={(e) => handleRowDragOver(e, idx)}
                  onDrop={(e) => handleRowDrop(e, idx)}
                  onDragEnd={handleRowDragEnd}
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
                    onToggleCollapse={() => toggleCollapse(task.id)}
                    onInlineUpdate={onInlineUpdate}
                    onRowContextMenu={(x, y) => { setRowCtxMenu({ x, y, taskId: task.id }); setBarCtxMenu(null); }}
                  />
                </div>
              );
            });
          })()}
          <QuickAddRow onAdd={onQuickAdd} titleWidth={colWidths.title} assigneeWidth={colWidths.assignee} dateColWidth={dateColWidth} />
        </div>
      </div>

      {/* ── ガント右パネル（横スクロールバーあり） ── */}
      <div data-testid="gantt-panel" ref={ganttPanelRef} style={{ flex: 1, overflow: 'auto' }} onScroll={handleScroll}>
        <div style={{ width: totalWidth }}>

          {/* ガントヘッダー（マルチレベル・sticky） */}
          <div data-testid="gantt-header" style={{
            position: 'sticky', top: 0, zIndex: 20,
            borderBottom: '2px solid var(--th-border)', background: 'var(--th-bg2)',
          }}>
            {headerRows.map((row, ri) => (
              <div key={row.level} style={{
                width: totalWidth, position: 'relative',
                height: HEADER_ROW_H, boxSizing: 'border-box',
                background: 'var(--th-bg2)',
                borderTop: ri > 0 ? '1px solid var(--th-border)' : undefined,
              }}>
                {row.cells.map((cell, ci) => {
                  const isSat = (row.level === 'day' || row.level === 'dow') && cell.dow === 6;
                  const isSun = (row.level === 'day' || row.level === 'dow') && cell.dow === 0;
                  const bg = isSat
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
                        fontSize: row.level === 'dow' ? 10 : row.level === 'day' ? 10 : 10,
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
          </div>

          {/* ガント SVG */}
          <svg ref={svgRef} width={totalWidth} height={Math.max(totalHeight, 1)} style={{ display: 'block' }}>
            <defs>
              <marker id="arrowhead" markerWidth="6" markerHeight="6" refX="6" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6 Z" fill="#378ADD" />
              </marker>
            </defs>

            {/* 縞背景 */}
            {flatRows.map(({ task, depth }, i) => {
              const isRootParent = depth === 0 && (childCount.get(task.id) ?? 0) > 0;
              return (
                <rect key={i} x={0} y={i * uiRowHeight} width={totalWidth} height={uiRowHeight}
                  style={{ fill: task.titleBgColor ?? (isRootParent ? 'var(--th-bg-parent)' : (i % 2 === 0 ? 'var(--th-bg)' : 'var(--th-bg-alt)')) }} />
              );
            })}

            {/* 土日背景 */}
            {weekendXs.map((x, i) => (
              <rect key={i} x={x} y={0} width={dayWidth} height={Math.max(totalHeight, 1)}
                fill="rgba(148,163,184,0.18)" />
            ))}

            {/* タスクバー */}
            {flatRows.map(({ task }, i) => {
              const preview = dragPreview?.taskId === task.id ? dragPreview : null;
              const isParent = (childCount.get(task.id) ?? 0) > 0;
              return (
                <GanttBar
                  key={task.id}
                  task={task}
                  minDate={min}
                  zoom={zoomLevel}
                  rowIndex={i}
                  isCritical={criticalSet.has(task.id)}
                  dragPreview={preview}
                  rowHeight={uiRowHeight}
                  isParent={isParent}
                  onMoveStart={(e, id) => !isParent && startDrag(e, id, 'move')}
                  onResizeLeftStart={(e, id) => !isParent && startDrag(e, id, 'resize-left')}
                  onResizeRightStart={(e, id) => !isParent && startDrag(e, id, 'resize-right')}
                  onClick={() => !dragState && onEditTask(task)}
                />
              );
            })}

            {/* 依存関係矢印（折りたたみ時は可視祖先へリダイレクト） */}
            {(() => {
              const seen = new Set<string>();
              return sorted.flatMap(task =>
                task.predecessors.flatMap(predId => {
                  const fromId = resolveVisibleId(predId);
                  const toId   = resolveVisibleId(task.id);
                  if (!fromId || !toId || fromId === toId) return [];
                  const key = `${fromId}->${toId}`;
                  if (seen.has(key)) return [];
                  seen.add(key);
                  const fromTask = taskById.get(fromId)!;
                  const toTask   = taskById.get(toId)!;
                  return [
                    <DependencyArrow key={key}
                      fromTask={fromTask} toTask={toTask} minDate={min}
                      zoom={zoomLevel} taskIndex={taskIndex} rowHeight={uiRowHeight} />,
                  ];
                })
              );
            })()}

            {/* 今日ライン */}
            <TodayLine
              min={min}
              zoomLevel={zoomLevel}
              height={Math.max(totalHeight, 1)}
            />

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
                <button
                  onClick={() => { onAddSubTask(task.id); close(); }}
                  style={{
                    display: 'block', width: '100%', padding: '8px 14px', border: 'none',
                    background: 'none', textAlign: 'left', cursor: 'pointer', fontSize: 13,
                    color: 'var(--th-text2)',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--th-bg2)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                >
                  ＋ 子タスクを追加
                </button>
                <div style={{ height: 1, background: 'var(--th-border)' }} />
              </>
            )}
            <button
              onClick={() => { onEditTask(task); close(); }}
              style={{
                display: 'block', width: '100%', padding: '8px 14px', border: 'none',
                background: 'none', textAlign: 'left', cursor: 'pointer', fontSize: 13,
                color: 'var(--th-text2)',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--th-bg2)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            >
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
            <button
              onClick={() => { onDeleteTask(task.id); close(); }}
              style={{
                display: 'block', width: '100%', padding: '8px 14px', border: 'none',
                background: 'none', textAlign: 'left', cursor: 'pointer', fontSize: 13, color: '#ef4444',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#fef2f2')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            >
              削除
            </button>
          </ContextMenu>
        );
      })}

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
            style={{
              display: 'block', width: '100%', padding: '7px 14px', border: 'none',
              background: 'none', textAlign: 'left', cursor: 'pointer', fontSize: 13,
              color: 'var(--th-text2)',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--th-bg2)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
          >
            全タスクの色をリセット
          </button>
        </ContextMenu>
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
      />
    )}
    </div>
  );
}
