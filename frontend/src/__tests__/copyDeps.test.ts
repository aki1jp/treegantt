import { describe, it, expect } from 'vitest';
import { mapInternalPredecessors } from '../utils/copyDeps';
import type { Task } from '../types/task';

let seq = 0;
function makeTask(overrides: Partial<Task> = {}): Task {
  seq++;
  return {
    id: `t${seq}`, projectId: 'p1', parentId: null,
    title: `Task${seq}`, summary: '', description: '',
    status: 'todo', priority: 'medium', progress: 0, assignee: '',
    startDate: '2026-06-10', endDate: '2026-06-15',
    isMilestone: false, predecessors: [], seq, order: seq,
    createdAt: '', updatedAt: '', titleColor: null, titleBgColor: null,
    ...overrides,
  };
}

describe('mapInternalPredecessors（コピー時の内部依存の付け替え）', () => {
  it('子同士の依存を新IDに付け替える', () => {
    const parent = makeTask({ id: 'p' });
    const childA = makeTask({ id: 'a', parentId: 'p' });
    const childB = makeTask({ id: 'b', parentId: 'p', predecessors: ['a'] });
    const idMap = new Map([['p', 'P2'], ['a', 'A2'], ['b', 'B2']]);

    const result = mapInternalPredecessors([parent, childA, childB], idMap);
    expect(result).toEqual([{ id: 'B2', predecessors: ['A2'] }]);
  });

  it('サブツリー外への依存は除外される（内部依存と混在時は内部分のみ残る）', () => {
    const childB = makeTask({ id: 'b', parentId: 'p', predecessors: ['external', 'a'] });
    const childA = makeTask({ id: 'a', parentId: 'p' });
    const idMap = new Map([['a', 'A2'], ['b', 'B2']]);

    const result = mapInternalPredecessors([childA, childB], idMap);
    expect(result).toEqual([{ id: 'B2', predecessors: ['A2'] }]);
  });

  it('外部依存のみのタスク・依存なしタスクは結果に含まれない', () => {
    const childA = makeTask({ id: 'a', parentId: 'p', predecessors: ['external'] });
    const childB = makeTask({ id: 'b', parentId: 'p' });
    const idMap = new Map([['a', 'A2'], ['b', 'B2']]);

    expect(mapInternalPredecessors([childA, childB], idMap)).toEqual([]);
  });

  it('孫同士の依存もコピーされる', () => {
    const parent = makeTask({ id: 'p' });
    const child  = makeTask({ id: 'c', parentId: 'p' });
    const grandA = makeTask({ id: 'ga', parentId: 'c' });
    const grandB = makeTask({ id: 'gb', parentId: 'c', predecessors: ['ga'] });
    const idMap = new Map([['p', 'P2'], ['c', 'C2'], ['ga', 'GA2'], ['gb', 'GB2']]);

    const result = mapInternalPredecessors([parent, child, grandA, grandB], idMap);
    expect(result).toEqual([{ id: 'GB2', predecessors: ['GA2'] }]);
  });
});
