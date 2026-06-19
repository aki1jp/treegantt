import { describe, it, expect } from 'vitest';
import type { Task } from '../types/task';
import {
  buildChildCountMap,
  buildChildrenMap,
  calcAllEffectiveProgress,
  calcEffectiveProgress,
} from '../utils/taskTree';
import { calcParentSpanMap } from '../utils/ganttCalc';
import { genLargeTasks } from './fixtures/genLargeTasks';

// ---- 参照実装（v2.59 時点のアルゴリズムをそのまま固定したもの）----
// O(N) 化リファクタリング（v2.60）後も挙動が変わっていないことを証明するための基準。

function refEffectiveProgress(
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
    (sum, c) => sum + refEffectiveProgress(c.id, childCountMap, allTasks, new Set(visited)),
    0,
  );
  return Math.round(total / children.length);
}

function refParentSpanMap(
  allTasks: Task[],
): Map<string, { startDate: string | null; endDate: string | null }> {
  const childrenMap = new Map<string, Task[]>();
  for (const t of allTasks) {
    if (t.parentId) {
      const list = childrenMap.get(t.parentId) ?? [];
      list.push(t);
      childrenMap.set(t.parentId, list);
    }
  }
  function getDescendantDates(
    taskId: string,
    visited = new Set<string>(),
  ): { starts: string[]; ends: string[] } {
    if (visited.has(taskId)) return { starts: [], ends: [] };
    visited.add(taskId);
    const children = childrenMap.get(taskId) ?? [];
    const starts: string[] = [], ends: string[] = [];
    for (const child of children) {
      const isLeaf = !childrenMap.has(child.id);
      if (isLeaf && !child.isMilestone) {
        if (child.startDate) starts.push(child.startDate);
        if (child.endDate) ends.push(child.endDate);
      }
      const sub = getDescendantDates(child.id, new Set(visited));
      starts.push(...sub.starts);
      ends.push(...sub.ends);
    }
    return { starts, ends };
  }
  const result = new Map<string, { startDate: string | null; endDate: string | null }>();
  for (const [parentId] of childrenMap) {
    const { starts, ends } = getDescendantDates(parentId);
    result.set(parentId, {
      startDate: starts.length > 0 ? [...starts].sort()[0] : null,
      endDate: ends.length > 0 ? [...ends].sort().at(-1)! : null,
    });
  }
  return result;
}

function makeTask(partial: Partial<Task> & { id: string }): Task {
  return {
    projectId: 'p1',
    parentId: null,
    title: partial.id,
    summary: '',
    description: '',
    status: 'todo',
    priority: 'medium',
    progress: 0,
    assignee: '',
    startDate: null,
    endDate: null,
    isMilestone: false,
    predecessors: [],
    seq: 0,
    order: 0,
    titleColor: null,
    titleBgColor: null, estimateMinutes: null,
    createdAt: '',
    updatedAt: '',
    ...partial,
  };
}

// ---- buildChildrenMap ----

describe('buildChildrenMap', () => {
  it('親IDごとに子タスクを配列順で索引する', () => {
    const tasks = [
      makeTask({ id: 'a' }),
      makeTask({ id: 'b', parentId: 'a' }),
      makeTask({ id: 'c', parentId: 'a' }),
      makeTask({ id: 'd', parentId: 'b' }),
      makeTask({ id: 'e' }),
    ];
    const map = buildChildrenMap(tasks);
    expect(map.get('a')!.map(t => t.id)).toEqual(['b', 'c']);
    expect(map.get('b')!.map(t => t.id)).toEqual(['d']);
    expect(map.has('e')).toBe(false);
    expect(map.has('c')).toBe(false);
  });
});

// ---- calcAllEffectiveProgress / calcEffectiveProgress の同値性 ----

