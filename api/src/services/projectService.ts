import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/client.js';
import type { Project } from '../types/task.js';

interface RawProject {
  id: string;
  name: string;
  created_at: string;
}

function rawToProject(row: RawProject): Project {
  return { id: row.id, name: row.name, createdAt: row.created_at };
}

export function listProjects(): Project[] {
  const rows = db.prepare('SELECT * FROM projects ORDER BY created_at DESC').all() as RawProject[];
  return rows.map(rawToProject);
}

export function getProject(id: string): Project | null {
  const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as RawProject | undefined;
  return row ? rawToProject(row) : null;
}

export function createProject(name: string): Project {
  const id = uuidv4();
  return rawToProject(
    db.prepare('INSERT INTO projects (id, name) VALUES (?, ?) RETURNING *').get(id, name) as RawProject
  );
}

export function renameProject(id: string, name: string): Project | null {
  const row = db.prepare(
    'UPDATE projects SET name = ? WHERE id = ? RETURNING *'
  ).get(name, id) as RawProject | undefined;
  return row ? rawToProject(row) : null;
}

export function deleteProject(id: string): boolean {
  return db.prepare('DELETE FROM projects WHERE id = ?').run(id).changes > 0;
}
