import type { Task, TaskStatus } from '../types/task';

export function filterTasks(
  tasks: Task[],
  filterStatus: TaskStatus | '' | '!done',
  filterAssignee: string,
  filterPriority: string,
  filterSearch = '',
): Task[] {
  let result = tasks;

  if (filterStatus === '!done') result = result.filter(t => t.status !== 'done' && t.status !== 'pending');
  else if (filterStatus)        result = result.filter(t => t.status === filterStatus);
  if (filterAssignee) {
    // 自身の担当者が一致、または祖先のいずれかが一致するタスクを残す
    // （自分が担当する親タスク配下の子タスクは、子の担当に関わらず全て表示）。
    // 祖先ルックアップは元の全 tasks で行う（祖先が他フィルタで落ちていても継承を効かせる）。
    const byId = new Map(tasks.map(t => [t.id, t]));
    const matchesAssignee = (t: Task): boolean => {
      const seen = new Set<string>();
      let cur: Task | undefined = t;
      while (cur && !seen.has(cur.id)) {
        seen.add(cur.id); // 循環 parentId ガード
        if (cur.assignee.includes(filterAssignee)) return true;
        cur = cur.parentId ? byId.get(cur.parentId) : undefined;
      }
      return false;
    };
    result = result.filter(t => t.isMilestone || matchesAssignee(t));
  }
  if (filterPriority) result = result.filter(t => t.priority === filterPriority);
  if (filterSearch) {
    const q = filterSearch.toLowerCase();
    result = result.filter(t =>
      t.title.toLowerCase().includes(q) || t.assignee.toLowerCase().includes(q)
    );
  }

  return [...result].sort((a, b) => a.order - b.order);
}
