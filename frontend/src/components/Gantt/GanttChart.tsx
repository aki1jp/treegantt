import { useState, useRef, useEffect, useCallback } from 'react';
import dayjs from 'dayjs';
import weekOfYear from 'dayjs/plugin/weekOfYear';
import type { Task, TaskStatus, TaskPriority, ZoomLevel } from '../../types/task';
import { useTaskStore } from '../../store/taskStore';
import { sortAndFilter } from '../../utils/sort';
import {
  calcGanttRange, calcTodayX, calcLightningPoints,
  ganttTotalWidth, ZOOM_CONFIG,
  calcCriticalPath,
} from '../../utils/ganttCalc';
import { buildTree, flattenTree, calcEffectiveProgress } from '../../utils/taskTree';
import { GanttBar } from './GanttBar';
import { DependencyArrow } from './DependencyArrow';
import { LightningLine, TodayLine } from './LightningLine';
import { ConflictDialog } from '../ConflictDialog/ConflictDialog';
import { clampMenuPos } from '../../utils/menuPos';

dayjs.extend(weekOfYear);

const HEADER_ROW_H = 26;

// ── 左パネル列定義 ──────────────────────────────────
const LEFT_COLS = [
  { key: 'order',     label: '#',        width: 36,  sortable: true  },
  { key: 'title',     label: 'タイトル', width: 180, sortable: true  },
  { key: 'status',    label: 'ST',       width: 66,  sortable: true  },
  { key: 'priority',  label: '優先',     width: 56,  sortable: true  },
  { key: 'progress',  label: '進捗',     width: 76,  sortable: true  },
  { key: 'assignee',  label: '担当',     width: 76,  sortable: true  },
  { key: 'startDate', label: '開始',     width: 88,  sortable: true  },
  { key: 'endDate',   label: '終了',     width: 88,  sortable: true  },
  { key: 'duration',  label: '日数',     width: 50,  sortable: false },
] as const;

const RESIZABLE_COL_KEYS = new Set(['title', 'assignee']);
const COL_MIN_WIDTHS: Record<string, number> = { title: 80, assignee: 50 };

// ── 色マップ ────────────────────────────────────────
const STATUS_COLOR: Record<TaskStatus, string> = {
  todo: '#6b7280', wip: '#3b82f6', done: '#22c55e', wait: '#f59e0b',
};
const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: 'TODO', wip: 'Doing', done: 'DONE', wait: '待機',
};
const PRIORITY_COLOR: Record<TaskPriority, string> = {
  critical: '#ef4444', high: '#f97316', medium: '#6b7280', low: '#d1d5db',
};
const PRIORITY_LABEL: Record<TaskPriority, string> = {
  critical: '最高', high: '高', medium: '中', low: '低',
};

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

function addDays(date: string, n: number): string {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function calcDuration(start: string | null, end: string | null): number | null {
  if (!start || !end || end < start) return null;
  return Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000) + 1;
}

// ── マルチレベルヘッダー構築 ─────────────────────────
type HeaderRow = { level: 'year' | 'month' | 'week' | 'day'; cells: { label: string; x: number; width: number }[] };

