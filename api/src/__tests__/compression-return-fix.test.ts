import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createTestDb } from './helpers.js';
import type Database from 'better-sqlite3';
import type { FastifyInstance } from 'fastify';
import type { AddressInfo } from 'node:net';

// compression-real-socket.test.ts で特定した「async handler内で reply.send() を
// return/await せずに呼んでいる」アンチパターンについて、tasks.ts:113（POST /tasks）以外にも
// 同型の箇所（projects.ts / refs.ts / tasks.ts の204系 / importExport.ts の export系）が
// 残っていたための回帰テスト。
//
// @fastify/compress の onSend フックは、ペイロードが threshold（1024バイト）未満なら
// 同期的に next() を呼ぶだけで非同期ストリーム処理を一切行わない
// （node_modules/@fastify/compress/index.js の `Buffer.byteLength(payload) < params.threshold`
// 分岐を参照）。したがって今回のバグが実際に「ボディ0バイトで送出される」形で再現するのは、
// レスポンスが1024バイト以上あり、かつ圧縮対象（Content-Type が compressible）である場合に限られる。
//
// - projects.ts:23（POST /projects）: name は schema で maxLength:200 だが、color には
//   長さ制限が無いため、そこを埋めて1024バイト超のレスポンスを作れる。
// - refs.ts:60（POST /projects/:id/refs）: レスポンスは { ref: { projectId, refTaskId, createdAt } }
//   のみで、projectId/refTaskId は実在するプロジェクト/タスクの UUID（固定長）でなければ
//   404/400 になってしまうため、原理上レスポンスを1024バイト超に膨らませられない。
//   このためこのテストは「圧縮境界を踏んでの再現」ではなく、return漏れが無いことの
//   軽量な回帰防止として置いている（fix前でも red にはならない）。
// - tasks.ts:278 / projects.ts:58 / refs.ts:78（204系）: ボディが無い（payload==null）ため
//   onSend フックはそもそも圧縮処理に入らない。同様に軽量な回帰防止として置く。
// - importExport.ts の export/json・export/csv: grep 対象外だった箇所で発見した同型のバグ
//   （async handler内で reply.header(...).send(...) を return していない）。エクスポートは
//   タスク一覧をまるごと返すため実運用でも1024バイトを容易に超え、最も再現性が高い。

let testDb: Database.Database;

vi.mock('../db/client.js', () => ({
  get db() { return testDb; },
}));

vi.mock('../ws/wsRoom.js', () => ({
  notifyRoom: vi.fn(),
  wss: { on: vi.fn() },
}));

const { buildApp } = await import('../app.js');

const OVER_THRESHOLD_BYTES = 1500; // 1024バイト閾値を確実に超える

