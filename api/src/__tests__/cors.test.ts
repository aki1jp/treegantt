import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { corsOptions } from '../plugins/cors.js';

// 本番（index.ts）と同じ corsOptions で app を組み、ブラウザのプリフライト(OPTIONS)を
// 明示的に inject する。通常の CRUD inject はプリフライトを経由しないため、
// クロスオリジンの PATCH/DELETE が弾かれる不具合を検出できなかった。
async function buildApp() {
  const app = Fastify();
  await app.register(cors, corsOptions);
  app.patch('/api/v1/tasks/:id', async () => ({ ok: true }));
  app.delete('/api/v1/tasks/:id', async () => ({ ok: true }));
  return app;
}

describe('CORS プリフライト（クロスオリジンの変更系メソッド許可）', () => {
  it('OPTIONS プリフライトが PATCH/DELETE/POST を許可する', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'OPTIONS',
      url: '/api/v1/tasks/abc',
      headers: {
        origin: 'http://localhost:3001',
        'access-control-request-method': 'PATCH',
      },
    });
    expect(res.statusCode).toBeLessThan(300); // 204 等
    const allow = String(res.headers['access-control-allow-methods'] ?? '');
    // ガントのドラッグ/編集/並び替え=PATCH、削除=DELETE、作成=POST
    expect(allow).toContain('PATCH');
    expect(allow).toContain('DELETE');
    expect(allow).toContain('POST');
    await app.close();
  });

  it('実 PATCH 応答に Access-Control-Allow-Origin が付く', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/tasks/abc',
      headers: { origin: 'http://localhost:3001', 'content-type': 'application/json' },
      payload: { progress: 50 },
    });
    expect(res.headers['access-control-allow-origin']).toBeTruthy();
    await app.close();
  });
});
