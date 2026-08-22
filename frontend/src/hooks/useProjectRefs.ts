import { useCallback, useEffect, useRef, useState } from 'react';
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

  // stale レスポンス破棄用の世代カウンタ。load() はエフェクト外（add/remove/refresh）からも
  // 呼ばれるため AddRefFlow.tsx の `let alive = true`（エフェクトスコープの単純フラグ）方式は
  // 使えない。projectId 切替・多重発火のいずれでも「直近に発火した1件だけ勝つ」よう、
  // 発火のたびに採番し、コールバック実行時点の最新世代と食い違えば全処理を破棄する。
  const genRef = useRef(0);

  const load = useCallback(() => {
    // 世代は projectId の有無に関わらず先に進める。projectId が未選択（プロジェクト全削除など）
    // へ遷移したときにここで先に return してしまうと、in-flight の旧世代が finally で
    // setLoading(false) できず loading が true のまま固着する。
    const gen = ++genRef.current;
    if (!projectId) { setLoading(false); return; }
    setLoading(true);
    return fetchProjectRefs(projectId)
      .then(d => {
        if (gen !== genRef.current) return;
        setRefs(d.refs);
        setRefData(d.tasks, d.projects, projectId);
      })
      .catch((err: Error) => {
        if (gen !== genRef.current) return;
        // useCallback のクロージャで locale を固定しないよう、catch 実行時点の最新 locale を読み直す
        const currentLocale = useTaskStore.getState().locale;
        const msg = dictionaries[currentLocale]['refManager.toast.loadFailed']
          .replaceAll('{message}', apiErrorMessage(err, currentLocale));
        showToast(msg, 'error');
      })
      .finally(() => {
        if (gen !== genRef.current) return;
        setLoading(false);
      });
  }, [projectId, setRefData]);

  useEffect(() => {
    // in-flight の旧世代は直後の load() が採番する新世代で無効化される
    // （projectId が未選択でも load() は世代だけ進めてから return する）
    setRefs([]);
    setRefData([], [], projectId ?? null);
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
      // PATCH 自体は完了済みなので、持ち主不一致（プロジェクト切替済み）でもエラー扱いにはしない。
      // 単に現在の refTasks への反映を見送る（stale データで上書きしないため）。
      if (useTaskStore.getState().refOwnerProjectId === projectId) {
        upsertRefTask(data.task as Task);
      }
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
