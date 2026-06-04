-- Migration 006: Add title_color and title_bg_color columns
ALTER TABLE tasks ADD COLUMN title_color    TEXT DEFAULT NULL;
ALTER TABLE tasks ADD COLUMN title_bg_color TEXT DEFAULT NULL;
