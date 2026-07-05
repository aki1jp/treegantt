import { useEffect, useRef, useState } from 'react';
import { useTaskStore } from '../store/taskStore';
import { showToast } from '../store/toastStore';
import { fetchAllTasks } from '../utils/api';

// 選択中プロジェクトのタスク取得（初回・切替時・reload イベント）を担うフック。
// 失敗時は無言で握りつぶさず、エラートーストを出す（§9.9）。
// 加えて、切替時取得の失敗は呼び出し側が再試行ボタン付きの可視エラー
// 表示に使えるよう error/retry を返す。
export function useProjectTasks(
  projectId: string | undefined,
  onLoaded?: (total: number) => void,
) {
  const setTasks       = useTaskStore(s => s.setTasks);
  const needsReload    = useTaskStore(s => s.needsReload);
  const setNeedsReload = useTaskStore(s => s.setNeedsReload);
  const [error, setError] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);

  // onLoaded は毎レンダー新しい関数になり得るため ref 経由で参照し、
  // タスク取得エフェクトの依存に含めない（プロジェクト切替のみで再取得したい）。
  const onLoadedRef = useRef(onLoaded);
  useEffect(() => { onLoadedRef.current = onLoaded; }, [onLoaded]);

  // プロジェクト切替時（または retry() 呼び出し時）: タスクを REST から即時取得
  useEffect(() => {
    if (!projectId) return;
    setError(null);
    fetchAllTasks(projectId)
      .then(d => {
        setTasks(d.tasks);
        onLoadedRef.current?.(d.total);
      })
      .catch((err: Error) => {
        setError('タスクの取得に失敗しました');
        showToast('タスクの取得に失敗しました: ' + err.message, 'error');
      });
  }, [projectId, retryTick]);

  // reload イベント受信時（import 後など）: タスクを再フェッチ
  useEffect(() => {
    if (!needsReload || !projectId) return;
    setNeedsReload(false);
    fetchAllTasks(projectId)
      .then(d => setTasks(d.tasks))
      .catch((err: Error) => {
        showToast('再読み込みに失敗しました: ' + err.message, 'error');
      });
  }, [needsReload]);

  return { error, retry: () => setRetryTick(t => t + 1) };
}
