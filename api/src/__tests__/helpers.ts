import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** インメモリSQLiteDBを作成してマイグレーションを適用する */
export function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  const sql001 = readFileSync(join(__dirname, '../db/migrations/001_init.sql'), 'utf-8');
  db.exec(sql001);
  const sql002 = readFileSync(join(__dirname, '../db/migrations/002_parent.sql'), 'utf-8');
  db.exec(sql002);
  const sql003 = readFileSync(join(__dirname, '../db/migrations/003_milestone.sql'), 'utf-8');
  db.exec(sql003);
  const sql004 = readFileSync(join(__dirname, '../db/migrations/004_seq.sql'), 'utf-8');
  db.exec(sql004);
  const sql005 = readFileSync(join(__dirname, '../db/migrations/005_pending_status.sql'), 'utf-8');
  db.exec(sql005);
  const sql006 = readFileSync(join(__dirname, '../db/migrations/006_task_colors.sql'), 'utf-8');
  db.exec(sql006);
  const sql007 = readFileSync(join(__dirname, '../db/migrations/007_project_color.sql'), 'utf-8');
  db.exec(sql007);
  const sql008 = readFileSync(join(__dirname, '../db/migrations/008_next_seq.sql'), 'utf-8');
  db.exec(sql008);
  return db;
}
