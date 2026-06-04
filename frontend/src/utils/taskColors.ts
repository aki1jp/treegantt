import type { TaskStatus, TaskPriority } from '../types/task';

export const STATUS_COLOR: Record<TaskStatus, string> = {
  todo: '#6b7280', wip: '#3b82f6', done: '#22c55e', wait: '#f59e0b', pending: '#94a3b8',
};

export const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: 'TODO', wip: 'Doing', done: 'DONE', wait: '待機', pending: '保留',
};

export const PRIORITY_COLOR: Record<TaskPriority, string> = {
  critical: '#ef4444', high: '#f97316', medium: '#6b7280', low: '#d1d5db',
};

export const PRIORITY_LABEL: Record<TaskPriority, string> = {
  critical: '最高', high: '高', medium: '中', low: '低',
};
