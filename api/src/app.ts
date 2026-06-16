import Fastify from 'fastify';
import type { FastifyInstance, FastifyError } from 'fastify';
import cors from '@fastify/cors';
import { corsOptions } from './plugins/cors.js';
import { registerJsonBodyParser } from './plugins/jsonParser.js';
import { registerCompression } from './plugins/compression.js';
import { authPlugin } from './plugins/auth.js';
import { healthRoutes } from './routes/health.js';
import { projectRoutes } from './routes/projects.js';
import { taskRoutes } from './routes/tasks.js';
import { importExportRoutes } from './routes/importExport.js';

const API_PREFIX = '/api/v1';

/**
 * 本番と同一の配線で Fastify アプリを構築する。
 * index.ts（本番起動）とテスト（app.test.ts）で共有し、
 * cors/compression/auth/ルート/エラーハンドラの配線をテスト可能にする。
 */
export async function buildApp(opts: { logger?: boolean } = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: opts.logger ?? false });

  await app.register(cors, corsOptions);
  registerJsonBodyParser(app);
  await registerCompression(app);
  await app.register(authPlugin);

  await app.register(healthRoutes);
  await app.register(projectRoutes, { prefix: API_PREFIX });
  await app.register(taskRoutes, { prefix: API_PREFIX });
  await app.register(importExportRoutes, { prefix: API_PREFIX });

  app.setErrorHandler((err: FastifyError, _req, reply) => {
    const statusCode = err.statusCode ?? 500;
    reply.code(statusCode).send({
      error: err.message,
      code: err.code ?? 'INTERNAL_ERROR',
    });
  });

  return app;
}
