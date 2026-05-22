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
    store.setTasks(store.tasks.map(t => t.id === id ? { ...t, ...patch } : t));
    await apiFetch(`/tasks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  }

  // 楽観的削除 → REST DELETE → サーバーが全クライアントへ task_deleted をブロードキャスト
  async function deleteTask(id: string): Promise<void> {
    const store = useTaskStore.getState();
    store.setTasks(store.tasks.filter(t => t.id !== id));
    await apiFetch(`/tasks/${id}`, { method: 'DELETE' });
  }

  // 楽観的並び替え → REST PATCH → サーバーが全クライアントへ tasks_reordered をブロードキャスト
  async function reorderTasks(orders: { id: string; order: number }[]): Promise<void> {
    const store = useTaskStore.getState();
    const map = new Map(orders.map(o => [o.id, o.order]));
    store.setTasks(store.tasks.map(t => map.has(t.id) ? { ...t, order: map.get(t.id)! } : t));
    await apiFetch(`/projects/${projectId}/tasks/reorder`, {
      method: 'PATCH',
      body: JSON.stringify({ orders }),
    });
  }

  return { createTask, updateTask, deleteTask, reorderTasks };
}
