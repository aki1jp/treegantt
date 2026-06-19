-- Migration 010: app_settings key-value table (リソース設定のアプリ既定)
CREATE TABLE IF NOT EXISTS app_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
