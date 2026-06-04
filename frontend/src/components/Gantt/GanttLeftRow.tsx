import { useState, useRef, useEffect, useCallback } from 'react';
import type { Task } from '../../types/task';
import { addDays, calcDuration } from '../../utils/ganttCalc';
import { titlePaddingLeft } from '../../utils/wbsLayout';
import { ConflictDialog } from '../ConflictDialog/ConflictDialog';
import { TaskTooltip } from './TaskTooltip';
import { STATUS_COLOR, STATUS_LABEL, PRIORITY_COLOR, PRIORITY_LABEL } from '../../utils/taskColors';

export interface GanttLeftRowProps {
  task: Task;
  depth: number;
  hasChildren: boolean;
  isCollapsed: boolean;
  effectiveProgress: number;
  fontSize: number;
  rowHeight: number;
  titleWidth: number;
  assigneeWidth: number;
  dateColWidth: number;
  isDragging?: boolean;
  onToggleCollapse: () => void;
  onInlineUpdate: (id: string, patch: Partial<Task>) => void;
  onRowContextMenu: (x: number, y: number) => void;
}

export function GanttLeftRow({
  task, depth, hasChildren, isCollapsed, effectiveProgress, fontSize, rowHeight,
  titleWidth, assigneeWidth, dateColWidth,
  isDragging = false,
  onToggleCollapse, onInlineUpdate, onRowContextMenu,
}: GanttLeftRowProps) {
  const [editField, setEditField] = useState<string | null>(null);
  const [editVal, setEditVal] = useState('');
  const [editStartVal, setEditStartVal] = useState('');
  const [conflict, setConflict] = useState<{ field: string; theirVal: string; myVal: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── ツールチップ ──────────────────────────────────────────
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const tooltipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasTooltipContent = task.summary.trim().length > 0 || task.description.trim().length > 0;

  const handleTitleMouseEnter = useCallback((e: React.MouseEvent) => {
    if (isDragging || !hasTooltipContent) return;
    setTooltipPos({ x: e.clientX, y: e.clientY });
    tooltipTimer.current = setTimeout(() => setTooltipVisible(true), 250);
  }, [isDragging, hasTooltipContent]);

  const handleTitleMouseLeave = useCallback(() => {
    if (tooltipTimer.current) clearTimeout(tooltipTimer.current);
    setTooltipVisible(false);
  }, []);

  // ドラッグ開始時にツールチップを強制非表示
  useEffect(() => {
    if (isDragging) {
      if (tooltipTimer.current) clearTimeout(tooltipTimer.current);
      setTooltipVisible(false);
    }
  }, [isDragging]);

  useEffect(() => () => { if (tooltipTimer.current) clearTimeout(tooltipTimer.current); }, []);

  useEffect(() => {
    if (editField && inputRef.current) { inputRef.current.focus(); inputRef.current.select(); }
  }, [editField]);

  function startEdit(field: string, val: string) {
    if (tooltipTimer.current) clearTimeout(tooltipTimer.current);
    setTooltipVisible(false);
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
    // 開始日・終了日の前後矛盾チェック: 矛盾する場合は両方を新しい値にクランプ
    if (field === 'startDate' && myVal && task.endDate && (myVal as string) > task.endDate) {
      onInlineUpdate(task.id, { startDate: myVal as string, endDate: myVal as string });
      setEditField(null);
      return;
    }
    if (field === 'endDate' && myVal && task.startDate && (myVal as string) < task.startDate) {
      onInlineUpdate(task.id, { startDate: myVal as string, endDate: myVal as string });
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
    onInlineUpdate(task.id, { endDate: addDays(task.startDate, n - 1) });
    setEditField(null);
  }

  const CELL: React.CSSProperties = {
    height: rowHeight, display: 'flex', alignItems: 'center',
    padding: '0 6px', fontSize, overflow: 'hidden', whiteSpace: 'nowrap',
    boxSizing: 'border-box', color: 'var(--th-text2)',
  };
  const INPUT_S: React.CSSProperties = {
    width: '100%', padding: '2px 4px', border: '1px solid #4f46e5',
    borderRadius: 3, fontSize, outline: 'none',
    background: 'var(--th-input-bg)', color: 'var(--th-text)',
  };

  const isRootParent = depth === 0 && hasChildren;
  const indent = titlePaddingLeft(depth);
  const rowBg = task.titleBgColor ?? (isRootParent ? 'var(--th-bg-parent)' : 'var(--th-bg)');
  const duration = calcDuration(task);

  return (
    <div
      style={{
        display: 'flex', background: rowBg,
        height: rowHeight, boxSizing: 'border-box',
        borderBottom: '1px solid var(--th-border)',
        borderLeft: isRootParent ? '3px solid var(--th-border-strong)' : '3px solid transparent',
      }}
      onContextMenu={e => { e.preventDefault(); if (tooltipTimer.current) clearTimeout(tooltipTimer.current); setTooltipVisible(false); onRowContextMenu(e.clientX, e.clientY); }}
    >
      {/* # (seq: 作成時発番・不変) */}
      <div style={{ ...CELL, width: 36, justifyContent: 'center', color: 'var(--th-text-dim)', userSelect: 'none' }}>
        {task.isMilestone ? '◇' : task.seq}
      </div>

      {/* タイトル */}
      <div style={{ ...CELL, width: titleWidth, paddingLeft: indent }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 3, width: '100%', overflow: 'hidden' }}>
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
            <span
              onClick={() => startEdit('title', task.title)}
              onMouseEnter={handleTitleMouseEnter}
              onMouseLeave={handleTitleMouseLeave}
              style={{
                cursor: 'text', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                fontWeight: isRootParent ? 700 : 400,
                color: task.titleColor ?? (isRootParent ? 'var(--th-text-parent)' : 'var(--th-text2)'),
              }}>
              {task.title}
            </span>
          )}
          <TaskTooltip task={task} pos={tooltipPos} visible={tooltipVisible} />
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
      <div style={{ ...CELL, width: dateColWidth }}>
        {!hasChildren && editField === 'startDate' ? (
          <input ref={inputRef} style={INPUT_S} type="date" value={editVal}
            max={task.endDate || undefined}
            onChange={e => setEditVal(e.target.value)}
            onBlur={() => commit('startDate', editVal || null)}
            onKeyDown={e => onKey(e, 'startDate', editVal || null)} />
        ) : (
          <span
            data-testid={hasChildren ? 'date-readonly' : undefined}
            onClick={() => !hasChildren && startEdit('startDate', task.startDate ?? '')}
            title={hasChildren ? '子タスクの日付から自動計算' : undefined}
            style={{
              cursor: hasChildren ? 'default' : 'text',
              color: hasChildren ? 'var(--th-text-dim)' : (task.startDate ? 'var(--th-text2)' : 'var(--th-text-ph)'),
            }}>
            {task.startDate ?? '—'}
          </span>
        )}
      </div>

      {/* 終了日 */}
      <div style={{ ...CELL, width: dateColWidth }}>
        {!hasChildren && editField === 'endDate' ? (
          <input ref={inputRef} style={INPUT_S} type="date" value={editVal}
            min={task.startDate || undefined}
            onChange={e => setEditVal(e.target.value)}
            onBlur={() => commit('endDate', editVal || null)}
            onKeyDown={e => onKey(e, 'endDate', editVal || null)} />
        ) : (
          <span
            data-testid={hasChildren ? 'date-readonly' : undefined}
            onClick={() => !hasChildren && startEdit('endDate', task.endDate ?? '')}
            title={hasChildren ? '子タスクの日付から自動計算' : undefined}
            style={{
              cursor: hasChildren ? 'default' : 'text',
              color: hasChildren ? 'var(--th-text-dim)' : (task.endDate ? 'var(--th-text2)' : 'var(--th-text-ph)'),
            }}>
            {task.endDate ?? '—'}
          </span>
        )}
      </div>

      {/* 期間（日数） */}
      <div style={{ ...CELL, width: 50 }}>
        {!hasChildren && editField === 'duration' ? (
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
              if (!hasChildren && task.startDate) startEdit('duration', String(duration ?? ''));
            }}
            title={hasChildren ? '子タスクの日付から自動計算' : undefined}
            style={{
              cursor: (!hasChildren && task.startDate) ? 'text' : 'default',
              color: hasChildren ? 'var(--th-text-dim)' : (duration !== null ? 'var(--th-text2)' : 'var(--th-text-ph)'),
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
