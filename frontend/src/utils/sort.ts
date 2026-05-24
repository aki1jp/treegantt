import type { Task, TaskStatus, TaskPriority } from '../types/task';

const STATUS_ORDER: Record<TaskStatus, number> = { todo: 0, wip: 1, done: 2, wait: 3 };
const PRIORITY_ORDER: Record<TaskPriority, number> = { critical: 0, high: 1, medium: 2, low: 3 };

function topoSort(tasks: Task[]): Task[] {
  const inDegree = new Map<string, number>();
  const adjList  = new Map<string, string[]>();
  const ids = new Set(tasks.map(t => t.id));
  for (const t of tasks) {
    inDegree.set(t.id, 0);
    adjList.set(t.id, []);
  }
  for (const t of tasks) {
    for (const predId of t.predecessors) {
      if (!ids.has(predId)) continue;
      adjList.get(predId)!.push(t.id);
      inDegree.set(t.id, (inDegree.get(t.id) ?? 0) + 1);
    }
  }
  const queue = tasks.filter(t => (inDegree.get(t.id) ?? 0) === 0)
    .sort((a, b) => a.order - b.order);
  const result: Task[] = [];
  const taskMap = new Map(tasks.map(t => [t.id, t]));
  while (queue.length > 0) {
    const node = queue.shift()!;
    result.push(node);
    const nexts = (adjList.get(node.id) ?? [])
      .map(id => taskMap.get(id)!)
      .filter(Boolean);
    for (const next of nexts) {
      const deg = (inDegree.get(next.id) ?? 1) - 1;
      inDegree.set(next.id, deg);
      if (deg === 0) {
        const insertIdx = queue.findIndex(q => q.order > next.order);
        if (insertIdx === -1) queue.push(next); else queue.splice(insertIdx, 0, next);
      }
    }
  }
  // 循環依存などで残ったタスクを order 順で末尾に追加
  if (result.length < tasks.length) {
    const resultIds = new Set(result.map(t => t.id));
    tasks.filter(t => !resultIds.has(t.id)).sort((a, b) => a.order - b.order)
      .forEach(t => result.push(t));
  }
  return result;
}

export function sortAndFilter(
  tasks: Task[],
  sortKey: keyof Task | '' | 'deps',
  sortDir: 'asc' | 'desc',
  filterStatus: TaskStatus | '' | '!done',
  filterAssignee: string,
  filterPriority: string,
  filterSearch = '',
): Task[] {
  let result = tasks;

  if (filterStatus === '!done') result = result.filter(t => t.status !== 'done');
  else if (filterStatus)        result = result.filter(t => t.status === filterStatus);
  if (filterAssignee) result = result.filter(t => t.assignee.includes(filterAssignee));
  if (filterPriority) result = result.filter(t => t.priority === filterPriority);
  if (filterSearch) {
    const q = filterSearch.toLowerCase();
    result = result.filter(t =>
      t.title.toLowerCase().includes(q) || t.assignee.toLowerCase().includes(q)
    );
  }

  if (!sortKey) {
    return [...result].sort((a, b) => a.order - b.order);
  }

  if (sortKey === 'deps') {
    return topoSort(result);
  }

  return [...result].sort((a, b) => {
    let cmp = 0;
    if (sortKey === 'status') {
      cmp = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    } else if (sortKey === 'priority') {
      cmp = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    } else if (sortKey === 'startDate' || sortKey === 'endDate') {
      const av = a[sortKey], bv = b[sortKey];
      // null は昇順・降順に関わらず常に末尾
      if (!av && !bv) return 0;
      if (!av) return 1;
      if (!bv) return -1;
      cmp = av < bv ? -1 : av > bv ? 1 : 0;
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
