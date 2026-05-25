import { WebSocketServer, WebSocket } from 'ws';

const WS_PORT = parseInt(process.env.WS_PORT ?? '4001', 10);

// projectId → 接続中クライアント一覧
const rooms = new Map<string, Set<WebSocket>>();

export const wss = new WebSocketServer({ port: WS_PORT });

wss.on('connection', (ws) => {
  let room: string | null = null;

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
