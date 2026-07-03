import type { FastifyInstance } from 'fastify';
import { getSettings, updateSettings } from '../services/settingsService.js';

export async function settingsRoutes(fastify: FastifyInstance) {
  fastify.get('/settings', { schema: { tags: ['Settings'], summary: 'アプリ既定のリソース設定を取得' } }, async () => getSettings());

  fastify.put<{ Body: { capacityMinutesPerDay?: number; workingDays?: number[] } }>(
    '/settings',
    {
      schema: {
        tags: ['Settings'],
        summary: 'アプリ既定のリソース設定を部分更新',
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
