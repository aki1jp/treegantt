import type { Task } from '../types/task';

export interface TreeNode { task: Task; depth: number; children: TreeNode[] }

export function buildChildCountMap(tasks: Task[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const t of tasks) {
    if (t.parentId) map.set(t.parentId, (map.get(t.parentId) ?? 0) + 1);
  }
  return map;
}

export function buildChildrenMap(tasks: Task[]): Map<string, Task[]> {
  const map = new Map<string, Task[]>();
  for (const t of tasks) {
    if (!t.parentId) continue;
    const list = map.get(t.parentId);
    if (list) list.push(t);
    else map.set(t.parentId, [t]);
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

// No. 列（表示専用の通し番号, 設計書 §9.2）: 全展開・フィルタなしの表示順
// （buildTree → flattenTree(roots, 空の Set)）で 1 から採番したタスク id → 番号 の Map を返す。
// 実際の画面（フィルタ適用後・折りたたみ適用後）ではこの Map の値をそのまま表示し、詰め直さない。
export function buildRowNumberMap(tasks: Task[]): Map<string, number> {
  // buildTree は「order 昇順で渡される」前提（他の呼び出し箇所は全てソート済み配列を渡す）。
  // ここでは呼び出し元（画面の displayTasks）がソート済みとは限らないため、order 昇順に揃えてから渡す。
  const sorted = [...tasks].sort((a, b) => a.order - b.order);
  const { roots } = buildTree(sorted);
  const flat = flattenTree(roots, new Set());
  const map = new Map<string, number>();
  flat.forEach((row, i) => map.set(row.task.id, i + 1));
  return map;
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

export function resolveVisibleId(
  id: string,
  taskIndex: Map<string, number>,
  taskById: Map<string, Task>,
): string | null {
  let cur: string | undefined = id;
  while (cur) {
    if (taskIndex.has(cur)) return cur;
    cur = taskById.get(cur)?.parentId ?? undefined;
  }
  return null;
}

// 全タスクの実効進捗（親=子の平均、葉=自身の progress）を post-order DFS 1パスで
// まとめて計算する。結果 Map がメモを兼ねるため各タスクは1回しか計算されない。
// 循環 parentId は「計算中セット」で検出して 0 を返す（calcEffectiveProgress と同仕様）。
export function calcAllEffectiveProgress(
  tasks: Task[],
  childrenMap: Map<string, Task[]> = buildChildrenMap(tasks),
): Map<string, number> {
  const result = new Map<string, number>();
  const inProgress = new Set<string>();
  const byId = new Map(tasks.map(t => [t.id, t]));

  const visit = (taskId: string): number => {
    const cached = result.get(taskId);
    if (cached !== undefined) return cached;
    if (inProgress.has(taskId)) return 0;
    const children = childrenMap.get(taskId);
    let value: number;
    if (!children || children.length === 0) {
      value = byId.get(taskId)?.progress ?? 0;
    } else {
      inProgress.add(taskId);
      const total = children.reduce((sum, c) => sum + visit(c.id), 0);
      inProgress.delete(taskId);
      value = Math.round(total / children.length);
    }
    result.set(taskId, value);
    return value;
  };

  for (const t of tasks) visit(t.id);
  return result;
}

export function calcEffectiveProgress(
  taskId: string,
  childCountMap: Map<string, number>,
  allTasks: Task[],
  visited: Set<string> = new Set(),
): number {
  if (visited.has(taskId)) return 0;
  // childrenMap を1回構築して再帰のたびの allTasks.filter 線形探索を排除する
  const childrenMap = buildChildrenMap(allTasks);
  const byId = new Map(allTasks.map(t => [t.id, t]));
  const memo = new Map<string, number>();
  const inProgress = new Set(visited);

  const visit = (id: string): number => {
    const cached = memo.get(id);
    if (cached !== undefined) return cached;
    if (inProgress.has(id)) return 0;
    let value: number;
    if ((childCountMap.get(id) ?? 0) === 0) {
      value = byId.get(id)?.progress ?? 0;
    } else {
      const children = childrenMap.get(id) ?? [];
      if (children.length === 0) {
        value = byId.get(id)?.progress ?? 0;
      } else {
        inProgress.add(id);
        const total = children.reduce((sum, c) => sum + visit(c.id), 0);
        inProgress.delete(id);
        value = Math.round(total / children.length);
      }
    }
    memo.set(id, value);
    return value;
  };

  return visit(taskId);
}
