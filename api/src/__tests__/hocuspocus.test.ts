import { describe, it, expect, beforeEach } from 'vitest';
import * as Y from 'yjs';
import Database from 'better-sqlite3';
import { createTestDb } from './helpers.js';
import { handleLoadDocument, handleStoreDocument } from '../ws/hocuspocusHandlers.js';

const PROJECT_ID = 'proj-hocus-1';

let testDb: Database.Database;

function seed() {
  testDb.prepare('INSERT INTO projects (id, name) VALUES (?, ?)').run(PROJECT_ID, 'Test Project');
}

function insertTask(id: string, title: string, ord = 0) {
  testDb.prepare(
    `INSERT INTO tasks (id, project_id, title, ord, created_at)
     VALUES (?, ?, ?, ?, '2026-01-01T00:00:00Z')`,
  ).run(id, PROJECT_ID, title, ord);
}

function makeDoc(): { doc: Y.Doc; yTasks: Y.Map<Y.Map<unknown>> } {
  const doc = new Y.Doc();
  return { doc, yTasks: doc.getMap<Y.Map<unknown>>('tasks') };
}

function addTaskToYjs(yTasks: Y.Map<Y.Map<unknown>>, id: string, title: string) {
  const yTask = new Y.Map<unknown>();
  yTask.set('id', id);
  yTask.set('title', title);
  yTask.set('projectId', PROJECT_ID);
  yTask.set('parentId', null);
  yTask.set('summary', '');
  yTask.set('description', '');
  yTask.set('status', 'todo');
  yTask.set('priority', 'medium');
  yTask.set('progress', 0);
  yTask.set('assignee', '');
  yTask.set('startDate', null);
  yTask.set('endDate', null);
  yTask.set('order', 0);
  yTask.set('createdAt', '2026-01-01T00:00:00Z');
  yTask.set('predecessors', []);
  yTasks.set(id, yTask);
}

// ─── handleLoadDocument ────────────────────────────────────────────────────

describe('handleLoadDocument', () => {
  beforeEach(() => {
    testDb = createTestDb();
    seed();
  });

  it('DBが空の場合、Y.jsにタスクを追加しない', async () => {
    const { doc, yTasks } = makeDoc();
    await handleLoadDocument(doc, PROJECT_ID, testDb);
    expect(yTasks.size).toBe(0);
  });

  it('Y.jsが空の場合、DBの全タスクを追加する（初回ロード）', async () => {
    insertTask('t1', 'Task 1', 0);
    insertTask('t2', 'Task 2', 1);
    const { doc, yTasks } = makeDoc();

    await handleLoadDocument(doc, PROJECT_ID, testDb);

    expect(yTasks.size).toBe(2);
    expect((yTasks.get('t1') as Y.Map<unknown>).get('title')).toBe('Task 1');
    expect((yTasks.get('t2') as Y.Map<unknown>).get('title')).toBe('Task 2');
  });

  it('フィールドマッピングが正しい（camelCase変換）', async () => {
    testDb.prepare(
      `INSERT INTO tasks (id, project_id, title, summary, description, status, priority, progress,
       assignee, start_date, end_date, ord, created_at)
       VALUES ('t-full', ?, 'Full', 'S', 'D', 'wip', 'high', 60, '山田', '2026-03-01', '2026-03-31', 5, '2026-01-01T00:00:00Z')`,
    ).run(PROJECT_ID);
    const { doc, yTasks } = makeDoc();
    await handleLoadDocument(doc, PROJECT_ID, testDb);

    const m = yTasks.get('t-full') as Y.Map<unknown>;
    expect(m.get('projectId')).toBe(PROJECT_ID);
    expect(m.get('summary')).toBe('S');
    expect(m.get('status')).toBe('wip');
    expect(m.get('priority')).toBe('high');
    expect(m.get('progress')).toBe(60);
    expect(m.get('assignee')).toBe('山田');
    expect(m.get('startDate')).toBe('2026-03-01');
    expect(m.get('endDate')).toBe('2026-03-31');
    expect(m.get('order')).toBe(5);
  });

  // ── 回帰テスト ────────────────────────────────────────────────────────────

  it('【回帰】Y.jsに既存タスクがある状態でDBに新タスクがある場合、新タスクのみ追加する', async () => {
    // 古いバイナリが復元された状態: Y.jsにはtask-oldのみ
    // DBにはtask-oldとtask-new両方ある（task-newはY.jsバイナリ作成後に追加）
    insertTask('task-old', 'Old Task', 0);
    insertTask('task-new', 'New Task', 1);

    const { doc, yTasks } = makeDoc();
    doc.transact(() => { addTaskToYjs(yTasks, 'task-old', 'Old Task'); });

    await handleLoadDocument(doc, PROJECT_ID, testDb);

    expect(yTasks.size).toBe(2);
    expect(yTasks.has('task-old')).toBe(true);
    expect(yTasks.has('task-new')).toBe(true);
  });

  it('【回帰】Y.jsに全タスクが存在する場合、何も追加しない', async () => {
    insertTask('t1', 'Task 1', 0);
    const { doc, yTasks } = makeDoc();
    doc.transact(() => { addTaskToYjs(yTasks, 't1', 'Task 1'); });

    await handleLoadDocument(doc, PROJECT_ID, testDb);

    expect(yTasks.size).toBe(1);
  });

  it('既存Y.jsタスクのフィールドをDB値で上書きしない（CRDT優先）', async () => {
    insertTask('t1', 'DB Title', 0);
    const { doc, yTasks } = makeDoc();
    doc.transact(() => { addTaskToYjs(yTasks, 't1', 'YJS Title'); });

    await handleLoadDocument(doc, PROJECT_ID, testDb);

    // t1はY.jsに既にあるのでスキップ → YJS Titleのまま
    expect((yTasks.get('t1') as Y.Map<unknown>).get('title')).toBe('YJS Title');
  });

  it('predecessors（依存関係）を正しく読み込む', async () => {
    insertTask('pred', 'Predecessor', 0);
    insertTask('succ', 'Successor', 1);
    testDb.prepare(
      'INSERT INTO task_deps (predecessor_id, successor_id) VALUES (?, ?)',
    ).run('pred', 'succ');
    const { doc, yTasks } = makeDoc();

    await handleLoadDocument(doc, PROJECT_ID, testDb);

    const succMap = yTasks.get('succ') as Y.Map<unknown>;
    expect(succMap.get('predecessors')).toEqual(['pred']);
    const predMap = yTasks.get('pred') as Y.Map<unknown>;
    expect(predMap.get('predecessors')).toEqual([]);
  });
});

