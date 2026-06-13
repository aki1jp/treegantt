import type { FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import {
  listTasks,
  getTask,
  createTask,
  updateTask,
  deleteTaskSubtree,
  deleteTaskKeepChildren,
  reorderTasks,
  wouldCreateCycle,
  batchCreateTasks,
  type BatchTaskInput,
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
  titleColor:   { type: ['string', 'null'] },
  titleBgColor: { type: ['string', 'null'] },
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
        reorderTasks(req.body.orders);
        notifyRoom(req.params.id, { type: 'tasks_reordered', projectId: req.params.id, orders: req.body.orders });
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
          titleColor:   req.body.titleColor   as string | null | undefined,
          titleBgColor: req.body.titleBgColor as string | null | undefined,
        });
        if (!task) return reply.code(404).send({ error: 'Task not found', code: 'NOT_FOUND' });
        notifyRoom(task.projectId, { type: 'task_updated', projectId: task.projectId, task });
        return { task };
      },
    }
  );

  fastify.delete<{ Params: { id: string }; Querystring: { mode?: 'subtree' | 'single' } }>(
    '/tasks/:id',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: { mode: { type: 'string', enum: ['subtree', 'single'] } },
        },
      },
    },
    async (req, reply) => {
      const task = getTask(req.params.id);
      if (!task) return reply.code(404).send({ error: 'Task not found', code: 'NOT_FOUND' });

      // 削除通知は ids 配列の tasks_deleted 1通に一括（v2.66。N件削除で N通→1通）
      if (req.query.mode === 'single') {
        // 本体のみ削除: 直下の子を祖父母に付け替え
        const reparented = deleteTaskKeepChildren(req.params.id);
        if (reparented.length > 0) {
          notifyRoom(task.projectId, { type: 'tasks_reordered', projectId: task.projectId, orders: reparented });
        }
        notifyRoom(task.projectId, { type: 'tasks_deleted', projectId: task.projectId, ids: [req.params.id] });
      } else {
        // デフォルト: 子孫ごと削除
        const deletedIds = deleteTaskSubtree(req.params.id);
        if (deletedIds.length > 0) {
          notifyRoom(task.projectId, { type: 'tasks_deleted', projectId: task.projectId, ids: deletedIds });
        }
      }
      reply.code(204).send();
    },
  );

  // サブツリー一括作成（v2.69）
  // コピー操作でシーケンシャル POST を避け1リクエストで完結させる。
  // parentRef はリクエスト配列内のインデックスで親子関係を指定する。
  fastify.post<{
    Params: { id: string };
    Body: { parentId: string | null; tasks: BatchTaskInput[] };
  }>(
    '/projects/:id/tasks/batch',
    {
      schema: {
        body: {
          type: 'object',
          required: ['tasks'],
          properties: {
            parentId: { type: ['string', 'null'] },
            tasks: {
              type: 'array',
              minItems: 1,
              items: {
                type: 'object',
                required: ['title'],
                properties: {
                  parentRef:    { type: ['number', 'null'] },
                  title:        { type: 'string', minLength: 1, maxLength: 200 },
                  summary:      { type: 'string' },
                  description:  { type: 'string' },
                  status:       { type: 'string' },
                  priority:     { type: 'string' },
                  progress:     { type: 'number' },
                  assignee:     { type: 'string' },
                  startDate:    { type: ['string', 'null'] },
                  endDate:      { type: ['string', 'null'] },
                  isMilestone:  { type: 'boolean' },
                  order:        { type: 'number' },
                  titleColor:   { type: ['string', 'null'] },
                  titleBgColor: { type: ['string', 'null'] },
                },
              },
            },
          },
        },
      },
    },
    async (req, reply) => {
      const { id: projectId } = req.params;
      const { parentId = null, tasks: inputs } = req.body;

      // parentRef の範囲チェック
      for (let i = 0; i < inputs.length; i++) {
        const ref = inputs[i].parentRef;
        if (ref !== null && ref !== undefined && (ref < 0 || ref >= i)) {
          return reply.code(400).send({ error: `tasks[${i}].parentRef=${ref} is out of range`, code: 'INVALID_PARENT_REF' });
        }
      }

      const tasks = batchCreateTasks(projectId, parentId, inputs);
      notifyRoom(projectId, { type: 'tasks_created', projectId, tasks });
      return reply.code(201).send({ tasks });
    },
  );
}
