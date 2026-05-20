import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTestDb } from './helpers.js';
import type Database from 'better-sqlite3';

// インメモリDBをセットアップしてdbモジュールをモック
let testDb: Database.Database;

vi.mock('../db/client.js', () => ({
  get db() { return testDb; },
}));

const { createTask, getTask, listTasks, updateTask, deleteTask, reorderTasks } =
  await import('../services/taskService.js');

const PROJECT_ID = 'proj-test-1';

function seed() {
  testDb.prepare('INSERT INTO projects (id, name) VALUES (?, ?)').run(PROJECT_ID, 'Test Project');
}

describe('taskService', () => {
  beforeEach(() => {
    testDb = createTestDb();
    seed();
  });

  describe('createTask', () => {
    it('creates a task with required fields only', () => {
      const task = createTask({ id: 'task-1', projectId: PROJECT_ID, title: 'First Task' });
      expect(task.id).toBe('task-1');
      expect(task.title).toBe('First Task');
      expect(task.status).toBe('todo');
      expect(task.priority).toBe('medium');
      expect(task.progress).toBe(0);
      expect(task.predecessors).toEqual([]);
      expect(task.successors).toEqual([]);
    });

    it('creates a task with all fields', () => {
      const task = createTask({
        id: 'task-full',
        projectId: PROJECT_ID,
        title: 'Full Task',
        summary: 'Summary',
        description: 'Description',
        status: 'wip',
        priority: 'high',
        progress: 50,
        assignee: '田中',
        startDate: '2026-01-01',
        endDate: '2026-01-31',
        predecessors: [],
      });
      expect(task.summary).toBe('Summary');
      expect(task.status).toBe('wip');
      expect(task.priority).toBe('high');
      expect(task.progress).toBe(50);
      expect(task.assignee).toBe('田中');
      expect(task.startDate).toBe('2026-01-01');
      expect(task.endDate).toBe('2026-01-31');
    });

    it('assigns auto-incrementing order', () => {
      const t1 = createTask({ id: 't1', projectId: PROJECT_ID, title: 'T1' });
      const t2 = createTask({ id: 't2', projectId: PROJECT_ID, title: 'T2' });
      expect(t2.order).toBe(t1.order + 1);
    });

    it('creates predecessor dependencies', () => {
      createTask({ id: 'pred', projectId: PROJECT_ID, title: 'Predecessor' });
      const task = createTask({
        id: 'succ',
        projectId: PROJECT_ID,
        title: 'Successor',
        predecessors: ['pred'],
      });
      expect(task.predecessors).toContain('pred');

      const pred = getTask('pred');
      expect(pred?.successors).toContain('succ');
    });
  });

  describe('getTask', () => {
    it('returns null for non-existent task', () => {
      expect(getTask('no-such-id')).toBeNull();
    });

    it('returns task with successors attached', () => {
      createTask({ id: 'a', projectId: PROJECT_ID, title: 'A' });
      createTask({ id: 'b', projectId: PROJECT_ID, title: 'B', predecessors: ['a'] });
      const taskA = getTask('a');
      expect(taskA?.successors).toContain('b');
    });
  });

  describe('listTasks', () => {
    beforeEach(() => {
      createTask({ id: 't1', projectId: PROJECT_ID, title: 'T1', status: 'todo', priority: 'high', assignee: '山田' });
      createTask({ id: 't2', projectId: PROJECT_ID, title: 'T2', status: 'wip',  priority: 'low',  assignee: '田中' });
      createTask({ id: 't3', projectId: PROJECT_ID, title: 'T3', status: 'done', priority: 'medium', assignee: '山田' });
    });

    it('returns all tasks with correct total', () => {
      const { tasks, total } = listTasks(PROJECT_ID, {});
      expect(tasks).toHaveLength(3);
      expect(total).toBe(3);
    });

    it('filters by status', () => {
      const { tasks, total } = listTasks(PROJECT_ID, { status: 'wip' });
      expect(tasks).toHaveLength(1);
      expect(tasks[0].id).toBe('t2');
      expect(total).toBe(1);
    });

    it('filters by assignee (partial match)', () => {
      const { tasks } = listTasks(PROJECT_ID, { assignee: '山田' });
      expect(tasks).toHaveLength(2);
    });

    it('filters by priority', () => {
      const { tasks } = listTasks(PROJECT_ID, { priority: 'low' });
      expect(tasks).toHaveLength(1);
      expect(tasks[0].id).toBe('t2');
    });

    it('respects limit and offset', () => {
      const { tasks } = listTasks(PROJECT_ID, { limit: 2, offset: 1 });
      expect(tasks).toHaveLength(2);
    });

    it('returns empty array for unknown project', () => {
      const { tasks, total } = listTasks('unknown-proj', {});
      expect(tasks).toHaveLength(0);
      expect(total).toBe(0);
    });
  });

  describe('updateTask', () => {
    it('returns null for non-existent task', () => {
      expect(updateTask('no-id', { title: 'X' })).toBeNull();
    });

    it('updates individual fields', () => {
      createTask({ id: 'upd', projectId: PROJECT_ID, title: 'Original' });
      const updated = updateTask('upd', { title: 'Updated', progress: 75, status: 'wip' });
      expect(updated?.title).toBe('Updated');
      expect(updated?.progress).toBe(75);
      expect(updated?.status).toBe('wip');
    });

    it('replaces predecessors', () => {
      createTask({ id: 'p1', projectId: PROJECT_ID, title: 'P1' });
      createTask({ id: 'p2', projectId: PROJECT_ID, title: 'P2' });
      createTask({ id: 'child', projectId: PROJECT_ID, title: 'Child', predecessors: ['p1'] });

      const updated = updateTask('child', { predecessors: ['p2'] });
      expect(updated?.predecessors).toEqual(['p2']);
      expect(updated?.predecessors).not.toContain('p1');
    });
  });

  describe('deleteTask', () => {
    it('returns false for non-existent task', () => {
      expect(deleteTask('no-id')).toBe(false);
    });

    it('deletes a task and its deps', () => {
      createTask({ id: 'del', projectId: PROJECT_ID, title: 'To Delete' });
      expect(deleteTask('del')).toBe(true);
      expect(getTask('del')).toBeNull();
    });

    it('CASCADE removes deps when predecessor is deleted', () => {
      createTask({ id: 'pred', projectId: PROJECT_ID, title: 'Pred' });
      createTask({ id: 'succ', projectId: PROJECT_ID, title: 'Succ', predecessors: ['pred'] });

      deleteTask('pred');
      const succ = getTask('succ');
      expect(succ?.predecessors).toEqual([]);
    });
  });

  describe('reorderTasks', () => {
    it('updates ord values', () => {
      createTask({ id: 'r1', projectId: PROJECT_ID, title: 'R1' });
      createTask({ id: 'r2', projectId: PROJECT_ID, title: 'R2' });

      reorderTasks([
        { id: 'r1', order: 10 },
        { id: 'r2', order: 5 },
      ]);

      const r1 = getTask('r1');
      const r2 = getTask('r2');
      expect(r1?.order).toBe(10);
      expect(r2?.order).toBe(5);
    });
  });
});
