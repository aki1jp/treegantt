-- Migration 011: per-project resource setting overrides (null=アプリ既定を継承)
ALTER TABLE projects ADD COLUMN capacity_minutes_per_day INTEGER DEFAULT NULL;
ALTER TABLE projects ADD COLUMN working_days TEXT DEFAULT NULL; -- JSON 配列
