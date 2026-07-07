import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { FastifyInstance } from 'fastify';
import { readFileSync } from 'fs';

// API バージョン: package.json を単一の出典にする（routes/health.ts と同じ方式）。
let API_VERSION = '0.0.0';
try {
  API_VERSION = (
    JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf-8')) as { version: string }
  ).version;
} catch { /* package.json 未配置時はフォールバック値を維持 */ }

export async function registerSwagger(fastify: FastifyInstance): Promise<void> {
  await fastify.register(swagger, {
    openapi: {
      info: {
        title: 'TreeGantt API',
        description: 'TreeGantt の REST API 仕様（WebSocket リアルタイム同期は対象外。設計書 docs/treegantt_design.md §6 を参照）。',
        version: API_VERSION,
      },
      tags: [
        { name: 'Health', description: '稼働確認' },
        { name: 'Projects', description: 'プロジェクトの CRUD' },
        { name: 'Tasks', description: 'タスクの CRUD・並び替え・一括作成' },
        { name: 'Refs', description: 'クロスプロジェクトのタスク参照（読み取り専用）' },
        { name: 'ImportExport', description: 'タスクの一括インポート・エクスポート' },
        { name: 'Settings', description: 'アプリ既定のリソース設定' },
      ],
    },
  });

  await fastify.register(swaggerUi, {
    routePrefix: '/docs',
  });
}
