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
    useTaskStore.getState().upsertTask(data.task as Task);
    return data.task as Task;
  }

  // 楽観的更新 → REST PATCH → サーバーが全クライアントへ task_updated をブロードキャスト
  async function updateTask(id: string, patch: Partial<Task>): Promise<void> {
    const store = useTaskStore.getState();
    const prev = store.tasks;
    const existing = prev.find(t => t.id === id);
    if (existing) store.upsertTask({ ...existing, ...patch });
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

    // 削除IDへの依存（predecessors）の除去は store.removeTasks が一括で行う
    // （幽霊参照のまま PATCH するとサーバーでFK違反になるため）
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
      store.removeTasks([...removed]);
    } else {
      // 子を祖父母へ付け替えてから本体を削除
      const newParentId = prev.find(t => t.id === id)?.parentId ?? null;
      store.setTasks(prev.map(t => t.parentId === id ? { ...t, parentId: newParentId } : t));
      store.removeTasks([id]);
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
    store.applyOrders(orders);
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

  // サブツリー一括作成（v2.69）: 1リクエストで複数タスクを作成し tasks_created を受け取る
  async function batchCreateTasks(
    inputs: { parentRef: number | null; title: string; [key: string]: unknown }[],
    parentId: string | null,
  ): Promise<Task[]> {
    const data = await apiFetch(`/projects/${projectId}/tasks/batch`, {
      method: 'POST',
      body: JSON.stringify({ parentId, tasks: inputs }),
    });
    const tasks = data.tasks as Task[];
    // 楽観的追加（WS ブロードキャストより先に到着する場合の保険）
    for (const task of tasks) {
      useTaskStore.getState().upsertTask(task);
    }
    return tasks;
  }

  return { createTask, updateTask, deleteTask, reorderTasks, batchCreateTasks };
}
