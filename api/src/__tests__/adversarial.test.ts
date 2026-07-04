import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTestDb } from './helpers.js';
import type Database from 'better-sqlite3';
import Fastify from 'fastify';
import cors from '@fastify/cors';

let testDb: Database.Database;

vi.mock('../db/client.js', () => ({
  get db() { return testDb; },
}));

vi.mock('../ws/wsRoom.js', () => ({
  notifyRoom: vi.fn(),
  wss: { on: vi.fn() },
}));

const { healthRoutes }       = await import('../routes/health.js');
const { projectRoutes }      = await import('../routes/projects.js');
const { taskRoutes }         = await import('../routes/tasks.js');
const { importExportRoutes } = await import('../routes/importExport.js');
const { authPlugin }         = await import('../plugins/auth.js');

async function buildApp() {
  const app = Fastify();
  await app.register(cors);
  await app.register(authPlugin);
  await app.register(healthRoutes);
  await app.register(projectRoutes,    { prefix: '/api/v1' });
  await app.register(taskRoutes,       { prefix: '/api/v1' });
  await app.register(importExportRoutes, { prefix: '/api/v1' });
  await app.ready();
  return app;
}

type App = Awaited<ReturnType<typeof buildApp>>;

async function mkProject(app: App, name = 'P') {
  const res = await app.inject({
    method: 'POST', url: '/api/v1/projects',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  return res.json().project.id as string;
}

async function mkTask(app: App, projectId: string, body: Record<string, unknown>) {
  return app.inject({
    method: 'POST',
    url: `/api/v1/projects/${projectId}/tasks`,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('API 悪意テスト — 入力バリデーション', () => {
  let app: App;
  let pid: string;

  beforeEach(async () => {
    testDb = createTestDb();
    app = await buildApp();
    pid = await mkProject(app);
  });

  it('XSS ペイロードはそのまま保存・取得される（エスケープはフロント責務）', async () => {
    const xss = '<script>alert("xss")</script>';
    const res = await mkTask(app, pid, { title: xss });
    expect(res.statusCode).toBe(201);
    expect(res.json().task.title).toBe(xss);
  });

  it('SQL インジェクション試行でも DB が壊れない（プリペアドステートメント）', async () => {
    const injection = "'; DROP TABLE tasks; --";
    const res = await mkTask(app, pid, { title: injection });
    expect(res.statusCode).toBe(201);
    const list = await app.inject({ method: 'GET', url: `/api/v1/projects/${pid}/tasks` });
    expect(list.statusCode).toBe(200);
    expect(list.json().tasks[0].title).toBe(injection);
  });

  it('空タイトル → 400', async () => {
    const res = await mkTask(app, pid, { title: '' });
    expect(res.statusCode).toBe(400);
  });

  it('タイトル 201 文字（上限超過）→ 400', async () => {
    const res = await mkTask(app, pid, { title: 'a'.repeat(201) });
    expect(res.statusCode).toBe(400);
  });

  it('タイトル 200 文字（ちょうど上限）→ 201', async () => {
    const res = await mkTask(app, pid, { title: 'a'.repeat(200) });
    expect(res.statusCode).toBe(201);
  });

  it('progress = -1 → 400', async () => {
    expect((await mkTask(app, pid, { title: 'T', progress: -1 })).statusCode).toBe(400);
  });

  it('progress = 101 → 400', async () => {
    expect((await mkTask(app, pid, { title: 'T', progress: 101 })).statusCode).toBe(400);
  });

  it('progress 境界値 0・100 はそれぞれ通る', async () => {
    expect((await mkTask(app, pid, { title: 'T0',   progress: 0   })).statusCode).toBe(201);
    expect((await mkTask(app, pid, { title: 'T100', progress: 100 })).statusCode).toBe(201);
  });

  it('progress に文字列 → 400', async () => {
    expect((await mkTask(app, pid, { title: 'T', progress: 'fifty' })).statusCode).toBe(400);
  });

  it('無効な status 値 → 400', async () => {
    expect((await mkTask(app, pid, { title: 'T', status: 'invalid' })).statusCode).toBe(400);
  });

  it('無効な priority 値 → 400', async () => {
    expect((await mkTask(app, pid, { title: 'T', priority: 'urgent' })).statusCode).toBe(400);
  });

  it('title フィールドなし → 400', async () => {
    expect((await mkTask(app, pid, { status: 'todo' })).statusCode).toBe(400);
  });

  it('不正な JSON ボディ → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${pid}/tasks`,
      headers: { 'content-type': 'application/json' },
      payload: '{invalid-json',
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('API 悪意テスト — 存在しないリソース', () => {
  let app: App;

  beforeEach(async () => {
    testDb = createTestDb();
    app = await buildApp();
  });

  it('存在しないプロジェクトへのタスク作成は FK 制約でエラー', async () => {
    const res = await mkTask(app, 'no-such-project', { title: 'T' });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });

  it('存在しないタスクの GET → 404', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/tasks/nonexistent' });
    expect(res.statusCode).toBe(404);
  });

  it('存在しないタスクの PATCH → 404', async () => {
    const res = await app.inject({
      method: 'PATCH', url: '/api/v1/tasks/nonexistent',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Updated' }),
    });
    expect(res.statusCode).toBe(404);
  });

  it('存在しないタスクの DELETE → 404', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/tasks/nonexistent' });
    expect(res.statusCode).toBe(404);
  });

  it('存在しないプロジェクトの export → 404', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/projects/ghost/export/json' });
    expect(res.statusCode).toBe(404);
  });
});

describe('API 悪意テスト — データ境界', () => {
  let app: App;
  let pid: string;

  beforeEach(async () => {
    testDb = createTestDb();
    app = await buildApp();
    pid = await mkProject(app);
  });

  it('100KB の description は保存・取得できる', async () => {
    const huge = 'x'.repeat(100_000);
    const res = await mkTask(app, pid, { title: 'T', description: huge });
    expect(res.statusCode).toBe(201);
    expect(res.json().task.description).toBe(huge);
  });

  it('絵文字・マルチバイト・RTL 文字を含むタイトルは正確に保存・取得できる', async () => {
    const title = '🚀 タスク完了 🌟 한국어 العربية';
    const res = await mkTask(app, pid, { title });
    expect(res.statusCode).toBe(201);
    expect(res.json().task.title).toBe(title);
  });

  it('改行を含む description は保存できる', async () => {
    const desc = 'line1\nline2\r\nline3';
    const res = await mkTask(app, pid, { title: 'T', description: desc });
    expect(res.statusCode).toBe(201);
    expect(res.json().task.description).toBe(desc);
  });
});

describe('API 悪意テスト — 依存関係の悪用', () => {
  let app: App;
  let pid: string;

  beforeEach(async () => {
    testDb = createTestDb();
    app = await buildApp();
    pid = await mkProject(app);
  });

  it('循環依存 A→B, B→A を作成しても API がクラッシュしない', async () => {
    const idA = (await mkTask(app, pid, { title: 'A' })).json().task.id as string;
    const idB = (await mkTask(app, pid, { title: 'B', predecessors: [idA] })).json().task.id as string;

    const rPatch = await app.inject({
      method: 'PATCH', url: `/api/v1/tasks/${idA}`,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ predecessors: [idB] }),
    });
    expect(rPatch.statusCode).toBe(200);

    const list = await app.inject({ method: 'GET', url: `/api/v1/projects/${pid}/tasks` });
    expect(list.statusCode).toBe(200);
    expect(list.json().tasks).toHaveLength(2);
  });

  it('自己 parentId（A.parentId = A.id）→ 400 CYCLE_DETECTED', async () => {
    const idA = (await mkTask(app, pid, { title: 'A' })).json().task.id as string;
    const res = await app.inject({
      method: 'PATCH', url: `/api/v1/tasks/${idA}`,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ parentId: idA }),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('CYCLE_DETECTED');
  });

  it('間接的な循環（A→B→C→A）→ 400 CYCLE_DETECTED', async () => {
    const idA = (await mkTask(app, pid, { title: 'A' })).json().task.id as string;
    const idB = (await mkTask(app, pid, { title: 'B', parentId: idA })).json().task.id as string;
    const idC = (await mkTask(app, pid, { title: 'C', parentId: idB })).json().task.id as string;
    // A の parentId を C（自分の子孫）に設定 → 循環
    const res = await app.inject({
      method: 'PATCH', url: `/api/v1/tasks/${idA}`,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ parentId: idC }),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('CYCLE_DETECTED');
  });
});

describe('API 悪意テスト — インポートの悪用', () => {
  let app: App;
  let pid: string;

  beforeEach(async () => {
    testDb = createTestDb();
    app = await buildApp();
    pid = await mkProject(app);
  });

  it('空の tasks 配列 → imported: 0（エラーにならない）', async () => {
    const res = await app.inject({
      method: 'POST', url: `/api/v1/projects/${pid}/import`,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tasks: [] }),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().imported).toBe(0);
  });

  it('tasks フィールドなし → 400', async () => {
    const res = await app.inject({
      method: 'POST', url: `/api/v1/projects/${pid}/import`,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ version: '1.0' }),
    });
    expect(res.statusCode).toBe(400);
  });

  it('同一 ID のタスクを 2 回インポートすると別タスクとして追加される（上書きしない・PK 衝突なし）', async () => {
    // 新仕様: インポートは常に新 UUID を生成するため、同じ oldId でも別タスクになる
    const task = {
      id: 'dup-id', title: 'First',
      status: 'todo', priority: 'medium', progress: 0, predecessors: [],
    };
    const res1 = await app.inject({
      method: 'POST', url: `/api/v1/projects/${pid}/import`,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tasks: [task] }),
    });
    expect(res1.statusCode).toBe(200);

    const res2 = await app.inject({
      method: 'POST', url: `/api/v1/projects/${pid}/import`,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tasks: [{ ...task, title: 'Updated' }] }),
    });
    expect(res2.statusCode).toBe(200);

    // 2回インポートで2件になる（上書きではなく追加）
    const list = await app.inject({ method: 'GET', url: `/api/v1/projects/${pid}/tasks` });
    const titles = list.json().tasks.map((t: { title: string }) => t.title);
    expect(titles).toContain('First');
    expect(titles).toContain('Updated');
    expect(list.json().tasks).toHaveLength(2);
  });
});

