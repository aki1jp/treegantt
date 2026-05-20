import type { FastifyInstance } from 'fastify';
import { db } from '../db/client.js';
import { v4 as uuidv4 } from 'uuid';

interface RawProject {
  id: string;
  name: string;
  created_at: string;
}

function rawToProject(row: RawProject) {
  return { id: row.id, name: row.name, createdAt: row.created_at };
}

export async function projectRoutes(fastify: FastifyInstance) {
  fastify.get('/projects', async () => {
    const rows = db.prepare('SELECT * FROM projects ORDER BY created_at DESC').all() as RawProject[];
    return { projects: rows.map(rawToProject) };
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
      const id = uuidv4();
      db.prepare('INSERT INTO projects (id, name) VALUES (?, ?)').run(id, req.body.name);
      const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as RawProject;
      reply.code(201).send({ project: rawToProject(row) });
    },
  });

  fastify.delete<{ Params: { id: string } }>('/projects/:id', async (req, reply) => {
    const result = db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);
    if (result.changes === 0) {
      return reply.code(404).send({ error: 'Project not found', code: 'NOT_FOUND' });
    }
    reply.code(204).send();
  });
}
