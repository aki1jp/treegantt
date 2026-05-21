import * as Y from 'yjs';
import { v4 as uuidv4 } from 'uuid';
import type { Task } from '../types/task';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

async function apiFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${API_BASE}/api/v1${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.status === 204 ? null : res.json();
}

export function useTasks(yTasks: Y.Map<Y.Map<unknown>>, projectId: string) {
  function ySet(task: Task) {
    const ydoc = yTasks.doc!;
    ydoc.transact(() => {
      const yTask = new Y.Map<unknown>();
      for (const [k, v] of Object.entries(task)) yTask.set(k, v);
      yTasks.set(task.id, yTask);
    });
  }

  // タスク作成: REST API（ID生成・DB挿入）→ サーバー側でY.jsも更新
  // クライアントでも楽観的にY.jsへ追加（即時反映のため）
  async function createTask(input: Partial<Task> & { title: string }): Promise<Task> {
    const data = await apiFetch(`/projects/${projectId}/tasks`, {
      method: 'POST',
      body: JSON.stringify({ ...input, predecessors: input.predecessors ?? [] }),
    });
    ySet(data.task);
    return data.task as Task;
  }

  // タスク更新: Y.js直接書き込み → Hocuspocusが全クライアントに即時配信 → onStoreDocumentがDBを同期
  // REST API は呼ばない（外部REST経由の更新はサーバー側でY.jsも更新済み）
  async function updateTask(id: string, patch: Partial<Task>): Promise<void> {
    const ydoc = yTasks.doc!;
    ydoc.transact(() => {
      const yTask = yTasks.get(id);
      if (!yTask) return;
      for (const [k, v] of Object.entries(patch)) {
        yTask.set(k, v as unknown);
      }
    });
  }

  // タスク削除: REST API（カスケード削除・DB整合性）→ サーバー側でY.jsも更新
  async function deleteTask(id: string): Promise<void> {
    await apiFetch(`/tasks/${id}`, { method: 'DELETE' });
    const ydoc = yTasks.doc!;
    ydoc.transact(() => { yTasks.delete(id); });
  }

  async function reorderTasks(orders: { id: string; order: number }[]): Promise<void> {
    await apiFetch(`/projects/${projectId}/tasks/reorder`, {
      method: 'PATCH',
      body: JSON.stringify({ orders }),
    });
    const ydoc = yTasks.doc!;
    ydoc.transact(() => {
      for (const { id, order } of orders) {
        yTasks.get(id)?.set('order', order);
      }
    });
  }

  return { createTask, updateTask, deleteTask, reorderTasks };
}
