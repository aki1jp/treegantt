import { db } from '../db/client.js';
import type { Task, TaskWithSuccessors } from '../types/task.js';

interface RawTask {
  id: string;
  project_id: string;
  parent_id: string | null;
  title: string;
  summary: string;
  description: string;
  status: string;
  priority: string;
  progress: number;
  assignee: string;
  start_date: string | null;
  end_date: string | null;
  is_milestone: number;
  seq: number;
  ord: number;
  created_at: string;
  updated_at: string;
}

function rawToTask(row: RawTask): Task {
  return {
    id: row.id,
    projectId: row.project_id,
    parentId: row.parent_id ?? null,
    title: row.title,
    summary: row.summary,
    description: row.description,
    status: row.status as Task['status'],
    priority: row.priority as Task['priority'],
    progress: row.progress,
    assignee: row.assignee,
    startDate: row.start_date,
    endDate: row.end_date,
    isMilestone: row.is_milestone === 1,
    seq: row.seq,
    order: row.ord,
    predecessors: [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function attachDeps(tasks: Task[]): TaskWithSuccessors[] {
  const ids = tasks.map(t => t.id);
  if (ids.length === 0) return [];

  const placeholders = ids.map(() => '?').join(',');
  const predecessorRows = db
    .prepare(
      `SELECT successor_id, predecessor_id FROM task_deps WHERE successor_id IN (${placeholders})`
    )
    .all(...ids) as { successor_id: string; predecessor_id: string }[];

  const successorRows = db
    .prepare(
      `SELECT predecessor_id, successor_id FROM task_deps WHERE predecessor_id IN (${placeholders})`
    )
    .all(...ids) as { predecessor_id: string; successor_id: string }[];

  const predMap = new Map<string, string[]>();
  const succMap = new Map<string, string[]>();

  for (const r of predecessorRows) {
    const arr = predMap.get(r.successor_id) ?? [];
    arr.push(r.predecessor_id);
    predMap.set(r.successor_id, arr);
  }
  for (const r of successorRows) {
    const arr = succMap.get(r.predecessor_id) ?? [];
    arr.push(r.successor_id);
    succMap.set(r.predecessor_id, arr);
  }

  return tasks.map(t => ({
    ...t,
    predecessors: predMap.get(t.id) ?? [],
    successors: succMap.get(t.id) ?? [],
  }));
}

export interface TaskListQuery {
  status?: string;
  assignee?: string;
  priority?: string;
  limit?: number;
  offset?: number;
}

export function listTasks(
  projectId: string,
  query: TaskListQuery
): { tasks: TaskWithSuccessors[]; total: number } {
  const conditions: string[] = ['project_id = ?'];
  const params: unknown[] = [projectId];

  if (query.status) {
    conditions.push('status = ?');
    params.push(query.status);
  }
  if (query.assignee) {
    conditions.push('assignee LIKE ?');
    params.push(`%${query.assignee}%`);
  }
  if (query.priority) {
    conditions.push('priority = ?');
    params.push(query.priority);
  }

  const where = conditions.join(' AND ');
  const total = (
    db.prepare(`SELECT COUNT(*) as cnt FROM tasks WHERE ${where}`).get(...params) as { cnt: number }
  ).cnt;

  const limit = query.limit ?? 500;
  const offset = query.offset ?? 0;

  const rows = db
    .prepare(`SELECT * FROM tasks WHERE ${where} ORDER BY ord ASC LIMIT ? OFFSET ?`)
    .all(...params, limit, offset) as RawTask[];

  const tasks = rows.map(rawToTask);
  return { tasks: attachDeps(tasks), total };
}

export function getTask(id: string): TaskWithSuccessors | null {
  const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as RawTask | undefined;
  if (!row) return null;
  return attachDeps([rawToTask(row)])[0];
}

export interface CreateTaskInput {
  id: string;
  projectId: string;
  parentId?: string | null;
  title: string;
  summary?: string;
  description?: string;
  status?: string;
  priority?: string;
  progress?: number;
  assignee?: string;
  startDate?: string | null;
  endDate?: string | null;
  isMilestone?: boolean;
  predecessors?: string[];
  order?: number;
}

export function createTask(input: CreateTaskInput): TaskWithSuccessors {
  const { m: maxOrd, s: maxSeq } = (
    db
      .prepare('SELECT COALESCE(MAX(ord), 0) as m, COALESCE(MAX(seq), 0) as s FROM tasks WHERE project_id = ?')
      .get(input.projectId) as { m: number; s: number }
  );

  db.prepare(
    `INSERT INTO tasks (id, project_id, parent_id, title, summary, description, status, priority, progress, assignee, start_date, end_date, is_milestone, ord, seq)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    input.id,
    input.projectId,
    input.parentId ?? null,
    input.title,
    input.summary ?? '',
    input.description ?? '',
    input.status ?? 'todo',
    input.priority ?? 'medium',
    input.progress ?? 0,
    input.assignee ?? '',
    input.startDate ?? null,
    input.endDate ?? null,
    input.isMilestone ? 1 : 0,
    input.order ?? maxOrd + 1,
    maxSeq + 1
  );

  if (input.predecessors?.length) {
    const insertDep = db.prepare(
      'INSERT OR IGNORE INTO task_deps (predecessor_id, successor_id) VALUES (?, ?)'
    );
    for (const predId of input.predecessors) {
      insertDep.run(predId, input.id);
    }
  }

  if (input.startDate !== undefined || input.endDate !== undefined) {
    propagateDatesToParent(input.id);
  }

  return getTask(input.id)!;
}

export type UpdateTaskInput = Partial<Omit<CreateTaskInput, 'id' | 'projectId'>>;

type ColEntry = [keyof UpdateTaskInput, string, ((v: unknown) => unknown)?];
const COLUMN_MAP: ColEntry[] = [
  ['parentId',    'parent_id'],
  ['title',       'title'],
  ['summary',     'summary'],
  ['description', 'description'],
  ['status',      'status'],
  ['priority',    'priority'],
  ['progress',    'progress'],
  ['assignee',    'assignee'],
  ['startDate',   'start_date'],
  ['endDate',     'end_date'],
  ['isMilestone', 'is_milestone', (v) => v ? 1 : 0],
  ['order',       'ord'],
];

export function updateTask(id: string, input: UpdateTaskInput): TaskWithSuccessors | null {
  const row = db.prepare('SELECT id FROM tasks WHERE id = ?').get(id);
  if (!row) return null;

  const fields: string[] = [];
  const params: unknown[] = [];
  for (const [key, col, transform] of COLUMN_MAP) {
    if (input[key] !== undefined) {
      fields.push(`${col} = ?`);
      params.push(transform ? transform(input[key]) : input[key]);
    }
  }

  if (fields.length > 0) {
    db.prepare(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`).run(...params, id);
  }

  if (input.predecessors !== undefined) {
    db.prepare('DELETE FROM task_deps WHERE successor_id = ?').run(id);
    const insertDep = db.prepare(
      'INSERT OR IGNORE INTO task_deps (predecessor_id, successor_id) VALUES (?, ?)'
    );
    for (const predId of input.predecessors) {
      insertDep.run(predId, id);
    }
  }

  if (input.startDate !== undefined || input.endDate !== undefined) {
    propagateDatesToParent(id);
  }

  return getTask(id);
}

function recalcParentDates(parentId: string): void {
  const children = db.prepare(
    'SELECT start_date, end_date FROM tasks WHERE parent_id = ? AND is_milestone = 0'
  ).all(parentId) as { start_date: string | null; end_date: string | null }[];

  const starts = children.map(c => c.start_date).filter((d): d is string => d != null);
  const ends   = children.map(c => c.end_date).filter((d): d is string => d != null);
  if (starts.length === 0 && ends.length === 0) return;

  const minStart = starts.length > 0 ? [...starts].sort()[0] : null;
  const maxEnd   = ends.length > 0   ? [...ends].sort().at(-1)! : null;

  const fields: string[] = [];
  const params: unknown[] = [];
  if (minStart !== null) { fields.push('start_date = ?'); params.push(minStart); }
  if (maxEnd   !== null) { fields.push('end_date = ?');   params.push(maxEnd); }

  if (fields.length > 0) {
    db.prepare(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`).run(...params, parentId);
    propagateDatesToParent(parentId);
  }
}

export function propagateDatesToParent(taskId: string): void {
  const row = db.prepare('SELECT parent_id FROM tasks WHERE id = ?').get(taskId) as { parent_id: string | null } | undefined;
  if (!row?.parent_id) return;
  recalcParentDates(row.parent_id);
}

export function getAncestorTasks(taskId: string): TaskWithSuccessors[] {
  const ancestors: TaskWithSuccessors[] = [];
  let current = taskId;
  const visited = new Set<string>();
  while (true) {
    if (visited.has(current)) break;
    visited.add(current);
    const row = db.prepare('SELECT parent_id FROM tasks WHERE id = ?').get(current) as { parent_id: string | null } | undefined;
    if (!row?.parent_id) break;
    const parent = getTask(row.parent_id);
    if (!parent) break;
    ancestors.push(parent);
    current = row.parent_id;
  }
  return ancestors;
}

export function deleteTask(id: string): boolean {
  const result = db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
  return result.changes > 0;
}

export function wouldCreateCycle(taskId: string, newParentId: string): boolean {
  let current: string | null = newParentId;
  const visited = new Set<string>();
  while (current) {
    if (current === taskId) return true;
    if (visited.has(current)) break;
    visited.add(current);
    const row = db.prepare('SELECT parent_id FROM tasks WHERE id = ?').get(current) as { parent_id: string | null } | undefined;
    if (!row) break;
    current = row.parent_id;
  }
  return false;
}

export function reorderTasks(orders: { id: string; order: number; parentId?: string | null }[]): Set<string> {
  const updateOrd    = db.prepare('UPDATE tasks SET ord = ? WHERE id = ?');
  const updateParent = db.prepare('UPDATE tasks SET parent_id = ? WHERE id = ?');
  const getParentId  = db.prepare<[string], { parent_id: string | null }>('SELECT parent_id FROM tasks WHERE id = ?');

  // parentId が変わるタスクの旧親を記録
  const oldParentIds = new Set<string>();
  const newParentIds = new Set<string>();
  for (const { id, parentId } of orders) {
    if (parentId !== undefined) {
      const row = getParentId.get(id);
      const oldParentId = row?.parent_id ?? null;
      if (oldParentId !== (parentId ?? null)) {
        if (oldParentId) oldParentIds.add(oldParentId);
        if (parentId)    newParentIds.add(parentId);
      }
    }
  }

  db.transaction(() => {
    for (const { id, order, parentId } of orders) {
      updateOrd.run(order, id);
      if (parentId !== undefined) updateParent.run(parentId ?? null, id);
    }
  })();

  // 新旧両親の日付を再計算して伝播
  const affectedParentIds = new Set([...oldParentIds, ...newParentIds]);
  for (const parentId of affectedParentIds) {
    recalcParentDates(parentId);
  }

  return affectedParentIds;
}
