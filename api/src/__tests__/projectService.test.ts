import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTestDb } from './helpers.js';
import type Database from 'better-sqlite3';

let testDb: Database.Database;

vi.mock('../db/client.js', () => ({
  get db() { return testDb; },
}));

const { listProjects, getProject, createProject, deleteProject, updateProject } =
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
      expect((p as unknown as Record<string, unknown>).created_at).toBeUndefined();
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

  describe('リソース設定の個別上書き（継承）', () => {
    it('新規プロジェクトは上書き値が null（＝アプリ既定を継承）', () => {
      const p = createProject('P');
      expect(p.capacityMinutesPerDay).toBeNull();
      expect(p.workingDays).toBeNull();
    });

    it('updateProject で上書き値を設定・null 解除できる', () => {
      const p = createProject('P');
      const u = updateProject(p.id, { capacityMinutesPerDay: 465, workingDays: [1, 2, 3] });
      expect(u?.capacityMinutesPerDay).toBe(465);
      expect(u?.workingDays).toEqual([1, 2, 3]);

      const cleared = updateProject(p.id, { capacityMinutesPerDay: null, workingDays: null });
      expect(cleared?.capacityMinutesPerDay).toBeNull();
      expect(cleared?.workingDays).toBeNull();
    });

    it('workingDays の上書きは正規化（重複除去・昇順・範囲外除外）', () => {
      const p = createProject('P');
      const u = updateProject(p.id, { workingDays: [5, 1, 1, 7, 3] });
      expect(u?.workingDays).toEqual([1, 3, 5]);
    });

    it('listProjects/getProject も上書き値を返す', () => {
      const p = createProject('P');
      updateProject(p.id, { capacityMinutesPerDay: 300 });
      expect(getProject(p.id)?.capacityMinutesPerDay).toBe(300);
      expect(listProjects()[0].capacityMinutesPerDay).toBe(300);
    });
  });
});
