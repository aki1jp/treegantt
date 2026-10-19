import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTestDb, buildTestApp } from './helpers.js';
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
describe('Projects API', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    testDb = createTestDb();
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
    testDb.close();
  });

  it('GET /api/v1/projects returns empty list initially', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/projects' });
    expect(res.statusCode).toBe(200);
    expect(res.json().projects).toEqual([]);
  });

  it('POST /api/v1/projects creates a project', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/projects',
      payload: { name: 'My Project' },
    });
    expect(res.statusCode).toBe(201);
    const { project } = res.json();
    expect(project.name).toBe('My Project');
    expect(project.id).toBeTruthy();
  });

  it('POST /api/v1/projects rejects missing name', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/projects',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('DELETE /api/v1/projects/:id removes project', async () => {
    const createRes = await app.inject({
      method: 'POST', url: '/api/v1/projects',
      payload: { name: 'To Delete' },
    });
    const { project } = createRes.json();

    const delRes = await app.inject({ method: 'DELETE', url: `/api/v1/projects/${project.id}` });
    expect(delRes.statusCode).toBe(204);

    const listRes = await app.inject({ method: 'GET', url: '/api/v1/projects' });
    expect(listRes.json().projects).toHaveLength(0);
  });

  it('DELETE /api/v1/projects/:id returns 404 for unknown id', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/projects/no-such-id' });
    expect(res.statusCode).toBe(404);
  });

  // ブラウザの fetch は content-type を付けつつボディ空で DELETE する。
  // 空ボディ+application/json を Fastify が FST_ERR_CTP_EMPTY_JSON_BODY(400) で
  // 弾く回帰を防ぐ（通常の inject は content-type を付けないため検出できなかった）。
  it('DELETE /api/v1/projects/:id は content-type:application/json（ボディ空）でも 204', async () => {
    const createRes = await app.inject({
      method: 'POST', url: '/api/v1/projects', payload: { name: 'CT Delete' },
    });
    const { project } = createRes.json();
    const res = await app.inject({
      method: 'DELETE', url: `/api/v1/projects/${project.id}`,
      headers: { 'content-type': 'application/json' },
    });
    expect(res.statusCode).toBe(204);
  });

  it('PATCH /api/v1/projects/:id renames a project', async () => {
    const createRes = await app.inject({
      method: 'POST', url: '/api/v1/projects',
      payload: { name: 'Old Name' },
    });
    const { project } = createRes.json();

    const patchRes = await app.inject({
      method: 'PATCH', url: `/api/v1/projects/${project.id}`,
      payload: { name: 'New Name' },
    });
    expect(patchRes.statusCode).toBe(200);
    expect(patchRes.json().project.name).toBe('New Name');
    expect(patchRes.json().project.id).toBe(project.id);
  });

  it('PATCH /api/v1/projects/:id でリソース設定の上書きを保存できる', async () => {
    const createRes = await app.inject({
      method: 'POST', url: '/api/v1/projects', payload: { name: 'Res' },
    });
    const { project } = createRes.json();

    const patchRes = await app.inject({
      method: 'PATCH', url: `/api/v1/projects/${project.id}`,
      payload: { capacityMinutesPerDay: 465, workingDays: [1, 2, 3, 4] },
    });
    expect(patchRes.statusCode).toBe(200);
    expect(patchRes.json().project.capacityMinutesPerDay).toBe(465);
    expect(patchRes.json().project.workingDays).toEqual([1, 2, 3, 4]);
  });

  it('PATCH /api/v1/projects/:id returns 404 for unknown id', async () => {
    const res = await app.inject({
      method: 'PATCH', url: '/api/v1/projects/no-such-id',
      payload: { name: 'X' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('PATCH /api/v1/projects/:id rejects empty name', async () => {
    const createRes = await app.inject({
      method: 'POST', url: '/api/v1/projects',
      payload: { name: 'Alpha' },
    });
    const { project } = createRes.json();
    const res = await app.inject({
      method: 'PATCH', url: `/api/v1/projects/${project.id}`,
      payload: { name: '' },
    });
    expect(res.statusCode).toBe(400);
  });

  // ── プロジェクトカラー (Plan C) ──────────────────────────
  it('POST /api/v1/projects で color を指定して作成できる', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/projects',
      payload: { name: 'カラープロジェクト', color: '#ef4444' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().project.color).toBe('#ef4444');
  });

  it('GET /api/v1/projects は color フィールドを返す（null or string）', async () => {
    await app.inject({ method: 'POST', url: '/api/v1/projects', payload: { name: 'NoColor' } });
    const res = await app.inject({ method: 'GET', url: '/api/v1/projects' });
    expect(res.statusCode).toBe(200);
    const p = res.json().projects[0];
    expect('color' in p).toBe(true);
  });

  it('PATCH /api/v1/projects/:id で color を更新できる', async () => {
    const createRes = await app.inject({
      method: 'POST', url: '/api/v1/projects',
      payload: { name: 'PatchColor' },
    });
    const { project } = createRes.json();

    const patchRes = await app.inject({
      method: 'PATCH', url: `/api/v1/projects/${project.id}`,
      payload: { color: '#3b82f6' },
    });
    expect(patchRes.statusCode).toBe(200);
    expect(patchRes.json().project.color).toBe('#3b82f6');
  });

  it('PATCH /api/v1/projects/:id で color を null にリセットできる', async () => {
    const createRes = await app.inject({
      method: 'POST', url: '/api/v1/projects',
      payload: { name: 'ColorReset', color: '#22c55e' },
    });
    const { project } = createRes.json();

    const patchRes = await app.inject({
      method: 'PATCH', url: `/api/v1/projects/${project.id}`,
      payload: { color: null },
    });
    expect(patchRes.statusCode).toBe(200);
    expect(patchRes.json().project.color).toBeNull();
  });
});
