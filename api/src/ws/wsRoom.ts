import { WebSocketServer, WebSocket } from 'ws';
import { resolveWsPort } from '../config.js';

const WS_PORT = resolveWsPort();

// 1メッセージあたりの最大バイト数。クライアントは subscribe メッセージしか送らないため
// 数十バイト程度で足りる。過大なメッセージ（誤送信・DoS的送信）を早期に遮断する。
const MAX_PAYLOAD_BYTES = 64 * 1024;

// projectId → 接続中クライアント一覧
const rooms = new Map<string, Set<WebSocket>>();

/** Origin ヘッダーに基づき接続を許可するか判定する。
 *  - Origin ヘッダーが無い接続（MCP・CLI 等の非ブラウザクライアント）は常に許可する。
 *  - CORS_ORIGIN が未設定または '*'（既定）のときは常に許可する（挙動不変）。
 *  - それ以外は CORS_ORIGIN と完全一致する Origin のみ許可する。 */
function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return true;
  const allowed = process.env.CORS_ORIGIN;
  if (!allowed || allowed === '*') return true;
  return origin === allowed;
}

export const wss = new WebSocketServer({
  port: WS_PORT,
  maxPayload: MAX_PAYLOAD_BYTES,
  verifyClient: (info, callback) => {
    callback(isOriginAllowed(info.origin));
  },
});

wss.on('connection', (ws) => {
  let room: string | null = null;

  // maxPayload 超過時などに 'error' が発火する（直後に 'close' も発火し切断される）。
  // リスナー未登録だと未処理例外としてプロセスに伝播するため、ここで受けて何もしない。
  ws.on('error', () => { /* 切断は 'close' ハンドラ側で処理される */ });

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString()) as { type: string; projectId?: string };
      if (msg.type === 'subscribe' && msg.projectId) {
        if (room) rooms.get(room)?.delete(ws);
        room = msg.projectId;
        if (!rooms.has(room)) rooms.set(room, new Set());
        rooms.get(room)!.add(ws);
      }
    } catch { /* malformed message — ignore */ }
  });

  ws.on('close', () => {
    if (room) rooms.get(room)?.delete(ws);
  });
});

export function notifyRoom(projectId: string, message: unknown): void {
  const room = rooms.get(projectId);
  if (!room) return;
  const payload = JSON.stringify(message);
  for (const client of room) {
    if (client.readyState === WebSocket.OPEN) client.send(payload);
  }
}
