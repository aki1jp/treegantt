import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTestDb } from './helpers.js';
import type Database from 'better-sqlite3';
import Fastify from 'fastify';

let testDb: Database.Database;

vi.mock('../db/client.js', () => ({
  get db() { return testDb; },
}));

const { registerJsonBodyParser } = await import('../plugins/jsonParser.js');
const { settingsRoutes } = await import('../routes/settings.js');
const { getSettings, updateSettings, DEFAULT_SETTINGS } = await import('../services/settingsService.js');

async function buildApp() {
  const app = Fastify();
  registerJsonBodyParser(app);
  await app.register(settingsRoutes, { prefix: '/api/v1' });
  await app.ready();
  return app;
}

describe('settingsService', () => {
  beforeEach(() => { testDb = createTestDb(); });

  it('未設定時は既定値を返す（capacity=480, workingDays=月〜金）', () => {
    expect(getSettings()).toEqual(DEFAULT_SETTINGS);
    expect(getSettings()).toEqual({ capacityMinutesPerDay: 480, workingDays: [1, 2, 3, 4, 5] });
  });

  it('部分更新: 指定キーのみ更新し、未指定キーは既定を保つ', () => {
    updateSettings({ capacityMinutesPerDay: 465 });
    expect(getSettings().capacityMinutesPerDay).toBe(465);
    expect(getSettings().workingDays).toEqual([1, 2, 3, 4, 5]);
  });

  it('workingDays は重複除去・昇順・範囲外(0–6以外)除外で正規化', () => {
    updateSettings({ workingDays: [5, 1, 1, 7, -1, 3, 0] });
    expect(getSettings().workingDays).toEqual([0, 1, 3, 5]);
  });
});

describe('GET/PUT /api/v1/settings', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  beforeEach(async () => { testDb = createTestDb(); app = await buildApp(); });

  it('GET は既定値を返す', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/settings' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ capacityMinutesPerDay: 480, workingDays: [1, 2, 3, 4, 5] });
  });

  it('PUT で部分更新し、更新後の全設定を返す', async () => {
    const res = await app.inject({
      method: 'PUT', url: '/api/v1/settings',
      payload: { capacityMinutesPerDay: 600 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().capacityMinutesPerDay).toBe(600);
    expect(res.json().workingDays).toEqual([1, 2, 3, 4, 5]);

    const after = await app.inject({ method: 'GET', url: '/api/v1/settings' });
    expect(after.json().capacityMinutesPerDay).toBe(600);
  });

  it('capacityMinutesPerDay=0 は 400', async () => {
    const res = await app.inject({
      method: 'PUT', url: '/api/v1/settings',
      payload: { capacityMinutesPerDay: 0 },
    });
    expect(res.statusCode).toBe(400);
  });
});
