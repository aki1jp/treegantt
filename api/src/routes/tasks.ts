import type { FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import {
  listTasks,
  getTask,
  createTask,
  updateTask,
  deleteTask,
  reorderTasks,
  wouldCreateCycle,
  getAncestorTasks,
} from '../services/taskService.js';
import { notifyRoom } from '../ws/wsRoom.js';

const TASK_BODY_PROPERTIES = {
  parentId:     { type: ['string', 'null'] },
  title:        { type: 'string', minLength: 1, maxLength: 200 },
  summary:      { type: 'string' },
  description:  { type: 'string' },
  status:       { type: 'string', enum: ['todo', 'wip', 'done', 'wait', 'pending'] },
  priority:     { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
  progress:     { type: 'number', minimum: 0, maximum: 100 },
  assignee:     { type: 'string' },
  startDate:    { type: ['string', 'null'] },
  endDate:      { type: ['string', 'null'] },
  isMilestone:  { type: 'boolean' },
  predecessors: { type: 'array', items: { type: 'string' } },
} as const;

export async function taskRoutes(fastify: FastifyInstance) {
  fastify.get<{
    Params: { id: string };
    Querystring: { status?: string; assignee?: string; priority?: string; limit?: string; offset?: string };
  }>('/projects/:id/tasks', async (req) => {
    const { status, assignee, priority, limit, offset } = req.query;
    return listTasks(req.params.id, {
      status,
      assignee,
      priority,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  });

  fastify.post<{ Params: { id: string }; Body: Record<string, unknown> }>(
    '/projects/:id/tasks',
    {
      schema: {
        body: {
          type: 'object',
          required: ['title'],
          properties: TASK_BODY_PROPERTIES,
        },
      },
      async handler(req, reply) {
        const parentId = req.body.parentId as string | null | undefined;
        if (parentId) {
          const parent = getTask(parentId);
          if (!parent || parent.projectId !== req.params.id)
            return reply.code(400).send({ error: 'Invalid parentId', code: 'INVALID_PARENT' });
          if (parent.isMilestone)
            return reply.code(400).send({ error: 'Milestone cannot be a parent', code: 'MILESTONE_CANNOT_BE_PARENT' });
        }
        const task = createTask({
          id: uuidv4(),
          projectId: req.params.id,
          parentId,
          title:       req.body.title       as string,
          summary:     req.body.summary     as string | undefined,
          description: req.body.description as string | undefined,
          status:      req.body.status      as string | undefined,
          priority:    req.body.priority    as string | undefined,
          progress:    req.body.progress    as number | undefined,
          assignee:    req.body.assignee    as string | undefined,
          startDate:   req.body.startDate   as string | null | undefined,
          endDate:     req.body.endDate     as string | null | undefined,
          isMilestone: req.body.isMilestone as boolean | undefined,
          predecessors: req.body.predecessors as string[] | undefined,
        });
        notifyRoom(req.params.id, { type: 'task_created', projectId: req.params.id, task });
        reply.code(201).send({ task });
      },
    }
  );

  fastify.patch<{ Params: { id: string }; Body: { orders: { id: string; order: number; parentId?: string | null }[] } }>(
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
                  id:       { type: 'string' },
                  order:    { type: 'number' },
                  parentId: { type: ['string', 'null'] },
                },
              },
            },
          },
        },
      },
      async handler(req) {
        const affectedParentIds = reorderTasks(req.body.orders);
        notifyRoom(req.params.id, { type: 'tasks_reordered', projectId: req.params.id, orders: req.body.orders });
        for (const parentId of affectedParentIds) {
          const parent = getTask(parentId);
          if (parent) notifyRoom(req.params.id, { type: 'task_updated', projectId: req.params.id, task: parent });
        }
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
          properties: { ...TASK_BODY_PROPERTIES, order: { type: 'number' } },
        },
      },
      async handler(req, reply) {
        if (typeof req.body.parentId === 'string') {
          if (req.body.parentId === req.params.id ||
              wouldCreateCycle(req.params.id, req.body.parentId)) {
            return reply.code(400).send({ error: 'Circular parentId detected', code: 'CYCLE_DETECTED' });
          }
          const currentTask = getTask(req.params.id);
          const parent = getTask(req.body.parentId);
          if (!parent || (currentTask && parent.projectId !== currentTask.projectId))
            return reply.code(400).send({ error: 'Invalid parentId', code: 'INVALID_PARENT' });
          if (parent.isMilestone)
            return reply.code(400).send({ error: 'Milestone cannot be a parent', code: 'MILESTONE_CANNOT_BE_PARENT' });
        }
        const task = updateTask(req.params.id, {
          parentId:     req.body.parentId     as string | null | undefined,
          title:        req.body.title        as string | undefined,
          summary:      req.body.summary      as string | undefined,
          description:  req.body.description  as string | undefined,
          status:       req.body.status       as string | undefined,
          priority:     req.body.priority     as string | undefined,
          progress:     req.body.progress     as number | undefined,
          assignee:     req.body.assignee     as string | undefined,
          startDate:    req.body.startDate    as string | null | undefined,
          endDate:      req.body.endDate      as string | null | undefined,
          isMilestone:  req.body.isMilestone  as boolean | undefined,
          predecessors: req.body.predecessors as string[] | undefined,
          order:        req.body.order        as number | undefined,
        });
        if (!task) return reply.code(404).send({ error: 'Task not found', code: 'NOT_FOUND' });
        notifyRoom(task.projectId, { type: 'task_updated', projectId: task.projectId, task });
        if (req.body.startDate !== undefined || req.body.endDate !== undefined) {
          for (const ancestor of getAncestorTasks(req.params.id)) {
            notifyRoom(ancestor.projectId, { type: 'task_updated', projectId: ancestor.projectId, task: ancestor });
          }
        }
        return { task };
      },
    }
  );

  fastify.delete<{ Params: { id: string } }>('/tasks/:id', async (req, reply) => {
    const task = getTask(req.params.id);
    if (!task) return reply.code(404).send({ error: 'Task not found', code: 'NOT_FOUND' });
    deleteTask(req.params.id);
    notifyRoom(task.projectId, { type: 'task_deleted', projectId: task.projectId, id: req.params.id });
    reply.code(204).send();
  });
}
