import { useCallback, useEffect, useState } from 'react';
import type { Task, TaskRef } from '../types/task';
import { useTaskStore } from '../store/taskStore';
import { showToast } from '../store/toastStore';
import { apiFetch, fetchProjectRefs, addProjectRef, removeProjectRef } from '../utils/api';
import { apiErrorMessage, dictionaries } from '../i18n/apiError';

// クロスプロジェクト参照（§5.8）のロード・追加・解除・跨ぎ依存更新を担うフック。
// R1（本リリース）はスナップショット方式: プロジェクト切替時ロード＋手動 refresh() のみ。
export function useProjectRefs(projectId: string | undefined) {
  const setRefData    = useTaskStore(s => s.setRefData);
  const upsertRefTask = useTaskStore(s => s.upsertRefTask);
  const [refs, setRefs]       = useState<TaskRef[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    if (!projectId) return;
    setLoading(true);
    return fetchProjectRefs(projectId)
      .then(d => {
        setRefs(d.refs);
        setRefData(d.tasks, d.projects);
      })
      .catch((err: Error) => {
        // useCallback のクロージャで locale を固定しないよう、catch 実行時点の最新 locale を読み直す
        const currentLocale = useTaskStore.getState().locale;
        const msg = dictionaries[currentLocale]['refManager.toast.loadFailed']
          .replaceAll('{message}', apiErrorMessage(err, currentLocale));
        showToast(msg, 'error');
      })
      .finally(() => setLoading(false));
  }, [projectId, setRefData]);

  useEffect(() => {
    setRefs([]);
    setRefData([], []);
    void load();
    // projectId 変化時のみ再ロードする（load 自体は setRefData 経由で毎回再生成されるが依存に含めない）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function add(refTaskId: string): Promise<void> {
    if (!projectId) return;
    try {
      await addProjectRef(projectId, refTaskId);
      await load();
    } catch (err) {
      const currentLocale = useTaskStore.getState().locale;
      const msg = dictionaries[currentLocale]['refManager.toast.addFailed']
        .replaceAll('{message}', apiErrorMessage(err, currentLocale));
      showToast(msg, 'error');
      throw err;
    }
  }

  async function remove(refTaskId: string): Promise<void> {
    if (!projectId) return;
    try {
      await removeProjectRef(projectId, refTaskId);
      await load();
    } catch (err) {
      const currentLocale = useTaskStore.getState().locale;
      const msg = dictionaries[currentLocale]['refManager.toast.removeFailed']
        .replaceAll('{message}', apiErrorMessage(err, currentLocale));
      showToast(msg, 'error');
      throw err;
    }
  }

  // 後続タスクが参照タスク側にあるクロス依存の更新専用経路。
  // ⚠️ useTasks.updateTask は使わない: 楽観的更新が `tasks` スロットへ書き込むため、
  // 参照タスク（他プロジェクト所属）が現プロジェクトの tasks に紛れ込んでしまう。
  async function updateExternalPredecessors(refTaskId: string, predecessors: string[]): Promise<void> {
    try {
      const data = await apiFetch(`/tasks/${refTaskId}`, {
        method: 'PATCH', body: JSON.stringify({ predecessors }),
      });
      upsertRefTask(data.task as Task);
    } catch (err) {
      const currentLocale = useTaskStore.getState().locale;
      const msg = dictionaries[currentLocale]['refManager.toast.updatePredecessorsFailed']
        .replaceAll('{message}', apiErrorMessage(err, currentLocale));
      showToast(msg, 'error');
      throw err;
    }
  }

  return { refs, loading, refresh: load, add, remove, updateExternalPredecessors };
}
