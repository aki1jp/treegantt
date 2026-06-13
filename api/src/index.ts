import { buildApp } from './app.js';
import { wss } from './ws/wsRoom.js';
import { resolveApiPort } from './config.js';

const PORT = resolveApiPort();

const fastify = await buildApp({ logger: true });

await fastify.listen({ port: PORT, host: '0.0.0.0' });
fastify.log.info(`API listening on port ${PORT}`);

wss.on('listening', () => {
  fastify.log.info(`WebSocket room server listening on port ${process.env.WS_PORT ?? 4001}`);
});
