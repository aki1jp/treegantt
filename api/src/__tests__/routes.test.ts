import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTestDb } from './helpers.js';
import type Database from 'better-sqlite3';
import Fastify from 'fastify';
import cors from '@fastify/cors';

let testDb: Database.Database;

vi.mock('../db/client.js', () => ({
  get db() { return testDb; },
}));

// Hocuspocusは統合テストでは不要なのでスタブ化
vi.mock('../ws/hocuspocus.js', () => ({
  hocuspocus: { listen: vi.fn() },
}));

const { healthRoutes }     = await import('../routes/health.js');
const { projectRoutes }    = await import('../routes/projects.js');
const { taskRoutes }       = await import('../routes/tasks.js');
const { importExportRoutes } = await import('../routes/importExport.js');
const { authPlugin }       = await import('../plugins/auth.js');

async function buildApp() {
  const app = Fastify();
  await app.register(cors);
  await app.register(authPlugin);
  await app.register(healthRoutes);
  await app.register(projectRoutes, { prefix: '/api/v1' });
  await app.register(taskRoutes,    { prefix: '/api/v1' });
  await app.register(importExportRoutes, { prefix: '/api/v1' });
  await app.ready();
  return app;
}

describe('GET /health', () => {
  it('returns 200 with ok status', async () => {
    testDb = createTestDb();
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok' });
    await app.close();
  });
});

describe('Projects API', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    testDb = createTestDb();
    app = await buildApp();
  });

  it('GET /api/v1/projects returns empty list initially', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/projects' });
    expect(res.statusCode).toBe(200);
    expect(res.json().projects).toEqual([]);
  });

  it('POST /api/v1/projects creates a project', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/projects',
      payload: { name: 'My Project' },
    });
    expect(res.statusCode).toBe(201);
    const { project } = res.json();
    expect(project.name).toBe('My Project');
    expect(project.id).toBeTruthy();
  });

  it('POST /api/v1/projects rejects missing name', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/projects',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('DELETE /api/v1/projects/:id removes project', async () => {
    const createRes = await app.inject({
      method: 'POST', url: '/api/v1/projects',
      payload: { name: 'To Delete' },
    });
    const { project } = createRes.json();

    const delRes = await app.inject({ method: 'DELETE', url: `/api/v1/projects/${project.id}` });
    expect(delRes.statusCode).toBe(204);

    const listRes = await app.inject({ method: 'GET', url: '/api/v1/projects' });
    expect(listRes.json().projects).toHaveLength(0);
  });

  it('DELETE /api/v1/projects/:id returns 404 for unknown id', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/projects/no-such-id' });
    expect(res.statusCode).toBe(404);
  });
});

