import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTestDb, buildTestApp, createProject } from './helpers.js';
import type Database from 'better-sqlite3';
import { notifyRoom } from '../ws/wsRoom.js';

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
// ─── Tasks Batch API（v2.69）───────────────────────────────────────────────
describe('Tasks Batch API — POST /projects/:id/tasks/batch', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let projectId: string;

  beforeEach(async () => {
    testDb = createTestDb();
    app = await buildApp();
    projectId = (await createProject(app, { name: 'Batch Test Project' })).id;
  });

  afterEach(async () => {
    await app.close();
    testDb.close();
  });

  it('親＋子2件のバッチを1リクエストで作成し 201 で全タスクを返す', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/tasks/batch`,
      payload: {
        parentId: null,
        tasks: [
          { parentRef: null, title: 'Root', order: 1 },
          { parentRef: 0,    title: 'Child A' },
          { parentRef: 0,    title: 'Child B' },
        ],
      },
    });
    expect(res.statusCode).toBe(201);
    const { tasks } = res.json() as { tasks: { id: string; title: string; parentId: string | null }[] };
    expect(tasks).toHaveLength(3);
    expect(tasks[0].title).toBe('Root');
    expect(tasks[0].parentId).toBeNull();
    expect(tasks[1].title).toBe('Child A');
    expect(tasks[1].parentId).toBe(tasks[0].id);
    expect(tasks[2].title).toBe('Child B');
    expect(tasks[2].parentId).toBe(tasks[0].id);
  });

  it('3階層のネストも parentRef で正しく解決される', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/tasks/batch`,
      payload: {
        parentId: null,
        tasks: [
          { parentRef: null, title: 'L0' },
          { parentRef: 0,    title: 'L1' },
          { parentRef: 1,    title: 'L2' },
        ],
      },
    });
    expect(res.statusCode).toBe(201);
    const { tasks } = res.json() as { tasks: { id: string; title: string; parentId: string | null }[] };
    expect(tasks[2].parentId).toBe(tasks[1].id);
    expect(tasks[1].parentId).toBe(tasks[0].id);
  });

  it('tasks_created を1通だけ WS ブロードキャストする', async () => {
    vi.mocked(notifyRoom).mockClear();
    await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/tasks/batch`,
      payload: {
        parentId: null,
        tasks: [
          { parentRef: null, title: 'R' },
          { parentRef: 0,    title: 'C1' },
          { parentRef: 0,    title: 'C2' },
        ],
      },
    });
    const calls = vi.mocked(notifyRoom).mock.calls;
    const batchMsgs  = calls.filter(([, msg]) => (msg as { type: string }).type === 'tasks_created');
    const singleMsgs = calls.filter(([, msg]) => (msg as { type: string }).type === 'task_created');
    expect(batchMsgs).toHaveLength(1);
    expect(singleMsgs).toHaveLength(0);
    const payload = batchMsgs[0][1] as { tasks: { title: string }[]; projectId: string };
    expect(payload.tasks).toHaveLength(3);
    expect(payload.projectId).toBe(projectId);
  });

  it('空配列はエラーを返す', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/tasks/batch`,
      payload: { parentId: null, tasks: [] },
    });
    expect(res.statusCode).toBe(400);
  });

  it('parentRef が範囲外のときエラーを返す', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/tasks/batch`,
      payload: {
        parentId: null,
        tasks: [
          { parentRef: 99, title: 'Bad ref' },
        ],
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('batch 作成時に titleColor/titleBgColor が永続化される', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/tasks/batch`,
      payload: {
        parentId: null,
        tasks: [
          { parentRef: null, title: 'Colored Root', titleColor: '#ff0000', titleBgColor: '#00ff00' },
          { parentRef: 0,    title: 'Colored Child', titleColor: '#0000ff' },
        ],
      },
    });
    expect(res.statusCode).toBe(201);
    const { tasks } = res.json() as { tasks: { id: string; titleColor: string | null; titleBgColor: string | null }[] };
    expect(tasks[0].titleColor).toBe('#ff0000');
    expect(tasks[0].titleBgColor).toBe('#00ff00');
    expect(tasks[1].titleColor).toBe('#0000ff');
    expect(tasks[1].titleBgColor).toBeNull();

    // GET でも（=DBに保存されていることを）確認
    const fetched = (await app.inject({ method: 'GET', url: `/api/v1/tasks/${tasks[0].id}` })).json().task;
    expect(fetched.titleColor).toBe('#ff0000');
    expect(fetched.titleBgColor).toBe('#00ff00');
  });

  // ── parentId（root の接続先）検証 — single 作成と同等に揃える ──────
  it('存在しない parentId を指定すると 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/tasks/batch`,
      payload: { parentId: 'non-existent-uuid', tasks: [{ parentRef: null, title: 'Child' }] },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('INVALID_PARENT');
  });

  it('別プロジェクトのタスクを parentId に指定すると 400', async () => {
    const otherProjectId = (await app.inject({
      method: 'POST', url: '/api/v1/projects', payload: { name: 'Other' },
    })).json().project.id;
    const otherTask = (await app.inject({
      method: 'POST', url: `/api/v1/projects/${otherProjectId}/tasks`, payload: { title: '他P親' },
    })).json().task;

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/tasks/batch`,
      payload: { parentId: otherTask.id, tasks: [{ parentRef: null, title: 'Child' }] },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('INVALID_PARENT');
  });

  it('マイルストーンを parentId に指定すると 400', async () => {
    const ms = (await app.inject({
      method: 'POST', url: `/api/v1/projects/${projectId}/tasks`,
      payload: { title: 'MS', isMilestone: true, startDate: '2026-06-01', endDate: '2026-06-01' },
    })).json().task;

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/tasks/batch`,
      payload: { parentId: ms.id, tasks: [{ parentRef: null, title: 'Child' }] },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('MILESTONE_CANNOT_BE_PARENT');
  });

  it('同プロジェクト内の通常タスクを parentId に指定できる（正常系）', async () => {
    const parent = (await app.inject({
      method: 'POST', url: `/api/v1/projects/${projectId}/tasks`, payload: { title: '親' },
    })).json().task;

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/tasks/batch`,
      payload: { parentId: parent.id, tasks: [{ parentRef: null, title: 'Child' }] },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().tasks[0].parentId).toBe(parent.id);
  });

  // ── タイトル長・enum を single と同等に ─────────────────────────
  it('不正な status（enum 外）を指定すると 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/tasks/batch`,
      payload: { parentId: null, tasks: [{ parentRef: null, title: 'T', status: 'invalid_status' }] },
    });
    expect(res.statusCode).toBe(400);
  });

  it('不正な priority（enum 外）を指定すると 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/tasks/batch`,
      payload: { parentId: null, tasks: [{ parentRef: null, title: 'T', priority: 'invalid_priority' }] },
    });
    expect(res.statusCode).toBe(400);
  });

  it('progress が範囲外（101）だと 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/tasks/batch`,
      payload: { parentId: null, tasks: [{ parentRef: null, title: 'T', progress: 101 }] },
    });
    expect(res.statusCode).toBe(400);
  });

  it('title が201文字（上限超過）だと 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/tasks/batch`,
      payload: { parentId: null, tasks: [{ parentRef: null, title: 'x'.repeat(201) }] },
    });
    expect(res.statusCode).toBe(400);
  });

  it.each(['202610-10-21', '2026/10/21', '2026-1-5'])('日付形式不正 %s は 400', async (bad) => {
    for (const field of ['startDate', 'endDate']) {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/projects/${projectId}/tasks/batch`,
        payload: { parentId: null, tasks: [{ title: 'Bad date', [field]: bad }] },
      });
      expect(res.statusCode).toBe(400);
    }
  });

  it('正しい YYYY-MM-DD と null の日付は成功する', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/tasks/batch`,
      payload: { parentId: null, tasks: [{ title: 'OK', startDate: '2026-10-21', endDate: null }] },
    });
    expect(res.statusCode).toBe(201);
  });
});
