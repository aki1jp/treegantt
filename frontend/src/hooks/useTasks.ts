import type { Task } from '../types/task';
import { useTaskStore } from '../store/taskStore';
import { apiFetch, shiftSubtree as shiftSubtreeApi } from '../utils/api';
import { addDays } from '../utils/ganttCalc';
import { buildChildrenMap } from '../utils/taskTree';

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

  // 親タスク配下の日付一括シフト: 子孫を楽観的にずらす → POST shift → レスポンスで upsert
  // 失敗時はロールバックして throw。サーバーは tasks_updated をブロードキャストする
  async function shiftSubtree(taskId: string, days: number): Promise<void> {
    const store = useTaskStore.getState();
    const prev = store.tasks;
    // 子孫収集（parentId→children の Map による O(N) 走査。visited により循環でも停止、根自身は除外）
    const childrenMap = buildChildrenMap(prev);
    const descendants = new Set<string>();
    const stack = [taskId];
    while (stack.length > 0) {
      for (const c of childrenMap.get(stack.pop()!) ?? []) {
        if (c.id === taskId || descendants.has(c.id)) continue;
        descendants.add(c.id);
        stack.push(c.id);
      }
    }
    // ロールバック用に、実際にシフトする子孫の元の値だけを保持する
    const originals: Task[] = [];
    for (const t of prev) {
      if (!descendants.has(t.id) || (!t.startDate && !t.endDate)) continue;
      originals.push(t);
      store.upsertTask({
        ...t,
        startDate: t.startDate ? addDays(t.startDate, days) : t.startDate,
        endDate: t.endDate ? addDays(t.endDate, days) : t.endDate,
      });
    }
    try {
      const updated = await shiftSubtreeApi(projectId, taskId, days);
      for (const t of updated) useTaskStore.getState().upsertTask(t);
    } catch (e) {
      // 子孫だけ元に戻す（待機中に WS で届いた他タスクの更新は巻き戻さない）
      for (const t of originals) useTaskStore.getState().upsertTask(t);
      throw e;
    }
  }

  return { createTask, updateTask, deleteTask, reorderTasks, batchCreateTasks, shiftSubtree };
}
