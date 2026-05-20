import type { FastifyInstance } from 'fastify';
import { db } from '../db/client.js';

export async function healthRoutes(fastify: FastifyInstance) {
  fastify.get('/health', async () => {
    db.prepare('SELECT 1').get();
    return { status: 'ok', timestamp: new Date().toISOString() };
  });
}