describe('実効進捗の O(N) 化と参照実装の同値性', () => {
  it('1000件フィクスチャの全タスクで参照実装と一致する（calcAllEffectiveProgress）', () => {
    const tasks = genLargeTasks(1000);
    const childCountMap = buildChildCountMap(tasks);
    const all = calcAllEffectiveProgress(tasks);
    expect(all.size).toBe(1000);
    for (const t of tasks) {
      expect(all.get(t.id), `task ${t.id}`).toBe(
        refEffectiveProgress(t.id, childCountMap, tasks),
      );
    }
  });

  it('書き換え後の calcEffectiveProgress も参照実装と一致する（後方互換）', () => {
    const tasks = genLargeTasks(300, 7);
    const childCountMap = buildChildCountMap(tasks);
    for (const t of tasks) {
      expect(calcEffectiveProgress(t.id, childCountMap, tasks), `task ${t.id}`).toBe(
        refEffectiveProgress(t.id, childCountMap, tasks),
      );
    }
  });

  it('childrenMap を渡しても省略しても同じ結果になる', () => {
    const tasks = genLargeTasks(200, 3);
    const withMap = calcAllEffectiveProgress(tasks, buildChildrenMap(tasks));
    const withoutMap = calcAllEffectiveProgress(tasks);
    expect(withMap).toEqual(withoutMap);
  });

  it('各階層で四捨五入する既存仕様を維持する（孫の丸め値を親が平均する）', () => {
    // sub1 = round((10+25)/2) = 18（17.5 の丸め）, root = round((18+40)/2) = 29
    const tasks = [
      makeTask({ id: 'root' }),
      makeTask({ id: 'sub1', parentId: 'root' }),
      makeTask({ id: 'leaf1', parentId: 'sub1', progress: 10 }),
      makeTask({ id: 'leaf2', parentId: 'sub1', progress: 25 }),
      makeTask({ id: 'leaf3', parentId: 'root', progress: 40 }),
    ];
    const all = calcAllEffectiveProgress(tasks);
    expect(all.get('sub1')).toBe(18);
    expect(all.get('root')).toBe(29);
    expect(all.get('leaf1')).toBe(10);
  });

  it('循環 parentId は 0 を返す（既存仕様）', () => {
    const tasks = [
      makeTask({ id: 'a', parentId: 'b', progress: 50 }),
      makeTask({ id: 'b', parentId: 'a', progress: 70 }),
      makeTask({ id: 'solo', progress: 30 }),
    ];
    const childCountMap = buildChildCountMap(tasks);
    const all = calcAllEffectiveProgress(tasks);
    for (const t of tasks) {
      expect(all.get(t.id), `task ${t.id}`).toBe(
        refEffectiveProgress(t.id, childCountMap, tasks),
      );
    }
    expect(all.get('a')).toBe(0);
    expect(all.get('b')).toBe(0);
    expect(all.get('solo')).toBe(30);
  });

  it('500段の深い一本鎖でもスタックを溢れさせず参照実装と一致する', () => {
    const tasks: Task[] = [];
    for (let i = 0; i < 500; i++) {
      tasks.push(
        makeTask({
          id: `n${i}`,
          parentId: i === 0 ? null : `n${i - 1}`,
          progress: i === 499 ? 60 : 0,
        }),
      );
    }
    const childCountMap = buildChildCountMap(tasks);
    const all = calcAllEffectiveProgress(tasks);
    expect(all.get('n0')).toBe(refEffectiveProgress('n0', childCountMap, tasks));
    expect(all.get('n0')).toBe(60); // 一本鎖は葉の値がそのまま伝播する
  });

  it('progress が 100 超や負値でもそのまま平均する（参照実装と同値）', () => {
    const tasks = [
      makeTask({ id: 'p' }),
      makeTask({ id: 'c1', parentId: 'p', progress: 150 }),
      makeTask({ id: 'c2', parentId: 'p', progress: -10 }),
    ];
    const childCountMap = buildChildCountMap(tasks);
    const all = calcAllEffectiveProgress(tasks);
    expect(all.get('p')).toBe(refEffectiveProgress('p', childCountMap, tasks));
  });
});

// ---- calcParentSpanMap の同値性 ----

describe('calcParentSpanMap の O(N) 化と参照実装の同値性', () => {
  it('1000件フィクスチャで参照実装と一致する', () => {
    const tasks = genLargeTasks(1000);
    const actual = calcParentSpanMap(tasks);
    const expected = refParentSpanMap(tasks);
    expect(actual.size).toBe(expected.size);
    for (const [id, span] of expected) {
      expect(actual.get(id), `parent ${id}`).toEqual(span);
    }
  });

  it('循環 parentId があっても無限ループしない', () => {
    const tasks = [
      makeTask({ id: 'a', parentId: 'b', startDate: '2026-01-01', endDate: '2026-01-05' }),
      makeTask({ id: 'b', parentId: 'a', startDate: '2026-02-01', endDate: '2026-02-05' }),
    ];
    const actual = calcParentSpanMap(tasks);
    const expected = refParentSpanMap(tasks);
    for (const [id, span] of expected) {
      expect(actual.get(id), `parent ${id}`).toEqual(span);
    }
  });

  it('マイルストーン・日付なし葉を除外する既存仕様を維持する', () => {
    const tasks = [
      makeTask({ id: 'p' }),
      makeTask({ id: 'c1', parentId: 'p', startDate: '2026-03-01', endDate: '2026-03-10' }),
      makeTask({ id: 'ms', parentId: 'p', startDate: '2026-01-01', endDate: '2026-01-01', isMilestone: true }),
      makeTask({ id: 'nodate', parentId: 'p' }),
    ];
    expect(calcParentSpanMap(tasks).get('p')).toEqual({
      startDate: '2026-03-01',
      endDate: '2026-03-10',
    });
  });
});

// ---- 時間 budget（CI 揺らぎを見込んだ緩い閾値）----

describe('1000件時の計算時間 budget', () => {
  it('calcAllEffectiveProgress + calcParentSpanMap が 1000件で 200ms 未満', () => {
    const tasks = genLargeTasks(1000);
    const t0 = performance.now();
    calcAllEffectiveProgress(tasks);
    calcParentSpanMap(tasks);
    const elapsed = performance.now() - t0;
    expect(elapsed).toBeLessThan(200);
  });
});
