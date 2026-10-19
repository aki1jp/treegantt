import { describe, it, expect } from 'vitest';
import type { Task } from '../types/task';
import {
  buildChildCountMap,
  calcAllEffectiveProgress,
  calcEffectiveProgress,
} from '../utils/taskTree';

// 保留（status === 'pending'）のタスクは親の進捗集計から除外する（設計書 §8.3）。

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
    titleBgColor: null,
    estimateMinutes: null,
    createdAt: '',
    updatedAt: '',
    ...partial,
  };
}

function both(tasks: Task[]): { all: Map<string, number>; one: (id: string) => number } {
  const childCountMap = buildChildCountMap(tasks);
  return {
    all: calcAllEffectiveProgress(tasks),
    one: (id: string) => calcEffectiveProgress(id, childCountMap, tasks),
  };
}

describe('保留タスクの進捗集計除外', () => {
  it('done 100 + pending 0 の子 → 親は 100', () => {
    const tasks = [
      makeTask({ id: 'p' }),
      makeTask({ id: 'a', parentId: 'p', status: 'done', progress: 100 }),
      makeTask({ id: 'b', parentId: 'p', status: 'pending', progress: 0 }),
    ];
    const { all, one } = both(tasks);
    expect(all.get('p')).toBe(100);
    expect(one('p')).toBe(100);
  });

  it('子が全て pending → 親は 0 で、祖父の平均からも除外される', () => {
    const tasks = [
      makeTask({ id: 'g' }),
      makeTask({ id: 'P', parentId: 'g' }),
      makeTask({ id: 'p1', parentId: 'P', status: 'pending', progress: 80 }),
      makeTask({ id: 'p2', parentId: 'P', status: 'pending', progress: 20 }),
      makeTask({ id: 'l', parentId: 'g', status: 'todo', progress: 40 }),
    ];
    const { all, one } = both(tasks);
    expect(all.get('P')).toBe(0);
    expect(all.get('g')).toBe(40);
    expect(one('P')).toBe(0);
    expect(one('g')).toBe(40);
  });

  it('孫に pending を含む多階層でも除外して各階層で四捨五入する', () => {
    // sub1 = (10, 25) → 18, sub2 = 孫 pending 除外 → 90, root = round((18+90+60)/3) = 56
    const tasks = [
      makeTask({ id: 'root' }),
      makeTask({ id: 'sub1', parentId: 'root' }),
      makeTask({ id: 'a', parentId: 'sub1', progress: 10 }),
      makeTask({ id: 'b', parentId: 'sub1', progress: 25 }),
      makeTask({ id: 'sub2', parentId: 'root' }),
      makeTask({ id: 'c', parentId: 'sub2', status: 'wip', progress: 90 }),
      makeTask({ id: 'd', parentId: 'sub2', status: 'pending', progress: 5 }),
      makeTask({ id: 'e', parentId: 'root', progress: 60 }),
    ];
    const { all, one } = both(tasks);
    expect(all.get('sub1')).toBe(18);
    expect(all.get('sub2')).toBe(90);
    expect(all.get('root')).toBe(56);
    expect(one('root')).toBe(56);
  });

  it('親自身の status が pending でも、除外されていない子があれば集計する', () => {
    const tasks = [
      makeTask({ id: 'p', status: 'pending' }),
      makeTask({ id: 'a', parentId: 'p', progress: 30 }),
    ];
    const { all, one } = both(tasks);
    expect(all.get('p')).toBe(30);
    expect(one('p')).toBe(30);
  });

  it('pending の葉自身の値は自身の progress のまま', () => {
    const tasks = [
      makeTask({ id: 'p' }),
      makeTask({ id: 'a', parentId: 'p', status: 'pending', progress: 35 }),
      makeTask({ id: 'b', parentId: 'p', progress: 50 }),
    ];
    const { all, one } = both(tasks);
    expect(all.get('a')).toBe(35);
    expect(one('a')).toBe(35);
    expect(all.get('p')).toBe(50);
  });
});
