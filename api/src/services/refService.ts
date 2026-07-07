import { db } from '../db/client.js';
import type { TaskRef } from '../types/task.js';

interface RawTaskRef {
  project_id:  string;
  ref_task_id: string;
  created_at:  string;
}

function rawToRef(row: RawTaskRef): TaskRef {
  return { projectId: row.project_id, refTaskId: row.ref_task_id, createdAt: row.created_at };
}

/** projectId が持つ参照一覧（追加順） */
export function listRefs(projectId: string): TaskRef[] {
  const rows = db
    .prepare('SELECT * FROM task_refs WHERE project_id = ? ORDER BY created_at ASC')
    .all(projectId) as RawTaskRef[];
  return rows.map(rawToRef);
}

/** 冪等追加。既に同じペアが存在する場合は既存行を返し created=false とする */
export function addRef(projectId: string, refTaskId: string): { ref: TaskRef; created: boolean } {
  const existing = db
    .prepare('SELECT * FROM task_refs WHERE project_id = ? AND ref_task_id = ?')
    .get(projectId, refTaskId) as RawTaskRef | undefined;
  if (existing) return { ref: rawToRef(existing), created: false };

  const row = db
    .prepare('INSERT INTO task_refs (project_id, ref_task_id) VALUES (?, ?) RETURNING *')
    .get(projectId, refTaskId) as RawTaskRef;
  return { ref: rawToRef(row), created: true };
}

/** 参照解除。task_deps（跨ぎ依存）は削除しない（§5.8 の仕様） */
export function removeRef(projectId: string, refTaskId: string): boolean {
  return db
    .prepare('DELETE FROM task_refs WHERE project_id = ? AND ref_task_id = ?')
    .run(projectId, refTaskId).changes > 0;
}