function buildMultiLevelHeaders(
  min: Date, max: Date, zoom: ZoomLevel,
  levels: { year: boolean; month: boolean; week: boolean; day: boolean },
): HeaderRow[] {
  const { dayWidth } = ZOOM_CONFIG[zoom];
  const toX = (d: dayjs.Dayjs) =>
    Math.round((d.toDate().getTime() - min.getTime()) / 86400000) * dayWidth;

  const rows: HeaderRow[] = [];

  if (levels.year) {
    const cells: HeaderRow['cells'] = [];
    let cur = dayjs(min).startOf('year');
    const end = dayjs(max);
    while (cur.isBefore(end)) {
      const next = cur.add(1, 'year');
      const x = Math.max(0, toX(cur));
      const xe = toX(next.isBefore(end) ? next : end);
      cells.push({ label: cur.format('YYYY'), x, width: xe - x });
      cur = next;
    }
    rows.push({ level: 'year', cells });
  }

  if (levels.month) {
    const cells: HeaderRow['cells'] = [];
    let cur = dayjs(min).startOf('month');
    const end = dayjs(max);
    while (cur.isBefore(end)) {
      const next = cur.add(1, 'month');
      const x = Math.max(0, toX(cur));
      const xe = toX(next.isBefore(end) ? next : end);
      cells.push({ label: cur.format('YYYY-MM'), x, width: xe - x });
      cur = next;
    }
    rows.push({ level: 'month', cells });
  }

  if (levels.week) {
    const cells: HeaderRow['cells'] = [];
    let cur = dayjs(min).startOf('week');
    const end = dayjs(max);
    while (cur.isBefore(end)) {
      const next = cur.add(1, 'week');
      const x = Math.max(0, toX(cur));
      const xe = toX(next.isBefore(end) ? next : end);
      cells.push({ label: `W${cur.week()}`, x, width: xe - x });
      cur = next;
    }
    rows.push({ level: 'week', cells });
  }

  if (levels.day) {
    const cells: HeaderRow['cells'] = [];
    let cur = dayjs(min);
    const end = dayjs(max);
    while (cur.isBefore(end)) {
      const x = toX(cur);
      cells.push({ label: cur.format('D'), x, width: dayWidth });
      cur = cur.add(1, 'day');
    }
    rows.push({ level: 'day', cells });
  }

  return rows;
}

// ── コンテキストメニュー（自動位置調整） ──────────────
function ContextMenu({
  x, y, onMouseDown, onClick, children,
}: {
  x: number; y: number;
  onMouseDown: (e: React.MouseEvent) => void;
  onClick: (e: React.MouseEvent) => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const { width, height } = ref.current.getBoundingClientRect();
    setPos(clampMenuPos(x, y, width, height));
  }, [x, y]);

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        top: pos?.top ?? y,
        left: pos?.left ?? x,
        visibility: pos ? 'visible' : 'hidden',
        background: 'var(--th-bg)', border: '1px solid var(--th-border)', borderRadius: 6,
        boxShadow: '0 4px 16px rgba(0,0,0,.18)', zIndex: 9999, minWidth: 160,
      }}
      onMouseDown={onMouseDown}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

// ── 左セル 1行コンポーネント ────────────────────────
interface LeftRowProps {
  task: Task;
  depth: number;
  hasChildren: boolean;
  isCollapsed: boolean;
  effectiveProgress: number;
  fontSize: number;
  rowHeight: number;
  titleWidth: number;
  assigneeWidth: number;
  onToggleCollapse: () => void;
  onInlineUpdate: (id: string, patch: Partial<Task>) => void;
  onRowContextMenu: (x: number, y: number) => void;
}

