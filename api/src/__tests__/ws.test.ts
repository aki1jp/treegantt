import { describe, it, expect, afterAll } from 'vitest';
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
