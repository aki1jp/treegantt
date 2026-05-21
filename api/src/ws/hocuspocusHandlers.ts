import * as Y from 'yjs';
import type Database from 'better-sqlite3';

interface RawRow {
  id: string; project_id: string; parent_id: string | null;
  title: string; summary: string; description: string;
  status: string; priority: string; progress: number;
  assignee: string; start_date: string | null; end_date: string | null;
  ord: number; created_at: string; updated_at: string;
}

// @hocuspocus/extension-sqlite がバイナリ復元した後に呼ばれる。
// tasks テーブルにあってY.jsにないタスクだけを追加（マージ）する。
// バイナリが古い・部分的な場合でもDBのデータが必ず反映される。
export async function handleLoadDocument(
  document: Y.Doc,
  documentName: string,
  db: Database.Database,
): Promise<void> {
  const yTasks = document.getMap<Y.Map<unknown>>('tasks');

  const rows = db
    .prepare('SELECT * FROM tasks WHERE project_id = ? ORDER BY ord ASC')
    .all(documentName) as RawRow[];
  if (rows.length === 0) return;

  // DBにあってY.jsにないタスクのみを対象にする
  const missingRows = rows.filter(r => !yTasks.has(r.id));
  if (missingRows.length === 0) return;

  const ids = missingRows.map(r => r.id);
  const placeholders = ids.map(() => '?').join(',');
  const deps = db
    .prepare(`SELECT successor_id, predecessor_id FROM task_deps WHERE successor_id IN (${placeholders})`)
    .all(...ids) as { successor_id: string; predecessor_id: string }[];
  const predMap = new Map<string, string[]>();
  for (const d of deps) {
    const arr = predMap.get(d.successor_id) ?? [];
    arr.push(d.predecessor_id);
    predMap.set(d.successor_id, arr);
  }

  document.transact(() => {
    for (const row of missingRows) {
      const yTask = new Y.Map<unknown>();
      yTask.set('id',           row.id);
      yTask.set('projectId',    row.project_id);
      yTask.set('parentId',     row.parent_id ?? null);
      yTask.set('title',        row.title);
      yTask.set('summary',      row.summary);
      yTask.set('description',  row.description);
      yTask.set('status',       row.status);
      yTask.set('priority',     row.priority);
      yTask.set('progress',     row.progress);
      yTask.set('assignee',     row.assignee);
      yTask.set('startDate',    row.start_date ?? null);
      yTask.set('endDate',      row.end_date ?? null);
      yTask.set('order',        row.ord);
      yTask.set('predecessors', predMap.get(row.id) ?? []);
      yTask.set('createdAt',    row.created_at);
      yTask.set('updatedAt',    row.updated_at);
      yTasks.set(row.id, yTask);
    }
  });
}

// Y.js の変更を tasks テーブルに upsert する。
// 削除はしない — タスク削除は REST DELETE → syncToYjs が担う。
// （Y.js が古いバイナリから復元された状態で誤削除するのを防ぐ）
export async function handleStoreDocument(
  document: Y.Doc,
  documentName: string,
  db: Database.Database,
): Promise<void> {
  const yTasks = document.getMap<Y.Map<unknown>>('tasks');
  if (yTasks.size === 0) return;

  const rows: Array<{
    id: string; parentId: string | null;
    title: string; summary: string; description: string;
    status: string; priority: string; progress: number;
    assignee: string; startDate: string | null; endDate: string | null;
    order: number; createdAt: string; predecessors: string[];
  }> = [];

  yTasks.forEach((yTask, id) => {
    const t = Object.fromEntries(yTask.entries()) as Record<string, unknown>;
    rows.push({
      id,
      parentId:     (t.parentId     as string | null) ?? null,
      title:        (t.title        as string) ?? '',
      summary:      (t.summary      as string) ?? '',
      description:  (t.description  as string) ?? '',
      status:       (t.status       as string) ?? 'todo',
      priority:     (t.priority     as string) ?? 'medium',
      progress:     (t.progress     as number) ?? 0,
      assignee:     (t.assignee     as string) ?? '',
      startDate:    (t.startDate    as string | null) ?? null,
      endDate:      (t.endDate      as string | null) ?? null,
      order:        (t.order        as number) ?? 0,
      createdAt:    (t.createdAt    as string) ?? new Date().toISOString(),
      predecessors: (t.predecessors as string[]) ?? [],
    });
  });

  const upsert = db.prepare(`
    INSERT INTO tasks
      (id, project_id, parent_id, title, summary, description,
       status, priority, progress, assignee, start_date, end_date, ord, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      parent_id   = excluded.parent_id,
      title       = excluded.title,
      summary     = excluded.summary,
      description = excluded.description,
      status      = excluded.status,
      priority    = excluded.priority,
      progress    = excluded.progress,
      assignee    = excluded.assignee,
      start_date  = excluded.start_date,
      end_date    = excluded.end_date,
      ord         = excluded.ord
  `);
  const deleteDeps = db.prepare('DELETE FROM task_deps WHERE successor_id = ?');
  const insertDep  = db.prepare('INSERT OR IGNORE INTO task_deps (predecessor_id, successor_id) VALUES (?, ?)');

  db.transaction(() => {
    for (const row of rows) {
      upsert.run(
        row.id, documentName, row.parentId,
        row.title, row.summary, row.description,
        row.status, row.priority, row.progress, row.assignee,
        row.startDate, row.endDate, row.order, row.createdAt,
      );
      deleteDeps.run(row.id);
      for (const predId of row.predecessors) {
        insertDep.run(predId, row.id);
      }
    }
  })();
}
