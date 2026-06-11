import type { Task } from '../types/task';
import { useTaskStore } from '../store/taskStore';
import { apiFetch } from '../utils/api';

export function useTasks(projectId: string) {
  // REST POST → サーバーが全クライアントへ task_created をブロードキャスト
  async function createTask(input: Partial<Task> & { title: string }): Promise<Task> {
    const data = await apiFetch(`/projects/${projectId}/tasks`, {
      method: 'POST',
      body: JSON.stringify({ ...input, predecessors: input.predecessors ?? [] }),
    });
    // 楽観的追加（ブロードキャストより先に到着する場合の保険）
    const store = useTaskStore.getState();
    if (!store.tasks.some(t => t.id === data.task.id)) {
      store.setTasks([...store.tasks, data.task]);
    }
    return data.task as Task;
  }

  // 楽観的更新 → REST PATCH → サーバーが全クライアントへ task_updated をブロードキャスト
  async function updateTask(id: string, patch: Partial<Task>): Promise<void> {
    const store = useTaskStore.getState();
    const prev = store.tasks;
    store.setTasks(prev.map(t => t.id === id ? { ...t, ...patch } : t));
    try {
      await apiFetch(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
    } catch (e) {
      store.setTasks(prev);
      throw e;
    }
  }

  // 楽観的削除 → REST DELETE → サーバーが全クライアントへ task_deleted をブロードキャスト
  // mode='subtree'（デフォルト）: 子孫ごと削除 / mode='single': 子を祖父母に付け替えて本体のみ削除
  async function deleteTask(id: string, mode: 'subtree' | 'single' = 'subtree'): Promise<void> {
    const store = useTaskStore.getState();
    const prev = store.tasks;

    if (mode === 'subtree') {
      const removed = new Set([id]);
      let grew = true;
      while (grew) {
        grew = false;
        for (const t of prev) {
          if (t.parentId && removed.has(t.parentId) && !removed.has(t.id)) {
            removed.add(t.id);
            grew = true;
          }
        }
      }
      store.setTasks(prev.filter(t => !removed.has(t.id)));
    } else {
      const newParentId = prev.find(t => t.id === id)?.parentId ?? null;
      store.setTasks(
        prev.filter(t => t.id !== id)
          .map(t => t.parentId === id ? { ...t, parentId: newParentId } : t)
      );
    }

    try {
      await apiFetch(`/tasks/${id}?mode=${mode}`, { method: 'DELETE' });
    } catch (e) {
      store.setTasks(prev);
      throw e;
    }
  }

  // 楽観的並び替え → REST PATCH → サーバーが全クライアントへ tasks_reordered をブロードキャスト
  async function reorderTasks(orders: { id: string; order: number; parentId?: string | null }[]): Promise<void> {
    const store = useTaskStore.getState();
    const prev = store.tasks;
    const map = new Map(orders.map(o => [o.id, o]));
    store.setTasks(prev.map(t => {
      const o = map.get(t.id);
      if (!o) return t;
      return { ...t, order: o.order, ...(o.parentId !== undefined ? { parentId: o.parentId } : {}) };
    }));
    try {
      await apiFetch(`/projects/${projectId}/tasks/reorder`, {
        method: 'PATCH',
        body: JSON.stringify({ orders }),
      });
    } catch (e) {
      store.setTasks(prev);
      throw e;
    }
  }

  return { createTask, updateTask, deleteTask, reorderTasks };
}
