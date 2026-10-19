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
describe('GET /health', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    testDb = createTestDb();
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
    testDb.close();
  });

  it('returns 200 with ok status', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok' });
  });
});
