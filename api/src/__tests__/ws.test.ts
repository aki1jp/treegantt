import { describe, it, expect, afterAll, vi } from 'vitest';
import { WebSocket } from 'ws';

// wsRoom はモジュール読み込み時に WebSocketServer を起動する。
// 他テストとポート衝突しないよう専用ポートを import 前に設定する。
process.env.WS_PORT = '4071';
const { wss, notifyRoom } = await import('../ws/wsRoom.js');

const WS_URL = 'ws://localhost:4071';

afterAll(() => {
  wss.close();
});

function connectAndSubscribe(projectId: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    ws.on('error', reject);
    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'subscribe', projectId }));
      // room へ登録される猶予
      setTimeout(() => resolve(ws), 50);
    });
  });
}

describe('wsRoom ブロードキャスト', () => {
  it('同一プロジェクト購読者に notifyRoom が届く', async () => {
    const a = await connectAndSubscribe('proj-1');
    const b = await connectAndSubscribe('proj-1');

    const received = new Promise<Record<string, unknown>>((resolve) => {
      b.on('message', (data) => resolve(JSON.parse(data.toString())));
    });
    notifyRoom('proj-1', { type: 'task_updated', projectId: 'proj-1', task: { id: 't1' } });

    const msg = await received;
    expect(msg).toMatchObject({ type: 'task_updated', projectId: 'proj-1' });
    a.close();
    b.close();
  });

  it('別プロジェクト購読者には届かない', async () => {
    const a = await connectAndSubscribe('proj-A');
    let got = false;
    a.on('message', () => { got = true; });

    notifyRoom('proj-B', { type: 'reload', projectId: 'proj-B' });
    await new Promise((r) => setTimeout(r, 80));

    expect(got).toBe(false);
    a.close();
  });
});

describe('wsRoom ハードニング', () => {
  it('maxPayload を超えるメッセージを送ると接続が切断される（close code 1009）', async () => {
    const ws = new WebSocket(WS_URL);
    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => resolve());
      ws.on('error', reject);
    });

    const closed = new Promise<number>((resolve) => {
      ws.on('close', (code) => resolve(code));
    });

    ws.send('a'.repeat(70 * 1024)); // 64KB の maxPayload を超える

    const code = await closed;
    expect(code).toBe(1009);
  });

  it('CORS_ORIGIN 設定時、不一致な Origin からの接続は拒否される', async () => {
    vi.resetModules();
    process.env.WS_PORT = '4074';
    process.env.CORS_ORIGIN = 'http://allowed.example';
    const mod = await import('../ws/wsRoom.js');
    try {
      const ws = new WebSocket('ws://localhost:4074', { origin: 'http://evil.example' });
      const result = await new Promise<'open' | 'rejected'>((resolve) => {
        ws.on('open', () => resolve('open'));
        ws.on('unexpected-response', () => resolve('rejected'));
      });
      expect(result).toBe('rejected');
    } finally {
      mod.wss.close();
      delete process.env.CORS_ORIGIN;
    }
  });

  it('CORS_ORIGIN 設定時でも Origin ヘッダーが無い接続は許可される（非ブラウザクライアント）', async () => {
    vi.resetModules();
    process.env.WS_PORT = '4075';
    process.env.CORS_ORIGIN = 'http://allowed.example';
    const mod = await import('../ws/wsRoom.js');
    try {
      const ws = new WebSocket('ws://localhost:4075'); // Origin ヘッダーなし（ws クライアントは既定で送らない）
      const result = await new Promise<'open' | 'rejected'>((resolve) => {
        ws.on('open', () => resolve('open'));
        ws.on('unexpected-response', () => resolve('rejected'));
      });
      expect(result).toBe('open');
      ws.close();
    } finally {
      mod.wss.close();
      delete process.env.CORS_ORIGIN;
    }
  });

  it('CORS_ORIGIN 未設定（既定 *）では Origin 不一致でも接続できる（挙動が変わらない）', async () => {
    vi.resetModules();
    process.env.WS_PORT = '4076';
    delete process.env.CORS_ORIGIN;
    const mod = await import('../ws/wsRoom.js');
    try {
      const ws = new WebSocket('ws://localhost:4076', { origin: 'http://anything.example' });
      const result = await new Promise<'open' | 'rejected'>((resolve) => {
        ws.on('open', () => resolve('open'));
        ws.on('unexpected-response', () => resolve('rejected'));
      });
      expect(result).toBe('open');
      ws.close();
    } finally {
      mod.wss.close();
    }
  });
});
