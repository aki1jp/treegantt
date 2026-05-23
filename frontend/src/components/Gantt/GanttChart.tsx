import { useState, useRef, useEffect } from 'react';
import dayjs from 'dayjs';
import weekOfYear from 'dayjs/plugin/weekOfYear';
import type { Task, TaskStatus, TaskPriority, ZoomLevel } from '../../types/task';
import { useTaskStore } from '../../store/taskStore';
import { sortAndFilter } from '../../utils/sort';
import {
  calcGanttRange, calcTodayX, calcLightningPoints,
  ganttTotalWidth, ROW_HEIGHT_PX, ZOOM_CONFIG,
} from '../../utils/ganttCalc';
import { buildTree, flattenTree, calcEffectiveProgress } from '../../utils/taskTree';
import { GanttBar } from './GanttBar';
import { DependencyArrow } from './DependencyArrow';
import { LightningLine, TodayLine } from './LightningLine';
import { ConflictDialog } from '../ConflictDialog/ConflictDialog';

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
] as const;

const LEFT_TOTAL = LEFT_COLS.reduce((s, c) => s + c.width, 0);

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

  // 年行
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

  // 月行
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

  // 週行
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

  // 日行
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

// ── 左セル 1行コンポーネント ────────────────────────
interface LeftRowProps {
  task: Task;
  depth: number;
  hasChildren: boolean;
  isCollapsed: boolean;
  effectiveProgress: number;
  onToggleCollapse: () => void;
  onInlineUpdate: (id: string, patch: Partial<Task>) => void;
  onOpenModal: () => void;
  onDelete: () => void;
}

