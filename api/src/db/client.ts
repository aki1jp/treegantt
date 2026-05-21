import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH ?? join(__dirname, '../../data/taskflow.db');

export const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const migrationSql = readFileSync(
  join(__dirname, 'migrations/001_init.sql'),
  'utf-8'
);
db.exec(migrationSql);

try {
  const migration002 = readFileSync(
    join(__dirname, 'migrations/002_parent.sql'),
    'utf-8'
  );
  db.exec(migration002);
} catch {
  // duplicate column name — migration already applied
}
