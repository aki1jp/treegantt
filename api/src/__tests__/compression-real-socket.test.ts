import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createTestDb } from './helpers.js';
import type Database from 'better-sqlite3';
import type { FastifyInstance } from 'fastify';
import type { AddressInfo } from 'node:net';

// 実ソケット越しに @fastify/compress (brotli/gzip) の実クライアント通信を検証する。
//
// 背景（バグ報告）: タスク編集ダイアログで長い(1KB超)descriptionを保存すると、
// フロントで `Failed to execute 'json' on 'Response': Unexpected end of JSON input`
// が発生する（が実際はDB保存は成功している）。
//
// api/src/plugins/compression.ts の @fastify/compress は global: true, threshold: 1024,
// encodings: ['br', 'gzip'] で全ルートに適用されている。既存の compression.test.ts は
// Fastify の .inject()（実ソケットを使わないインプロセス呼び出し）のみ・GETのタスク一覧
// のみ・gzipのみをカバーしており、実ソケット越しの実クライアント通信・brotli・
// 単体タスクPATCH/POSTのいずれも検証していない。このファイルはそのギャップを埋める。

let testDb: Database.Database;

vi.mock('../db/client.js', () => ({
  get db() { return testDb; },
}));

vi.mock('../ws/wsRoom.js', () => ({
  notifyRoom: vi.fn(),
  wss: { on: vi.fn() },
}));

const { buildApp } = await import('../app.js');

/**
 * Buffer.byteLength で厳密に targetBytes に一致する文字列を作る。
 * SQL文＋日本語混じりの繰り返しパターンで埋め、端数は ASCII 'x'（1バイト文字）で
 * ぴったり合わせる。
 */
function buildDescriptionOfByteLength(targetBytes: number): string {
  const pattern =
    "SELECT * FROM tasks WHERE description LIKE '%緊急%' AND 担当者 = '山田太郎'; -- 日本語混じりの説明文サンプルです。";
  let result = '';
  while (Buffer.byteLength(result + pattern, 'utf-8') <= targetBytes) {
    result += pattern;
  }
  const remaining = targetBytes - Buffer.byteLength(result, 'utf-8');
  result += 'x'.repeat(Math.max(0, remaining));
  expect(Buffer.byteLength(result, 'utf-8')).toBe(targetBytes);
  return result;
}

const OVER_THRESHOLD_BYTES = 1500; // 1024バイト閾値を確実に超える
const UNDER_THRESHOLD_BYTES = 500; // 1024バイト閾値を確実に下回る

describe('レスポンス圧縮（実ソケット・実クライアント通信）', () => {
  let app: FastifyInstance;
  let baseUrl: string;
  let projectId: string;

  beforeAll(async () => {
    testDb = createTestDb();
    app = await buildApp();
    await app.listen({ port: 0, host: '127.0.0.1' });
    const address = app.server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}/api/v1`;

    const projRes = await fetch(`${baseUrl}/projects`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Real Socket Compression Project' }),
    });
    const projBody = await projRes.json();
    projectId = projBody.project.id;
  });

  afterAll(async () => {
    await app.close();
    testDb.close();
  });

  async function createSeedTask(): Promise<string> {
    const res = await fetch(`${baseUrl}/projects/${projectId}/tasks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: '実ソケットテスト用タスク', description: 'seed' }),
    });
    const body = await res.json();
    return body.task.id as string;
  }

  describe.each([
    { label: 'gzip, deflate, br（実ブラウザ相当）', acceptEncoding: 'gzip, deflate, br' },
    { label: 'br のみ', acceptEncoding: 'br' },
    { label: 'gzip のみ', acceptEncoding: 'gzip' },
  ])('本丸: PATCH /tasks/:id に1024バイト超のdescription（Accept-Encoding: $label）', ({ acceptEncoding }) => {
    it(`Accept-Encoding: ${acceptEncoding} で200・res.json()成功・descriptionが完全一致する`, async () => {
      const taskId = await createSeedTask();
      const longDescription = buildDescriptionOfByteLength(OVER_THRESHOLD_BYTES);

      const res = await fetch(`${baseUrl}/tasks/${taskId}`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          'accept-encoding': acceptEncoding,
        },
        body: JSON.stringify({ description: longDescription }),
      });

      expect(res.status).toBe(200);

      // res.json() がここで例外を投げる場合、それがバグ報告の
      // 「Unexpected end of JSON input」を再現するケース。あえて try/catch で
      // 握りつぶさず、素の例外としてテストを red にする。
      const body: { task: { description: string } } = await res.json();
      expect(body.task.description).toBe(longDescription);
    });
  });

  it('POST /projects/:id/tasks（新規タスク作成）でも1024バイト超のdescriptionで壊れずJSONが返る', async () => {
    const longDescription = buildDescriptionOfByteLength(OVER_THRESHOLD_BYTES);

    const res = await fetch(`${baseUrl}/projects/${projectId}/tasks`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'accept-encoding': 'gzip, deflate, br',
      },
      body: JSON.stringify({ title: '新規タスク（長いdescription）', description: longDescription }),
    });

    expect(res.status).toBe(201);

    const body: { task: { description: string } } = await res.json();
    expect(body.task.description).toBe(longDescription);
  });

  describe('コントロールケース（圧縮が絡まなければ壊れない）', () => {
    it('閾値未満（500バイト程度）のdescriptionのPATCHは実クライアント通信でも問題なく成功する', async () => {
      const taskId = await createSeedTask();
      const shortDescription = buildDescriptionOfByteLength(UNDER_THRESHOLD_BYTES);

      const res = await fetch(`${baseUrl}/tasks/${taskId}`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          'accept-encoding': 'gzip, deflate, br',
        },
        body: JSON.stringify({ description: shortDescription }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.task.description).toBe(shortDescription);
    });

    it('Accept-Encoding: identity を指定した場合は1024バイト超でも圧縮が絡まず成功する', async () => {
      const taskId = await createSeedTask();
      const longDescription = buildDescriptionOfByteLength(OVER_THRESHOLD_BYTES);

      const res = await fetch(`${baseUrl}/tasks/${taskId}`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          'accept-encoding': 'identity',
        },
        body: JSON.stringify({ description: longDescription }),
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('content-encoding')).toBeNull();
      const body = await res.json();
      expect(body.task.description).toBe(longDescription);
    });
  });
});
