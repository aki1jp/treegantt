import type { FastifyInstance } from 'fastify';
import { getProject } from '../services/projectService.js';
import { getTask, getTaskSubtrees } from '../services/taskService.js';
import { listRefs, addRef, removeRef } from '../services/refService.js';

export async function refRoutes(fastify: FastifyInstance) {
  fastify.get<{ Params: { id: string } }>(
    '/projects/:id/refs',
    {
      schema: {
        tags: ['Refs'],
        summary: 'クロスプロジェクト参照一覧（ハイドレート済みタスク・参照先プロジェクト情報つき）',
      },
    },
    async (req, reply) => {
      if (!getProject(req.params.id)) {
        return reply.code(404).send({ error: 'Project not found', code: 'NOT_FOUND' });
      }

      const refs = listRefs(req.params.id);
      const tasks = getTaskSubtrees(refs.map(r => r.refTaskId));

      const projectIds = [...new Set(tasks.map(t => t.projectId))];
      const projects = projectIds
        .map(pid => getProject(pid))
        .filter((p): p is NonNullable<ReturnType<typeof getProject>> => p !== null)
        .map(p => ({ id: p.id, name: p.name, color: p.color }));

      return { refs, tasks, projects };
    }
  );

  fastify.post<{ Params: { id: string }; Body: { refTaskId: string } }>(
    '/projects/:id/refs',
    {
      schema: {
        tags: ['Refs'],
        summary: '参照追加（冪等。自プロジェクトのタスク参照は SELF_REF で拒否）',
        body: {
          type: 'object',
          required: ['refTaskId'],
          properties: { refTaskId: { type: 'string' } },
        },
      },
      async handler(req, reply) {
        if (!getProject(req.params.id)) {
          return reply.code(404).send({ error: 'Project not found', code: 'NOT_FOUND' });
        }

        const { refTaskId } = req.body;
        const refTask = getTask(refTaskId);
        if (!refTask) {
          return reply.code(400).send({ error: 'Invalid refTaskId', code: 'INVALID_REF_TASK' });
        }
        if (refTask.projectId === req.params.id) {
          return reply.code(400).send({ error: 'Cannot reference a task in the same project', code: 'SELF_REF' });
        }

        const { ref, created } = addRef(req.params.id, refTaskId);
        reply.code(created ? 201 : 200).send({ ref });
      },
    }
  );

  fastify.delete<{ Params: { id: string; refTaskId: string } }>(
    '/projects/:id/refs/:refTaskId',
    {
      schema: {
        tags: ['Refs'],
        summary: '参照解除（跨ぎ依存＝task_deps は削除しない。再参照で矢印復活）',
      },
    },
    async (req, reply) => {
      const deleted = removeRef(req.params.id, req.params.refTaskId);
      if (!deleted) {
        return reply.code(404).send({ error: 'Ref not found', code: 'NOT_FOUND' });
      }
      reply.code(204).send();
    }
  );
}
