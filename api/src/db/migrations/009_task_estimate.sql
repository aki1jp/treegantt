-- Migration 009: Add estimate_minutes column (予定工数＝分, null=未設定)
ALTER TABLE tasks ADD COLUMN estimate_minutes INTEGER DEFAULT NULL;
