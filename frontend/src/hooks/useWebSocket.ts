import { useEffect } from 'react';
import { useConnectionStore } from '../store/connectionStore';
import { useTaskStore } from '../store/taskStore';
import type { Task } from '../types/task';

const WS_URL = import.meta.env.VITE_WS_URL ?? 'ws://localhost:4001';
const RECONNECT_DELAY_MS = 3000;

// Module-level singleton: React StrictMode の二重マウントでも接続を維持
let _ws: WebSocket | null = null;
let _projectId: string | null = null;
let _reconnectTimer: ReturnType<typeof setTimeout> | null = null;

function applyMessage(msg: Record<string, unknown>) {
  const store = useTaskStore.getState();
  const tasks = store.tasks;

  switch (msg.type) {
    case 'task_created': {
      const task = msg.task as Task;
      if (!tasks.some(t => t.id === task.id)) {
        store.setTasks([...tasks, task]);
      }
      break;
    }
    case 'task_updated': {
      const task = msg.task as Task;
      store.setTasks(tasks.map(t => t.id === task.id ? task : t));
      break;
    }
    case 'task_deleted': {
      store.setTasks(tasks.filter(t => t.id !== (msg.id as string)));
      break;
    }
    case 'tasks_reordered': {
      const orders = msg.orders as { id: string; order: number }[];
      const map = new Map(orders.map(o => [o.id, o.order]));
      store.setTasks(tasks.map(t => map.has(t.id) ? { ...t, order: map.get(t.id)! } : t));
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

  useConnectionStore.getState().setStatus('connecting');

  ws.onopen = () => {
    if (_projectId !== projectId) { ws.close(); return; }
    useConnectionStore.getState().setStatus('connected');
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
    useConnectionStore.getState().setStatus('disconnected');
    _reconnectTimer = setTimeout(() => openWs(projectId), RECONNECT_DELAY_MS);
  };

  ws.onerror = () => {
    useConnectionStore.getState().setStatus('disconnected');
  };
}

export function useWebSocket(projectId: string | null) {
  useEffect(() => {
    if (!projectId) {
      if (_ws) { _ws.onclose = null; _ws.onerror = null; _ws.close(); _ws = null; }
      if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null; }
      _projectId = null;
      useConnectionStore.getState().setStatus('disconnected');
      return;
    }

    if (_projectId === projectId && _ws?.readyState === WebSocket.OPEN) return;

    openWs(projectId);
  }, [projectId]);
}
