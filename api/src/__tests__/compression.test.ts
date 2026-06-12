import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { gunzipSync } from 'node:zlib';
import Fastify from 'fastify';
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

const { registerCompression } = await import('../plugins/compression.js');
const { taskRoutes } = await import('../routes/tasks.js');
const { projectRoutes } = await import('../routes/projects.js');

async function buildApp() {
  const app = Fastify({ logger: false });
  await registerCompression(app);
  await app.register(projectRoutes, { prefix: '/api/v1' });
  await app.register(taskRoutes, { prefix: '/api/v1' });
  await app.ready();
  return app;
}

describe('レスポンス圧縮（v2.67）', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let projectId: string;

  beforeEach(async () => {
    testDb = createTestDb();
    app = await buildApp();
    const res = await app.inject({
      method: 'POST', url: '/api/v1/projects',
      payload: { name: 'Compress Project' },
    });
    projectId = res.json().project.id;
    // 1024バイト閾値を確実に超える件数を投入
    for (let i = 1; i <= 100; i++) {
      await app.inject({
        method: 'POST', url: `/api/v1/projects/${projectId}/tasks`,
        payload: { title: `圧縮テスト用タスク ${i}`, description: 'x'.repeat(50) },
      });
    }
  });

  afterEach(async () => {
    await app.close();
    testDb.close();
  });

  it('Accept-Encoding: gzip 付きの大きな一覧取得は gzip 圧縮される', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${projectId}/tasks?limit=1000`,
      headers: { 'accept-encoding': 'gzip' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-encoding']).toBe('gzip');

    // 展開後ボディが非圧縮レスポンスと一致する
    const decompressed = JSON.parse(gunzipSync(res.rawPayload).toString('utf-8'));
    expect(decompressed.total).toBe(100);
    expect(decompressed.tasks).toHaveLength(100);

    // 転送サイズが素のJSONより十分小さい
    const plain = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${projectId}/tasks?limit=1000`,
      headers: { 'accept-encoding': 'identity' },
    });
    expect(res.rawPayload.length).toBeLessThan(plain.rawPayload.length / 2);
  });

  it('Accept-Encoding なしのクライアントには非圧縮で返す', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${projectId}/tasks?limit=10`,
      headers: { 'accept-encoding': 'identity' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-encoding']).toBeUndefined();
    expect(res.json().tasks).toHaveLength(10);
  });

  it('閾値（1024バイト）未満の小さなレスポンスは圧縮しない', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${projectId}/tasks?limit=1`,
      headers: { 'accept-encoding': 'gzip' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-encoding']).toBeUndefined();
  });
});
