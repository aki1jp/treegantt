import type { Task } from '../types/task';

export interface TreeNode { task: Task; depth: number; children: TreeNode[] }

export function buildChildCountMap(tasks: Task[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const t of tasks) {
    if (t.parentId) map.set(t.parentId, (map.get(t.parentId) ?? 0) + 1);
  }
  return map;
}

export function buildTree(tasks: Task[]): { roots: TreeNode[]; childCount: Map<string, number> } {
  const childCount = buildChildCountMap(tasks);
  const nodeMap = new Map<string, TreeNode>();
  for (const t of tasks) {
    nodeMap.set(t.id, { task: t, depth: 0, children: [] });
  }
  const roots: TreeNode[] = [];
  for (const t of tasks) {
    const node = nodeMap.get(t.id)!;
    if (t.parentId && nodeMap.has(t.parentId)) {
      nodeMap.get(t.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  // 親子関係確立後に DFS で depth を正しく設定（処理順序に依存しない）
  function assignDepths(nodes: TreeNode[], depth: number): void {
    for (const node of nodes) {
      node.depth = depth;
      assignDepths(node.children, depth + 1);
    }
  }
  assignDepths(roots, 0);
  return { roots, childCount };
}

export function flattenTree(
  nodes: TreeNode[],
  collapsed: Set<string>,
): { task: Task; depth: number }[] {
  const result: { task: Task; depth: number }[] = [];
  for (const node of nodes) {
    result.push({ task: node.task, depth: node.depth });
    if (!collapsed.has(node.task.id) && node.children.length > 0)
      result.push(...flattenTree(node.children, collapsed));
  }
  return result;
}

export function includeAncestors(filtered: Task[], all: Task[]): Task[] {
  const ids = new Set(filtered.map(t => t.id));
  const allMap = new Map(all.map(t => [t.id, t]));
  const result = [...filtered];
  for (const t of filtered) {
    let pid = t.parentId;
    while (pid && !ids.has(pid)) {
      const parent = allMap.get(pid);
      if (!parent) break;
      ids.add(pid);
      result.push(parent);
      pid = parent.parentId;
    }
  }
  return result.sort((a, b) => a.order - b.order);
}

export function calcEffectiveProgress(
  taskId: string,
  childCountMap: Map<string, number>,
  allTasks: Task[],
  visited: Set<string> = new Set(),
): number {
  if (visited.has(taskId)) return 0;
  visited.add(taskId);
  if ((childCountMap.get(taskId) ?? 0) === 0) {
    return allTasks.find(t => t.id === taskId)?.progress ?? 0;
  }
  const children = allTasks.filter(t => t.parentId === taskId);
  if (children.length === 0) return allTasks.find(t => t.id === taskId)?.progress ?? 0;
  const total = children.reduce(
    (sum, c) => sum + calcEffectiveProgress(c.id, childCountMap, allTasks, new Set(visited)),
    0,
  );
  return Math.round(total / children.length);
}
