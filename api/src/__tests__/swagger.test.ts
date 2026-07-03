import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
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

const PACKAGE_VERSION = (
  JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf-8')) as { version: string }
).version;

describe('OpenAPI (Swagger) ドキュメント', () => {
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

  it('GET /docs/json が OpenAPI 定義を返し、info.version が package.json と一致する', async () => {
    const res = await app.inject({ method: 'GET', url: '/docs/json' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.openapi).toMatch(/^3\./);
    expect(body.info.version).toBe(PACKAGE_VERSION);
  });

  it('GET /docs/json の paths に代表的なエンドポイントを含む', async () => {
    const res = await app.inject({ method: 'GET', url: '/docs/json' });
    const body = res.json();
    expect(body.paths).toHaveProperty('/health');
    expect(body.paths).toHaveProperty('/api/v1/projects');
    expect(body.paths).toHaveProperty('/api/v1/settings');
    expect(body.paths).toHaveProperty('/api/v1/tasks/{id}');
  });

  it('GET /docs が Swagger UI (HTML) を返す', async () => {
    const res = await app.inject({ method: 'GET', url: '/docs' });
    expect(res.statusCode).toBe(200);
    expect(String(res.headers['content-type'])).toContain('text/html');
  });
});
