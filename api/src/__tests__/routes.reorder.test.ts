import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTestDb, buildTestApp, createProject, createTask as createTaskIn } from './helpers.js';
import type Database from 'better-sqlite3';

let testDb: Database.Database;

vi.mock('../db/client.js', () => ({
  get db() { return testDb; },
}));

// WebSocket room 通知はテストでは不要なのでスタブ化
vi.mock('../ws/wsRoom.js', () => ({
  notifyRoom: vi.fn(),
  wss: { on: vi.fn() },
}));


const buildApp = () => buildTestApp({
  cors: true, jsonParser: true, auth: true, health: true, projects: true, tasks: true, importExport: true,
});
describe('Tasks API — reorder のバリデーション', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let projectId: string;
  let otherProjectId: string;

  beforeEach(async () => {
    testDb = createTestDb();
    app = await buildApp();
    projectId = (await createProject(app, { name: 'P1' })).id;
    otherProjectId = (await createProject(app, { name: 'P2' })).id;
  });
  afterEach(async () => { await app.close(); testDb.close(); });

  const createTask = (pid: string, overrides = {}) =>
    createTaskIn(app, pid, { title: 'Test Task', ...overrides });

  it('reorder: 自分自身を parentId に指定すると 400（循環）', async () => {
    const task = await createTask(projectId, { title: 'T' });
    const res = await app.inject({
      method: 'PATCH', url: `/api/v1/projects/${projectId}/tasks/reorder`,
      payload: { orders: [{ id: task.id, order: 1, parentId: task.id }] },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('CYCLE_DETECTED');
  });

  it('reorder: 子を親の parentId に指定すると 400（循環）', async () => {
    const parent = await createTask(projectId, { title: '親' });
    const child  = await createTask(projectId, { title: '子', parentId: parent.id });
    const res = await app.inject({
      method: 'PATCH', url: `/api/v1/projects/${projectId}/tasks/reorder`,
      payload: { orders: [{ id: parent.id, order: 1, parentId: child.id }] },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('CYCLE_DETECTED');

    // 循環が拒否された場合、親の parentId は変更されていないこと
    const parentAfter = (await app.inject({ method: 'GET', url: `/api/v1/tasks/${parent.id}` })).json().task;
    expect(parentAfter.parentId).toBeNull();
  });

  it('reorder: 2件スワップ（A→B, B→A を同時指定）で循環が完成する場合 400', async () => {
    // A・B とも現在ルート。個別には循環しないが、一括適用後に A↔B の循環が完成する
    const a = await createTask(projectId, { title: 'A' });
    const b = await createTask(projectId, { title: 'B' });
    const res = await app.inject({
      method: 'PATCH', url: `/api/v1/projects/${projectId}/tasks/reorder`,
      payload: { orders: [
        { id: a.id, order: 1, parentId: b.id },
        { id: b.id, order: 2, parentId: a.id },
      ]},
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('CYCLE_DETECTED');

    // 一切適用されていないこと
    const aAfter = (await app.inject({ method: 'GET', url: `/api/v1/tasks/${a.id}` })).json().task;
    const bAfter = (await app.inject({ method: 'GET', url: `/api/v1/tasks/${b.id}` })).json().task;
    expect(aAfter.parentId).toBeNull();
    expect(bAfter.parentId).toBeNull();
  });

  it('reorder: 3件リング（A→B→C→A）でも 400', async () => {
    const a = await createTask(projectId, { title: 'A' });
    const b = await createTask(projectId, { title: 'B' });
    const c = await createTask(projectId, { title: 'C' });
    const res = await app.inject({
      method: 'PATCH', url: `/api/v1/projects/${projectId}/tasks/reorder`,
      payload: { orders: [
        { id: a.id, order: 1, parentId: b.id },
        { id: b.id, order: 2, parentId: c.id },
        { id: c.id, order: 3, parentId: a.id },
      ]},
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('CYCLE_DETECTED');
  });

  it('reorder: 別の親への正当な付け替えを含む一括指定は 200（オーバーレイ検証の正常系）', async () => {
    // 親P1配下の子C1と親P2配下の子C2を同時に入れ替える（循環なし）
    const p1 = await createTask(projectId, { title: 'P1' });
    const p2 = await createTask(projectId, { title: 'P2' });
    const c1 = await createTask(projectId, { title: 'C1', parentId: p1.id });
    const c2 = await createTask(projectId, { title: 'C2', parentId: p2.id });
    const res = await app.inject({
      method: 'PATCH', url: `/api/v1/projects/${projectId}/tasks/reorder`,
      payload: { orders: [
        { id: c1.id, order: 1, parentId: p2.id },
        { id: c2.id, order: 2, parentId: p1.id },
      ]},
    });
    expect(res.statusCode).toBe(200);
    const c1After = (await app.inject({ method: 'GET', url: `/api/v1/tasks/${c1.id}` })).json().task;
    const c2After = (await app.inject({ method: 'GET', url: `/api/v1/tasks/${c2.id}` })).json().task;
    expect(c1After.parentId).toBe(p2.id);
    expect(c2After.parentId).toBe(p1.id);
  });

  it('reorder: 循環が無ければ 200（正常系の回帰確認）', async () => {
    const parent = await createTask(projectId, { title: '親' });
    const child  = await createTask(projectId, { title: '子' });
    const res = await app.inject({
      method: 'PATCH', url: `/api/v1/projects/${projectId}/tasks/reorder`,
      payload: { orders: [{ id: child.id, order: 1, parentId: parent.id }] },
    });
    expect(res.statusCode).toBe(200);
  });

  it('reorder: 別プロジェクトのタスクIDを含むと 400（プロジェクト境界）', async () => {
    const myTask    = await createTask(projectId, { title: '自分' });
    const otherTask = await createTask(otherProjectId, { title: '他P' });

    const res = await app.inject({
      method: 'PATCH', url: `/api/v1/projects/${projectId}/tasks/reorder`,
      payload: { orders: [{ id: myTask.id, order: 1 }, { id: otherTask.id, order: 2 }] },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('INVALID_PROJECT');

    // 拒否された場合、他プロジェクトのタスクの order は変更されていないこと
    const otherAfter = (await app.inject({ method: 'GET', url: `/api/v1/tasks/${otherTask.id}` })).json().task;
    expect(otherAfter.order).not.toBe(2);
  });

  it('reorder: 存在しないタスクIDを含むと 400', async () => {
    const res = await app.inject({
      method: 'PATCH', url: `/api/v1/projects/${projectId}/tasks/reorder`,
      payload: { orders: [{ id: 'non-existent-uuid', order: 1 }] },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('INVALID_PROJECT');
  });
});
