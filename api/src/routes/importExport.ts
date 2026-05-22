import type { FastifyInstance } from 'fastify';
import { db } from '../db/client.js';
import { createTask, updateTask, listTasks } from '../services/taskService.js';
import { broadcast } from '../ws/broadcast.js';
import type { Task } from '../types/task.js';

const CSV_HEADERS = 'id,title,summary,description,status,priority,progress,assignee,startDate,endDate,predecessors';

function escapeCsv(val: string): string {
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

export async function importExportRoutes(fastify: FastifyInstance) {
  fastify.post<{ Params: { id: string }; Body: unknown }>(
    '/projects/:id/import',
    async (req, reply) => {
      const body = req.body as { version?: string; tasks?: Task[] };
      if (!body || !Array.isArray(body.tasks)) {
        return reply.code(400).send({ error: 'Invalid import format', code: 'INVALID_FORMAT' });
      }

      let imported = 0;
      for (const task of body.tasks) {
        const existing = db.prepare('SELECT id FROM tasks WHERE id = ?').get(task.id);
        if (existing) {
          updateTask(task.id, {
            title: task.title,
            summary: task.summary,
            description: task.description,
            status: task.status,
            priority: task.priority,
            progress: task.progress,
            assignee: task.assignee,
            startDate: task.startDate,
            endDate: task.endDate,
            predecessors: task.predecessors,
            order: task.order,
          });
        } else {
          createTask({
            id: task.id,
            projectId: req.params.id,
            title: task.title,
            summary: task.summary,
            description: task.description,
            status: task.status,
            priority: task.priority,
            progress: task.progress,
            assignee: task.assignee,
            startDate: task.startDate,
            endDate: task.endDate,
            predecessors: task.predecessors,
            order: task.order,
          });
        }
        imported++;
      }

      // 他のクライアントへリロード通知
      broadcast(req.params.id, { type: 'reload', projectId: req.params.id });

      return { imported };
    }
  );

  fastify.get<{ Params: { id: string } }>(
    '/projects/:id/export/json',
    async (req, reply) => {
      const project = db
        .prepare('SELECT * FROM projects WHERE id = ?')
        .get(req.params.id) as { id: string; name: string; created_at: string } | undefined;

      if (!project) {
        return reply.code(404).send({ error: 'Project not found', code: 'NOT_FOUND' });
      }

      const { tasks } = listTasks(req.params.id, { limit: 100000 });

      reply
        .header('Content-Type', 'application/json')
        .header('Content-Disposition', `attachment; filename="taskflow-export-${req.params.id}.json"`)
        .send({
          version: '1.1',
          exportedAt: new Date().toISOString(),
          project: { id: project.id, name: project.name },
          tasks,
        });
    }
  );

  fastify.get<{ Params: { id: string } }>(
    '/projects/:id/export/csv',
    async (req, reply) => {
      const project = db
        .prepare('SELECT id FROM projects WHERE id = ?')
        .get(req.params.id);

      if (!project) {
        return reply.code(404).send({ error: 'Project not found', code: 'NOT_FOUND' });
      }

      const { tasks } = listTasks(req.params.id, { limit: 100000 });

      const rows = tasks.map(t =>
        [
          t.id,
          t.title,
          t.summary,
          t.description,
          t.status,
          t.priority,
          String(t.progress),
          t.assignee,
          t.startDate ?? '',
          t.endDate ?? '',
          t.predecessors.join(';'),
        ]
          .map(escapeCsv)
          .join(',')
      );

      const csv = [CSV_HEADERS, ...rows].join('\n');

      reply
        .header('Content-Type', 'text/csv; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="taskflow-export-${req.params.id}.csv"`)
        .send(csv);
    }
  );
}