describe('return漏れ修正の回帰テスト（実ソケット・実クライアント通信）', () => {
  let app: FastifyInstance;
  let baseUrl: string;

  beforeAll(async () => {
    testDb = createTestDb();
    app = await buildApp();
    await app.listen({ port: 0, host: '127.0.0.1' });
    const address = app.server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}/api/v1`;
  });

  afterAll(async () => {
    await app.close();
    testDb.close();
  });

  async function createProject(body: Record<string, unknown>) {
    return fetch(`${baseUrl}/projects`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'accept-encoding': 'gzip, deflate, br' },
      body: JSON.stringify(body),
    });
  }

  async function createTask(projectId: string, body: Record<string, unknown>) {
    const res = await fetch(`${baseUrl}/projects/${projectId}/tasks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Task', ...body }),
    });
    const parsed = await res.json();
    return parsed.task as { id: string };
  }

  describe('projects.ts:23 POST /projects（1024バイト超のcolorでレスポンスを膨らませる）', () => {
    it.each([
      { label: 'gzip, deflate, br（実ブラウザ相当）', acceptEncoding: 'gzip, deflate, br' },
      { label: 'br のみ', acceptEncoding: 'br' },
      { label: 'gzip のみ', acceptEncoding: 'gzip' },
    ])('Accept-Encoding: $label で201・res.json()成功・colorが完全一致する', async ({ acceptEncoding }) => {
      const longColor = '#'.padEnd(OVER_THRESHOLD_BYTES, 'c');

      const res = await fetch(`${baseUrl}/projects`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'accept-encoding': acceptEncoding },
        body: JSON.stringify({ name: 'Return漏れ回帰テストProject', color: longColor }),
      });

      expect(res.status).toBe(201);

      // res.json() がここで例外を投げる場合、それがバグ報告の
      // 「Unexpected end of JSON input」を再現するケース。
      const body: { project: { color: string } } = await res.json();
      expect(body.project.color).toBe(longColor);
    });
  });

  describe('importExport.ts export/json（追加で発見したreturn漏れ。1024バイト超）', () => {
    it('GET /projects/:id/export/json が壊れずJSONを返す', async () => {
      const projRes = await createProject({ name: 'Export JSON Project' });
      const { project } = await projRes.json();

      const longDescription = 'd'.repeat(OVER_THRESHOLD_BYTES);
      await createTask(project.id, { title: 'Export対象タスク', description: longDescription });

      const res = await fetch(`${baseUrl}/projects/${project.id}/export/json`, {
        headers: { 'accept-encoding': 'gzip, deflate, br' },
      });

      expect(res.status).toBe(200);
      const body: { tasks: { description: string }[] } = await res.json();
      expect(body.tasks).toHaveLength(1);
      expect(body.tasks[0].description).toBe(longDescription);
    });
  });

  describe('importExport.ts export/csv（追加で発見したreturn漏れ。1024バイト超）', () => {
    it('GET /projects/:id/export/csv が壊れずCSVを返す', async () => {
      const projRes = await createProject({ name: 'Export CSV Project' });
      const { project } = await projRes.json();

      const longDescription = 'd'.repeat(OVER_THRESHOLD_BYTES);
      await createTask(project.id, { title: 'Export対象タスク', description: longDescription });

      const res = await fetch(`${baseUrl}/projects/${project.id}/export/csv`, {
        headers: { 'accept-encoding': 'gzip, deflate, br' },
      });

      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text.startsWith('id,parentId,title,')).toBe(true);
      expect(text).toContain(longDescription);
    });
  });

  describe('refs.ts:60 POST /projects/:id/refs（構造上1024バイト超にできないため軽量な回帰防止）', () => {
    it('201・res.json()成功・refが完全一致する', async () => {
      const projARes = await createProject({ name: 'Ref A' });
      const { project: projA } = await projARes.json();
      const projBRes = await createProject({ name: 'Ref B' });
      const { project: projB } = await projBRes.json();
      const taskB = await createTask(projB.id, {});

      const res = await fetch(`${baseUrl}/projects/${projA.id}/refs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'accept-encoding': 'gzip, deflate, br' },
        body: JSON.stringify({ refTaskId: taskB.id }),
      });

      expect(res.status).toBe(201);
      const body: { ref: { projectId: string; refTaskId: string } } = await res.json();
      expect(body.ref).toMatchObject({ projectId: projA.id, refTaskId: taskB.id });
    });
  });

  describe('204系（projects.ts:58 / refs.ts:78 / tasks.ts:278）の軽量な回帰防止', () => {
    it('DELETE /projects/:id は204でボディが空のまま完了する', async () => {
      const projRes = await createProject({ name: 'Delete Project' });
      const { project } = await projRes.json();

      const res = await fetch(`${baseUrl}/projects/${project.id}`, {
        method: 'DELETE',
        headers: { 'accept-encoding': 'gzip, deflate, br' },
      });

      expect(res.status).toBe(204);
      const text = await res.text();
      expect(text).toBe('');
    });

    it('DELETE /projects/:id/refs/:refTaskId は204でボディが空のまま完了する', async () => {
      const projARes = await createProject({ name: 'Ref Delete A' });
      const { project: projA } = await projARes.json();
      const projBRes = await createProject({ name: 'Ref Delete B' });
      const { project: projB } = await projBRes.json();
      const taskB = await createTask(projB.id, {});

      await fetch(`${baseUrl}/projects/${projA.id}/refs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refTaskId: taskB.id }),
      });

      const res = await fetch(`${baseUrl}/projects/${projA.id}/refs/${taskB.id}`, {
        method: 'DELETE',
        headers: { 'accept-encoding': 'gzip, deflate, br' },
      });

      expect(res.status).toBe(204);
      const text = await res.text();
      expect(text).toBe('');
    });

    it('DELETE /tasks/:id は204でボディが空のまま完了する', async () => {
      const projRes = await createProject({ name: 'Task Delete Project' });
      const { project } = await projRes.json();
      const task = await createTask(project.id, {});

      const res = await fetch(`${baseUrl}/tasks/${task.id}`, {
        method: 'DELETE',
        headers: { 'accept-encoding': 'gzip, deflate, br' },
      });

      expect(res.status).toBe(204);
      const text = await res.text();
      expect(text).toBe('');
    });
  });
});
