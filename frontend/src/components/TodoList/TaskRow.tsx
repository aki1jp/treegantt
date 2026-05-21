import { useState, useRef, useEffect } from 'react';
import type { Task, TaskStatus, TaskPriority } from '../../types/task';

interface Props {
  task: Task;
  depth?: number;
  hasChildren?: boolean;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  onInlineUpdate: (id: string, patch: Partial<Task>) => void;
  onOpenModal: () => void;
  onDelete: () => void;
}

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

const TD: React.CSSProperties = {
  padding: '6px 10px', borderBottom: '1px solid #f3f4f6', fontSize: 13, verticalAlign: 'middle',
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
};
const CELL_INPUT: React.CSSProperties = {
  width: '100%', padding: '2px 4px', border: '1px solid #4f46e5', borderRadius: 3,
  fontSize: 13, outline: 'none', boxSizing: 'border-box',
};

interface ContextMenu { x: number; y: number }

export function TaskRow({
  task, depth = 0, hasChildren = false, isCollapsed = false,
  onToggleCollapse, onInlineUpdate, onOpenModal, onDelete,
}: Props) {
  const [editingField, setEditingField] = useState<keyof Task | null>(null);
  const [editValue, setEditValue] = useState('');
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingField && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingField]);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [contextMenu]);

  function startEdit(field: keyof Task, value: string) {
    setEditingField(field);
    setEditValue(value);
  }

  function commitEdit() {
    if (!editingField) return;
    const trimmed = editValue.trim();
    if (editingField === 'title' && !trimmed) {
      setEditingField(null);
      return;
    }
    onInlineUpdate(task.id, { [editingField]: trimmed || null });
    setEditingField(null);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') commitEdit();
    if (e.key === 'Escape') setEditingField(null);
  }

  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }

  const indent = depth * 20;
  const rowBg = depth > 0 ? `hsl(240, 20%, ${98 - depth * 2}%)` : undefined;

  return (
    <>
      <tr onContextMenu={handleContextMenu} style={{ background: rowBg }}>
        {/* タイトル（インデント＋折りたたみボタン） */}
        <td style={{ ...TD, paddingLeft: 10 + indent }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {hasChildren && (
              <button
                onClick={e => { e.stopPropagation(); onToggleCollapse?.(); }}
                style={{
                  width: 16, height: 16, border: 'none', background: 'none',
                  cursor: 'pointer', padding: 0, color: '#6b7280', fontSize: 10, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                {isCollapsed ? '▶' : '▼'}
              </button>
            )}
            {!hasChildren && depth > 0 && (
              <span style={{ width: 16, flexShrink: 0, color: '#d1d5db', fontSize: 10 }}>└</span>
            )}
            {editingField === 'title' ? (
              <input ref={inputRef} style={CELL_INPUT} value={editValue}
                onChange={e => setEditValue(e.target.value)}
                onBlur={commitEdit} onKeyDown={handleKeyDown} />
            ) : (
              <span onClick={() => startEdit('title', task.title)}
                style={{ cursor: 'text', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {task.title}
              </span>
            )}
          </div>
        </td>

        {/* ステータス */}
        <td style={TD}>
          {editingField === 'status' ? (
            <select style={{ ...CELL_INPUT, width: 'auto' }} value={editValue} autoFocus
              onChange={e => {
                onInlineUpdate(task.id, { status: e.target.value as TaskStatus });
                setEditingField(null);
              }}
              onBlur={() => setEditingField(null)}>
              {Object.entries(STATUS_LABEL).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          ) : (
            <span onClick={() => startEdit('status', task.status)} style={{ cursor: 'pointer' }}>
              <span style={{
                padding: '2px 8px', borderRadius: 9999, fontSize: 11, fontWeight: 600,
                background: STATUS_COLOR[task.status] + '22', color: STATUS_COLOR[task.status],
              }}>
                {STATUS_LABEL[task.status]}
              </span>
            </span>
          )}
        </td>

        {/* 優先度 */}
        <td style={TD}>
          {editingField === 'priority' ? (
            <select style={{ ...CELL_INPUT, width: 'auto' }} value={editValue} autoFocus
              onChange={e => {
                onInlineUpdate(task.id, { priority: e.target.value as TaskPriority });
                setEditingField(null);
              }}
              onBlur={() => setEditingField(null)}>
              {Object.entries(PRIORITY_LABEL).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          ) : (
            <span onClick={() => startEdit('priority', task.priority)} style={{ cursor: 'pointer' }}>
              <span style={{
                padding: '2px 8px', borderRadius: 9999, fontSize: 11, fontWeight: 600,
                background: PRIORITY_COLOR[task.priority] + '22', color: PRIORITY_COLOR[task.priority],
              }}>
                {PRIORITY_LABEL[task.priority]}
              </span>
            </span>
          )}
        </td>

        {/* 進捗 */}
        <td style={TD}>
          {editingField === 'progress' ? (
            <input ref={inputRef} style={{ ...CELL_INPUT, width: 60 }}
              type="number" min={0} max={100} value={editValue}
              onChange={e => setEditValue(e.target.value)}
              onBlur={() => {
                const v = Math.min(100, Math.max(0, Number(editValue)));
                onInlineUpdate(task.id, { progress: v });
                setEditingField(null);
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  const v = Math.min(100, Math.max(0, Number(editValue)));
                  onInlineUpdate(task.id, { progress: v });
                  setEditingField(null);
                }
                if (e.key === 'Escape') setEditingField(null);
              }} />
          ) : (
            <div onClick={() => startEdit('progress', String(task.progress))}
              style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'text' }}>
              <div style={{ width: 60, height: 6, background: '#e5e7eb', borderRadius: 3, flexShrink: 0 }}>
                <div style={{ width: `${task.progress}%`, height: '100%', background: '#4f46e5', borderRadius: 3 }} />
              </div>
              <span style={{ fontSize: 11, color: '#6b7280' }}>{task.progress}%</span>
            </div>
          )}
        </td>

        {/* 担当者 */}
        <td style={TD}>
          {editingField === 'assignee' ? (
            <input ref={inputRef} style={CELL_INPUT} value={editValue}
              onChange={e => setEditValue(e.target.value)}
              onBlur={commitEdit} onKeyDown={handleKeyDown} />
          ) : (
            <span onClick={() => startEdit('assignee', task.assignee)}
              style={{ cursor: 'text', display: 'block', color: task.assignee ? undefined : '#9ca3af' }}>
              {task.assignee || '—'}
            </span>
          )}
        </td>

        {/* 開始日 */}
        <td style={TD}>
          {editingField === 'startDate' ? (
            <input ref={inputRef} style={CELL_INPUT} type="date" value={editValue}
              onChange={e => setEditValue(e.target.value)}
              onBlur={commitEdit} onKeyDown={handleKeyDown} />
          ) : (
            <span onClick={() => startEdit('startDate', task.startDate ?? '')}
              style={{ cursor: 'text', display: 'block', color: task.startDate ? undefined : '#9ca3af' }}>
              {task.startDate ?? '—'}
            </span>
          )}
        </td>

        {/* 終了日 */}
        <td style={TD}>
          {editingField === 'endDate' ? (
            <input ref={inputRef} style={CELL_INPUT} type="date" value={editValue}
              onChange={e => setEditValue(e.target.value)}
              onBlur={commitEdit} onKeyDown={handleKeyDown} />
          ) : (
            <span onClick={() => startEdit('endDate', task.endDate ?? '')}
              style={{ cursor: 'text', display: 'block', color: task.endDate ? undefined : '#9ca3af' }}>
              {task.endDate ?? '—'}
            </span>
          )}
        </td>

        <td style={{ ...TD, textAlign: 'right' }}>
          <button onClick={e => { e.stopPropagation(); onDelete(); }} style={{
            padding: '2px 8px', border: '1px solid #fca5a5', borderRadius: 4,
            background: '#fff', color: '#ef4444', cursor: 'pointer', fontSize: 12,
          }}>
            削除
          </button>
        </td>
      </tr>

      {/* 右クリックコンテキストメニュー */}
      {contextMenu && (
        <div
          style={{
            position: 'fixed', top: contextMenu.y, left: contextMenu.x,
            background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6,
            boxShadow: '0 4px 16px rgba(0,0,0,.12)', zIndex: 9999, minWidth: 140,
          }}
          onClick={e => e.stopPropagation()}
        >
          <button
            onClick={() => { onOpenModal(); setContextMenu(null); }}
            style={{
              display: 'block', width: '100%', padding: '8px 16px', border: 'none',
              background: 'none', textAlign: 'left', cursor: 'pointer', fontSize: 13,
            }}
            onMouseEnter={e => (e.currentTarget.style.background = '#f3f4f6')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
          >
            編集（詳細）
          </button>
          <div style={{ height: 1, background: '#e5e7eb', margin: '2px 0' }} />
          <button
            onClick={() => { onDelete(); setContextMenu(null); }}
            style={{
              display: 'block', width: '100%', padding: '8px 16px', border: 'none',
              background: 'none', textAlign: 'left', cursor: 'pointer', fontSize: 13, color: '#ef4444',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = '#fef2f2')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
          >
            削除
          </button>
        </div>
      )}
    </>
  );
}
