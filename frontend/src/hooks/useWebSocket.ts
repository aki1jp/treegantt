import { useEffect } from 'react';
import { useTaskStore } from '../store/taskStore';
import type { Task } from '../types/task';

const WS_URL = import.meta.env.VITE_WS_URL ?? `ws://${window.location.hostname}:4001`;
const RECONNECT_DELAY_MS = 3000;

// Module-level singleton: React StrictMode の二重マウントでも接続を維持
let _ws: WebSocket | null = null;
let _projectId: string | null = null;
let _reconnectTimer: ReturnType<typeof setTimeout> | null = null;

export function applyMessage(msg: Record<string, unknown>) {
  const store = useTaskStore.getState();

  switch (msg.type) {
    // created/updated とも upsert: 作成通知より更新通知が先着しても自己回復する
    case 'task_created':
    case 'task_updated': {
      store.upsertTask(msg.task as Task);
      break;
    }
    case 'tasks_deleted': {
      store.removeTasks(msg.ids as string[]);
      break;
    }
    // 旧形式（v2.66 以前のサーバー）。互換のため残置
    case 'task_deleted': {
      store.removeTasks([msg.id as string]);
      break;
    }
    case 'tasks_reordered': {
      store.applyOrders(msg.orders as { id: string; order: number; parentId?: string | null }[]);
      break;
    }
    case 'reload': {
      // import 後など: App 側でリロードトリガーを発火させる
      store.setNeedsReload(true);
      break;
    }
  }
}

function openWs(projectId: string) {
  if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null; }
  if (_ws) { _ws.onclose = null; _ws.onerror = null; _ws.close(); _ws = null; }

  _projectId = projectId;
  const ws = new WebSocket(WS_URL);
  _ws = ws;

  ws.onopen = () => {
    if (_projectId !== projectId) { ws.close(); return; }
    ws.send(JSON.stringify({ type: 'subscribe', projectId }));
  };

  ws.onmessage = (event: MessageEvent) => {
    try {
      const msg = JSON.parse(event.data as string) as Record<string, unknown>;
      if (msg.projectId !== _projectId) return;
      applyMessage(msg);
    } catch { /* malformed — ignore */ }
  };

  ws.onclose = () => {
    if (_projectId !== projectId) return;
    _reconnectTimer = setTimeout(() => openWs(projectId), RECONNECT_DELAY_MS);
  };

  ws.onerror = () => { /* auto-reconnect via onclose */ };
}

export function useWebSocket(projectId: string | null) {
  useEffect(() => {
    if (!projectId) {
      if (_ws) { _ws.onclose = null; _ws.onerror = null; _ws.close(); _ws = null; }
      if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null; }
      _projectId = null;
      return;
    }

    if (_projectId === projectId && _ws?.readyState === WebSocket.OPEN) return;

    openWs(projectId);
  }, [projectId]);
}