describe('Tasks API', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let projectId: string;

  beforeEach(async () => {
    testDb = createTestDb();
    app = await buildApp();

    const res = await app.inject({
      method: 'POST', url: '/api/v1/projects',
      payload: { name: 'Test Project' },
    });
    projectId = res.json().project.id;
  });

  async function createTask(overrides = {}) {
    const res = await app.inject({
      method: 'POST', url: `/api/v1/projects/${projectId}/tasks`,
      payload: { title: 'Test Task', ...overrides },
    });
    return res.json().task;
  }

  it('GET /api/v1/projects/:id/tasks returns empty list', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/v1/projects/${projectId}/tasks` });
    expect(res.statusCode).toBe(200);
    expect(res.json().tasks).toEqual([]);
    expect(res.json().total).toBe(0);
  });

  it('POST /api/v1/projects/:id/tasks creates task with defaults', async () => {
    const res = await app.inject({
      method: 'POST', url: `/api/v1/projects/${projectId}/tasks`,
      payload: { title: 'New Task' },
    });
    expect(res.statusCode).toBe(201);
    const { task } = res.json();
    expect(task.title).toBe('New Task');
    expect(task.status).toBe('todo');
    expect(task.priority).toBe('medium');
    expect(task.progress).toBe(0);
  });

  it('POST /api/v1/projects/:id/tasks validates title required', async () => {
    const res = await app.inject({
      method: 'POST', url: `/api/v1/projects/${projectId}/tasks`,
      payload: { summary: 'no title' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('GET /api/v1/tasks/:id returns task', async () => {
    const task = await createTask();
    const res = await app.inject({ method: 'GET', url: `/api/v1/tasks/${task.id}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().task.id).toBe(task.id);
  });

  it('GET /api/v1/tasks/:id returns 404 for unknown', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/tasks/unknown-id' });
    expect(res.statusCode).toBe(404);
  });

  it('PATCH /api/v1/tasks/:id updates fields', async () => {
    const task = await createTask({ title: 'Original', status: 'todo', progress: 0 });
    const res = await app.inject({
      method: 'PATCH', url: `/api/v1/tasks/${task.id}`,
      payload: { title: 'Updated', status: 'wip', progress: 50 },
    });
    expect(res.statusCode).toBe(200);
    const updated = res.json().task;
    expect(updated.title).toBe('Updated');
    expect(updated.status).toBe('wip');
    expect(updated.progress).toBe(50);
  });

  it('PATCH /api/v1/tasks/:id returns 404 for unknown', async () => {
    const res = await app.inject({
      method: 'PATCH', url: '/api/v1/tasks/unknown',
      payload: { title: 'X' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('DELETE /api/v1/tasks/:id deletes task', async () => {
    const task = await createTask();
    const res = await app.inject({ method: 'DELETE', url: `/api/v1/tasks/${task.id}` });
    expect(res.statusCode).toBe(204);

    const getRes = await app.inject({ method: 'GET', url: `/api/v1/tasks/${task.id}` });
    expect(getRes.statusCode).toBe(404);
  });

  it('PATCH /api/v1/projects/:id/tasks/reorder updates order', async () => {
    const t1 = await createTask({ title: 'T1' });
    const t2 = await createTask({ title: 'T2' });

    const res = await app.inject({
      method: 'PATCH', url: `/api/v1/projects/${projectId}/tasks/reorder`,
      payload: { orders: [{ id: t1.id, order: 10 }, { id: t2.id, order: 5 }] },
    });
    expect(res.statusCode).toBe(200);

    const t1Updated = (await app.inject({ method: 'GET', url: `/api/v1/tasks/${t1.id}` })).json().task;
    expect(t1Updated.order).toBe(10);
  });

  it('GET tasks with status filter', async () => {
    await createTask({ title: 'Todo Task', status: 'todo' });
    await createTask({ title: 'WIP Task', status: 'wip' });

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${projectId}/tasks?status=wip`,
    });
    expect(res.statusCode).toBe(200);
    const { tasks } = res.json();
    expect(tasks).toHaveLength(1);
    expect(tasks[0].status).toBe('wip');
  });
});

describe('Import/Export API', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let projectId: string;

  beforeEach(async () => {
    testDb = createTestDb();
    app = await buildApp();

    const res = await app.inject({
      method: 'POST', url: '/api/v1/projects',
      payload: { name: 'Export Test' },
    });
    projectId = res.json().project.id;
  });

  it('GET /api/v1/projects/:id/export/json returns valid JSON', async () => {
    await app.inject({
      method: 'POST', url: `/api/v1/projects/${projectId}/tasks`,
      payload: { title: 'Export Me', status: 'todo' },
    });

    const res = await app.inject({ method: 'GET', url: `/api/v1/projects/${projectId}/export/json` });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');

    const data = res.json();
    expect(data.version).toBe('1.1');
    expect(data.tasks).toHaveLength(1);
    expect(data.tasks[0].title).toBe('Export Me');
  });

  it('GET /api/v1/projects/:id/export/csv returns CSV', async () => {
    await app.inject({
      method: 'POST', url: `/api/v1/projects/${projectId}/tasks`,
      payload: { title: 'CSV Task', assignee: '山田' },
    });

    const res = await app.inject({ method: 'GET', url: `/api/v1/projects/${projectId}/export/csv` });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.payload).toContain('CSV Task');
    expect(res.payload).toContain('山田');
  });

  it('POST /api/v1/projects/:id/import imports tasks', async () => {
    const { v4: uuidv4 } = await import('uuid');
    const importData = {
      version: '1.1',
      tasks: [{
        id: uuidv4(),
        projectId,
        title: 'Imported Task',
        summary: '',
        description: '',
        status: 'todo',
        priority: 'high',
        progress: 0,
        assignee: '',
        startDate: null,
        endDate: null,
        predecessors: [],
        order: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }],
    };

    const res = await app.inject({
      method: 'POST', url: `/api/v1/projects/${projectId}/import`,
      payload: importData,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().imported).toBe(1);

    const listRes = await app.inject({ method: 'GET', url: `/api/v1/projects/${projectId}/tasks` });
    expect(listRes.json().tasks[0].title).toBe('Imported Task');
  });

  it('POST /api/v1/projects/:id/import returns 400 for invalid format', async () => {
    const res = await app.inject({
      method: 'POST', url: `/api/v1/projects/${projectId}/import`,
      payload: { notTasks: [] },
    });
    expect(res.statusCode).toBe(400);
  });
});
