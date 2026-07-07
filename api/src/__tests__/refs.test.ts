import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTestDb } from './helpers.js';
import type Database from 'better-sqlite3';

let testDb: Database.Database;

vi.mock('../db/client.js', () => ({
  get db() { return testDb; },
}));
vi.mock('../ws/wsRoom.js', () => ({
  notifyRoom: vi.fn(),
  wss: { on: vi.fn() },
}));

const { buildApp } = await import('../app.js');

type App = Awaited<ReturnType<typeof buildApp>>;

async function mkProject(app: App, name = 'P', color: string | null = null) {
  const res = await app.inject({ method: 'POST', url: '/api/v1/projects', payload: { name, color } });
  return res.json().project as { id: string; name: string; color: string | null };
}

async function mkTask(app: App, projectId: string, body: Record<string, unknown> = {}) {
  const res = await app.inject({
    method: 'POST', url: `/api/v1/projects/${projectId}/tasks`,
    payload: { title: 'Task', ...body },
  });
  return res.json().task as { id: string; parentId: string | null; predecessors: string[] };
}

function addRef(app: App, projectId: string, refTaskId: string) {
  return app.inject({ method: 'POST', url: `/api/v1/projects/${projectId}/refs`, payload: { refTaskId } });
}

describe('クロスプロジェクト参照 API (task_refs)', () => {
  let app: App;

  beforeEach(async () => {
    testDb = createTestDb();
    app = await buildApp();
    await app.ready();
  });
  afterEach(async () => {
    await app.close();
    testDb.close();
  });

  describe('POST /projects/:id/refs', () => {
    it('参照を新規追加すると 201 を返す', async () => {
      const pa = await mkProject(app, 'A');
      const pb = await mkProject(app, 'B');
      const taskB = await mkTask(app, pb.id, { title: 'B-task' });

      const res = await addRef(app, pa.id, taskB.id);
      expect(res.statusCode).toBe(201);
      expect(res.json().ref).toMatchObject({ projectId: pa.id, refTaskId: taskB.id });
    });

    it('同じ参照を再度追加すると冪等に 200 を返し、行は増えない', async () => {
      const pa = await mkProject(app, 'A');
      const pb = await mkProject(app, 'B');
      const taskB = await mkTask(app, pb.id, { title: 'B-task' });

      await addRef(app, pa.id, taskB.id);
      const res2 = await addRef(app, pa.id, taskB.id);
      expect(res2.statusCode).toBe(200);

      const list = await app.inject({ method: 'GET', url: `/api/v1/projects/${pa.id}/refs` });
      expect(list.json().refs).toHaveLength(1);
    });

    it('自プロジェクトのタスクを参照しようとすると 400 SELF_REF', async () => {
      const pa = await mkProject(app, 'A');
      const taskA = await mkTask(app, pa.id, { title: 'A-task' });

      const res = await addRef(app, pa.id, taskA.id);
      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe('SELF_REF');
    });

    it('存在しないタスクを参照しようとすると 400 INVALID_REF_TASK', async () => {
      const pa = await mkProject(app, 'A');
      const res = await addRef(app, pa.id, 'ghost-task-id');
      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe('INVALID_REF_TASK');
    });

    it('存在しないプロジェクトへの追加は 404 NOT_FOUND', async () => {
      const pb = await mkProject(app, 'B');
      const taskB = await mkTask(app, pb.id, { title: 'B-task' });
      const res = await addRef(app, 'ghost-project-id', taskB.id);
      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBe('NOT_FOUND');
    });
  });

  describe('GET /projects/:id/refs', () => {
    it('refs 配列とハイドレートされた tasks・参照先プロジェクト情報を返す', async () => {
      const pa = await mkProject(app, 'A');
      const pb = await mkProject(app, 'B', '#00ff00');
      const taskB = await mkTask(app, pb.id, { title: 'B-task' });
      await addRef(app, pa.id, taskB.id);

      const res = await app.inject({ method: 'GET', url: `/api/v1/projects/${pa.id}/refs` });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.refs).toHaveLength(1);
      expect(body.refs[0]).toMatchObject({ projectId: pa.id, refTaskId: taskB.id });
      expect(body.tasks.map((t: { id: string }) => t.id)).toContain(taskB.id);
      expect(body.projects).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: pb.id, name: 'B', color: '#00ff00' })])
      );
    });

    it('親タスクを参照するとサブツリー全量（子孫）が同梱される', async () => {
      const pa = await mkProject(app, 'A');
      const pb = await mkProject(app, 'B');
      const parent = await mkTask(app, pb.id, { title: 'Parent' });
      const child  = await mkTask(app, pb.id, { title: 'Child', parentId: parent.id });
      const grand  = await mkTask(app, pb.id, { title: 'Grand', parentId: child.id });

      await addRef(app, pa.id, parent.id);

      const res = await app.inject({ method: 'GET', url: `/api/v1/projects/${pa.id}/refs` });
      const ids = res.json().tasks.map((t: { id: string }) => t.id);
      expect(ids).toEqual(expect.arrayContaining([parent.id, child.id, grand.id]));
      expect(ids).toHaveLength(3);
    });

    it('親と子を両方参照しても tasks に重複が出ない', async () => {
      const pa = await mkProject(app, 'A');
      const pb = await mkProject(app, 'B');
      const parent = await mkTask(app, pb.id, { title: 'Parent' });
      const child  = await mkTask(app, pb.id, { title: 'Child', parentId: parent.id });

      await addRef(app, pa.id, parent.id);
      await addRef(app, pa.id, child.id);

      const res = await app.inject({ method: 'GET', url: `/api/v1/projects/${pa.id}/refs` });
      const ids = res.json().tasks.map((t: { id: string }) => t.id) as string[];
      expect(ids).toHaveLength(2);
      expect(new Set(ids).size).toBe(2);
    });

    it('predecessors/successors が付与される', async () => {
      const pa = await mkProject(app, 'A');
      const pb = await mkProject(app, 'B');
      const x = await mkTask(app, pb.id, { title: 'X' });
      const y = await mkTask(app, pb.id, { title: 'Y', predecessors: [x.id] });

      await addRef(app, pa.id, y.id);

      const res = await app.inject({ method: 'GET', url: `/api/v1/projects/${pa.id}/refs` });
      const yHydrated = res.json().tasks.find((t: { id: string }) => t.id === y.id);
      expect(yHydrated.predecessors).toContain(x.id);
    });

    it('存在しないプロジェクトは 404', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/projects/ghost-project-id/refs' });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('DELETE /projects/:id/refs/:refTaskId', () => {
    it('参照を解除すると 204', async () => {
      const pa = await mkProject(app, 'A');
      const pb = await mkProject(app, 'B');
      const taskB = await mkTask(app, pb.id, { title: 'B-task' });
      await addRef(app, pa.id, taskB.id);

      const res = await app.inject({ method: 'DELETE', url: `/api/v1/projects/${pa.id}/refs/${taskB.id}` });
      expect(res.statusCode).toBe(204);

      const list = await app.inject({ method: 'GET', url: `/api/v1/projects/${pa.id}/refs` });
      expect(list.json().refs).toHaveLength(0);
    });

    it('存在しない参照の解除は 404', async () => {
      const pa = await mkProject(app, 'A');
      const res = await app.inject({ method: 'DELETE', url: `/api/v1/projects/${pa.id}/refs/ghost-task` });
      expect(res.statusCode).toBe(404);
    });

    it('参照解除しても跨ぎ依存（task_deps）は残る（再参照で矢印復活）', async () => {
      const pa = await mkProject(app, 'A');
      const pb = await mkProject(app, 'B');
      const taskA = await mkTask(app, pa.id, { title: 'A-task' });
      const taskB = await mkTask(app, pb.id, { title: 'B-task' });
      await addRef(app, pa.id, taskB.id);

      // A-task の先行として、参照した B-task を設定（クロスプロジェクト依存）
      const patchRes = await app.inject({
        method: 'PATCH', url: `/api/v1/tasks/${taskA.id}`,
        payload: { predecessors: [taskB.id] },
      });
      expect(patchRes.statusCode).toBe(200);

      // 参照を解除
      await app.inject({ method: 'DELETE', url: `/api/v1/projects/${pa.id}/refs/${taskB.id}` });

      // task_deps 側の依存は消えていない
      const after = await app.inject({ method: 'GET', url: `/api/v1/tasks/${taskA.id}` });
      expect(after.json().task.predecessors).toContain(taskB.id);

      // 再参照すると参照は復活する
      const readd = await addRef(app, pa.id, taskB.id);
      expect(readd.statusCode).toBe(201);
    });
  });

  describe('CASCADE 削除', () => {
    it('参照先タスクを削除すると参照行も消える', async () => {
      const pa = await mkProject(app, 'A');
      const pb = await mkProject(app, 'B');
      const taskB = await mkTask(app, pb.id, { title: 'B-task' });
      await addRef(app, pa.id, taskB.id);

      const del = await app.inject({ method: 'DELETE', url: `/api/v1/tasks/${taskB.id}` });
      expect(del.statusCode).toBe(204);

      const list = await app.inject({ method: 'GET', url: `/api/v1/projects/${pa.id}/refs` });
      expect(list.json().refs).toHaveLength(0);
    });

    it('参照先プロジェクトを削除すると参照行も消える', async () => {
      const pa = await mkProject(app, 'A');
      const pb = await mkProject(app, 'B');
      const taskB = await mkTask(app, pb.id, { title: 'B-task' });
      await addRef(app, pa.id, taskB.id);

      const del = await app.inject({ method: 'DELETE', url: `/api/v1/projects/${pb.id}` });
      expect(del.statusCode).toBe(204);

      const list = await app.inject({ method: 'GET', url: `/api/v1/projects/${pa.id}/refs` });
      expect(list.json().refs).toHaveLength(0);
    });
  });
});
