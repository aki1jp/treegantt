import { useState, useRef, useEffect } from 'react';
import dayjs from 'dayjs';
import weekOfYear from 'dayjs/plugin/weekOfYear';
import type { Task, TaskStatus, TaskPriority, ZoomLevel } from '../../types/task';
import { useTaskStore } from '../../store/taskStore';
import { sortAndFilter } from '../../utils/sort';
import {
  calcGanttRange, dateToX, calcTodayX, calcLightningX,
  ganttTotalWidth, ROW_HEIGHT_PX, ZOOM_CONFIG,
} from '../../utils/ganttCalc';
import { GanttBar } from './GanttBar';
import { DependencyArrow } from './DependencyArrow';
import { LightningLine } from './LightningLine';
import { ConflictDialog } from '../ConflictDialog/ConflictDialog';

dayjs.extend(weekOfYear);

const HEADER_H = 32;

// ── 左パネル列定義 ──────────────────────────────────
const LEFT_COLS = [
  { key: 'order',     label: '#',          width: 36,  sortable: true  },
  { key: 'title',     label: 'タイトル',   width: 180, sortable: true  },
  { key: 'status',    label: 'ST',         width: 66,  sortable: true  },
  { key: 'priority',  label: '優先',       width: 56,  sortable: true  },
  { key: 'progress',  label: '進捗',       width: 76,  sortable: true  },
  { key: 'assignee',  label: '担当',       width: 76,  sortable: true  },
  { key: 'startDate', label: '開始',       width: 88,  sortable: true  },
  { key: 'endDate',   label: '終了',       width: 88,  sortable: true  },
] as const;

const LEFT_TOTAL = LEFT_COLS.reduce((s, c) => s + c.width, 0);

// ── 色マップ ────────────────────────────────────────
const STATUS_COLOR: Record<TaskStatus, string> = {
  todo: '#6b7280', wip: '#3b82f6', done: '#22c55e', wait: '#f59e0b',
};
const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: 'TODO', wip: '進行中', done: '完了', wait: '待機',
};
const PRIORITY_COLOR: Record<TaskPriority, string> = {
  critical: '#ef4444', high: '#f97316', medium: '#6b7280', low: '#d1d5db',
};
const PRIORITY_LABEL: Record<TaskPriority, string> = {
  critical: '最高', high: '高', medium: '中', low: '低',
};

// ── ツリー構造 ──────────────────────────────────────
interface TreeNode { task: Task; depth: number; children: TreeNode[] }

