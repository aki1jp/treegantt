-- seq 永久欠番: MAX(seq)+1 採番では削除済み番号が再利用されるため、
-- プロジェクト単位の単調増加カウンターに変更する
ALTER TABLE projects ADD COLUMN next_seq INTEGER NOT NULL DEFAULT 1;

-- 既存プロジェクトは現在の最大 seq の次から開始
UPDATE projects SET next_seq = COALESCE((SELECT MAX(seq) FROM tasks WHERE project_id = projects.id), 0) + 1;
