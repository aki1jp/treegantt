import type { Task, TaskStatus, TaskPriority } from '../types/task';

const STATUS_ORDER: Record<TaskStatus, number> = { todo: 0, wip: 1, done: 2, wait: 3 };
const PRIORITY_ORDER: Record<TaskPriority, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export function sortAndFilter(
  tasks: Task[],
  sortKey: keyof Task | '',
  sortDir: 'asc' | 'desc',
  filterStatus: TaskStatus | '',
  filterAssignee: string,
  filterPriority: string
): Task[] {
  let result = tasks;

  if (filterStatus)   result = result.filter(t => t.status === filterStatus);
  if (filterAssignee) result = result.filter(t => t.assignee.includes(filterAssignee));
  if (filterPriority) result = result.filter(t => t.priority === filterPriority);

  if (!sortKey) {
    return [...result].sort((a, b) => a.order - b.order);
  }

  return [...result].sort((a, b) => {
    let cmp = 0;
    if (sortKey === 'status') {
      cmp = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    } else if (sortKey === 'priority') {
      cmp = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    } else if (sortKey === 'startDate' || sortKey === 'endDate') {
      const av = a[sortKey], bv = b[sortKey];
      if (!av && !bv) cmp = 0;
      else if (!av) cmp = 1;
      else if (!bv) cmp = -1;
      else cmp = av < bv ? -1 : av > bv ? 1 : 0;
    } else if (sortKey === 'progress' || sortKey === 'order') {
      cmp = (a[sortKey] as number) - (b[sortKey] as number);
    } else {
      const av = String(a[sortKey] ?? '');
      const bv = String(b[sortKey] ?? '');
      cmp = av.localeCompare(bv, 'ja');
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });
}
