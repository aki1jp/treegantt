import type { Task } from '../../types/task';
import { TaskRow } from './TaskRow';
import { useTaskStore } from '../../store/taskStore';
import { sortAndFilter } from '../../utils/sort';

interface Props {
  onEditTask: (task: Task) => void;
  onDeleteTask: (id: string) => void;
}

const SORT_HEADERS: { key: keyof Task | ''; label: string }[] = [
  { key: 'title',    label: 'タイトル' },
  { key: 'status',   label: 'ステータス' },
  { key: 'priority', label: '優先度' },
  { key: 'progress', label: '進捗' },
  { key: 'assignee', label: '担当者' },
  { key: 'startDate', label: '開始日' },
  { key: 'endDate',   label: '終了日' },
  { key: '',          label: '' },
];

const TH: React.CSSProperties = {
  padding: '10px 12px', textAlign: 'left', fontSize: 12, fontWeight: 600,
  color: '#6b7280', borderBottom: '2px solid #e5e7eb', background: '#f9fafb', userSelect: 'none',
};

export function TodoList({ onEditTask, onDeleteTask }: Props) {
  const { tasks, sortKey, sortDir, filterStatus, filterAssignee, filterPriority, setSortKey } = useTaskStore();
  const sorted = sortAndFilter(tasks, sortKey, sortDir, filterStatus, filterAssignee, filterPriority);

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {SORT_HEADERS.map(({ key, label }) => (
              <th key={key} style={{ ...TH, cursor: key ? 'pointer' : 'default' }}
                onClick={() => key && setSortKey(key)}>
                {label}
                {sortKey === key && (sortDir === 'asc' ? ' ↑' : ' ↓')}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr>
              <td colSpan={8} style={{ padding: 32, textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>
                タスクがありません
              </td>
            </tr>
          ) : (
            sorted.map(task => (
              <TaskRow
                key={task.id}
                task={task}
                onClick={() => onEditTask(task)}
                onDelete={() => onDeleteTask(task.id)}
              />
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
