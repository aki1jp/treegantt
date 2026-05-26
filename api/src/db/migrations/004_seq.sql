-- 不変の作成順 ID（# 列表示用）。並び替えで変わる ord とは別管理。
ALTER TABLE tasks ADD COLUMN seq INTEGER NOT NULL DEFAULT 0;

-- 既存行は ord 値をそのまま seq として引き継ぐ
UPDATE tasks SET seq = ord;
