import type { FastifyInstance } from 'fastify';
import { listProjects, createProject, renameProject, deleteProject } from '../services/projectService.js';

export async function projectRoutes(fastify: FastifyInstance) {
  fastify.get('/projects', async () => {
    return { projects: listProjects() };
  });

  fastify.post<{ Body: { name: string } }>('/projects', {
    schema: {
      body: {
        type: 'object',
        required: ['name'],
        properties: { name: { type: 'string', minLength: 1, maxLength: 200 } },
      },
    },
    async handler(req, reply) {
      reply.code(201).send({ project: createProject(req.body.name) });
    },
  });

  fastify.patch<{ Params: { id: string }; Body: { name: string } }>('/projects/:id', {
    schema: {
      body: {
        type: 'object',
        required: ['name'],
        properties: { name: { type: 'string', minLength: 1, maxLength: 200 } },
      },
    },
    async handler(req, reply) {
      const project = renameProject(req.params.id, req.body.name);
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