function buildTree(tasks: Task[]) {
  const childCount = new Map<string, number>();
  const nodeMap = new Map<string, TreeNode>();
  for (const t of tasks) {
    nodeMap.set(t.id, { task: t, depth: 0, children: [] });
    if (t.parentId) childCount.set(t.parentId, (childCount.get(t.parentId) ?? 0) + 1);
  }
  const roots: TreeNode[] = [];
  for (const t of tasks) {
    const node = nodeMap.get(t.id)!;
    if (t.parentId && nodeMap.has(t.parentId)) {
      const parent = nodeMap.get(t.parentId)!;
      node.depth = parent.depth + 1;
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return { roots, childCount };
}

function flattenTree(nodes: TreeNode[], collapsed: Set<string>): { task: Task; depth: number }[] {
  const result: { task: Task; depth: number }[] = [];
  for (const node of nodes) {
    result.push({ task: node.task, depth: node.depth });
    if (!collapsed.has(node.task.id) && node.children.length > 0)
      result.push(...flattenTree(node.children, collapsed));
  }
  return result;
}

// ── タイムラインヘッダー ────────────────────────────
function buildHeaders(min: Date, max: Date, zoom: ZoomLevel) {
  const { dayWidth, headerFormat } = ZOOM_CONFIG[zoom];
  const headers: { label: string; x: number; width: number }[] = [];
  let cur = dayjs(min);
  const end = dayjs(max);
  while (cur.isBefore(end)) {
    const x = Math.round((cur.toDate().getTime() - min.getTime()) / 86400000) * dayWidth;
    if (zoom === 'day') {
      headers.push({ label: cur.format(headerFormat), x, width: dayWidth });
      cur = cur.add(1, 'day');
    } else if (zoom === 'week') {
      const ws = cur.startOf('week');
      const we = ws.add(6, 'day');
      const ce = we.isAfter(end) ? end : we;
      headers.push({ label: `W${cur.week()}`, x, width: ce.diff(cur, 'day') * dayWidth + dayWidth });
      cur = ws.add(1, 'week').startOf('week');
    } else {
      const ms = cur.startOf('month');
      const me = ms.endOf('month');
      const ce = me.isAfter(end) ? end : me;
      headers.push({ label: cur.format(headerFormat), x, width: ce.diff(cur, 'day') * dayWidth + dayWidth });
      cur = ms.add(1, 'month').startOf('month');
    }
  }
  return headers;
}

// ── 左セル 1行コンポーネント ────────────────────────
interface LeftRowProps {
  task: Task;
  depth: number;
  hasChildren: boolean;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onInlineUpdate: (id: string, patch: Partial<Task>) => void;
  onOpenModal: () => void;
  onDelete: () => void;
}

function GanttLeftRow({
  task, depth, hasChildren, isCollapsed,
  onToggleCollapse, onInlineUpdate, onOpenModal, onDelete,
}: LeftRowProps) {
  const [editField, setEditField] = useState<string | null>(null);
  const [editVal, setEditVal] = useState('');
  const [editStartVal, setEditStartVal] = useState('');  // 編集開始時点のY.js値
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
    setEditStartVal(val);  // 編集開始時点の値を記録
  }

  function commit(field: string, myVal: string | number | null) {
    // 編集中に別ユーザーが同フィールドを変更したか確認
    const currentYjsVal = String(task[field as keyof Task] ?? '');
    if (currentYjsVal !== editStartVal) {
      setConflict({ field, theirVal: currentYjsVal, myVal: String(myVal ?? '') });
      setEditField(null);
      return;
    }
    onInlineUpdate(task.id, { [field]: myVal });
    setEditField(null);
  }

  function resolveConflict(useTheirs: boolean) {
    if (!conflict) return;
    if (!useTheirs) {
      // 自分の変更を適用
      const parsed = isNaN(Number(conflict.myVal)) ? conflict.myVal : Number(conflict.myVal);
      onInlineUpdate(task.id, { [conflict.field]: parsed });
    }
    setConflict(null);
  }
  function onKey(e: React.KeyboardEvent, field: string, val: string | null) {
    if (e.key === 'Enter') commit(field, val);
    if (e.key === 'Escape') setEditField(null);
  }

  const CELL: React.CSSProperties = {
    height: ROW_HEIGHT_PX, display: 'flex', alignItems: 'center',
    padding: '0 6px', fontSize: 12, overflow: 'hidden', borderBottom: '1px solid #f3f4f6',
    boxSizing: 'border-box',
  };
  const INPUT_S: React.CSSProperties = {
    width: '100%', padding: '2px 4px', border: '1px solid #4f46e5',
    borderRadius: 3, fontSize: 12, outline: 'none',
  };

  const indent = depth * 16;
  const rowBg = depth > 0 ? `hsl(240,15%,${99 - depth}%)` : '#fff';

  return (
    <div
      style={{ display: 'flex', background: rowBg, borderBottom: '1px solid #f3f4f6' }}
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
              style={{ cursor: 'text', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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

      {/* 進捗 */}
      <div style={{ ...CELL, width: 76 }}>
        {editField === 'progress' ? (
          <input ref={inputRef} style={{ ...INPUT_S, width: 52 }} type="number" min={0} max={100} value={editVal}
            onChange={e => setEditVal(e.target.value)}
            onBlur={() => { commit('progress', Math.min(100, Math.max(0, Number(editVal)))); }}
            onKeyDown={e => {
              if (e.key === 'Enter') commit('progress', Math.min(100, Math.max(0, Number(editVal))));
              if (e.key === 'Escape') setEditField(null);
            }} />
        ) : (
          <div onClick={() => startEdit('progress', String(task.progress))}
            style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'text', width: '100%' }}>
            <div style={{ width: 40, height: 5, background: '#e5e7eb', borderRadius: 3, flexShrink: 0 }}>
              <div style={{ width: `${task.progress}%`, height: '100%', background: '#4f46e5', borderRadius: 3 }} />
            </div>
            <span style={{ fontSize: 10, color: '#6b7280' }}>{task.progress}%</span>
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
            style={{ cursor: 'text', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: task.assignee ? undefined : '#d1d5db' }}>
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

      {/* 競合解決ダイアログ */}
      {conflict && (
        <ConflictDialog
          field={conflict.field}
          theirVal={conflict.theirVal}
          myVal={conflict.myVal}
          onResolve={resolveConflict}
        />
      )}

      {/* 右クリックメニュー */}
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

// ── メインコンポーネント ──────────────────────────────
interface Props {
  onEditTask: (task: Task) => void;
  onDeleteTask: (id: string) => void;
  onInlineUpdate: (id: string, patch: Partial<Task>) => void;
}

export function GanttChart({ onEditTask, onDeleteTask, onInlineUpdate }: Props) {
  const { tasks, sortKey, sortDir, filterStatus, filterAssignee, filterPriority, zoomLevel, setSortKey } = useTaskStore();
  const sorted = sortAndFilter(tasks, sortKey, sortDir, filterStatus, filterAssignee, filterPriority);

  const [collapsed, setCollapsed] = useState(new Set<string>());
  const { roots, childCount } = buildTree(sorted);
  const flatRows = flattenTree(roots, collapsed);

  const range = calcGanttRange(sorted);
  const { min, max } = range;
  const totalWidth = ganttTotalWidth(sorted, zoomLevel);
  const totalHeight = flatRows.length * ROW_HEIGHT_PX;
  const headers = buildHeaders(min, max, zoomLevel);
  const todayX = calcTodayX(min, zoomLevel);
  const lightningX = calcLightningX(sorted, min, zoomLevel);

  const taskIndex = new Map(flatRows.map(({ task }, i) => [task.id, i]));
  const taskById  = new Map(sorted.map(t => [t.id, t]));

  function toggleCollapse(id: string) {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const TH: React.CSSProperties = {
    height: HEADER_H, display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 11, fontWeight: 700, color: '#6b7280',
    borderRight: '1px solid #e5e7eb', cursor: 'default', userSelect: 'none',
    boxSizing: 'border-box', padding: '0 4px',
  };

  return (
    <div style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
      {/* コンテンツ幅 = 左パネル + タイムライン幅 */}
      <div style={{ width: LEFT_TOTAL + totalWidth }}>

        {/* ── ヘッダー行（縦スクロールで固定） ── */}
        <div style={{
          display: 'flex', height: HEADER_H,
          position: 'sticky', top: 0, zIndex: 20,
          borderBottom: '2px solid #e5e7eb', background: '#f9fafb',
        }}>
          {/* 左ヘッダー（横スクロールでも固定） */}
          <div style={{
            display: 'flex', flexShrink: 0, width: LEFT_TOTAL,
            position: 'sticky', left: 0, zIndex: 21,
            background: '#f9fafb', borderRight: '2px solid #6366f1',
          }}>
            {LEFT_COLS.map(col => (
              <div
                key={col.key}
                style={{
                  ...TH, width: col.width,
                  cursor: col.sortable ? 'pointer' : 'default',
                }}
                onClick={() => col.sortable && setSortKey(col.key as keyof Task)}
              >
                {col.label}
                {sortKey === col.key && <span style={{ marginLeft: 2 }}>{sortDir === 'asc' ? '↑' : '↓'}</span>}
              </div>
            ))}
          </div>

          {/* タイムラインヘッダー */}
          <div style={{ width: totalWidth, position: 'relative', height: HEADER_H, background: '#f9fafb' }}>
            {headers.map((h, i) => (
              <div key={i} style={{
                position: 'absolute', left: h.x, width: h.width, height: HEADER_H,
                background: i % 2 === 0 ? '#f9fafb' : '#f3f4f6',
                borderRight: '1px solid #e5e7eb',
                display: 'flex', alignItems: 'center', paddingLeft: 4,
                fontSize: 10, fontWeight: 600, color: '#6b7280',
                boxSizing: 'border-box', overflow: 'hidden',
              }}>
                {h.label}
              </div>
            ))}
          </div>
        </div>

        {/* ── ボディ行 ── */}
        <div style={{ display: 'flex', position: 'relative' }}>

          {/* 左パネル（横スクロールでも固定） */}
          <div style={{
            flexShrink: 0, width: LEFT_TOTAL,
            position: 'sticky', left: 0, zIndex: 10,
            borderRight: '2px solid #6366f1',
            background: '#fff',
          }}>
            {flatRows.length === 0 ? (
              <div style={{ padding: '32px 16px', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
                タスクがありません
              </div>
            ) : (
              flatRows.map(({ task, depth }) => (
                <GanttLeftRow
                  key={task.id}
                  task={task}
                  depth={depth}
                  hasChildren={(childCount.get(task.id) ?? 0) > 0}
                  isCollapsed={collapsed.has(task.id)}
                  onToggleCollapse={() => toggleCollapse(task.id)}
                  onInlineUpdate={onInlineUpdate}
                  onOpenModal={() => onEditTask(task)}
                  onDelete={() => onDeleteTask(task.id)}
                />
              ))
            )}
          </div>

          {/* 右パネル：ガントSVG */}
          <svg
            width={totalWidth}
            height={Math.max(totalHeight, 1)}
            style={{ display: 'block', flexShrink: 0 }}
          >
            <defs>
              <marker id="arrowhead" markerWidth="6" markerHeight="6" refX="6" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6 Z" fill="#378ADD" />
              </marker>
            </defs>

            {/* 縞背景 */}
            {flatRows.map((_, i) => (
              <rect key={i} x={0} y={i * ROW_HEIGHT_PX} width={totalWidth} height={ROW_HEIGHT_PX}
                fill={i % 2 === 0 ? '#fff' : '#fafafa'} />
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
            <LightningLine x={todayX} height={Math.max(totalHeight, 1)} color="#E24B4A" label="今日" />

            {/* イナズマライン */}
            {lightningX !== null && (
              <LightningLine x={lightningX} height={Math.max(totalHeight, 1)} color="#D4537E" label="⚡" />
            )}
          </svg>
        </div>
      </div>
    </div>
  );
}