describe('API 悪意テスト — フィルタ・並び替えの悪用', () => {
  let app: App;
  let pid: string;

  beforeEach(async () => {
    testDb = createTestDb();
    app = await buildApp();
    pid = await mkProject(app);
    await mkTask(app, pid, { title: 'T' });
  });

  it('limit=0 は空配列を返す（エラーにならない）', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/v1/projects/${pid}/tasks?limit=0` });
    expect(res.statusCode).toBe(200);
    expect(res.json().tasks).toHaveLength(0);
  });

  it('未定義の status フィルタは空配列（エラーにならない）', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/v1/projects/${pid}/tasks?status=unknown_status` });
    expect(res.statusCode).toBe(200);
    expect(res.json().tasks).toHaveLength(0);
  });

  it('reorder に空配列を渡しても正常終了', async () => {
    const res = await app.inject({
      method: 'PATCH', url: `/api/v1/projects/${pid}/tasks/reorder`,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ orders: [] }),
    });
    expect(res.statusCode).toBe(200);
  });

  it('reorder に存在しない ID を渡すと 400（プロジェクト境界の検証で弾かれる）', async () => {
    const res = await app.inject({
      method: 'PATCH', url: `/api/v1/projects/${pid}/tasks/reorder`,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ orders: [{ id: 'ghost', order: 99 }] }),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('INVALID_PROJECT');
  });
});
