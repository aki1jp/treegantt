import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTestDb } from './helpers.js';
import type Database from 'better-sqlite3';

// 本番と同じ db/wsRoom をテスト用に差し替える（routes.test.ts と同パターン）
let testDb: Database.Database;
vi.mock('../db/client.js', () => ({
  get db() { return testDb; },
}));
vi.mock('../ws/wsRoom.js', () => ({
  notifyRoom: vi.fn(),
  wss: { on: vi.fn() },
}));

const { buildApp } = await import('../app.js');

describe('buildApp（本番配線）', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    testDb = createTestDb();
    app = await buildApp();
    await app.ready();
  });
  afterEach(async () => {
    await app.close();
    testDb.close();
  });

  it('/health が status と version を返す', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('ok');
    expect(typeof body.version).toBe('string');
    expect(body.version.length).toBeGreaterThan(0);
  });

  it('CORS プリフライトが本番配線でも PATCH/DELETE を許可する', async () => {
    const res = await app.inject({
      method: 'OPTIONS',
      url: '/api/v1/tasks/abc',
      headers: { origin: 'http://localhost:3001', 'access-control-request-method': 'PATCH' },
    });
    expect(res.statusCode).toBeLessThan(300);
    const allow = String(res.headers['access-control-allow-methods'] ?? '');
    expect(allow).toContain('PATCH');
    expect(allow).toContain('DELETE');
  });

  it('バリデーションエラーをエラーハンドラが {error, code} で返す', async () => {
    // name 必須の projects POST に空ボディ → スキーマ検証エラー → setErrorHandler
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body).toHaveProperty('error');
    expect(body).toHaveProperty('code');
  });

  it('未知タスクの取得は 404 {error, code}', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/tasks/nonexistent' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ code: 'NOT_FOUND' });
  });
});
