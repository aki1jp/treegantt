import type { FastifyInstance } from 'fastify';
import { getSettings, updateSettings } from '../services/settingsService.js';

export async function settingsRoutes(fastify: FastifyInstance) {
  fastify.get('/settings', async () => getSettings());

  fastify.put<{ Body: { capacityMinutesPerDay?: number; workingDays?: number[] } }>(
    '/settings',
    {
      schema: {
        body: {
          type: 'object',
          properties: {
            capacityMinutesPerDay: { type: 'number', minimum: 1 },
            workingDays: {
              type: 'array',
              items: { type: 'integer', minimum: 0, maximum: 6 },
            },
          },
        },
      },
      async handler(req) {
        return updateSettings({
          capacityMinutesPerDay: req.body.capacityMinutesPerDay,
          workingDays: req.body.workingDays,
        });
      },
    }
  );
}
