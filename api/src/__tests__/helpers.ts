import Database from 'better-sqlite3';
import { readdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** インメモリSQLiteDBを作成してマイグレーションを適用する */
export function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  // 本番 db/client.ts と同じく、番号順（ファイル名昇順）で全マイグレーションを適用する
  const dir = join(__dirname, '../db/migrations');
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.sql')).sort()) {
    db.exec(readFileSync(join(dir, f), 'utf-8'));
  }
  return db;
}
