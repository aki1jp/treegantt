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

// Bootstrap: create migration tracking table before anything else
db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
  name       TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);

function runMigration(name: string, sql: string): void {
  if (db.prepare('SELECT 1 FROM _migrations WHERE name = ?').get(name)) return;
  try {
    db.exec(sql);
  } catch (e) {
    // "duplicate column name" means the migration was applied before tracking was introduced
    if (!(e instanceof Error) || !e.message.includes('duplicate column name')) throw e;
  }
  db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(name);
}

const migrationsDir = join(__dirname, 'migrations');
runMigration('001_init',    readFileSync(join(migrationsDir, '001_init.sql'),    'utf-8'));
runMigration('002_parent',  readFileSync(join(migrationsDir, '002_parent.sql'),  'utf-8'));
runMigration('003_milestone', readFileSync(join(migrationsDir, '003_milestone.sql'), 'utf-8'));
runMigration('004_seq',       readFileSync(join(migrationsDir, '004_seq.sql'),       'utf-8'));
runMigration('005_pending_status', readFileSync(join(migrationsDir, '005_pending_status.sql'), 'utf-8'));
runMigration('006_task_colors',    readFileSync(join(migrationsDir, '006_task_colors.sql'),    'utf-8'));
runMigration('007_project_color', readFileSync(join(migrationsDir, '007_project_color.sql'), 'utf-8'));
runMigration('008_next_seq',      readFileSync(join(migrationsDir, '008_next_seq.sql'),      'utf-8'));
runMigration('009_task_estimate', readFileSync(join(migrationsDir, '009_task_estimate.sql'), 'utf-8'));
runMigration('010_app_settings',  readFileSync(join(migrationsDir, '010_app_settings.sql'),  'utf-8'));
runMigration('011_project_resource_overrides', readFileSync(join(migrationsDir, '011_project_resource_overrides.sql'), 'utf-8'));
