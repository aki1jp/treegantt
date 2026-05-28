import Fastify from 'fastify';
import cors from '@fastify/cors';
import { authPlugin } from './plugins/auth.js';
import { healthRoutes } from './routes/health.js';
import { projectRoutes } from './routes/projects.js';
import { taskRoutes } from './routes/tasks.js';
import { importExportRoutes } from './routes/importExport.js';
import { wss } from './ws/wsRoom.js';
import { resolveApiPort } from './config.js';

const PORT = resolveApiPort();

const fastify = Fastify({ logger: true });

await fastify.register(cors, {
  origin: process.env.CORS_ORIGIN ?? '*',
});

await fastify.register(authPlugin);

const API_PREFIX = '/api/v1';
await fastify.register(healthRoutes);
await fastify.register(projectRoutes, { prefix: API_PREFIX });
await fastify.register(taskRoutes, { prefix: API_PREFIX });
await fastify.register(importExportRoutes, { prefix: API_PREFIX });

fastify.setErrorHandler((err, _req, reply) => {
  const statusCode = err.statusCode ?? 500;
  reply.code(statusCode).send({
    error: err.message,
    code: err.code ?? 'INTERNAL_ERROR',
  });
});

await fastify.listen({ port: PORT, host: '0.0.0.0' });
fastify.log.info(`API listening on port ${PORT}`);

wss.on('listening', () => {
  fastify.log.info(`WebSocket room server listening on port ${process.env.WS_PORT ?? 4001}`);
});
