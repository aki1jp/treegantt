import { describe, it, expect } from 'vitest';
import type { Task } from '../types/task.js';

// sort.ts はフロントエンド側なのでここでは同等ロジックをテスト
const STATUS_ORDER: Record<string, number> = { todo: 0, wip: 1, done: 2, wait: 3 };
const PRIORITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'test-id',
    projectId: 'proj-1',
    parentId: null,
    title: 'Test Task',
    summary: '',
    description: '',
    status: 'todo',
    priority: 'medium',
    progress: 0,
    assignee: '',
    startDate: null,
    endDate: null,
    predecessors: [],
    order: 0,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('Task status ordering', () => {
  it('has correct order values', () => {
    expect(STATUS_ORDER['todo']).toBe(0);
    expect(STATUS_ORDER['wip']).toBe(1);
    expect(STATUS_ORDER['done']).toBe(2);
    expect(STATUS_ORDER['wait']).toBe(3);
  });

  it('sorts tasks by status correctly', () => {
    const tasks = [
      makeTask({ id: '3', status: 'done' }),
      makeTask({ id: '1', status: 'todo' }),
      makeTask({ id: '2', status: 'wip' }),
    ];
    const sorted = [...tasks].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
    expect(sorted.map(t => t.status)).toEqual(['todo', 'wip', 'done']);
  });
});

describe('Task priority ordering', () => {
  it('has correct order values', () => {
    expect(PRIORITY_ORDER['critical']).toBe(0);
    expect(PRIORITY_ORDER['high']).toBe(1);
    expect(PRIORITY_ORDER['medium']).toBe(2);
    expect(PRIORITY_ORDER['low']).toBe(3);
  });

  it('sorts tasks by priority correctly', () => {
    const tasks = [
      makeTask({ id: '3', priority: 'low' }),
      makeTask({ id: '1', priority: 'critical' }),
      makeTask({ id: '2', priority: 'high' }),
    ];
    const sorted = [...tasks].sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
    expect(sorted.map(t => t.priority)).toEqual(['critical', 'high', 'low']);
  });
});

describe('Task date sorting', () => {
  it('puts null dates last', () => {
    const tasks = [
      makeTask({ id: '2', startDate: null }),
      makeTask({ id: '1', startDate: '2026-01-01' }),
      makeTask({ id: '3', startDate: '2026-02-01' }),
    ];
    const sorted = [...tasks].sort((a, b) => {
      const av = a.startDate, bv = b.startDate;
      if (!av && !bv) return 0;
      if (!av) return 1;
      if (!bv) return -1;
      return av < bv ? -1 : av > bv ? 1 : 0;
    });
    expect(sorted.map(t => t.startDate)).toEqual(['2026-01-01', '2026-02-01', null]);
  });
});

describe('makeTask helper', () => {
  it('creates a valid task with defaults', () => {
    const task = makeTask();
    expect(task.status).toBe('todo');
    expect(task.priority).toBe('medium');
    expect(task.progress).toBe(0);
    expect(task.predecessors).toEqual([]);
  });

  it('applies overrides', () => {
    const task = makeTask({ title: 'Custom', progress: 50, status: 'wip' });
    expect(task.title).toBe('Custom');
    expect(task.progress).toBe(50);
    expect(task.status).toBe('wip');
  });
});
