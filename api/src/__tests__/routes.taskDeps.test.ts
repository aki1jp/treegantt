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
describe('Tasks API — 依存循環検証（task_deps 全域・DEP_CYCLE_DETECTED）', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let pid: string;

  beforeEach(async () => {
    testDb = createTestDb();
    app = await buildApp();
    pid = (await createProject(app, { name: 'P' })).id;
  });
  afterEach(async () => { await app.close(); testDb.close(); });

  const mkTask = (projectId: string, body: Record<string, unknown> = {}) =>
    createTaskIn(app, projectId, { title: 'T', ...body });

  it('同一プロジェクト内の依存循環（A→B→A）は更新時に 400 DEP_CYCLE_DETECTED', async () => {
    const a = await mkTask(pid, { title: 'A' });
    const b = await mkTask(pid, { title: 'B', predecessors: [a.id] });

    const res = await app.inject({
      method: 'PATCH', url: `/api/v1/tasks/${a.id}`,
      payload: { predecessors: [b.id] },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('DEP_CYCLE_DETECTED');

    // 循環が拒否された場合、A の predecessors は変更されていないこと
    const after = await app.inject({ method: 'GET', url: `/api/v1/tasks/${a.id}` });
    expect(after.json().task.predecessors).toEqual([]);
  });

  it('3プロジェクト跨ぎの循環（A(P1)→B(P2)→C(P3)→A）は 400 DEP_CYCLE_DETECTED', async () => {
    const p1 = pid;
    const p2 = (await createProject(app, { name: 'P2' })).id;
    const p3 = (await createProject(app, { name: 'P3' })).id;

    const a = await mkTask(p1, { title: 'A' });
    const b = await mkTask(p2, { title: 'B', predecessors: [a.id] });
    const c = await mkTask(p3, { title: 'C', predecessors: [b.id] });

    // A の先行に C を指定 → A→B→C→A の3プロジェクト跨ぎ循環
    const res = await app.inject({
      method: 'PATCH', url: `/api/v1/tasks/${a.id}`,
      payload: { predecessors: [c.id] },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('DEP_CYCLE_DETECTED');
  });

  it('predecessors を全置換しても、既存エッジ由来の偽陽性は出ない（A→B のまま更新して 200）', async () => {
    const a = await mkTask(pid, { title: 'A' });
    const b = await mkTask(pid, { title: 'B', predecessors: [a.id] });

    const res = await app.inject({
      method: 'PATCH', url: `/api/v1/tasks/${b.id}`,
      payload: { predecessors: [a.id] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().task.predecessors).toEqual([a.id]);
  });

  it('自己依存（predecessors に自分自身の id）は 400 DEP_CYCLE_DETECTED', async () => {
    const a = await mkTask(pid, { title: 'A' });

    const res = await app.inject({
      method: 'PATCH', url: `/api/v1/tasks/${a.id}`,
      payload: { predecessors: [a.id] },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('DEP_CYCLE_DETECTED');
  });

  it('循環のない正当なクロスプロジェクト依存は 200 で作成できる', async () => {
    const p2 = (await createProject(app, { name: 'P2' })).id;
    const a = await mkTask(pid, { title: 'A' });

    const res = await app.inject({
      method: 'POST', url: `/api/v1/projects/${p2}/tasks`,
      payload: { title: 'B', predecessors: [a.id] },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().task.predecessors).toEqual([a.id]);
  });
});
