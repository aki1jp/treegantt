import { useEffect, useRef, useState } from 'react';
import { useTaskStore } from '../store/taskStore';
import { showToast } from '../store/toastStore';
import { fetchAllTasks } from '../utils/api';
import { apiErrorMessage, dictionaries } from '../i18n/apiError';

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

  // reload イベント経路（下記）は projectId を依存配列に含めないため、切替を検知する
  // 目的で常に最新の projectId をレンダー毎に ref へ同期しておく。
  // （アンマウント時にクリアはしない：StrictMode の mount→unmount→mount では
  //  間にレンダーが挟まらず ref が undefined のまま残り、正常な reload まで
  //  stale 扱いで捨ててしまうため。）
  const projectIdRef = useRef(projectId);
  projectIdRef.current = projectId;

  // プロジェクト切替時（または retry() 呼び出し時）: タスクを REST から即時取得
  // alive フラグでプロジェクト切替と取得の競合を防ぐ（他プロジェクトのタスクが誤って
  // 表示されないよう、発火時の projectId が今も現在プロジェクトかを検証してから反映する）。
  useEffect(() => {
    if (!projectId) return;
    let alive = true;
    setError(null);
    fetchAllTasks(projectId)
      .then(d => {
        if (!alive) return;
        setTasks(d.tasks);
        onLoadedRef.current?.(d.total);
      })
      .catch((err: Error) => {
        if (!alive) return;
        // 空 dep 相当のクロージャで locale を固定しないよう、catch 実行時点の最新 locale を読み直す
        const currentLocale = useTaskStore.getState().locale;
        setError(dictionaries[currentLocale]['hooks.error.tasksFetchFailed']);
        const msg = dictionaries[currentLocale]['hooks.toast.tasksFetchFailed']
          .replaceAll('{message}', apiErrorMessage(err, currentLocale));
        showToast(msg, 'error');
      });
    return () => { alive = false; };
  }, [projectId, retryTick]);

  // reload イベント受信時（import 後など）: タスクを再フェッチ
  // このエフェクトは needsReload のみを依存に持ち、かつ発火直後に自ら
  // setNeedsReload(false) を呼ぶため、effect 内ローカルな alive フラグ＋
  // クリーンアップの組では「自分自身の再実行」で即座に stale 扱いになってしまい
  // 使えない。代わりに、発火時に捕捉した projectId を上記の projectIdRef（常に
  // 最新のプロジェクトを指す）と比較し、切替後の後着レスポンスで他プロジェクトの
  // タスクを上書きしないようにする。
  useEffect(() => {
    if (!needsReload || !projectId) return;
    const requestedProjectId = projectId;
    setNeedsReload(false);
    fetchAllTasks(projectId)
      .then(d => {
        if (projectIdRef.current !== requestedProjectId) return;
        setTasks(d.tasks);
      })
      .catch((err: Error) => {
        if (projectIdRef.current !== requestedProjectId) return;
        // 空 dep 相当のクロージャで locale を固定しないよう、catch 実行時点の最新 locale を読み直す
        const currentLocale = useTaskStore.getState().locale;
        const msg = dictionaries[currentLocale]['hooks.toast.reloadFailed']
          .replaceAll('{message}', apiErrorMessage(err, currentLocale));
        showToast(msg, 'error');
      });
  }, [needsReload]);

  return { error, retry: () => setRetryTick(t => t + 1) };
}