function GanttLeftRow({
  task, depth, hasChildren, isCollapsed, effectiveProgress,
  onToggleCollapse, onInlineUpdate, onOpenModal, onDelete,
}: LeftRowProps) {
  const [editField, setEditField] = useState<string | null>(null);
  const [editVal, setEditVal] = useState('');
  const [editStartVal, setEditStartVal] = useState('');
  const [conflict, setConflict] = useState<{ field: string; theirVal: string; myVal: string } | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editField && inputRef.current) { inputRef.current.focus(); inputRef.current.select(); }
  }, [editField]);

  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [ctxMenu]);

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

  // ★ アライメント修正: 外側 div に高さを明示し borderBottom はその内側に収める
  const CELL: React.CSSProperties = {
    height: ROW_HEIGHT_PX, display: 'flex', alignItems: 'center',
    padding: '0 6px', fontSize: 12, overflow: 'hidden',
    boxSizing: 'border-box',
  };
  const INPUT_S: React.CSSProperties = {
    width: '100%', padding: '2px 4px', border: '1px solid #4f46e5',
    borderRadius: 3, fontSize: 12, outline: 'none',
  };

  const indent = depth * 16;
  const rowBg = hasChildren ? '#eef2ff' : '#fff';

  return (
    <div
      style={{
        display: 'flex', background: rowBg,
        height: ROW_HEIGHT_PX, boxSizing: 'border-box',
        borderBottom: '1px solid #e5e7eb',
        borderLeft: hasChildren ? '3px solid #6366f1' : '3px solid transparent',
      }}
      onContextMenu={e => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY }); }}
    >
      {/* # (order) */}
      <div style={{ ...CELL, width: 36, justifyContent: 'center', color: '#9ca3af', userSelect: 'none' }}>
        {task.order}
      </div>

      {/* タイトル */}
      <div style={{ ...CELL, width: 180, paddingLeft: 6 + indent }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 3, width: '100%', overflow: 'hidden' }}>
          {hasChildren ? (
            <button onClick={e => { e.stopPropagation(); onToggleCollapse(); }} style={{
              width: 14, height: 14, border: 'none', background: 'none', cursor: 'pointer',
              padding: 0, fontSize: 9, color: '#6b7280', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {isCollapsed ? '▶' : '▼'}
            </button>
          ) : depth > 0 ? (
            <span style={{ width: 14, flexShrink: 0, color: '#d1d5db', fontSize: 10 }}>└</span>
          ) : null}
          {editField === 'title' ? (
            <input ref={inputRef} style={INPUT_S} value={editVal}
              onChange={e => setEditVal(e.target.value)}
              onBlur={() => { if (editVal.trim()) commit('title', editVal.trim()); else setEditField(null); }}
              onKeyDown={e => onKey(e, 'title', editVal.trim() || null)} />
          ) : (
            <span onClick={() => startEdit('title', task.title)}
              style={{
                cursor: 'text', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                fontWeight: hasChildren ? 700 : 400,
                color: hasChildren ? '#3730a3' : undefined,
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
            <div style={{ width: 40, height: 5, background: '#e5e7eb', borderRadius: 3, flexShrink: 0 }}>
              <div style={{
                width: `${effectiveProgress}%`, height: '100%', borderRadius: 3,
                background: hasChildren ? '#a5b4fc' : '#4f46e5',
              }} />
            </div>
            <span style={{ fontSize: 10, color: hasChildren ? '#a5b4fc' : '#6b7280' }}>
              {effectiveProgress}%
            </span>
          </div>
        )}
      </div>

      {/* 担当者 */}
      <div style={{ ...CELL, width: 76 }}>
        {editField === 'assignee' ? (
          <input ref={inputRef} style={INPUT_S} value={editVal}
            onChange={e => setEditVal(e.target.value)}
            onBlur={() => commit('assignee', editVal)}
            onKeyDown={e => onKey(e, 'assignee', editVal)} />
        ) : (
          <span onClick={() => startEdit('assignee', task.assignee)}
            style={{ cursor: 'text', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              color: task.assignee ? undefined : '#d1d5db' }}>
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
            style={{ cursor: 'text', color: task.startDate ? undefined : '#d1d5db' }}>
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
            style={{ cursor: 'text', color: task.endDate ? undefined : '#d1d5db' }}>
            {task.endDate ?? '—'}
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

      {ctxMenu && (
        <div style={{
          position: 'fixed', top: ctxMenu.y, left: ctxMenu.x,
          background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6,
          boxShadow: '0 4px 16px rgba(0,0,0,.12)', zIndex: 9999, minWidth: 140,
        }} onClick={e => e.stopPropagation()}>
          <button onClick={() => { onOpenModal(); setCtxMenu(null); }} style={{
            display: 'block', width: '100%', padding: '8px 14px', border: 'none',
            background: 'none', textAlign: 'left', cursor: 'pointer', fontSize: 13,
          }}
            onMouseEnter={e => (e.currentTarget.style.background = '#f3f4f6')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
            編集（詳細）
          </button>
          <div style={{ height: 1, background: '#e5e7eb' }} />
          <button onClick={() => { onDelete(); setCtxMenu(null); }} style={{
            display: 'block', width: '100%', padding: '8px 14px', border: 'none',
            background: 'none', textAlign: 'left', cursor: 'pointer', fontSize: 13, color: '#ef4444',
          }}
            onMouseEnter={e => (e.currentTarget.style.background = '#fef2f2')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
            削除
          </button>
        </div>
      )}
    </div>
  );
}

// ── クイック追加行 ──────────────────────────────────
function QuickAddRow({ onAdd }: { onAdd: (title: string) => Promise<void> }) {
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
    height: ROW_HEIGHT_PX, display: 'flex', alignItems: 'center',
    padding: '0 6px', fontSize: 12, overflow: 'hidden', boxSizing: 'border-box',
  };

  return (
    <div style={{
      display: 'flex', background: '#fafafa',
      height: ROW_HEIGHT_PX, boxSizing: 'border-box',
      borderTop: '1px dashed #e5e7eb',
    }}>
      <div style={{ ...CELL, width: 36 }} />
      <div style={{ ...CELL, width: 180 }}>
        {editing ? (
          <input ref={inputRef}
            style={{ width: '100%', padding: '2px 4px', border: '1px solid #4f46e5', borderRadius: 3, fontSize: 12, outline: 'none' }}
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
            style={{ color: '#9ca3af', cursor: 'text', fontSize: 12, userSelect: 'none' }}>
            ＋ タスクを追加…
          </span>
        )}
      </div>
      {[66, 56, 76, 76, 88, 88].map((w, i) => <div key={i} style={{ ...CELL, width: w }} />)}
    </div>
  );
}

// ── メインコンポーネント ──────────────────────────────
interface Props {
  onEditTask: (task: Task) => void;
  onDeleteTask: (id: string) => void;
  onInlineUpdate: (id: string, patch: Partial<Task>) => void;
  onQuickAdd: (title: string) => Promise<void>;
}

export function GanttChart({ onEditTask, onDeleteTask, onInlineUpdate, onQuickAdd }: Props) {
  const {
    tasks, sortKey, sortDir, filterStatus, filterAssignee, filterPriority,
    zoomLevel, ganttStartDate, ganttPeriod,
    showLightningLine, showWeekend, ganttHeaderLevels,
    setSortKey,
  } = useTaskStore();

  const sorted = sortAndFilter(tasks, sortKey, sortDir, filterStatus, filterAssignee, filterPriority);

  const [collapsed, setCollapsed] = useState(new Set<string>());
  const { roots, childCount } = buildTree(sorted);
  const flatRows = flattenTree(roots, collapsed);

  const start  = ganttStartDate || undefined;
  const period = ganttPeriod    || undefined;
  const range  = calcGanttRange(sorted, start, period);
  const { min, max } = range;
  const totalWidth  = ganttTotalWidth(sorted, zoomLevel, start, period);
  const headerRows  = buildMultiLevelHeaders(min, max, zoomLevel, ganttHeaderLevels);
  const todayX      = calcTodayX(min, zoomLevel);

  const taskIndex = new Map(flatRows.map(({ task }, i) => [task.id, i]));
  const taskById  = new Map(sorted.map(t => [t.id, t]));
  const totalHeight = (flatRows.length + 1) * ROW_HEIGHT_PX;

  // 土日列の X 座標リスト
  const { dayWidth } = ZOOM_CONFIG[zoomLevel];
  const weekendXs: number[] = [];
  if (showWeekend) {
    let cur = dayjs(min);
    const end = dayjs(max);
    while (cur.isBefore(end)) {
      const dow = cur.day(); // 0=Sun, 6=Sat
      if (dow === 0 || dow === 6) {
        const dayIdx = Math.round((cur.toDate().getTime() - min.getTime()) / 86400000);
        weekendXs.push(dayIdx * dayWidth);
      }
      cur = cur.add(1, 'day');
    }
  }

  // 親タスクの進捗を事前計算
  const progressMap = new Map(
    sorted.map(t => [t.id, calcEffectiveProgress(t.id, childCount, sorted)])
  );

  // イナズマライン: 各行の有効進捗率をX座標に変換したジグザグ折れ線
  const lightningPoints = calcLightningPoints(
    flatRows.map(r => ({ task: r.task, effectiveProgress: progressMap.get(r.task.id) ?? 0 })),
    min,
    zoomLevel,
  );

  function toggleCollapse(id: string) {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const TH: React.CSSProperties = {
    height: HEADER_ROW_H, display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 11, fontWeight: 700, color: '#6b7280',
    borderRight: '1px solid #e5e7eb', cursor: 'default', userSelect: 'none',
    boxSizing: 'border-box', padding: '0 4px',
  };

  return (
    <div style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
      <div style={{ width: LEFT_TOTAL + totalWidth }}>

        {/* ── ヘッダー（マルチレベル） ── */}
        <div style={{
          position: 'sticky', top: 0, zIndex: 20,
          borderBottom: '2px solid #e5e7eb', background: '#f9fafb',
        }}>
          {headerRows.map((row, ri) => (
            <div key={row.level} style={{ display: 'flex', height: HEADER_ROW_H }}>
              {/* 左ヘッダー（最初の行のみ列名・残りは空） */}
              <div style={{
                display: 'flex', flexShrink: 0, width: LEFT_TOTAL,
                position: 'sticky', left: 0, zIndex: 21,
                background: '#f9fafb', borderRight: '2px solid #6366f1',
              }}>
                {ri === 0
                  ? LEFT_COLS.map(col => (
                      <div
                        key={col.key}
                        style={{ ...TH, width: col.width, cursor: col.sortable ? 'pointer' : 'default' }}
                        onClick={() => col.sortable && setSortKey(col.key as keyof Task)}
                      >
                        {col.label}
                        {sortKey === col.key && <span style={{ marginLeft: 2 }}>{sortDir === 'asc' ? '↑' : '↓'}</span>}
                      </div>
                    ))
                  : <div style={{ width: LEFT_TOTAL, height: HEADER_ROW_H,
                      borderTop: '1px solid #e5e7eb', background: '#f9fafb' }} />
                }
              </div>

              {/* タイムラインヘッダー行 */}
              <div style={{ width: totalWidth, position: 'relative', height: HEADER_ROW_H, background: '#f9fafb',
                borderTop: ri > 0 ? '1px solid #e5e7eb' : undefined }}>
                {row.cells.map((cell, ci) => (
                  <div key={ci} style={{
                    position: 'absolute', left: cell.x, width: cell.width, height: HEADER_ROW_H,
                    background: ci % 2 === 0 ? '#f9fafb' : '#f3f4f6',
                    borderRight: '1px solid #e5e7eb',
                    display: 'flex', alignItems: 'center', paddingLeft: 4,
                    fontSize: row.level === 'day' ? 9 : 10,
                    fontWeight: row.level === 'year' ? 800 : 600,
                    color: row.level === 'year' ? '#374151' : '#6b7280',
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
            borderRight: '2px solid #6366f1',
            background: '#fff',
          }}>
            {flatRows.map(({ task, depth }) => (
              <GanttLeftRow
                key={task.id}
                task={task}
                depth={depth}
                hasChildren={(childCount.get(task.id) ?? 0) > 0}
                isCollapsed={collapsed.has(task.id)}
                effectiveProgress={progressMap.get(task.id) ?? task.progress}
                onToggleCollapse={() => toggleCollapse(task.id)}
                onInlineUpdate={onInlineUpdate}
                onOpenModal={() => onEditTask(task)}
                onDelete={() => onDeleteTask(task.id)}
              />
            ))}
            <QuickAddRow onAdd={onQuickAdd} />
          </div>

          {/* 右パネル：ガントSVG */}
          <svg width={totalWidth} height={Math.max(totalHeight, 1)} style={{ display: 'block', flexShrink: 0 }}>
            <defs>
              <marker id="arrowhead" markerWidth="6" markerHeight="6" refX="6" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6 Z" fill="#378ADD" />
              </marker>
            </defs>

            {/* 縞背景（親タスク行は #eef2ff） */}
            {flatRows.map(({ task }, i) => {
              const isParent = (childCount.get(task.id) ?? 0) > 0;
              return (
                <rect key={i} x={0} y={i * ROW_HEIGHT_PX} width={totalWidth} height={ROW_HEIGHT_PX}
                  fill={isParent ? '#eef2ff' : (i % 2 === 0 ? '#fff' : '#fafafa')} />
              );
            })}

            {/* 土日背景 */}
            {weekendXs.map((x, i) => (
              <rect key={i} x={x} y={0} width={dayWidth} height={Math.max(totalHeight, 1)}
                fill="rgba(148,163,184,0.18)" />
            ))}

            {/* タスクバー */}
            {flatRows.map(({ task }, i) => (
              <GanttBar key={task.id} task={task} minDate={min} zoom={zoomLevel} rowIndex={i}
                onClick={() => onEditTask(task)} />
            ))}

            {/* 依存関係矢印 */}
            {sorted.flatMap(task =>
              task.predecessors.map(predId => {
                const pred = taskById.get(predId);
                return pred ? (
                  <DependencyArrow key={`${predId}->${task.id}`}
                    fromTask={pred} toTask={task} minDate={min} zoom={zoomLevel} taskIndex={taskIndex} />
                ) : null;
              })
            )}

            {/* 今日ライン */}
            <TodayLine x={todayX} height={Math.max(totalHeight, 1)} />

            {/* イナズマライン（ON/OFF切替可） */}
            {showLightningLine && lightningPoints && (
              <LightningLine points={lightningPoints} color="#7c3aed" />
            )}
          </svg>
        </div>
      </div>
    </div>
  );
}
