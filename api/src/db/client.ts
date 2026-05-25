import Database from 'better-sqlite3';
import { mkdirSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH ?? join(__dirname, '../../data/treegantt.db');

mkdirSync(dirname(dbPath), { recursive: true });

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

try {
  const migration003 = readFileSync(
    join(__dirname, 'migrations/003_milestone.sql'),
    'utf-8'
  );
  db.exec(migration003);
} catch {
  // duplicate column name — migration already applied
}
