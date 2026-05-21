import * as Y from 'yjs';
import type { FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import {
  listTasks,
  getTask,
  createTask,
  updateTask,
  deleteTask,
  reorderTasks,
} from '../services/taskService.js';
import { hocuspocus } from '../ws/hocuspocus.js';
import type { Task } from '../types/task.js';

// Y.js ドキュメントを直接更新するヘルパー。
// 接続中クライアントがいない場合も openDirectConnection は動作するが、
// テスト環境等でエラーになってもDB更新は完了済みのため握りつぶす。
async function syncToYjs(
  projectId: string,
  fn: (yTasks: Y.Map<Y.Map<unknown>>) => void,
): Promise<void> {
  try {
    const conn = await hocuspocus.openDirectConnection(projectId, {});
    await conn.transact(doc => fn(doc.getMap<Y.Map<unknown>>('tasks')));
    await conn.disconnect();
  } catch {
    // Y.js 同期失敗は致命的ではない（次回接続時に onLoadDocument で復元）
  }
}

export async function taskRoutes(fastify: FastifyInstance) {
  fastify.get<{
    Params: { id: string };
    Querystring: { status?: string; assignee?: string; priority?: string; limit?: string; offset?: string };
  }>('/projects/:id/tasks', async (req, reply) => {
    const { status, assignee, priority, limit, offset } = req.query;
    const result = listTasks(req.params.id, {
      status,
      assignee,
      priority,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
    return result;
  });

  fastify.post<{ Params: { id: string }; Body: Record<string, unknown> }>(
    '/projects/:id/tasks',
    {
      schema: {
        body: {
          type: 'object',
          required: ['title'],
          properties: {
            parentId:     { type: ['string', 'null'] },
            title:        { type: 'string', minLength: 1, maxLength: 200 },
            summary:      { type: 'string' },
            description:  { type: 'string' },
            status:       { type: 'string', enum: ['todo', 'wip', 'done', 'wait'] },
            priority:     { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
            progress:     { type: 'number', minimum: 0, maximum: 100 },
            assignee:     { type: 'string' },
            startDate:    { type: ['string', 'null'] },
            endDate:      { type: ['string', 'null'] },
            predecessors: { type: 'array', items: { type: 'string' } },
          },
        },
      },
      async handler(req, reply) {
        const task = createTask({
          id: uuidv4(),
          projectId: req.params.id,
          parentId: req.body.parentId as string | null | undefined,
          title: req.body.title as string,
          summary: req.body.summary as string | undefined,
          description: req.body.description as string | undefined,
          status: req.body.status as string | undefined,
          priority: req.body.priority as string | undefined,
          progress: req.body.progress as number | undefined,
          assignee: req.body.assignee as string | undefined,
          startDate: req.body.startDate as string | null | undefined,
          endDate: req.body.endDate as string | null | undefined,
          predecessors: req.body.predecessors as string[] | undefined,
        });
        await syncToYjs(req.params.id, yTasks => {
          const yTask = new Y.Map<unknown>();
          for (const [k, v] of Object.entries(task as unknown as Task)) yTask.set(k, v);
          yTasks.set(task.id, yTask);
        });
        reply.code(201).send({ task });
      },
    }
  );

  fastify.patch<{ Params: { id: string }; Body: { orders: { id: string; order: number }[] } }>(
    '/projects/:id/tasks/reorder',
    {
      schema: {
        body: {
          type: 'object',
          required: ['orders'],
          properties: {
            orders: {
              type: 'array',
              items: {
                type: 'object',
                required: ['id', 'order'],
                properties: {
                  id:    { type: 'string' },
                  order: { type: 'number' },
                },
              },
            },
          },
        },
      },
      async handler(req) {
        reorderTasks(req.body.orders);
        await syncToYjs(req.params.id, yTasks => {
          for (const { id, order } of req.body.orders) {
            yTasks.get(id)?.set('order', order);
          }
        });
        return { ok: true };
      },
    }
  );

  fastify.get<{ Params: { id: string } }>('/tasks/:id', async (req, reply) => {
    const task = getTask(req.params.id);
    if (!task) return reply.code(404).send({ error: 'Task not found', code: 'NOT_FOUND' });
    return { task };
  });

  fastify.patch<{ Params: { id: string }; Body: Record<string, unknown> }>(
    '/tasks/:id',
    {
      schema: {
        body: {
          type: 'object',
          properties: {
            parentId:     { type: ['string', 'null'] },
            title:        { type: 'string', minLength: 1, maxLength: 200 },
            summary:      { type: 'string' },
            description:  { type: 'string' },
            status:       { type: 'string', enum: ['todo', 'wip', 'done', 'wait'] },
            priority:     { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
            progress:     { type: 'number', minimum: 0, maximum: 100 },
            assignee:     { type: 'string' },
            startDate:    { type: ['string', 'null'] },
            endDate:      { type: ['string', 'null'] },
            predecessors: { type: 'array', items: { type: 'string' } },
            order:        { type: 'number' },
          },
        },
      },
      async handler(req, reply) {
        const task = updateTask(req.params.id, {
          parentId:     req.body.parentId as string | null | undefined,
          title:        req.body.title as string | undefined,
          summary:      req.body.summary as string | undefined,
          description:  req.body.description as string | undefined,
          status:       req.body.status as string | undefined,
          priority:     req.body.priority as string | undefined,
          progress:     req.body.progress as number | undefined,
          assignee:     req.body.assignee as string | undefined,
          startDate:    req.body.startDate as string | null | undefined,
          endDate:      req.body.endDate as string | null | undefined,
          predecessors: req.body.predecessors as string[] | undefined,
          order:        req.body.order as number | undefined,
        });
        if (!task) return reply.code(404).send({ error: 'Task not found', code: 'NOT_FOUND' });
        await syncToYjs(task.projectId, yTasks => {
          const yTask = yTasks.get(task.id);
          if (yTask) {
            for (const [k, v] of Object.entries(task as unknown as Task)) yTask.set(k, v);
          } else {
            const newYTask = new Y.Map<unknown>();
            for (const [k, v] of Object.entries(task as unknown as Task)) newYTask.set(k, v);
            yTasks.set(task.id, newYTask);
          }
        });
        return { task };
      },
    }
  );

  fastify.delete<{ Params: { id: string } }>('/tasks/:id', async (req, reply) => {
    const task = getTask(req.params.id);
    if (!task) return reply.code(404).send({ error: 'Task not found', code: 'NOT_FOUND' });
    deleteTask(req.params.id);
    await syncToYjs(task.projectId, yTasks => { yTasks.delete(req.params.id); });
    reply.code(204).send();
  });
}