function GanttLeftRow({
  task, depth, hasChildren, isCollapsed, effectiveProgress, fontSize, rowHeight,
  titleWidth, assigneeWidth,
  onToggleCollapse, onInlineUpdate, onRowContextMenu,
}: LeftRowProps) {
  const [editField, setEditField] = useState<string | null>(null);
  const [editVal, setEditVal] = useState('');
  const [editStartVal, setEditStartVal] = useState('');
  const [conflict, setConflict] = useState<{ field: string; theirVal: string; myVal: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editField && inputRef.current) { inputRef.current.focus(); inputRef.current.select(); }
  }, [editField]);

  function startEdit(field: string, val: string) {
    setEditField(field);
    setEditVal(val);
    setEditStartVal(val);
  }

  function commit(field: string, myVal: string | number | null) {
    const currentVal = String(task[field as keyof Task] ?? '');
    if (currentVal !== editStartVal) {
      setConflict({ field, theirVal: currentVal, myVal: String(myVal ?? '') });
      setEditField(null);
      return;
    }
    onInlineUpdate(task.id, { [field]: myVal });
    setEditField(null);
  }

  function resolveConflict(useTheirs: boolean) {
    if (!conflict) return;
    if (!useTheirs) {
      const parsed = isNaN(Number(conflict.myVal)) ? conflict.myVal : Number(conflict.myVal);
      onInlineUpdate(task.id, { [conflict.field]: parsed });
    }
    setConflict(null);
  }

  function onKey(e: React.KeyboardEvent, field: string, val: string | null) {
    if (e.key === 'Enter') commit(field, val);
    if (e.key === 'Escape') setEditField(null);
  }

  function commitDuration(raw: string) {
    const n = parseInt(raw, 10);
    if (isNaN(n) || n < 1 || !task.startDate) { setEditField(null); return; }
    const newEnd = addDays(task.startDate, n - 1);
    onInlineUpdate(task.id, { endDate: newEnd });
    setEditField(null);
  }

  const CELL: React.CSSProperties = {
    height: rowHeight, display: 'flex', alignItems: 'center',
    padding: '0 6px', fontSize, overflow: 'hidden',
    boxSizing: 'border-box', color: 'var(--th-text2)',
  };
  const INPUT_S: React.CSSProperties = {
    width: '100%', padding: '2px 4px', border: '1px solid #4f46e5',
    borderRadius: 3, fontSize, outline: 'none',
    background: 'var(--th-input-bg)', color: 'var(--th-text)',
  };

  const isRootParent = depth === 0 && hasChildren;
  const indent = depth * 16;
  const rowBg = isRootParent ? 'var(--th-bg-parent)' : 'var(--th-bg)';
  const duration = calcDuration(task.startDate, task.endDate);

  return (
    <div
      style={{
        display: 'flex', background: rowBg,
        height: rowHeight, boxSizing: 'border-box',
        borderBottom: '1px solid var(--th-border)',
        borderLeft: isRootParent ? '3px solid var(--th-border-strong)' : '3px solid transparent',
      }}
      onContextMenu={e => { e.preventDefault(); onRowContextMenu(e.clientX, e.clientY); }}
    >
      {/* # (order) */}
      <div style={{ ...CELL, width: 36, justifyContent: 'center', color: 'var(--th-text-dim)', userSelect: 'none' }}>
        {task.isMilestone ? '◇' : task.order}
      </div>

      {/* タイトル */}
      <div style={{ ...CELL, width: titleWidth, paddingLeft: 6 + indent }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 3, width: '100%', overflow: 'hidden' }}>
          {/* アイコンスロット（常に16px固定・▼/└/スペーサーのいずれか1つ） */}
          {hasChildren ? (
            <button onClick={e => { e.stopPropagation(); onToggleCollapse(); }} style={{
              width: 16, height: 16, border: 'none', background: 'none', cursor: 'pointer',
              padding: 0, fontSize: 9, color: 'var(--th-text-muted)', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {isCollapsed ? '▶' : '▼'}
            </button>
          ) : depth > 0 ? (
            <span style={{ width: 16, flexShrink: 0, textAlign: 'center', color: 'var(--th-text-ph)', fontSize: 11, userSelect: 'none' }}>└</span>
          ) : (
            <span style={{ width: 16, flexShrink: 0 }} />
          )}
          {editField === 'title' ? (
            <input ref={inputRef} style={INPUT_S} value={editVal}
              onChange={e => setEditVal(e.target.value)}
              onBlur={() => { if (editVal.trim()) commit('title', editVal.trim()); else setEditField(null); }}
              onKeyDown={e => onKey(e, 'title', editVal.trim() || null)} />
          ) : (
            <span onClick={() => startEdit('title', task.title)}
              style={{
                cursor: 'text', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                fontWeight: isRootParent ? 700 : 400,
                color: isRootParent ? 'var(--th-text-parent)' : 'var(--th-text2)',
              }}>
              {task.title}
            </span>
          )}
        </div>
      </div>

      {/* ステータス */}
      <div style={{ ...CELL, width: 66 }}>
        {editField === 'status' ? (
          <select style={{ ...INPUT_S, width: 'auto', fontSize: 11 }} value={editVal} autoFocus
            onChange={e => commit('status', e.target.value)}
            onBlur={() => setEditField(null)}>
            {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        ) : (
          <span onClick={() => startEdit('status', task.status)} style={{ cursor: 'pointer' }}>
            <span style={{
              padding: '1px 5px', borderRadius: 9999, fontSize: 10, fontWeight: 600,
              background: STATUS_COLOR[task.status] + '22', color: STATUS_COLOR[task.status],
            }}>
              {STATUS_LABEL[task.status]}
            </span>
          </span>
        )}
      </div>

      {/* 優先度 */}
      <div style={{ ...CELL, width: 56 }}>
        {editField === 'priority' ? (
          <select style={{ ...INPUT_S, width: 'auto', fontSize: 11 }} value={editVal} autoFocus
            onChange={e => commit('priority', e.target.value)}
            onBlur={() => setEditField(null)}>
            {Object.entries(PRIORITY_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        ) : (
          <span onClick={() => startEdit('priority', task.priority)} style={{ cursor: 'pointer' }}>
            <span style={{
              padding: '1px 5px', borderRadius: 9999, fontSize: 10, fontWeight: 600,
              background: PRIORITY_COLOR[task.priority] + '22', color: PRIORITY_COLOR[task.priority],
            }}>
              {PRIORITY_LABEL[task.priority]}
            </span>
          </span>
        )}
      </div>

      {/* 進捗 — 親タスクは自動計算・編集不可 */}
      <div style={{ ...CELL, width: 76 }}>
        {!hasChildren && editField === 'progress' ? (
          <input ref={inputRef} style={{ ...INPUT_S, width: 52 }} type="number" min={0} max={100} value={editVal}
            onChange={e => setEditVal(e.target.value)}
            onBlur={() => commit('progress', Math.min(100, Math.max(0, Number(editVal))))}
            onKeyDown={e => {
              if (e.key === 'Enter') commit('progress', Math.min(100, Math.max(0, Number(editVal))));
              if (e.key === 'Escape') setEditField(null);
            }} />
        ) : (
          <div
            onClick={() => { if (!hasChildren) startEdit('progress', String(task.progress)); }}
            title={hasChildren ? '子タスクの平均（自動計算）' : undefined}
            style={{ display: 'flex', alignItems: 'center', gap: 4, width: '100%',
              cursor: hasChildren ? 'default' : 'text' }}>
            <div style={{ width: 40, height: 5, background: 'var(--th-border)', borderRadius: 3, flexShrink: 0 }}>
              <div style={{
                width: `${effectiveProgress}%`, height: '100%', borderRadius: 3,
                background: hasChildren ? '#a5b4fc' : '#4f46e5',
              }} />
            </div>
            <span style={{ fontSize: 10, color: hasChildren ? '#a5b4fc' : 'var(--th-text-muted)' }}>
              {effectiveProgress}%
            </span>
          </div>
        )}
      </div>

      {/* 担当者 */}
      <div style={{ ...CELL, width: assigneeWidth }}>
        {editField === 'assignee' ? (
          <input ref={inputRef} style={INPUT_S} value={editVal}
            onChange={e => setEditVal(e.target.value)}
            onBlur={() => commit('assignee', editVal)}
            onKeyDown={e => onKey(e, 'assignee', editVal)} />
        ) : (
          <span onClick={() => startEdit('assignee', task.assignee)}
            style={{ cursor: 'text', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              color: task.assignee ? 'var(--th-text2)' : 'var(--th-text-ph)' }}>
            {task.assignee || '—'}
          </span>
        )}
      </div>

      {/* 開始日 */}
      <div style={{ ...CELL, width: 88 }}>
        {editField === 'startDate' ? (
          <input ref={inputRef} style={INPUT_S} type="date" value={editVal}
            onChange={e => setEditVal(e.target.value)}
            onBlur={() => commit('startDate', editVal || null)}
            onKeyDown={e => onKey(e, 'startDate', editVal || null)} />
        ) : (
          <span onClick={() => startEdit('startDate', task.startDate ?? '')}
            style={{ cursor: 'text', color: task.startDate ? 'var(--th-text2)' : 'var(--th-text-ph)' }}>
            {task.startDate ?? '—'}
          </span>
        )}
      </div>

      {/* 終了日 */}
      <div style={{ ...CELL, width: 88 }}>
        {editField === 'endDate' ? (
          <input ref={inputRef} style={INPUT_S} type="date" value={editVal}
            onChange={e => setEditVal(e.target.value)}
            onBlur={() => commit('endDate', editVal || null)}
            onKeyDown={e => onKey(e, 'endDate', editVal || null)} />
        ) : (
          <span onClick={() => startEdit('endDate', task.endDate ?? '')}
            style={{ cursor: 'text', color: task.endDate ? 'var(--th-text2)' : 'var(--th-text-ph)' }}>
            {task.endDate ?? '—'}
          </span>
        )}
      </div>

      {/* 期間（日数） */}
      <div style={{ ...CELL, width: 50 }}>
        {editField === 'duration' ? (
          <input ref={inputRef}
            style={{ ...INPUT_S, width: 38 }} type="number" min={1} value={editVal}
            onChange={e => setEditVal(e.target.value)}
            onBlur={() => commitDuration(editVal)}
            onKeyDown={e => {
              if (e.key === 'Enter') commitDuration(editVal);
              if (e.key === 'Escape') setEditField(null);
            }} />
        ) : (
          <span
            onClick={() => {
              if (task.startDate) startEdit('duration', String(duration ?? ''));
            }}
            style={{
              cursor: task.startDate ? 'text' : 'default',
              color: duration !== null ? 'var(--th-text2)' : 'var(--th-text-ph)',
            }}>
            {duration !== null ? duration : '—'}
          </span>
        )}
      </div>

      {conflict && (
        <ConflictDialog
          field={conflict.field}
          theirVal={conflict.theirVal}
          myVal={conflict.myVal}
          onResolve={resolveConflict}
        />
      )}

    </div>
  );
}

// ── クイック追加行 ──────────────────────────────────
function QuickAddRow({ onAdd, titleWidth, assigneeWidth }: { onAdd: (title: string) => Promise<void>; titleWidth: number; assigneeWidth: number }) {
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
      {[66, 56, 76, assigneeWidth, 88, 88, 50].map((w, i) => <div key={i} style={{ ...CELL, width: w }} />)}
    </div>
  );
}

// ── メインコンポーネント ──────────────────────────────
interface Props {
  onEditTask: (task: Task) => void;
  onDeleteTask: (id: string) => void;
  onInlineUpdate: (id: string, patch: Partial<Task>) => void;
  onQuickAdd: (title: string) => Promise<void>;
  onAddSubTask: (parentId: string) => void;
}

export function GanttChart({ onEditTask, onDeleteTask, onInlineUpdate, onQuickAdd, onAddSubTask }: Props) {
  const {
    tasks, sortKey, sortDir, filterStatus, filterAssignee, filterPriority,
    zoomLevel, ganttStartDate, ganttPeriod,
    showLightningLine, showWeekend, showCriticalPath, uiFontSize, uiRowHeight, ganttHeaderLevels,
    setSortKey,
  } = useTaskStore();

  const sorted = sortAndFilter(tasks, sortKey, sortDir, filterStatus, filterAssignee, filterPriority);

  // 列幅（タイトル・担当者はドラッグでリサイズ可）
  const [colWidths, setColWidths] = useState({ title: 180, assignee: 76 });
  const [colResize, setColResize] = useState<{ key: string; startX: number; startWidth: number } | null>(null);
  const colResizeRef = useRef<typeof colResize>(null);
  useEffect(() => { colResizeRef.current = colResize; }, [colResize]);

  const LEFT_TOTAL = LEFT_COLS.reduce((s, c) =>
    s + (colWidths[c.key as keyof typeof colWidths] ?? c.width), 0);

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
  const { roots, childCount } = buildTree(sorted);
  const flatRows = flattenTree(roots, collapsed);

  const collapseAll = () => setCollapsed(new Set(childCount.keys()));
  const expandAll   = () => setCollapsed(new Set());

  const start  = ganttStartDate || undefined;
  const period = ganttPeriod    || undefined;
  const range  = calcGanttRange(sorted, start, period);
  const { min, max } = range;
  const totalWidth  = ganttTotalWidth(sorted, zoomLevel, start, period);
  const headerRows  = buildMultiLevelHeaders(min, max, zoomLevel, ganttHeaderLevels);
  const todayX      = calcTodayX(min, zoomLevel);

  const taskIndex = new Map(flatRows.map(({ task }, i) => [task.id, i]));
  const taskById  = new Map(sorted.map(t => [t.id, t]));
  const totalHeight = (flatRows.length + 1) * uiRowHeight;

  const { dayWidth } = ZOOM_CONFIG[zoomLevel];

  // 土日列
  const weekendXs: number[] = [];
  if (showWeekend) {
    let cur = dayjs(min);
    const end = dayjs(max);
    while (cur.isBefore(end)) {
      const dow = cur.day();
      if (dow === 0 || dow === 6) {
        const dayIdx = Math.round((cur.toDate().getTime() - min.getTime()) / 86400000);
        weekendXs.push(dayIdx * dayWidth);
      }
      cur = cur.add(1, 'day');
    }
  }

  // 親タスクの進捗事前計算
  const progressMap = new Map(
    sorted.map(t => [t.id, calcEffectiveProgress(t.id, childCount, sorted)])
  );

  // イナズマライン
  const lightningPoints = calcLightningPoints(
    flatRows.map(r => ({ task: r.task, effectiveProgress: progressMap.get(r.task.id) ?? 0 })),
    min,
    zoomLevel,
    uiRowHeight,
  );

  // クリティカルパス
  const criticalSet = showCriticalPath ? calcCriticalPath(sorted) : new Set<string>();

  // ── ドラッグ状態 ────────────────────────────────────
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null);
  const dragPreviewRef = useRef<DragPreview | null>(null);
  const [barCtxMenu, setBarCtxMenu] = useState<{ x: number; y: number; taskId: string } | null>(null);
  const [rowCtxMenu, setRowCtxMenu] = useState<{ x: number; y: number; taskId: string } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

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
    <div
      style={{
        flex: 1, overflow: 'auto', position: 'relative',
        cursor: dragState ? 'grabbing' : colResize ? 'col-resize' : 'default',
      }}
    >
      <div style={{ width: LEFT_TOTAL + totalWidth }}>

        {/* ── ヘッダー（マルチレベル） ── */}
        <div style={{
          position: 'sticky', top: 0, zIndex: 20,
          borderBottom: '2px solid var(--th-border)', background: 'var(--th-bg2)',
        }}>
          {headerRows.map((row, ri) => (
            <div key={row.level} style={{ display: 'flex', height: HEADER_ROW_H }}>
              <div style={{
                display: 'flex', flexShrink: 0, width: LEFT_TOTAL,
                position: 'sticky', left: 0, zIndex: 21,
                background: 'var(--th-bg2)', borderRight: '2px solid var(--th-border-strong)',
              }}>
                {ri === 0
                  ? LEFT_COLS.map(col => {
                      const w = colWidths[col.key as keyof typeof colWidths] ?? col.width;
                      const resizable = RESIZABLE_COL_KEYS.has(col.key);
                      const isTitleCol = col.key === 'title';
                      return (
                        <div
                          key={col.key}
                          style={{ ...TH, width: w, cursor: col.sortable ? 'pointer' : 'default',
                            position: resizable ? 'relative' : undefined,
                            justifyContent: isTitleCol ? 'flex-start' : 'center', gap: 2 }}
                          onClick={() => col.sortable && setSortKey(col.key as keyof Task)}
                        >
                          {isTitleCol && childCount.size > 0 && (
                            <div style={{ display: 'flex', gap: 1, paddingRight: 4 }}>
                              {[
                                { icon: '⊞', title: 'すべて展開', action: expandAll },
                                { icon: '⊟', title: 'すべて折りたたむ', action: collapseAll },
                              ].map(({ icon, title, action }) => (
                                <button key={icon} title={title}
                                  onClick={e => { e.stopPropagation(); action(); }}
                                  style={{ border: 'none', background: 'none', cursor: 'pointer',
                                    fontSize: 12, color: 'var(--th-text-dim)', padding: '1px 2px', borderRadius: 2,
                                    lineHeight: 1, fontWeight: 400 }}
                                  onMouseEnter={e => { e.currentTarget.style.background = '#e0e7ff'; e.currentTarget.style.color = '#4f46e5'; }}
                                  onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--th-text-dim)'; }}
                                >
                                  {icon}
                                </button>
                              ))}
                            </div>
                          )}
                          {col.label}
                          {sortKey === col.key && <span style={{ marginLeft: 2 }}>{sortDir === 'asc' ? '↑' : '↓'}</span>}
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
                    })
                  : <div style={{ width: LEFT_TOTAL, height: HEADER_ROW_H,
                      borderTop: '1px solid var(--th-border)', background: 'var(--th-bg2)' }} />
                }
              </div>

              <div style={{ width: totalWidth, position: 'relative', height: HEADER_ROW_H, background: 'var(--th-bg2)',
                borderTop: ri > 0 ? '1px solid var(--th-border)' : undefined }}>
                {row.cells.map((cell, ci) => (
                  <div key={ci} style={{
                    position: 'absolute', left: cell.x, width: cell.width, height: HEADER_ROW_H,
                    background: ci % 2 === 0 ? 'var(--th-bg2)' : 'var(--th-bg3)',
                    borderRight: '1px solid var(--th-border)',
                    display: 'flex', alignItems: 'center', paddingLeft: 4,
                    fontSize: row.level === 'day' ? 9 : 10,
                    fontWeight: row.level === 'year' ? 800 : 600,
                    color: row.level === 'year' ? 'var(--th-text2)' : 'var(--th-text-muted)',
                    boxSizing: 'border-box', overflow: 'hidden',
                  }}>
                    {cell.label}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* ── ボディ行 ── */}
        <div style={{ display: 'flex', position: 'relative' }}>

          {/* 左パネル */}
          <div style={{
            flexShrink: 0, width: LEFT_TOTAL,
            position: 'sticky', left: 0, zIndex: 10,
            borderRight: '2px solid var(--th-border-strong)',
            background: 'var(--th-bg)',
          }}>
            {flatRows.map(({ task, depth }) => (
              <GanttLeftRow
                key={task.id}
                task={task}
                depth={depth}
                hasChildren={(childCount.get(task.id) ?? 0) > 0}
                isCollapsed={collapsed.has(task.id)}
                effectiveProgress={progressMap.get(task.id) ?? task.progress}
                fontSize={uiFontSize}
                rowHeight={uiRowHeight}
                titleWidth={colWidths.title}
                assigneeWidth={colWidths.assignee}
                onToggleCollapse={() => toggleCollapse(task.id)}
                onInlineUpdate={onInlineUpdate}
                onRowContextMenu={(x, y) => { setRowCtxMenu({ x, y, taskId: task.id }); setBarCtxMenu(null); }}
              />
            ))}
            <QuickAddRow onAdd={onQuickAdd} titleWidth={colWidths.title} assigneeWidth={colWidths.assignee} />
          </div>

          {/* 右パネル：ガントSVG */}
          <svg ref={svgRef} width={totalWidth} height={Math.max(totalHeight, 1)} style={{ display: 'block', flexShrink: 0 }}>
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
                  style={{ fill: isRootParent ? 'var(--th-bg-parent)' : (i % 2 === 0 ? 'var(--th-bg)' : 'var(--th-bg-alt)') }} />
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
              return (
                <GanttBar
                  key={task.id}
                  task={task}
                  minDate={min}
                  zoom={zoomLevel}
                  rowIndex={i}
                  isCritical={criticalSet.has(task.id)}
                  dragPreview={preview}
                  fontSize={uiFontSize}
                  rowHeight={uiRowHeight}
                  onMoveStart={(e, id) => startDrag(e, id, 'move')}
                  onResizeLeftStart={(e, id) => startDrag(e, id, 'resize-left')}
                  onResizeRightStart={(e, id) => startDrag(e, id, 'resize-right')}
                  onClick={() => !dragState && onEditTask(task)}
                />
              );
            })}

            {/* 依存関係矢印 */}
            {sorted.flatMap(task =>
              task.predecessors.map(predId => {
                const pred = taskById.get(predId);
                return pred ? (
                  <DependencyArrow key={`${predId}->${task.id}`}
                    fromTask={pred} toTask={task} minDate={min} zoom={zoomLevel} taskIndex={taskIndex} rowHeight={uiRowHeight} />
                ) : null;
              })
            )}

            {/* 今日ライン */}
            <TodayLine x={todayX} height={Math.max(totalHeight, 1)} />

            {/* イナズマライン */}
            {showLightningLine && lightningPoints && (
              <LightningLine points={lightningPoints} color="#7c3aed" />
            )}
          </svg>
        </div>
      </div>

      {/* コンテキストメニュー共通レンダラ */}
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
    </div>
  );
}
