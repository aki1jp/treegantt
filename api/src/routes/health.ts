import type { FastifyInstance } from 'fastify';
import { readFileSync } from 'fs';
import { db } from '../db/client.js';

// API バージョン: package.json を単一の出典にする。実行時に読み込み、
// 欠損時はフォールバック値を使う（dev=api/、prod=/app/ に package.json を配置）。
let API_VERSION = '0.0.0';
try {
  API_VERSION = (
    JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf-8')) as { version: string }
  ).version;
} catch { /* package.json 未配置時はフォールバック値を維持 */ }

export async function healthRoutes(fastify: FastifyInstance) {
  fastify.get('/health', async () => {
    db.prepare('SELECT 1').get();
    return { status: 'ok', version: API_VERSION, timestamp: new Date().toISOString() };
  });
}
