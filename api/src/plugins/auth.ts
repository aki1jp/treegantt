import type { FastifyInstance } from 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    user: { id: string; name: string };
  }
}

export async function authPlugin(fastify: FastifyInstance) {
  if (process.env.LDAP_ENABLED !== 'true') {
    fastify.addHook('preHandler', async (req) => {
      req.user = { id: 'guest', name: 'Guest' };
    });
    return;
  }
  // Phase 2: LDAP認証をここに実装
}
