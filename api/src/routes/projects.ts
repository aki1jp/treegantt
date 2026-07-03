import type { FastifyInstance } from 'fastify';
import { listProjects, createProject, updateProject, deleteProject } from '../services/projectService.js';

export async function projectRoutes(fastify: FastifyInstance) {
  fastify.get('/projects', { schema: { tags: ['Projects'], summary: 'プロジェクト一覧' } }, async () => {
    return { projects: listProjects() };
  });

  fastify.post<{ Body: { name: string; color?: string | null } }>('/projects', {
    schema: {
      tags: ['Projects'],
      summary: 'プロジェクト作成',
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name:  { type: 'string', minLength: 1, maxLength: 200 },
          color: { type: ['string', 'null'] },
        },
      },
    },
    async handler(req, reply) {
      reply.code(201).send({ project: createProject(req.body.name, req.body.color) });
    },
  });

  fastify.patch<{
    Params: { id: string };
    Body: { name?: string; color?: string | null; capacityMinutesPerDay?: number | null; workingDays?: number[] | null };
  }>('/projects/:id', {
    schema: {
      tags: ['Projects'],
      summary: 'プロジェクト更新',
      body: {
        type: 'object',
        properties: {
          name:  { type: 'string', minLength: 1, maxLength: 200 },
          color: { type: ['string', 'null'] },
          capacityMinutesPerDay: { type: ['number', 'null'], minimum: 1 },
          workingDays: {
            type: ['array', 'null'],
            items: { type: 'integer', minimum: 0, maximum: 6 },
          },
        },
      },
    },
    async handler(req, reply) {
      const project = updateProject(req.params.id, req.body);
      if (!project) return reply.code(404).send({ error: 'Project not found', code: 'NOT_FOUND' });
      return { project };
    },
  });

  fastify.delete<{ Params: { id: string } }>('/projects/:id', { schema: { tags: ['Projects'], summary: 'プロジェクト削除' } }, async (req, reply) => {
    if (!deleteProject(req.params.id)) {
      return reply.code(404).send({ error: 'Project not found', code: 'NOT_FOUND' });
    }
    reply.code(204).send();
  });
}
