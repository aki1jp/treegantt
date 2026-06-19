import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/client.js';
import type { Project } from '../types/task.js';

interface RawProject {
  id: string;
  name: string;
  color: string | null;
  capacity_minutes_per_day: number | null;
  working_days: string | null;
  created_at: string;
}

/** workingDays を 0–6・重複除去・昇順に正規化する */
function normalizeWorkingDays(days: number[]): number[] {
  return [...new Set(days.filter(d => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b);
}

function rawToProject(row: RawProject): Project {
  let workingDays: number[] | null = null;
  if (row.working_days != null) {
    try {
      const parsed = JSON.parse(row.working_days);
      if (Array.isArray(parsed)) workingDays = normalizeWorkingDays(parsed as number[]);
    } catch { /* 壊れた値は継承(null)扱い */ }
  }
  return {
    id: row.id,
    name: row.name,
    color: row.color ?? null,
    capacityMinutesPerDay: row.capacity_minutes_per_day ?? null,
    workingDays,
    createdAt: row.created_at,
  };
}

export function listProjects(): Project[] {
  const rows = db.prepare('SELECT * FROM projects ORDER BY created_at DESC').all() as RawProject[];
  return rows.map(rawToProject);
}

export function getProject(id: string): Project | null {
  const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as RawProject | undefined;
  return row ? rawToProject(row) : null;
}

export function createProject(name: string, color?: string | null): Project {
  const id = uuidv4();
  return rawToProject(
    db.prepare('INSERT INTO projects (id, name, color) VALUES (?, ?, ?) RETURNING *').get(id, name, color ?? null) as RawProject
  );
}

export interface UpdateProjectInput {
  name?: string;
  color?: string | null;
  capacityMinutesPerDay?: number | null;
  workingDays?: number[] | null;
}

export function updateProject(id: string, patch: UpdateProjectInput): Project | null {
  const sets: string[] = [];
  const params: unknown[] = [];
  if (patch.name !== undefined) { sets.push('name = ?'); params.push(patch.name); }
  if ('color' in patch)         { sets.push('color = ?'); params.push(patch.color ?? null); }
  if ('capacityMinutesPerDay' in patch) {
    sets.push('capacity_minutes_per_day = ?');
    params.push(patch.capacityMinutesPerDay ?? null);
  }
  if ('workingDays' in patch) {
    sets.push('working_days = ?');
    params.push(patch.workingDays == null ? null : JSON.stringify(normalizeWorkingDays(patch.workingDays)));
  }
  if (sets.length === 0) {
    const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as RawProject | undefined;
    return row ? rawToProject(row) : null;
  }
  params.push(id);
  const row = db.prepare(
    `UPDATE projects SET ${sets.join(', ')} WHERE id = ? RETURNING *`
  ).get(...params) as RawProject | undefined;
  return row ? rawToProject(row) : null;
}

export function deleteProject(id: string): boolean {
  return db.prepare('DELETE FROM projects WHERE id = ?').run(id).changes > 0;
}
