import type { Task } from '../types/task';

// コピー時の依存関係付け替え: サブツリー内部の依存のみ新IDにマップする。
// 外部タスクへの依存はコピーしない（コピー先で意図しない依存を作らない）。
export function mapInternalPredecessors(
  subtree: Task[],
  idMap: ReadonlyMap<string, string>,
): { id: string; predecessors: string[] }[] {
  const result: { id: string; predecessors: string[] }[] = [];
  for (const task of subtree) {
    const internal = task.predecessors.filter(p => idMap.has(p));
    if (internal.length === 0) continue;
    result.push({
      id: idMap.get(task.id)!,
      predecessors: internal.map(p => idMap.get(p)!),
    });
  }
  return result;
}
