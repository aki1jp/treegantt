import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTestDb, buildTestApp, createProject, createTask as createTaskIn } from './helpers.js';
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
describe('Tasks API — POST /projects/:id/tasks/:taskId/shift（親配下の日付一括シフト）', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let projectId: string;

  beforeEach(async () => {
    testDb = createTestDb();
    app = await buildApp();
    projectId = (await createProject(app, { name: 'P' })).id;
    vi.mocked(notifyRoom).mockClear();
  });

  afterEach(async () => {
    await app.close();
    testDb.close();
  });

  const mk = (overrides = {}, pid = projectId) =>
    createTaskIn(app, pid, { title: 'T', ...overrides });
  async function shift(taskId: string, body: unknown, pid = projectId) {
    return app.inject({ method: 'POST', url: `/api/v1/projects/${pid}/tasks/${taskId}/shift`, payload: body as object });
  }
  async function get(id: string) {
    return (await app.inject({ method: 'GET', url: `/api/v1/tasks/${id}` })).json().task;
  }
  const shiftCalls = () =>
    vi.mocked(notifyRoom).mock.calls.filter(([, m]) => (m as { type: string }).type === 'tasks_updated');

  it('子・孫・マイルストーンがシフトされ、親自身は不変', async () => {
    const parent = await mk({ title: '親', startDate: '2026-06-01', endDate: '2026-06-30' });
    const child = await mk({ parentId: parent.id, startDate: '2026-06-02', endDate: '2026-06-10' });
    const grand = await mk({ parentId: child.id, startDate: '2026-06-03', endDate: '2026-06-05' });
    const ms = await mk({ parentId: parent.id, isMilestone: true, startDate: '2026-06-15', endDate: '2026-06-15' });
    vi.mocked(notifyRoom).mockClear();

    const res = await shift(parent.id, { days: 3 });
    expect(res.statusCode).toBe(200);
    const { tasks } = res.json();
    expect(tasks.map((t: { id: string }) => t.id).sort()).toEqual([child.id, grand.id, ms.id].sort());

    expect((await get(child.id)).startDate).toBe('2026-06-05');
    expect((await get(child.id)).endDate).toBe('2026-06-13');
    expect((await get(grand.id)).startDate).toBe('2026-06-06');
    expect((await get(grand.id)).endDate).toBe('2026-06-08');
    expect((await get(ms.id)).startDate).toBe('2026-06-18');
    expect((await get(ms.id)).endDate).toBe('2026-06-18');
    expect((await get(parent.id)).startDate).toBe('2026-06-01');
    expect((await get(parent.id)).endDate).toBe('2026-06-30');
  });

  it('日付なしの子孫は不変・更新対象に含まれない', async () => {
    const parent = await mk({});
    const dated = await mk({ parentId: parent.id, startDate: '2026-06-02', endDate: '2026-06-10' });
    const undated = await mk({ parentId: parent.id });
    const res = await shift(parent.id, { days: 1 });
    expect(res.json().tasks.map((t: { id: string }) => t.id)).toEqual([dated.id]);
    const u = await get(undated.id);
    expect(u.startDate).toBeNull();
    expect(u.endDate).toBeNull();
  });

  it('サブツリー外のタスクは不変', async () => {
    const parent = await mk({});
    await mk({ parentId: parent.id, startDate: '2026-06-02', endDate: '2026-06-10' });
    const other = await mk({ startDate: '2026-06-02', endDate: '2026-06-10' });
    await shift(parent.id, { days: 5 });
    const o = await get(other.id);
    expect(o.startDate).toBe('2026-06-02');
    expect(o.endDate).toBe('2026-06-10');
  });

  it('負の days で過去方向へシフトする', async () => {
    const parent = await mk({});
    const child = await mk({ parentId: parent.id, startDate: '2026-06-02', endDate: '2026-06-10' });
    const res = await shift(parent.id, { days: -4 });
    expect(res.statusCode).toBe(200);
    const c = await get(child.id);
    expect(c.startDate).toBe('2026-05-29');
    expect(c.endDate).toBe('2026-06-06');
  });

  it('月跨ぎ・年跨ぎ・うるう年を正しく加算する', async () => {
    const parent = await mk({});
    const a = await mk({ parentId: parent.id, startDate: '2026-12-30', endDate: '2026-12-31' });
    const b = await mk({ parentId: parent.id, startDate: '2028-02-27', endDate: '2028-02-28' });
    await shift(parent.id, { days: 2 });
    expect((await get(a.id)).startDate).toBe('2027-01-01');
    expect((await get(a.id)).endDate).toBe('2027-01-02');
    expect((await get(b.id)).startDate).toBe('2028-02-29');
    expect((await get(b.id)).endDate).toBe('2028-03-01');
  });

  it('days=3650 / -3650 は許可される', async () => {
    const parent = await mk({});
    await mk({ parentId: parent.id, startDate: '2026-06-02', endDate: '2026-06-10' });
    expect((await shift(parent.id, { days: 3650 })).statusCode).toBe(200);
    expect((await shift(parent.id, { days: -3650 })).statusCode).toBe(200);
  });

  it.each([[0], [1.5], [3651], [-3651], [null]])('不正な days=%j は 400', async (days) => {
    const parent = await mk({});
    await mk({ parentId: parent.id, startDate: '2026-06-02', endDate: '2026-06-10' });
    expect((await shift(parent.id, { days })).statusCode).toBe(400);
  });

  it('days 未指定は 400', async () => {
    const parent = await mk({});
    expect((await shift(parent.id, {})).statusCode).toBe(400);
  });

  it('YYYY/M/D 形式の日付は解釈され ISO に正規化される', async () => {
    const parent = await mk({});
    const child = await mk({ parentId: parent.id });
    testDb.prepare('UPDATE tasks SET start_date = ?, end_date = ? WHERE id = ?').run('2026/9/1', '2026/9/5', child.id);
    const res = await shift(parent.id, { days: 2 });
    expect(res.statusCode).toBe(200);
    const t = await get(child.id);
    expect(t.startDate).toBe('2026-09-03');
    expect(t.endDate).toBe('2026-09-07');
  });

  it('時刻付き日付も解釈される', async () => {
    const parent = await mk({});
    const child = await mk({ parentId: parent.id });
    testDb.prepare('UPDATE tasks SET start_date = ?, end_date = ? WHERE id = ?').run('2026-09-01T00:00:00', '2026-09-02 12:00', child.id);
    expect((await shift(parent.id, { days: 2 })).statusCode).toBe(200);
    const t = await get(child.id);
    expect(t.startDate).toBe('2026-09-03');
    expect(t.endDate).toBe('2026-09-04');
  });

  it('解釈不能な日付は据え置かれ 200（解釈できる側だけ加算）', async () => {
    const parent = await mk({});
    const bad = await mk({ parentId: parent.id });
    const half = await mk({ parentId: parent.id });
    testDb.prepare('UPDATE tasks SET start_date = ?, end_date = ? WHERE id = ?').run('abc', 'xyz', bad.id);
    testDb.prepare('UPDATE tasks SET start_date = ?, end_date = ? WHERE id = ?').run('abc', '2026-09-01', half.id);
    vi.mocked(notifyRoom).mockClear();
    const res = await shift(parent.id, { days: 2 });
    expect(res.statusCode).toBe(200);
    const b = await get(bad.id);
    expect([b.startDate, b.endDate]).toEqual(['abc', 'xyz']);
    const h = await get(half.id);
    expect([h.startDate, h.endDate]).toEqual(['abc', '2026-09-03']);
    expect(res.json().tasks.map((t: { id: string }) => t.id)).toEqual([half.id]);
  });

  it('循環 parentId があっても停止する', async () => {
    const parent = await mk({ startDate: '2026-06-01', endDate: '2026-06-02' });
    const child = await mk({ parentId: parent.id, startDate: '2026-06-02', endDate: '2026-06-03' });
    testDb.prepare('UPDATE tasks SET parent_id = ? WHERE id = ?').run(child.id, parent.id);
    const res = await shift(parent.id, { days: 1 });
    expect(res.statusCode).toBe(200);
    expect((await get(child.id)).startDate).toBe('2026-06-03');
  });

  it('存在しないタスクは 404', async () => {
    const res = await shift('no-such-task', { days: 1 });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('NOT_FOUND');
  });

  it('他プロジェクトのタスクは 400 で更新されない', async () => {
    const p2 = (await createProject(app, { name: 'P2' })).id;
    const parent = await mk({}, p2);
    const child = await mk({ parentId: parent.id, startDate: '2026-06-02', endDate: '2026-06-10' }, p2);
    const res = await shift(parent.id, { days: 1 });
    expect(res.statusCode).toBe(400);
    expect((await get(child.id)).startDate).toBe('2026-06-02');
  });

  it('WS は tasks_updated が1通だけ（更新タスク全件）', async () => {
    const parent = await mk({});
    const c1 = await mk({ parentId: parent.id, startDate: '2026-06-02', endDate: '2026-06-10' });
    const c2 = await mk({ parentId: parent.id, startDate: '2026-06-03', endDate: '2026-06-11' });
    vi.mocked(notifyRoom).mockClear();
    await shift(parent.id, { days: 2 });
    const calls = vi.mocked(notifyRoom).mock.calls;
    expect(calls).toHaveLength(1);
    const [pid, msg] = calls[0] as [string, { type: string; projectId: string; tasks: { id: string }[] }];
    expect(pid).toBe(projectId);
    expect(msg.type).toBe('tasks_updated');
    expect(msg.projectId).toBe(projectId);
    expect(msg.tasks.map(t => t.id).sort()).toEqual([c1.id, c2.id].sort());
  });

  it('更新0件（葉・子孫が日付なし）は { tasks: [] } で WS 配信なし', async () => {
    const leaf = await mk({ startDate: '2026-06-02', endDate: '2026-06-10' });
    const parent = await mk({});
    await mk({ parentId: parent.id });
    vi.mocked(notifyRoom).mockClear();
    const r1 = await shift(leaf.id, { days: 2 });
    expect(r1.statusCode).toBe(200);
    expect(r1.json()).toEqual({ tasks: [] });
    const r2 = await shift(parent.id, { days: 2 });
    expect(r2.json()).toEqual({ tasks: [] });
    expect(shiftCalls()).toHaveLength(0);
    expect((await get(leaf.id)).startDate).toBe('2026-06-02');
  });
});
