import { v4 as uuidv4 } from 'uuid';
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
  title_color:    string | null;
  title_bg_color: string | null;
  estimate_minutes: number | null;
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
    isMilestone:  row.is_milestone === 1,
    seq:          row.seq,
    order:        row.ord,
    titleColor:   row.title_color   ?? null,
    titleBgColor: row.title_bg_color ?? null,
    estimateMinutes: row.estimate_minutes ?? null,
    predecessors: [],
    createdAt:    row.created_at,
    updatedAt:    row.updated_at,
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
  titleColor?:   string | null;
  titleBgColor?: string | null;
  estimateMinutes?: number | null;
}

export function createTask(input: CreateTaskInput): TaskWithSuccessors {
  const { m: maxOrd } = (
    db
      .prepare('SELECT COALESCE(MAX(ord), 0) as m FROM tasks WHERE project_id = ?')
      .get(input.projectId) as { m: number }
  );

  db.transaction(() => {
    // seq は projects.next_seq カウンターから採番（削除済み番号は永久欠番）
    const { next_seq: seq } = db
      .prepare('SELECT next_seq FROM projects WHERE id = ?')
      .get(input.projectId) as { next_seq: number };
    db.prepare('UPDATE projects SET next_seq = next_seq + 1 WHERE id = ?').run(input.projectId);

    db.prepare(
      `INSERT INTO tasks (id, project_id, parent_id, title, summary, description, status, priority, progress, assignee, start_date, end_date, is_milestone, ord, seq, estimate_minutes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
      seq,
      input.estimateMinutes ?? null
    );

    if (input.predecessors?.length) {
      insertPredecessors(input.id, input.predecessors);
    }
  })();

  return getTask(input.id)!;
}

// 存在する先行タスクのみ task_deps に挿入する。
// 存在しないID（削除済みタスクへの幽霊参照など）は SELECT で自然にスキップされる（1文バッチ）
function insertPredecessors(successorId: string, predecessors: string[]): void {
  if (predecessors.length === 0) return;
  const placeholders = predecessors.map(() => '?').join(',');
  db.prepare(
    `INSERT OR IGNORE INTO task_deps (predecessor_id, successor_id)
     SELECT id, ? FROM tasks WHERE id IN (${placeholders})`
  ).run(successorId, ...predecessors);
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
  ['titleColor',   'title_color'],
  ['titleBgColor', 'title_bg_color'],
  ['estimateMinutes', 'estimate_minutes'],
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
    insertPredecessors(id, input.predecessors);
  }

  return getTask(id);
}


export function getAncestorTasks(taskId: string): TaskWithSuccessors[] {
  // 親IDだけを軽量クエリで辿って収集し、本体＋依存は最後に一括取得する
  // （従来は1階層ごとに getTask（依存取得2クエリ付き）を呼んでいた）
  const getParent = db.prepare('SELECT parent_id FROM tasks WHERE id = ?');
  const ancestorIds: string[] = [];
  let current = taskId;
  const visited = new Set<string>();
  while (true) {
    if (visited.has(current)) break;
    visited.add(current);
    const row = getParent.get(current) as { parent_id: string | null } | undefined;
    if (!row?.parent_id) break;
    ancestorIds.push(row.parent_id);
    current = row.parent_id;
  }
  if (ancestorIds.length === 0) return [];

  const placeholders = ancestorIds.map(() => '?').join(',');
  const rows = db
    .prepare(`SELECT * FROM tasks WHERE id IN (${placeholders})`)
    .all(...ancestorIds) as RawTask[];
  const byId = new Map(rows.map(r => [r.id, r]));
  // 近い親から順（収集順）を維持
  const ordered = ancestorIds
    .map(id => byId.get(id))
    .filter((r): r is RawTask => r !== undefined)
    .map(rawToTask);
  return attachDeps(ordered);
}

export function deleteTask(id: string): boolean {
  const result = db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
  return result.changes > 0;
}

/** タスクと全子孫をトランザクションで削除し、削除したID一覧を返す */
export function deleteTaskSubtree(id: string): string[] {
  const exists = db.prepare('SELECT id FROM tasks WHERE id = ?').get(id);
  if (!exists) return [];

  // 子孫IDを再帰CTE 1クエリで収集（UNION のため循環データでも停止する）
  const rows = db
    .prepare(
      `WITH RECURSIVE sub(id) AS (
         SELECT id FROM tasks WHERE id = ?
         UNION
         SELECT t.id FROM tasks t JOIN sub ON t.parent_id = sub.id
       )
       SELECT id FROM sub`
    )
    .all(id) as { id: string }[];
  const ids = rows.map(r => r.id);

  // DELETE ... IN (...) のチャンク実行（SQLite のバインド変数上限対策）。
  // FK は parent_id が ON DELETE SET NULL のため削除順序に制約はない
  const CHUNK = 500;
  db.transaction(() => {
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK);
      db.prepare(`DELETE FROM tasks WHERE id IN (${chunk.map(() => '?').join(',')})`)
        .run(...chunk);
    }
  })();
  return ids;
}

/** 直下の子を削除タスクの親（祖父母）に付け替えてから本体のみ削除し、付け替え情報を返す */
export function deleteTaskKeepChildren(
  id: string,
): { id: string; order: number; parentId: string | null }[] {
  const task = db.prepare('SELECT parent_id FROM tasks WHERE id = ?').get(id) as
    | { parent_id: string | null }
    | undefined;
  if (!task) return [];

  const children = db
    .prepare<[string], { id: string; ord: number }>('SELECT id, ord FROM tasks WHERE parent_id = ?')
    .all(id);

  db.transaction(() => {
    const upd = db.prepare('UPDATE tasks SET parent_id = ? WHERE id = ?');
    for (const c of children) upd.run(task.parent_id, c.id);
    db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
  })();

  return children.map(c => ({ id: c.id, order: c.ord, parentId: task.parent_id }));
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

  return new Set<string>();
}

export interface BatchTaskInput {
  parentRef: number | null;
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
  order?: number;
  titleColor?: string | null;
  titleBgColor?: string | null;
  estimateMinutes?: number | null;
}

export function batchCreateTasks(
  projectId: string,
  parentId: string | null,
  inputs: BatchTaskInput[],
): TaskWithSuccessors[] {
  const { m: maxOrd } = db
    .prepare('SELECT COALESCE(MAX(ord), 0) as m FROM tasks WHERE project_id = ?')
    .get(projectId) as { m: number };

  const ids: string[] = inputs.map(() => uuidv4());
  const createdIds: string[] = [];

  db.transaction(() => {
    for (let i = 0; i < inputs.length; i++) {
      const input = inputs[i];
      const resolvedParentId =
        input.parentRef === null ? parentId : (ids[input.parentRef] ?? null);

      const { next_seq: seq } = db
        .prepare('SELECT next_seq FROM projects WHERE id = ?')
        .get(projectId) as { next_seq: number };
      db.prepare('UPDATE projects SET next_seq = next_seq + 1 WHERE id = ?').run(projectId);

      db.prepare(
        `INSERT INTO tasks (id, project_id, parent_id, title, summary, description, status, priority, progress, assignee, start_date, end_date, is_milestone, ord, seq, estimate_minutes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        ids[i],
        projectId,
        resolvedParentId,
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
        input.order ?? maxOrd + i + 1,
        seq,
        input.estimateMinutes ?? null,
      );
      createdIds.push(ids[i]);
    }
  })();

  return createdIds.map(id => getTask(id)!);
}