// ─── handleStoreDocument ───────────────────────────────────────────────────

describe('handleStoreDocument', () => {
  beforeEach(() => {
    testDb = createTestDb();
    seed();
  });

  it('Y.jsが空の場合、DBに何も書き込まない', async () => {
    const { doc } = makeDoc();
    await handleStoreDocument(doc, PROJECT_ID, testDb);
    const rows = testDb.prepare('SELECT * FROM tasks WHERE project_id = ?').all(PROJECT_ID);
    expect(rows).toHaveLength(0);
  });

  it('Y.jsのタスクをDBにupsertする', async () => {
    const { doc, yTasks } = makeDoc();
    doc.transact(() => { addTaskToYjs(yTasks, 't1', 'My Task'); });
    const m = yTasks.get('t1') as Y.Map<unknown>;
    m.set('status', 'wip');
    m.set('priority', 'high');
    m.set('progress', 50);
    m.set('assignee', '山田');

    await handleStoreDocument(doc, PROJECT_ID, testDb);

    const row = testDb.prepare('SELECT * FROM tasks WHERE id = ?').get('t1') as Record<string, unknown>;
    expect(row).toBeTruthy();
    expect(row.title).toBe('My Task');
    expect(row.status).toBe('wip');
    expect(row.priority).toBe('high');
    expect(row.progress).toBe(50);
    expect(row.assignee).toBe('山田');
    expect(row.project_id).toBe(PROJECT_ID);
  });

  it('既存DBレコードを上書き（upsert）する', async () => {
    insertTask('t1', 'Original', 0);
    const { doc, yTasks } = makeDoc();
    doc.transact(() => { addTaskToYjs(yTasks, 't1', 'Updated'); });

    await handleStoreDocument(doc, PROJECT_ID, testDb);

    const row = testDb.prepare('SELECT * FROM tasks WHERE id = ?').get('t1') as Record<string, unknown>;
    expect(row.title).toBe('Updated');
  });

  // ── 回帰テスト ────────────────────────────────────────────────────────────

  it('【回帰】Y.jsに存在しないDBタスクを削除しない（古いバイナリによる誤削除を防ぐ）', async () => {
    // DBには2つのタスクがある
    insertTask('task-a', 'Task A', 0);
    insertTask('task-b', 'Task B', 1);

    // Y.jsには古いバイナリ由来でtask-aのみ（task-bはバイナリに含まれていない）
    const { doc, yTasks } = makeDoc();
    doc.transact(() => { addTaskToYjs(yTasks, 'task-a', 'Task A'); });

    await handleStoreDocument(doc, PROJECT_ID, testDb);

    // task-bはY.jsにないが、DBから削除されてはいけない
    const taskB = testDb.prepare('SELECT * FROM tasks WHERE id = ?').get('task-b');
    expect(taskB).toBeTruthy();

    // task-aはupsertされている
    const taskA = testDb.prepare('SELECT * FROM tasks WHERE id = ?').get('task-a');
    expect(taskA).toBeTruthy();
  });

  it('predecessorsをtask_depsテーブルに同期する', async () => {
    insertTask('pred', 'Predecessor', 0);
    insertTask('succ', 'Successor', 1);

    const { doc, yTasks } = makeDoc();
    doc.transact(() => {
      addTaskToYjs(yTasks, 'pred', 'Predecessor');
      addTaskToYjs(yTasks, 'succ', 'Successor');
      (yTasks.get('succ') as Y.Map<unknown>).set('predecessors', ['pred']);
    });

    await handleStoreDocument(doc, PROJECT_ID, testDb);

    const dep = testDb.prepare(
      'SELECT * FROM task_deps WHERE successor_id = ?',
    ).get('succ') as Record<string, string>;
    expect(dep).toBeTruthy();
    expect(dep.predecessor_id).toBe('pred');
  });

  it('predecessors変更時に古いtask_depsを置き換える', async () => {
    insertTask('p1', 'P1', 0);
    insertTask('p2', 'P2', 1);
    insertTask('succ', 'Succ', 2);
    testDb.prepare('INSERT INTO task_deps (predecessor_id, successor_id) VALUES (?, ?)').run('p1', 'succ');

    const { doc, yTasks } = makeDoc();
    doc.transact(() => {
      addTaskToYjs(yTasks, 'p1', 'P1');
      addTaskToYjs(yTasks, 'p2', 'P2');
      addTaskToYjs(yTasks, 'succ', 'Succ');
      (yTasks.get('succ') as Y.Map<unknown>).set('predecessors', ['p2']); // p1→p2に変更
    });

    await handleStoreDocument(doc, PROJECT_ID, testDb);

    const deps = testDb.prepare(
      'SELECT * FROM task_deps WHERE successor_id = ?',
    ).all('succ') as Array<Record<string, string>>;
    expect(deps).toHaveLength(1);
    expect(deps[0].predecessor_id).toBe('p2'); // p1は削除され、p2だけ
  });
});
