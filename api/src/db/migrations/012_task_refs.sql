-- Migration 012: クロスプロジェクトのタスク参照（読み取り専用）
-- project_id = 参照する側のプロジェクト、ref_task_id = 参照先タスク（通常は他プロジェクトのタスク）
CREATE TABLE IF NOT EXISTS task_refs (
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  ref_task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (project_id, ref_task_id)
);

-- 参照先タスク削除時の ON DELETE CASCADE を効率的に辿るための逆引き index
CREATE INDEX IF NOT EXISTS idx_task_refs_task ON task_refs(ref_task_id);
