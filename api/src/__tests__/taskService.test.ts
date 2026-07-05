import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTestDb } from './helpers.js';
import type Database from 'better-sqlite3';

// インメモリDBをセットアップしてdbモジュールをモック
let testDb: Database.Database;

vi.mock('../db/client.js', () => ({
  get db() { return testDb; },
}));

const { createTask, getTask, listTasks, updateTask, deleteTaskSubtree, deleteTaskKeepChildren, reorderTasks } =
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

    it('estimateMinutes（予定工数）: 既定は null、作成時に保持される', () => {
      const def = createTask({ id: 'est-default', projectId: PROJECT_ID, title: 'no estimate' });
      expect(def.estimateMinutes).toBeNull();

      const task = createTask({ id: 'est-set', projectId: PROJECT_ID, title: 'with estimate', estimateMinutes: 465 });
      expect(task.estimateMinutes).toBe(465);
      expect(getTask('est-set')?.estimateMinutes).toBe(465);
    });

    it('estimateMinutes は更新で変更・null クリアできる', () => {
      createTask({ id: 'est-upd', projectId: PROJECT_ID, title: 'E', estimateMinutes: 60 });
      expect(updateTask('est-upd', { estimateMinutes: 120 })?.estimateMinutes).toBe(120);
      expect(updateTask('est-upd', { estimateMinutes: null })?.estimateMinutes).toBeNull();
    });

    it('assigns auto-incrementing order', () => {
      const t1 = createTask({ id: 't1', projectId: PROJECT_ID, title: 'T1' });
      const t2 = createTask({ id: 't2', projectId: PROJECT_ID, title: 'T2' });
      expect(t2.order).toBe(t1.order + 1);
    });

    it('creates a task with pending status', () => {
      const task = createTask({ id: 'task-pending', projectId: PROJECT_ID, title: 'Pending Task', status: 'pending' });
      expect(task.status).toBe('pending');
    });

    it('assigns auto-incrementing seq (immutable creation ID)', () => {
      const t1 = createTask({ id: 't1', projectId: PROJECT_ID, title: 'T1' });
      const t2 = createTask({ id: 't2', projectId: PROJECT_ID, title: 'T2' });
      expect(t1.seq).toBe(1);
      expect(t2.seq).toBe(2);
    });

    it('seq does not change after reorder', () => {
      const t1 = createTask({ id: 'r1', projectId: PROJECT_ID, title: 'R1' });
      const t2 = createTask({ id: 'r2', projectId: PROJECT_ID, title: 'R2' });
      const seqBefore1 = t1.seq;
      const seqBefore2 = t2.seq;

      reorderTasks([
        { id: 'r1', order: 99 },
        { id: 'r2', order: 1 },
      ]);

      expect(getTask('r1')?.seq).toBe(seqBefore1);
      expect(getTask('r2')?.seq).toBe(seqBefore2);
    });

    it('全タスク削除後の最初のタスクは #1 から始まる', () => {
      const t1 = createTask({ id: 'tmp1', projectId: PROJECT_ID, title: 'T1' });
      const t2 = createTask({ id: 'tmp2', projectId: PROJECT_ID, title: 'T2' });
      deleteTaskSubtree(t1.id);
      deleteTaskSubtree(t2.id);
      const fresh = createTask({ id: 'fresh', projectId: PROJECT_ID, title: 'Fresh' });
      expect(fresh.order).toBe(1);
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

    it('存在しない先行IDは無視して作成できる（FKエラーにしない）', () => {
      createTask({ id: 'v1', projectId: PROJECT_ID, title: 'V1' });
      const task = createTask({
        id: 'v2',
        projectId: PROJECT_ID,
        title: 'V2',
        predecessors: ['ghost-id', 'v1'],
      });
      expect(task.predecessors).toEqual(['v1']);
    });
  });

  describe('seq 永久欠番（削除済み番号を再利用しない）', () => {
    it('最大seqのタスクを削除しても次のタスクは新しい番号を取る', () => {
      createTask({ id: 's1', projectId: PROJECT_ID, title: 'S1' }); // seq 1
      createTask({ id: 's2', projectId: PROJECT_ID, title: 'S2' }); // seq 2
      const t3 = createTask({ id: 's3', projectId: PROJECT_ID, title: 'S3' }); // seq 3
      expect(t3.seq).toBe(3);

      deleteTaskSubtree('s3');
      const t4 = createTask({ id: 's4', projectId: PROJECT_ID, title: 'S4' });
      expect(t4.seq).toBe(4); // 3 は永久欠番
    });

    it('サブツリー削除後も番号を再利用しない', () => {
      createTask({ id: 'p', projectId: PROJECT_ID, title: 'Parent' });               // seq 1
      createTask({ id: 'c', projectId: PROJECT_ID, title: 'Child', parentId: 'p' }); // seq 2
      deleteTaskSubtree('p');

      const fresh = createTask({ id: 'fresh', projectId: PROJECT_ID, title: 'Fresh' });
      expect(fresh.seq).toBe(3); // 1, 2 は永久欠番
    });

    it('全削除→再作成を繰り返しても番号は単調増加する', () => {
      const a = createTask({ id: 'a', projectId: PROJECT_ID, title: 'A' });
      deleteTaskSubtree('a');
      const b = createTask({ id: 'b', projectId: PROJECT_ID, title: 'B' });
      deleteTaskSubtree('b');
      const c = createTask({ id: 'c', projectId: PROJECT_ID, title: 'C' });
      expect(a.seq).toBe(1);
      expect(b.seq).toBe(2);
      expect(c.seq).toBe(3);
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

    it('存在しない先行IDは無視して更新できる（削除済みタスクの幽霊参照でFKエラーにしない）', () => {
      createTask({ id: 'g1', projectId: PROJECT_ID, title: 'G1' });
      createTask({ id: 'g2', projectId: PROJECT_ID, title: 'G2' });
      createTask({ id: 'g3', projectId: PROJECT_ID, title: 'G3', predecessors: ['g1', 'g2'] });
      deleteTaskSubtree('g1');

      // フロントの楽観的更新が遅れて g1 を含む predecessors を送ってきた状況
      const updated = updateTask('g3', { predecessors: ['g1', 'g2'] });
      expect(updated?.predecessors).toEqual(['g2']);
    });

    it('updates titleColor and titleBgColor', () => {
      createTask({ id: 'color-task', projectId: PROJECT_ID, title: 'Color Task' });
      const t1 = updateTask('color-task', { titleColor: '#ef4444', titleBgColor: '#fef2f2' });
      expect(t1?.titleColor).toBe('#ef4444');
      expect(t1?.titleBgColor).toBe('#fef2f2');
      // null でリセット
      const t2 = updateTask('color-task', { titleColor: null, titleBgColor: null });
      expect(t2?.titleColor).toBeNull();
      expect(t2?.titleBgColor).toBeNull();
    });

    it('createTask sets titleColor/titleBgColor to null by default', () => {
      const task = createTask({ id: 'default-color', projectId: PROJECT_ID, title: 'Default' });
      expect(task.titleColor).toBeNull();
      expect(task.titleBgColor).toBeNull();
    });
  });

  describe('deleteTaskSubtree', () => {
    it('タスクと全子孫を再帰的に削除し削除IDを返す', () => {
      createTask({ id: 'p', projectId: PROJECT_ID, title: '親' });
      createTask({ id: 'c', projectId: PROJECT_ID, title: '子', parentId: 'p' });
      createTask({ id: 'g', projectId: PROJECT_ID, title: '孫', parentId: 'c' });
      createTask({ id: 'other', projectId: PROJECT_ID, title: '無関係' });

      const deleted = deleteTaskSubtree('p');
      expect(new Set(deleted)).toEqual(new Set(['p', 'c', 'g']));
      expect(getTask('p')).toBeNull();
      expect(getTask('c')).toBeNull();
      expect(getTask('g')).toBeNull();
      expect(getTask('other')).not.toBeNull();
    });

    it('子を持たないタスクは本体のみ削除する', () => {
      createTask({ id: 'solo', projectId: PROJECT_ID, title: '単独' });
      expect(deleteTaskSubtree('solo')).toEqual(['solo']);
      expect(getTask('solo')).toBeNull();
    });

    it('存在しないタスクは空配列を返す', () => {
      expect(deleteTaskSubtree('no-id')).toEqual([]);
    });
  });

  describe('deleteTaskKeepChildren', () => {
    it('直下の子を祖父母に付け替えて本体のみ削除する', () => {
      createTask({ id: 'gp', projectId: PROJECT_ID, title: '祖父母' });
      createTask({ id: 'p', projectId: PROJECT_ID, title: '親', parentId: 'gp' });
      createTask({ id: 'c1', projectId: PROJECT_ID, title: '子1', parentId: 'p' });
      createTask({ id: 'c2', projectId: PROJECT_ID, title: '子2', parentId: 'p' });

      const reparented = deleteTaskKeepChildren('p');
      expect(getTask('p')).toBeNull();
      expect(getTask('c1')?.parentId).toBe('gp');
      expect(getTask('c2')?.parentId).toBe('gp');
      // 付け替え情報（ブロードキャスト用）に id / order / parentId を含む
      expect(reparented).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 'c1', parentId: 'gp', order: expect.any(Number) }),
        expect.objectContaining({ id: 'c2', parentId: 'gp', order: expect.any(Number) }),
      ]));
    });

    it('ルートタスク削除時は子がルート（parentId=null）になる', () => {
      createTask({ id: 'root', projectId: PROJECT_ID, title: 'ルート' });
      createTask({ id: 'c', projectId: PROJECT_ID, title: '子', parentId: 'root' });

      const reparented = deleteTaskKeepChildren('root');
      expect(getTask('root')).toBeNull();
      expect(getTask('c')?.parentId).toBeNull();
      expect(reparented).toEqual([expect.objectContaining({ id: 'c', parentId: null })]);
    });

    it('孫タスクの親は変更されない', () => {
      createTask({ id: 'p', projectId: PROJECT_ID, title: '親' });
      createTask({ id: 'c', projectId: PROJECT_ID, title: '子', parentId: 'p' });
      createTask({ id: 'g', projectId: PROJECT_ID, title: '孫', parentId: 'c' });

      deleteTaskKeepChildren('p');
      expect(getTask('c')?.parentId).toBeNull();
      expect(getTask('g')?.parentId).toBe('c');
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

    it('parentId を指定すると parent_id が更新される', () => {
      createTask({ id: 'rp', projectId: PROJECT_ID, title: '親' });
      createTask({ id: 'rc', projectId: PROJECT_ID, title: '子候補' });

      reorderTasks([{ id: 'rc', order: 2, parentId: 'rp' }]);

      expect(getTask('rc')?.parentId).toBe('rp');
    });

    it('parentId を null にすると parent_id がクリアされる', () => {
      createTask({ id: 'rparent2', projectId: PROJECT_ID, title: '親2' });
      createTask({ id: 'rchild2', projectId: PROJECT_ID, title: '子2', parentId: 'rparent2' });

      reorderTasks([{ id: 'rchild2', order: 1, parentId: null }]);

      expect(getTask('rchild2')?.parentId).toBeNull();
    });

    it('parentId を省略すると parent_id は変わらない', () => {
      createTask({ id: 'rparent3', projectId: PROJECT_ID, title: '親3' });
      createTask({ id: 'rchild3', projectId: PROJECT_ID, title: '子3', parentId: 'rparent3' });

      reorderTasks([{ id: 'rchild3', order: 5 }]);

      expect(getTask('rchild3')?.parentId).toBe('rparent3');
    });

    it('reorderTasks: 移動元旧親の日付は変わらない', () => {
      createTask({ id: 'reorder_old_parent', projectId: PROJECT_ID, title: '旧親',
        startDate: '2026-05-01', endDate: '2026-05-31' });
      createTask({ id: 'reorder_new_parent', projectId: PROJECT_ID, title: '新親',
        startDate: '2026-09-01', endDate: '2026-09-30' });
      createTask({ id: 'reorder_moving_child', projectId: PROJECT_ID, title: '移動する子',
        parentId: 'reorder_old_parent', startDate: '2026-07-01', endDate: '2026-07-31' });

      reorderTasks([{ id: 'reorder_moving_child', order: 1, parentId: 'reorder_new_parent' }]);

      const oldParent = getTask('reorder_old_parent');
      expect(oldParent?.startDate).toBe('2026-05-01');
      expect(oldParent?.endDate).toBe('2026-05-31');
    });

    it('reorderTasks: 移動先新親の日付は変わらない', () => {
      createTask({ id: 'reorder_np2', projectId: PROJECT_ID, title: '新親2',
        startDate: '2026-09-01', endDate: '2026-09-30' });
      createTask({ id: 'reorder_mc2', projectId: PROJECT_ID, title: '移動する子2',
        startDate: '2026-07-01', endDate: '2026-07-31' });

      reorderTasks([{ id: 'reorder_mc2', order: 1, parentId: 'reorder_np2' }]);

      const newParent = getTask('reorder_np2');
      expect(newParent?.startDate).toBe('2026-09-01');
      expect(newParent?.endDate).toBe('2026-09-30');
    });
  });

  describe('親タスク日付は変更されない', () => {
    it('子の日付 updateTask 後も親の日付は変わらない', () => {
      createTask({ id: 'nd_parent', projectId: PROJECT_ID, title: '親',
        startDate: '2026-05-01', endDate: '2026-05-31' });
      createTask({ id: 'nd_child', projectId: PROJECT_ID, title: '子', parentId: 'nd_parent' });

      updateTask('nd_child', { startDate: '2026-06-01', endDate: '2026-06-30' });

      const parent = getTask('nd_parent');
      expect(parent?.startDate).toBe('2026-05-01');
      expect(parent?.endDate).toBe('2026-05-31');
    });

    it('createTask で子を作成しても親の日付は変わらない', () => {
      createTask({ id: 'nd_parent2', projectId: PROJECT_ID, title: '親2',
        startDate: '2026-05-01', endDate: '2026-05-31' });
      createTask({ id: 'nd_child2', projectId: PROJECT_ID, title: '子2',
        parentId: 'nd_parent2', startDate: '2026-07-01', endDate: '2026-07-31' });

      const parent = getTask('nd_parent2');
      expect(parent?.startDate).toBe('2026-05-01');
      expect(parent?.endDate).toBe('2026-05-31');
    });

    it('祖父タスクの日付も変わらない', () => {
      createTask({ id: 'nd_gp', projectId: PROJECT_ID, title: '祖父',
        startDate: '2026-05-01', endDate: '2026-05-31' });
      createTask({ id: 'nd_p',  projectId: PROJECT_ID, title: '親', parentId: 'nd_gp' });
      createTask({ id: 'nd_c',  projectId: PROJECT_ID, title: '子', parentId: 'nd_p' });

      updateTask('nd_c', { startDate: '2026-08-01', endDate: '2026-08-31' });

      const gp = getTask('nd_gp');
      expect(gp?.startDate).toBe('2026-05-01');
      expect(gp?.endDate).toBe('2026-05-31');
    });

    it('子タスクに日付がない更新では親の日付は変わらない', () => {
      createTask({ id: 'nd_parent3', projectId: PROJECT_ID, title: '親3',
        startDate: '2026-06-01', endDate: '2026-06-30' });
      createTask({ id: 'nd_child3', projectId: PROJECT_ID, title: '子3', parentId: 'nd_parent3' });

      updateTask('nd_child3', { title: '子3（更新）' });

      const parent = getTask('nd_parent3');
      expect(parent?.startDate).toBe('2026-06-01');
      expect(parent?.endDate).toBe('2026-06-30');
    });
  });
});
