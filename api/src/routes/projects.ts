import type { FastifyInstance } from 'fastify';
import { listProjects, createProject, updateProject, deleteProject } from '../services/projectService.js';

export async function projectRoutes(fastify: FastifyInstance) {
  fastify.get('/projects', async () => {
    return { projects: listProjects() };
  });

  fastify.post<{ Body: { name: string; color?: string | null } }>('/projects', {
    schema: {
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

  fastify.patch<{ Params: { id: string }; Body: { name?: string; color?: string | null } }>('/projects/:id', {
    schema: {
      body: {
        type: 'object',
        properties: {
          name:  { type: 'string', minLength: 1, maxLength: 200 },
          color: { type: ['string', 'null'] },
        },
      },
    },
    async handler(req, reply) {
      const project = updateProject(req.params.id, req.body);
      if (!project) return reply.code(404).send({ error: 'Project not found', code: 'NOT_FOUND' });
      return { project };
    },
  });

  fastify.delete<{ Params: { id: string } }>('/projects/:id', async (req, reply) => {
    if (!deleteProject(req.params.id)) {
      return reply.code(404).send({ error: 'Project not found', code: 'NOT_FOUND' });
    }
    reply.code(204).send();
  });
}
