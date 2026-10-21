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
describe('Tasks API', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let projectId: string;

  beforeEach(async () => {
    testDb = createTestDb();
    app = await buildApp();

    projectId = (await createProject(app, { name: 'Test Project' })).id;
  });

  afterEach(async () => {
    await app.inject({ method: 'DELETE', url: `/api/v1/projects/${projectId}` });
    await app.close();
    testDb.close();
  });

  const createTask = (overrides = {}) =>
    createTaskIn(app, projectId, { title: 'Test Task', ...overrides });

  it('GET /api/v1/projects/:id/tasks returns empty list', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/v1/projects/${projectId}/tasks` });
    expect(res.statusCode).toBe(200);
    expect(res.json().tasks).toEqual([]);
    expect(res.json().total).toBe(0);
  });

  it('POST /api/v1/projects/:id/tasks creates task with defaults', async () => {
    const res = await app.inject({
      method: 'POST', url: `/api/v1/projects/${projectId}/tasks`,
      payload: { title: 'New Task' },
    });
    expect(res.statusCode).toBe(201);
    const { task } = res.json();
    expect(task.title).toBe('New Task');
    expect(task.status).toBe('todo');
    expect(task.priority).toBe('medium');
    expect(task.progress).toBe(0);
  });

  it('POST /api/v1/projects/:id/tasks validates title required', async () => {
    const res = await app.inject({
      method: 'POST', url: `/api/v1/projects/${projectId}/tasks`,
      payload: { summary: 'no title' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('GET /api/v1/tasks/:id returns task', async () => {
    const task = await createTask();
    const res = await app.inject({ method: 'GET', url: `/api/v1/tasks/${task.id}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().task.id).toBe(task.id);
  });

  it('GET /api/v1/tasks/:id returns 404 for unknown', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/tasks/unknown-id' });
    expect(res.statusCode).toBe(404);
  });

  it('PATCH /api/v1/tasks/:id updates fields', async () => {
    const task = await createTask({ title: 'Original', status: 'todo', progress: 0 });
    const res = await app.inject({
      method: 'PATCH', url: `/api/v1/tasks/${task.id}`,
      payload: { title: 'Updated', status: 'wip', progress: 50 },
    });
    expect(res.statusCode).toBe(200);
    const updated = res.json().task;
    expect(updated.title).toBe('Updated');
    expect(updated.status).toBe('wip');
    expect(updated.progress).toBe(50);
  });

  it('PATCH /api/v1/tasks/:id で isMilestone を更新できる（transform 関数のカバレッジ）', async () => {
    const task = await createTask({ title: 'Non-milestone' });
    // isMilestone: true に更新（transform(true) → 1）
    const r1 = await app.inject({
      method: 'PATCH', url: `/api/v1/tasks/${task.id}`,
      payload: { isMilestone: true },
    });
    expect(r1.statusCode).toBe(200);
    expect(r1.json().task.isMilestone).toBe(true);
    // isMilestone: false に戻す（transform(false) → 0）
    const r2 = await app.inject({
      method: 'PATCH', url: `/api/v1/tasks/${task.id}`,
      payload: { isMilestone: false },
    });
    expect(r2.statusCode).toBe(200);
    expect(r2.json().task.isMilestone).toBe(false);
  });

  it('PATCH /api/v1/tasks/:id returns 404 for unknown', async () => {
    const res = await app.inject({
      method: 'PATCH', url: '/api/v1/tasks/unknown',
      payload: { title: 'X' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('PATCH /api/v1/tasks/:id で titleColor と titleBgColor を更新・リセットできる', async () => {
    const task = await createTask({ title: 'Color Task' });
    // 色を設定
    const r1 = await app.inject({
      method: 'PATCH', url: `/api/v1/tasks/${task.id}`,
      payload: { titleColor: '#3b82f6', titleBgColor: '#eff6ff' },
    });
    expect(r1.statusCode).toBe(200);
    expect(r1.json().task.titleColor).toBe('#3b82f6');
    expect(r1.json().task.titleBgColor).toBe('#eff6ff');
    // null でリセット
    const r2 = await app.inject({
      method: 'PATCH', url: `/api/v1/tasks/${task.id}`,
      payload: { titleColor: null, titleBgColor: null },
    });
    expect(r2.statusCode).toBe(200);
    expect(r2.json().task.titleColor).toBeNull();
    expect(r2.json().task.titleBgColor).toBeNull();
  });

  it('POST /api/v1/projects/:id/tasks: 作成時に titleColor/titleBgColor が永続化される', async () => {
    const task = await createTask({ title: 'Color At Create', titleColor: '#3b82f6', titleBgColor: '#eff6ff' });
    expect(task.titleColor).toBe('#3b82f6');
    expect(task.titleBgColor).toBe('#eff6ff');

    // レスポンスだけでなく GET でも（=DBに保存されていることを）確認
    const fetched = (await app.inject({ method: 'GET', url: `/api/v1/tasks/${task.id}` })).json().task;
    expect(fetched.titleColor).toBe('#3b82f6');
    expect(fetched.titleBgColor).toBe('#eff6ff');
  });

  it('PATCH /api/v1/tasks/:id with valid parentId on non-existent task returns 404 (parentId validation passes, updateTask returns null)', async () => {
    const parent = await createTask({ title: 'Parent' });
    const res = await app.inject({
      method: 'PATCH', url: '/api/v1/tasks/non-existent-task-id',
      payload: { parentId: parent.id },
    });
    // parentId は valid（同プロジェクト・非マイルストーン）なので parentId validation を通過し
    // updateTask が null を返して 404 になる
    expect(res.statusCode).toBe(404);
  });

  it('GET /api/v1/projects/:id/tasks: limit が上限（100000）を超えると 400', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${projectId}/tasks?limit=100001`,
    });
    expect(res.statusCode).toBe(400);
  });

  it('GET /api/v1/projects/:id/tasks: limit が負値だと 400', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${projectId}/tasks?limit=-1`,
    });
    expect(res.statusCode).toBe(400);
  });

  it('GET /api/v1/projects/:id/tasks: limit が上限ちょうど（100000）は許可される', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${projectId}/tasks?limit=100000`,
    });
    expect(res.statusCode).toBe(200);
  });

  it('GET /api/v1/projects/:id/tasks supports offset parameter', async () => {
    // 3件作成して offset=1 で2件が返ることを確認
    await createTask({ title: 'Task A' });
    await createTask({ title: 'Task B' });
    await createTask({ title: 'Task C' });
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${projectId}/tasks?limit=10&offset=1`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().tasks).toHaveLength(2);
  });

  it('DELETE /api/v1/tasks/:id deletes task', async () => {
    const task = await createTask();
    const res = await app.inject({ method: 'DELETE', url: `/api/v1/tasks/${task.id}` });
    expect(res.statusCode).toBe(204);

    const getRes = await app.inject({ method: 'GET', url: `/api/v1/tasks/${task.id}` });
    expect(getRes.statusCode).toBe(404);
  });

  // ブラウザの fetch 実挙動（content-type 付き・ボディ空）でも 204 になること。
  // 空ボディ+application/json の FST_ERR_CTP_EMPTY_JSON_BODY(400) 回帰を防ぐ。
  it('DELETE /api/v1/tasks/:id は content-type:application/json（ボディ空）でも 204', async () => {
    const task = await createTask();
    const res = await app.inject({
      method: 'DELETE', url: `/api/v1/tasks/${task.id}`,
      headers: { 'content-type': 'application/json' },
    });
    expect(res.statusCode).toBe(204);
    expect((await app.inject({ method: 'GET', url: `/api/v1/tasks/${task.id}` })).statusCode).toBe(404);
  });

  it('DELETE /api/v1/tasks/:id はデフォルトで子孫ごと削除する', async () => {
    const parent = await createTask({ title: '親' });
    const child  = await createTask({ title: '子', parentId: parent.id });
    const grand  = await createTask({ title: '孫', parentId: child.id });

    const res = await app.inject({ method: 'DELETE', url: `/api/v1/tasks/${parent.id}` });
    expect(res.statusCode).toBe(204);
    expect((await app.inject({ method: 'GET', url: `/api/v1/tasks/${child.id}` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `/api/v1/tasks/${grand.id}` })).statusCode).toBe(404);
  });

  it('DELETE /api/v1/tasks/:id?mode=single は子を祖父母に付け替えて本体のみ削除する', async () => {
    const gp     = await createTask({ title: '祖父母' });
    const parent = await createTask({ title: '親', parentId: gp.id });
    const child  = await createTask({ title: '子', parentId: parent.id });

    const res = await app.inject({ method: 'DELETE', url: `/api/v1/tasks/${parent.id}?mode=single` });
    expect(res.statusCode).toBe(204);
    expect((await app.inject({ method: 'GET', url: `/api/v1/tasks/${parent.id}` })).statusCode).toBe(404);

    const childRes = await app.inject({ method: 'GET', url: `/api/v1/tasks/${child.id}` });
    expect(childRes.statusCode).toBe(200);
    expect(childRes.json().task.parentId).toBe(gp.id);
  });

  it('PATCH /api/v1/projects/:id/tasks/reorder updates order', async () => {
    const t1 = await createTask({ title: 'T1' });
    const t2 = await createTask({ title: 'T2' });

    const res = await app.inject({
      method: 'PATCH', url: `/api/v1/projects/${projectId}/tasks/reorder`,
      payload: { orders: [{ id: t1.id, order: 10 }, { id: t2.id, order: 5 }] },
    });
    expect(res.statusCode).toBe(200);

    const t1Updated = (await app.inject({ method: 'GET', url: `/api/v1/tasks/${t1.id}` })).json().task;
    expect(t1Updated.order).toBe(10);
  });

  it('PATCH /api/v1/projects/:id/tasks/reorder with parentId updates parent', async () => {
    const parent = await createTask({ title: 'Parent' });
    const child  = await createTask({ title: 'Child' });

    const res = await app.inject({
      method: 'PATCH', url: `/api/v1/projects/${projectId}/tasks/reorder`,
      payload: { orders: [{ id: child.id, order: 2, parentId: parent.id }] },
    });
    expect(res.statusCode).toBe(200);

    const updated = (await app.inject({ method: 'GET', url: `/api/v1/tasks/${child.id}` })).json().task;
    expect(updated.parentId).toBe(parent.id);
  });

  it('GET tasks with status filter', async () => {
    await createTask({ title: 'Todo Task', status: 'todo' });
    await createTask({ title: 'WIP Task', status: 'wip' });

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${projectId}/tasks?status=wip`,
    });
    expect(res.statusCode).toBe(200);
    const { tasks } = res.json();
    expect(tasks).toHaveLength(1);
    expect(tasks[0].status).toBe('wip');
  });

  it('子の日付 PATCH 後、親の日付は変化しない', async () => {
    const parent = await createTask({ title: '親', startDate: '2026-06-01', endDate: '2026-06-30' });
    const child  = await createTask({ title: '子', parentId: parent.id, startDate: '2026-06-05', endDate: '2026-06-20' });

    await app.inject({
      method: 'PATCH', url: `/api/v1/tasks/${child.id}`,
      payload: { startDate: '2026-05-01' },
    });

    const parentRes = await app.inject({ method: 'GET', url: `/api/v1/tasks/${parent.id}` });
    expect(parentRes.json().task.startDate).toBe('2026-06-01');
    expect(parentRes.json().task.endDate).toBe('2026-06-30');
  });

  it('子の日付 PATCH 後、親の task_updated は broadcast されない', async () => {
    const parent = await createTask({ title: '親', startDate: '2026-06-01', endDate: '2026-06-30' });
    const child  = await createTask({ title: '子', parentId: parent.id, startDate: '2026-06-05', endDate: '2026-06-20' });

    vi.mocked(notifyRoom).mockClear();

    await app.inject({
      method: 'PATCH', url: `/api/v1/tasks/${child.id}`,
      payload: { startDate: '2026-05-01' },
    });

    const broadcastedIds = vi.mocked(notifyRoom).mock.calls
      .filter(([, msg]) => (msg as { type: string }).type === 'task_updated')
      .map(([, msg]) => (msg as { task: { id: string } }).task.id);

    expect(broadcastedIds).not.toContain(parent.id);
  });

  it('祖父タスクの日付も変化しない', async () => {
    const gp    = await createTask({ title: '祖父', startDate: '2026-05-01', endDate: '2026-05-31' });
    const par   = await createTask({ title: '親',   parentId: gp.id });
    const child = await createTask({ title: '孫',   parentId: par.id });

    await app.inject({
      method: 'PATCH', url: `/api/v1/tasks/${child.id}`,
      payload: { startDate: '2026-08-01', endDate: '2026-08-31' },
    });

    const gpRes = await app.inject({ method: 'GET', url: `/api/v1/tasks/${gp.id}` });
    expect(gpRes.json().task.startDate).toBe('2026-05-01');
    expect(gpRes.json().task.endDate).toBe('2026-05-31');
  });

  it('reorder: 移動元・移動先どちらの日付も変化しない', async () => {
    const oldParent = await createTask({ title: '旧親', startDate: '2026-05-01', endDate: '2026-05-31' });
    const newParent = await createTask({ title: '新親', startDate: '2026-09-01', endDate: '2026-09-30' });
    const child     = await createTask({ title: '子',   parentId: oldParent.id, startDate: '2026-07-01', endDate: '2026-07-31' });

    await app.inject({
      method: 'PATCH', url: `/api/v1/projects/${projectId}/tasks/reorder`,
      payload: { orders: [{ id: child.id, order: 1, parentId: newParent.id }] },
    });

    const oldRes = await app.inject({ method: 'GET', url: `/api/v1/tasks/${oldParent.id}` });
    const newRes = await app.inject({ method: 'GET', url: `/api/v1/tasks/${newParent.id}` });
    expect(oldRes.json().task.startDate).toBe('2026-05-01');
    expect(oldRes.json().task.endDate).toBe('2026-05-31');
    expect(newRes.json().task.startDate).toBe('2026-09-01');
    expect(newRes.json().task.endDate).toBe('2026-09-30');
  });
});

describe('Tasks API — 実質変更なしの PATCH は保存・配信しない', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let projectId: string;

  beforeEach(async () => {
    testDb = createTestDb();
    app = await buildApp();

    projectId = (await createProject(app, { name: 'NoOp Test Project' })).id;
  });

  afterEach(async () => {
    await app.close();
    testDb.close();
  });

  const createTask = (overrides = {}) =>
    createTaskIn(app, projectId, { title: 'NoOp Task', ...overrides });

  it('同じ値で PATCH しても 200 かつ notifyRoom は呼ばれず、updatedAt も変化しない', async () => {
    const task = await createTask({ title: '同値', progress: 30, status: 'wip' });

    vi.mocked(notifyRoom).mockClear();
    const res = await app.inject({
      method: 'PATCH', url: `/api/v1/tasks/${task.id}`,
      payload: { title: '同値', progress: 30, status: 'wip' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().task.updatedAt).toBe(task.updatedAt);
    expect(vi.mocked(notifyRoom)).not.toHaveBeenCalled();
  });

  it('空ボディ {} の PATCH でも notifyRoom は呼ばれない', async () => {
    const task = await createTask({ title: '空ボディ' });

    vi.mocked(notifyRoom).mockClear();
    const res = await app.inject({
      method: 'PATCH', url: `/api/v1/tasks/${task.id}`,
      payload: {},
    });

    expect(res.statusCode).toBe(200);
    expect(vi.mocked(notifyRoom)).not.toHaveBeenCalled();
  });

  it('値を1つ変えて PATCH すれば従来どおり task_updated が1回だけ配信される', async () => {
    const task = await createTask({ title: '変更あり', progress: 10 });

    vi.mocked(notifyRoom).mockClear();
    const res = await app.inject({
      method: 'PATCH', url: `/api/v1/tasks/${task.id}`,
      payload: { progress: 20 },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().task.progress).toBe(20);
    const updatedCalls = vi.mocked(notifyRoom).mock.calls
      .filter(([, msg]) => (msg as { type: string }).type === 'task_updated');
    expect(updatedCalls).toHaveLength(1);
  });

  it('predecessors を同じ内容（順序違い含む）で送っても配信されない', async () => {
    const p1 = await createTask({ title: 'P1' });
    const p2 = await createTask({ title: 'P2' });
    const child = await createTask({ title: 'Child', predecessors: [p1.id, p2.id] });

    vi.mocked(notifyRoom).mockClear();
    const res = await app.inject({
      method: 'PATCH', url: `/api/v1/tasks/${child.id}`,
      payload: { predecessors: [p2.id, p1.id] },
    });

    expect(res.statusCode).toBe(200);
    expect(vi.mocked(notifyRoom)).not.toHaveBeenCalled();
  });

  it('predecessors の内容を変えれば配信される', async () => {
    const p1 = await createTask({ title: 'P1' });
    const p2 = await createTask({ title: 'P2' });
    const child = await createTask({ title: 'Child', predecessors: [p1.id] });

    vi.mocked(notifyRoom).mockClear();
    const res = await app.inject({
      method: 'PATCH', url: `/api/v1/tasks/${child.id}`,
      payload: { predecessors: [p2.id] },
    });

    expect(res.statusCode).toBe(200);
    const updatedCalls = vi.mocked(notifyRoom).mock.calls
      .filter(([, msg]) => (msg as { type: string }).type === 'task_updated');
    expect(updatedCalls).toHaveLength(1);
  });

  it('存在しない id への PATCH は従来どおり 404', async () => {
    const res = await app.inject({
      method: 'PATCH', url: `/api/v1/tasks/no-such-id`,
      payload: { title: 'X' },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('NOT_FOUND');
  });

  describe('クエリ本数の回帰テスト（no-op ガードの二重ハイドレート解消）', () => {
    function countQueries() {
      const spy = vi.spyOn(testDb, 'prepare');
      return {
        total: () => spy.mock.calls.length,
        matching: (re: RegExp) => spy.mock.calls.filter(([sql]) => re.test(sql as string)).length,
        restore: () => spy.mockRestore(),
      };
    }

    it('変更あり・predecessors なし: 6本（SELECT*(1) + SELECT id(1) + UPDATE(1) + getTask系3本）', async () => {
      const task = await createTask({ title: '変更前', progress: 10 });
      const counter = countQueries();
      const res = await app.inject({
        method: 'PATCH', url: `/api/v1/tasks/${task.id}`,
        payload: { progress: 20 },
      });
      expect(res.statusCode).toBe(200);
      expect(counter.total()).toBe(6);
      counter.restore();
    });

    it('変更なし・predecessors なし: 4本（SELECT*(1) + getTask系3本、UPDATEなし）', async () => {
      const task = await createTask({ title: '同値2', progress: 30, status: 'wip' });
      const counter = countQueries();
      const res = await app.inject({
        method: 'PATCH', url: `/api/v1/tasks/${task.id}`,
        payload: { title: '同値2', progress: 30, status: 'wip' },
      });
      expect(res.statusCode).toBe(200);
      expect(counter.total()).toBe(4);
      expect(counter.matching(/UPDATE tasks/)).toBe(0);
      counter.restore();
    });

    it('変更あり・列が変わっている＋predecessors あり: 短絡評価で hasPredecessorChanges 用の task_deps SELECT は発行されない', async () => {
      const p1 = await createTask({ title: 'P1' });
      const task = await createTask({ title: '変更前3', progress: 10, predecessors: [p1.id] });
      const counter = countQueries();
      const res = await app.inject({
        method: 'PATCH', url: `/api/v1/tasks/${task.id}`,
        payload: { progress: 20, predecessors: [p1.id] },
      });
      expect(res.statusCode).toBe(200);
      // 内訳: getTaskBasic(1) + wouldCreateDepCycleDb のBFS(1) + updateTask内 SELECT id(1) + UPDATE(1)
      //       + predecessors 再設定 DELETE(1) + INSERT(1) + 末尾 getTask 系(3) = 9
      // これらは predecessors が req.body に含まれる限り既存仕様として発生するもの（本refactorの対象外）。
      // 本refactorが保証するのは「hasPredecessorChanges 用の task_deps SELECT が短絡評価で
      // 発行されないこと」のみなので、それを個別に検証する。
      expect(counter.total()).toBe(9);
      expect(counter.matching(/^SELECT predecessor_id FROM task_deps WHERE successor_id = \?$/)).toBe(0);
      counter.restore();
    });
  });
});

describe('Tasks API — parentId バリデーション', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let projectId: string;
  let otherProjectId: string;

  beforeEach(async () => {
    testDb = createTestDb();
    app = await buildApp();
    projectId = (await createProject(app, { name: 'P1' })).id;
    otherProjectId = (await createProject(app, { name: 'P2' })).id;
  });
  afterEach(async () => { await app.close(); testDb.close(); });

  // ── 別プロジェクト parentId ───────────────────────────
  it('POST: 別プロジェクトのタスクを parentId に指定すると 400', async () => {
    const otherTask = (await app.inject({ method: 'POST', url: `/api/v1/projects/${otherProjectId}/tasks`, payload: { title: '他P親' } })).json().task;
    const res = await app.inject({
      method: 'POST', url: `/api/v1/projects/${projectId}/tasks`,
      payload: { title: '子', parentId: otherTask.id },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('INVALID_PARENT');
  });

  it('PATCH: 別プロジェクトのタスクを parentId に指定すると 400', async () => {
    const myTask   = (await app.inject({ method: 'POST', url: `/api/v1/projects/${projectId}/tasks`,      payload: { title: '自分' } })).json().task;
    const otherTask = (await app.inject({ method: 'POST', url: `/api/v1/projects/${otherProjectId}/tasks`, payload: { title: '他P' } })).json().task;
    const res = await app.inject({
      method: 'PATCH', url: `/api/v1/tasks/${myTask.id}`,
      payload: { parentId: otherTask.id },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('INVALID_PARENT');
  });

  it('POST: 存在しない parentId を指定すると 400', async () => {
    const res = await app.inject({
      method: 'POST', url: `/api/v1/projects/${projectId}/tasks`,
      payload: { title: '子', parentId: 'non-existent-uuid' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('INVALID_PARENT');
  });

  // ── マイルストーンへの子追加 ─────────────────────────
  it('POST: マイルストーンを parentId に指定すると 400', async () => {
    const ms = (await app.inject({ method: 'POST', url: `/api/v1/projects/${projectId}/tasks`, payload: { title: 'MS', isMilestone: true, startDate: '2026-06-01', endDate: '2026-06-01' } })).json().task;
    const res = await app.inject({
      method: 'POST', url: `/api/v1/projects/${projectId}/tasks`,
      payload: { title: '子', parentId: ms.id },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('MILESTONE_CANNOT_BE_PARENT');
  });

  it('PATCH: マイルストーンを parentId に指定すると 400', async () => {
    const ms   = (await app.inject({ method: 'POST', url: `/api/v1/projects/${projectId}/tasks`, payload: { title: 'MS', isMilestone: true, startDate: '2026-06-01', endDate: '2026-06-01' } })).json().task;
    const task = (await app.inject({ method: 'POST', url: `/api/v1/projects/${projectId}/tasks`, payload: { title: 'T' } })).json().task;
    const res = await app.inject({
      method: 'PATCH', url: `/api/v1/tasks/${task.id}`,
      payload: { parentId: ms.id },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('MILESTONE_CANNOT_BE_PARENT');
  });

  it('同プロジェクト内の通常タスクは parentId に指定できる（正常系）', async () => {
    const parent = (await app.inject({ method: 'POST', url: `/api/v1/projects/${projectId}/tasks`, payload: { title: '親' } })).json().task;
    const res = await app.inject({
      method: 'POST', url: `/api/v1/projects/${projectId}/tasks`,
      payload: { title: '子', parentId: parent.id },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().task.parentId).toBe(parent.id);
  });
});

describe('Tasks API — 削除WS通知の一括化（v2.66）', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let projectId: string;

  beforeEach(async () => {
    testDb = createTestDb();
    app = await buildApp();
    projectId = (await createProject(app, { name: 'WS Test Project' })).id;
  });

  afterEach(async () => {
    await app.close();
    testDb.close();
  });

  const createTask = (overrides = {}) =>
    createTaskIn(app, projectId, { title: 'WS Task', ...overrides });

  it('subtree 削除: 削除ID全件を含む tasks_deleted を1通だけ送る', async () => {
    const root = await createTask({ title: '親' });
    const c1 = await createTask({ title: '子1', parentId: root.id });
    const c2 = await createTask({ title: '子2', parentId: root.id });
    const gc = await createTask({ title: '孫', parentId: c1.id });

    vi.mocked(notifyRoom).mockClear();
    const res = await app.inject({ method: 'DELETE', url: `/api/v1/tasks/${root.id}` });
    expect(res.statusCode).toBe(204);

    const calls = vi.mocked(notifyRoom).mock.calls;
    const deletedMsgs = calls.filter(([, msg]) => (msg as { type: string }).type === 'tasks_deleted');
    const legacyMsgs  = calls.filter(([, msg]) => (msg as { type: string }).type === 'task_deleted');

    expect(legacyMsgs).toHaveLength(0);     // 旧形式は送らない
    expect(deletedMsgs).toHaveLength(1);    // 4件削除でも1通
    const ids = (deletedMsgs[0][1] as { ids: string[] }).ids;
    expect(new Set(ids)).toEqual(new Set([root.id, c1.id, c2.id, gc.id]));
    expect((deletedMsgs[0][1] as { projectId: string }).projectId).toBe(projectId);
  });

  it('single 削除: tasks_deleted（ids: [id]）と子の付け替え tasks_reordered を送る', async () => {
    const root = await createTask({ title: '親' });
    const child = await createTask({ title: '子', parentId: root.id });

    vi.mocked(notifyRoom).mockClear();
    const res = await app.inject({ method: 'DELETE', url: `/api/v1/tasks/${root.id}?mode=single` });
    expect(res.statusCode).toBe(204);

    const calls = vi.mocked(notifyRoom).mock.calls;
    const deletedMsgs   = calls.filter(([, msg]) => (msg as { type: string }).type === 'tasks_deleted');
    const reorderedMsgs = calls.filter(([, msg]) => (msg as { type: string }).type === 'tasks_reordered');

    expect(deletedMsgs).toHaveLength(1);
    expect((deletedMsgs[0][1] as { ids: string[] }).ids).toEqual([root.id]);
    expect(reorderedMsgs).toHaveLength(1);
    const orders = (reorderedMsgs[0][1] as { orders: { id: string }[] }).orders;
    expect(orders.map(o => o.id)).toContain(child.id);
  });

  describe('日付フィールドの形式検証（YYYY-MM-DD）', () => {
    const BAD = ['202610-10-21', '2026/10/21', '2026-1-5'];

    it.each(BAD)('POST で startDate=%s は 400', async (bad) => {
      const res = await app.inject({
        method: 'POST', url: `/api/v1/projects/${projectId}/tasks`,
        payload: { title: 'T', startDate: bad },
      });
      expect(res.statusCode).toBe(400);
    });

    it.each(BAD)('POST で endDate=%s は 400', async (bad) => {
      const res = await app.inject({
        method: 'POST', url: `/api/v1/projects/${projectId}/tasks`,
        payload: { title: 'T', endDate: bad },
      });
      expect(res.statusCode).toBe(400);
    });

    it.each(BAD)('PATCH で startDate/endDate=%s は 400', async (bad) => {
      const task = await createTask();
      for (const field of ['startDate', 'endDate']) {
        const res = await app.inject({
          method: 'PATCH', url: `/api/v1/tasks/${task.id}`,
          payload: { [field]: bad },
        });
        expect(res.statusCode).toBe(400);
      }
    });

    it('正しい YYYY-MM-DD と null は POST/PATCH とも成功する', async () => {
      const res = await app.inject({
        method: 'POST', url: `/api/v1/projects/${projectId}/tasks`,
        payload: { title: 'T', startDate: '2026-10-21', endDate: null },
      });
      expect(res.statusCode).toBe(201);
      const id = res.json().task?.id ?? res.json().id;
      const patch = await app.inject({
        method: 'PATCH', url: `/api/v1/tasks/${id}`,
        payload: { startDate: null, endDate: '2026-10-22' },
      });
      expect(patch.statusCode).toBe(200);
    });
  });
});
