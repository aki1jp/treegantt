import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/client.js';
import type { Project } from '../types/task.js';

interface RawProject {
  id: string;
  name: string;
  color: string | null;
  created_at: string;
}

function rawToProject(row: RawProject): Project {
  return { id: row.id, name: row.name, color: row.color ?? null, createdAt: row.created_at };
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

export function updateProject(id: string, patch: { name?: string; color?: string | null }): Project | null {
  const sets: string[] = [];
  const params: unknown[] = [];
  if (patch.name !== undefined) { sets.push('name = ?'); params.push(patch.name); }
  if ('color' in patch)         { sets.push('color = ?'); params.push(patch.color ?? null); }
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
