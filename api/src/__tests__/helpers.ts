import Database from 'better-sqlite3';
import { readdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';

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

/** buildTestApp で登録するルート/プラグイン（指定したものだけ登録。登録順は固定） */
export interface TestAppOptions {
  /** @fastify/cors（既定オプション） */
  cors?: boolean;
  /** registerJsonBodyParser */
  jsonParser?: boolean;
  /** registerCompression */
  compression?: boolean;
  /** authPlugin */
  auth?: boolean;
  /** healthRoutes */
  health?: boolean;
  /** projectRoutes（/api/v1） */
  projects?: boolean;
  /** taskRoutes（/api/v1） */
  tasks?: boolean;
  /** importExportRoutes（/api/v1） */
  importExport?: boolean;
  /** settingsRoutes（/api/v1） */
  settings?: boolean;
}

/**
 * テスト用 Fastify を組み立てる。登録順: cors → jsonParser → compression → auth → health →
 * projects → tasks → importExport → settings。
 * ルート等は動的 import するため、呼び出し側テストファイルの
 * `vi.mock('../db/client.js')` / `vi.mock('../ws/wsRoom.js')`（hoist 済み）が適用される。
 */
export async function buildTestApp(opts: TestAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify();
  const prefix = { prefix: '/api/v1' };
  if (opts.cors) await app.register(cors);
  if (opts.jsonParser) (await import('../plugins/jsonParser.js')).registerJsonBodyParser(app);
  if (opts.compression) await (await import('../plugins/compression.js')).registerCompression(app);
  if (opts.auth) await app.register((await import('../plugins/auth.js')).authPlugin);
  if (opts.health) await app.register((await import('../routes/health.js')).healthRoutes);
  if (opts.projects) await app.register((await import('../routes/projects.js')).projectRoutes, prefix);
  if (opts.tasks) await app.register((await import('../routes/tasks.js')).taskRoutes, prefix);
  if (opts.importExport) await app.register((await import('../routes/importExport.js')).importExportRoutes, prefix);
  if (opts.settings) await app.register((await import('../routes/settings.js')).settingsRoutes, prefix);
  await app.ready();
  return app;
}
