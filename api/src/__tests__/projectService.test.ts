import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTestDb } from './helpers.js';
import type Database from 'better-sqlite3';

let testDb: Database.Database;

vi.mock('../db/client.js', () => ({
  get db() { return testDb; },
}));

const { listProjects, getProject, createProject, deleteProject } =
  await import('../services/projectService.js');

describe('projectService', () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  describe('listProjects', () => {
    it('returns empty array when no projects', () => {
      expect(listProjects()).toEqual([]);
    });

    it('returns projects ordered by created_at DESC', () => {
      testDb.prepare('INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)').run('p1', 'Alpha', '2026-01-01 00:00:00');
      testDb.prepare('INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)').run('p2', 'Beta',  '2026-01-02 00:00:00');
      const result = listProjects();
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ id: 'p2', name: 'Beta' });
      expect(result[1]).toMatchObject({ id: 'p1', name: 'Alpha' });
    });

    it('returned objects have camelCase fields', () => {
      testDb.prepare('INSERT INTO projects (id, name) VALUES (?, ?)').run('p1', 'Test');
      const [p] = listProjects();
      expect(p.id).toBe('p1');
      expect(p.name).toBe('Test');
      expect(p.createdAt).toBeTruthy();
      expect((p as Record<string, unknown>).created_at).toBeUndefined();
    });
  });

  describe('getProject', () => {
    it('returns null for unknown id', () => {
      expect(getProject('no-such-id')).toBeNull();
    });

    it('returns the project for a known id', () => {
      testDb.prepare('INSERT INTO projects (id, name) VALUES (?, ?)').run('p1', 'Found');
      const p = getProject('p1');
      expect(p).not.toBeNull();
      expect(p!.name).toBe('Found');
    });
  });

  describe('createProject', () => {
    it('creates and returns a project with a generated UUID', () => {
      const p = createProject('My Project');
      expect(p.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(p.name).toBe('My Project');
      expect(p.createdAt).toBeTruthy();
    });

    it('persists to the database', () => {
      const p = createProject('Persisted');
      const found = getProject(p.id);
      expect(found?.name).toBe('Persisted');
    });
  });

  describe('deleteProject', () => {
    it('returns false for unknown id', () => {
      expect(deleteProject('no-such-id')).toBe(false);
    });

    it('returns true and removes the project', () => {
      testDb.prepare('INSERT INTO projects (id, name) VALUES (?, ?)').run('p1', 'ToDelete');
      expect(deleteProject('p1')).toBe(true);
      expect(getProject('p1')).toBeNull();
    });

    it('cascades to tasks on delete', () => {
      testDb.prepare('INSERT INTO projects (id, name) VALUES (?, ?)').run('proj', 'P');
      testDb.prepare(
        'INSERT INTO tasks (id, project_id, title) VALUES (?, ?, ?)'
      ).run('t1', 'proj', 'Task');
      deleteProject('proj');
      const row = testDb.prepare('SELECT 1 FROM tasks WHERE id = ?').get('t1');
      expect(row).toBeUndefined();
    });
  });
});
