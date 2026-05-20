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
  const sql = readFileSync(join(__dirname, '../db/migrations/001_init.sql'), 'utf-8');
  db.exec(sql);
  return db;
}
