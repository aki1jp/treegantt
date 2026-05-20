import type { Task, TaskStatus, TaskPriority } from '../../types/task';

interface Props {
  task: Task;
  onClick: () => void;
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
  padding: '8px 12px', borderBottom: '1px solid #f3f4f6', fontSize: 13, verticalAlign: 'middle',
};

export function TaskRow({ task, onClick, onDelete }: Props) {
  return (
    <tr style={{ cursor: 'pointer' }} onClick={onClick}>
      <td style={TD}>{task.title}</td>
      <td style={TD}>
        <span style={{
          padding: '2px 8px', borderRadius: 9999, fontSize: 11, fontWeight: 600,
          background: STATUS_COLOR[task.status] + '22', color: STATUS_COLOR[task.status],
        }}>
          {STATUS_LABEL[task.status]}
        </span>
      </td>
      <td style={TD}>
        <span style={{
          padding: '2px 8px', borderRadius: 9999, fontSize: 11, fontWeight: 600,
          background: PRIORITY_COLOR[task.priority] + '22', color: PRIORITY_COLOR[task.priority],
        }}>
          {PRIORITY_LABEL[task.priority]}
        </span>
      </td>
      <td style={TD}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 80, height: 6, background: '#e5e7eb', borderRadius: 3 }}>
            <div style={{ width: `${task.progress}%`, height: '100%', background: '#4f46e5', borderRadius: 3 }} />
          </div>
          <span style={{ fontSize: 11, color: '#6b7280' }}>{task.progress}%</span>
        </div>
      </td>
      <td style={TD}>{task.assignee || '—'}</td>
      <td style={TD}>{task.startDate ?? '—'}</td>
      <td style={TD}>{task.endDate ?? '—'}</td>
      <td style={{ ...TD, textAlign: 'right' }}>
        <button onClick={e => { e.stopPropagation(); onDelete(); }} style={{
          padding: '2px 8px', border: '1px solid #fca5a5', borderRadius: 4,
          background: '#fff', color: '#ef4444', cursor: 'pointer', fontSize: 12,
        }}>
          削除
        </button>
      </td>
    </tr>
  );
}
