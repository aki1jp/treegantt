import type { FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/client.js';
import { listTasks, propagateDatesToParent } from '../services/taskService.js';
import { getProject } from '../services/projectService.js';
import { notifyRoom } from '../ws/wsRoom.js';

const CSV_HEADERS = 'id,parentId,title,summary,description,status,priority,progress,assignee,startDate,endDate,isMilestone,predecessors';

function escapeCsv(val: string): string {
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

const VALID_STATUSES   = new Set(['todo', 'wip', 'done', 'wait']);
const VALID_PRIORITIES = new Set(['critical', 'high', 'medium', 'low']);

function toStatus(v: unknown): string {
  const s = String(v ?? '');
  return VALID_STATUSES.has(s) ? s : 'todo';
}
function toPriority(v: unknown): string {
  const s = String(v ?? '');
  return VALID_PRIORITIES.has(s) ? s : 'medium';
}
function toProgress(v: unknown): number {
  const n = Number(v);
  return isNaN(n) ? 0 : Math.max(0, Math.min(100, Math.round(n)));
}
function toStr(v: unknown): string {
  return v == null ? '' : String(v);
}
function toNullableStr(v: unknown): string | null {
  return v == null || v === '' ? null : String(v);
}

export async function importExportRoutes(fastify: FastifyInstance) {
  fastify.post<{ Params: { id: string }; Body: unknown }>(
    '/projects/:id/import',
    async (req, reply) => {
      const body = req.body as { tasks?: unknown; mode?: unknown };
      if (!body || !Array.isArray(body.tasks)) {
        return reply.code(400).send({ error: 'Invalid import format', code: 'INVALID_FORMAT' });
      }

      const projectId = req.params.id;
      const project = getProject(projectId);
      if (!project) {
        return reply.code(404).send({ error: 'Project not found', code: 'NOT_FOUND' });
      }

      const isRestore = body.mode === 'restore';
      const inputTasks = body.tasks as Array<Record<string, unknown>>;

      // restore モード: 既存タスクを全削除（task_deps は CASCADE で自動削除）
      if (isRestore) {
        db.prepare('DELETE FROM tasks WHERE project_id = ?').run(projectId);
      }

      // Step 0: 既存の最大 ord を取得（追記用オフセット）
      const maxOrd = isRestore ? 0 : (
        db.prepare('SELECT COALESCE(MAX(ord), 0) AS m FROM tasks WHERE project_id = ?')
          .get(projectId) as { m: number }
      ).m;

      // Step 1: 全タスクに新 UUID を割り当て、oldId → newId マッピングを構築
      const idMap = new Map<string, string>();
      const newIds: string[] = inputTasks.map(task => {
        const newId = uuidv4();
        const oldId = typeof task.id === 'string' && task.id ? task.id : null;
        if (oldId) idMap.set(oldId, newId);
        return newId;
      });

      const doImport = db.transaction(() => {
        // Pass 1: 全タスクを parent_id=NULL でINSERT（FK 順序問題を回避）
        const insertTask = db.prepare(`
          INSERT INTO tasks
            (id, project_id, parent_id, title, summary, description,
             status, priority, progress, assignee, start_date, end_date, is_milestone, ord)
          VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        inputTasks.forEach((task, i) => {
          insertTask.run(
            newIds[i],
            projectId,
            toStr(task.title),
            toStr(task.summary),
            toStr(task.description),
            toStatus(task.status),
            toPriority(task.priority),
            toProgress(task.progress),
            toStr(task.assignee),
            toNullableStr(task.startDate),
            toNullableStr(task.endDate),
            task.isMilestone ? 1 : 0,
            maxOrd + i + 1,
          );
        });

        // Pass 2: parent_id をリマップして UPDATE（バッチ外 ID は null 扱い）
        const setParent = db.prepare('UPDATE tasks SET parent_id = ? WHERE id = ?');
        inputTasks.forEach((task, i) => {
          const oldParentId = typeof task.parentId === 'string' ? task.parentId : null;
          const newParentId = oldParentId ? (idMap.get(oldParentId) ?? null) : null;
          if (newParentId) setParent.run(newParentId, newIds[i]);
        });

        // Pass 3: predecessors をリマップして task_deps に INSERT（バッチ外 ID は除外）
        const insertDep = db.prepare(
          'INSERT OR IGNORE INTO task_deps (predecessor_id, successor_id) VALUES (?, ?)'
        );
        inputTasks.forEach((task, i) => {
          const preds = Array.isArray(task.predecessors) ? task.predecessors : [];
          for (const oldPredId of preds) {
            if (typeof oldPredId !== 'string') continue;
            const newPredId = idMap.get(oldPredId);
            if (newPredId) insertDep.run(newPredId, newIds[i]);
          }
        });

        // Pass 4: 親を持つタスクの日付を上位に伝播
        inputTasks.forEach((task, i) => {
          const oldParentId = typeof task.parentId === 'string' ? task.parentId : null;
          if (oldParentId && idMap.has(oldParentId)) {
            propagateDatesToParent(newIds[i]);
          }
        });

        return inputTasks.length;
      });

      const imported = doImport();
      notifyRoom(projectId, { type: 'reload', projectId });
      return { imported };
    }
  );

  fastify.get<{ Params: { id: string } }>(
    '/projects/:id/export/json',
    async (req, reply) => {
      const project = getProject(req.params.id);

      if (!project) {
        return reply.code(404).send({ error: 'Project not found', code: 'NOT_FOUND' });
      }

      const { tasks } = listTasks(req.params.id, { limit: 100000 });

      reply
        .header('Content-Type', 'application/json')
        .header('Content-Disposition', `attachment; filename="treegantt-export-${req.params.id}.json"`)
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
      const project = getProject(req.params.id);

      if (!project) {
        return reply.code(404).send({ error: 'Project not found', code: 'NOT_FOUND' });
      }

      const { tasks } = listTasks(req.params.id, { limit: 100000 });

      const orderMap = new Map(tasks.map(t => [t.id, t.order]));
      const rows = tasks.map(t =>
        [
          String(t.order),
          t.parentId != null ? String(orderMap.get(t.parentId) ?? '') : '',
          t.title,
          t.summary,
          t.description,
          t.status,
          t.priority,
          String(t.progress),
          t.assignee,
          t.startDate ?? '',
          t.endDate ?? '',
          t.isMilestone ? '1' : '0',
          t.predecessors.map(p => orderMap.get(p)).filter(v => v != null).join(';'),
        ]
          .map(escapeCsv)
          .join(',')
      );

      const csv = [CSV_HEADERS, ...rows].join('\n');

      reply
        .header('Content-Type', 'text/csv; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="treegantt-export-${req.params.id}.csv"`)
        .send(csv);
    }
  );
}
