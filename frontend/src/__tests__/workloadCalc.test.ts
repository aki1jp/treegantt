import { describe, it, expect } from 'vitest';
import { calcWorkloadMatrix, workloadColor } from '../utils/workloadCalc';
import type { Task } from '../types/task';

function makeTask(partial: Partial<Task>): Task {
  return {
    id: 'x',
    projectId: 'p',
    title: 'Task',
    summary: '',
    description: '',
    status: 'todo',
    priority: 'medium',
    progress: 0,
    assignee: '',
    startDate: null,
    endDate: null,
    parentId: null,
    predecessors: [],
    isMilestone: false,
    seq: 1,
    order: 1,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    ...partial,
  };
}

describe('calcWorkloadMatrix', () => {
  it('空タスクリストは空マトリクスを返す', () => {
    const result = calcWorkloadMatrix([], new Date('2026-05-01'), new Date('2026-05-03'));
    expect(result.assignees).toEqual([]);
    expect(result.days).toEqual([]);
    expect(result.matrix).toEqual([]);
  });

  it('担当者なしのタスクは集計されない', () => {
    const tasks = [makeTask({ startDate: '2026-05-01', endDate: '2026-05-02', status: 'todo' })];
    const result = calcWorkloadMatrix(tasks, new Date('2026-05-01'), new Date('2026-05-02'));
    expect(result.assignees).toEqual([]);
  });

  it('doneタスクは集計されない', () => {
    const tasks = [makeTask({ assignee: 'Alice', startDate: '2026-05-01', endDate: '2026-05-02', status: 'done' })];
    const result = calcWorkloadMatrix(tasks, new Date('2026-05-01'), new Date('2026-05-02'));
    expect(result.assignees).toEqual([]);
  });

  it('startDate/endDate が null のタスクは集計されない', () => {
    const tasks = [makeTask({ assignee: 'Alice', startDate: null, endDate: null, status: 'todo' })];
    const result = calcWorkloadMatrix(tasks, new Date('2026-05-01'), new Date('2026-05-02'));
    expect(result.assignees).toEqual([]);
  });

  it('1人1タスク: 対象日に count=1 が返る', () => {
    const tasks = [
      makeTask({ id: 't1', assignee: 'Alice', startDate: '2026-05-01', endDate: '2026-05-03', status: 'todo' }),
    ];
    const result = calcWorkloadMatrix(tasks, new Date('2026-05-01'), new Date('2026-05-03'));
    expect(result.assignees).toEqual(['Alice']);
    expect(result.days).toEqual(['2026-05-01', '2026-05-02', '2026-05-03']);
    // Alice の全3日 count=1
    expect(result.matrix[0]).toEqual([1, 1, 1]);
  });

  it('同日に2タスク: count=2 が返る', () => {
    const tasks = [
      makeTask({ id: 't1', assignee: 'Alice', startDate: '2026-05-01', endDate: '2026-05-01', status: 'wip' }),
      makeTask({ id: 't2', assignee: 'Alice', startDate: '2026-05-01', endDate: '2026-05-01', status: 'todo' }),
    ];
    const result = calcWorkloadMatrix(tasks, new Date('2026-05-01'), new Date('2026-05-01'));
    expect(result.matrix[0][0]).toBe(2);
  });

  it('複数担当者が正しく分離される', () => {
    const tasks = [
      makeTask({ id: 't1', assignee: 'Alice', startDate: '2026-05-01', endDate: '2026-05-01', status: 'todo' }),
      makeTask({ id: 't2', assignee: 'Bob',   startDate: '2026-05-01', endDate: '2026-05-01', status: 'todo' }),
      makeTask({ id: 't3', assignee: 'Bob',   startDate: '2026-05-01', endDate: '2026-05-01', status: 'wip' }),
    ];
    const result = calcWorkloadMatrix(tasks, new Date('2026-05-01'), new Date('2026-05-01'));
    expect(result.assignees).toContain('Alice');
    expect(result.assignees).toContain('Bob');
    const aliceIdx = result.assignees.indexOf('Alice');
    const bobIdx   = result.assignees.indexOf('Bob');
    expect(result.matrix[aliceIdx][0]).toBe(1);
    expect(result.matrix[bobIdx][0]).toBe(2);
  });

  it('範囲外の日は含まれない', () => {
    const tasks = [
      makeTask({ id: 't1', assignee: 'Alice', startDate: '2026-04-28', endDate: '2026-05-05', status: 'todo' }),
    ];
    const result = calcWorkloadMatrix(tasks, new Date('2026-05-01'), new Date('2026-05-03'));
    // 範囲は5/1〜5/3 のみ
    expect(result.days).toEqual(['2026-05-01', '2026-05-02', '2026-05-03']);
    expect(result.matrix[0]).toEqual([1, 1, 1]);
  });

  it('担当者名はソートされる', () => {
    const tasks = [
      makeTask({ id: 't1', assignee: 'Zara',  startDate: '2026-05-01', endDate: '2026-05-01', status: 'todo' }),
      makeTask({ id: 't2', assignee: 'Alice', startDate: '2026-05-01', endDate: '2026-05-01', status: 'todo' }),
    ];
    const result = calcWorkloadMatrix(tasks, new Date('2026-05-01'), new Date('2026-05-01'));
    expect(result.assignees[0]).toBe('Alice');
    expect(result.assignees[1]).toBe('Zara');
  });
});

describe('workloadColor', () => {
  it('count=0 は transparent', () => {
    expect(workloadColor(0)).toBe('transparent');
  });

  it('count=1 は green', () => {
    expect(workloadColor(1)).toContain('34,197,94');
  });

  it('count=2 は yellow', () => {
    expect(workloadColor(2)).toContain('234,179,8');
  });

  it('count=3 は orange', () => {
    expect(workloadColor(3)).toContain('249,115,22');
  });

  it('count=4 以上は red', () => {
    expect(workloadColor(4)).toContain('239,68,68');
    expect(workloadColor(100)).toContain('239,68,68');
  });
});
