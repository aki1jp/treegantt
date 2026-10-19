import { useMemo } from 'react';
import type { Task } from '../types/task';
import { useTaskStore } from '../store/taskStore';

// 空配列はモジュールスコープの定数で参照同一性を保つ（React.memo / useMemo 依存への影響を避ける）
const EMPTY_TASKS: Task[] = [];

/**
 * 現プロジェクトのタスクの読み出し口を一本化するフック（§5.8 の tasks 持ち主照合）。
 * ストアの tasks/tasksOwnerProjectId を読み、持ち主が現在プロジェクトと一致するときだけ
 * 実データと loaded:true を返す。不一致（プロジェクト切替直後〜取得完了前など）は
 * 空配列＋loaded:false を返し、旧プロジェクトのタスクが参照タスク（淡色＋🔗）として
 * 描画されるのを防ぐ。loaded:false は読み込み表示に使える。
 */
export function useProjectTaskData(currentProjectId: string | undefined): { tasks: Task[]; loaded: boolean } {
  const tasks               = useTaskStore(s => s.tasks);
  const tasksOwnerProjectId = useTaskStore(s => s.tasksOwnerProjectId);

  const owned = currentProjectId != null && tasksOwnerProjectId === currentProjectId;

  return useMemo(
    () => (owned ? { tasks, loaded: true } : { tasks: EMPTY_TASKS, loaded: false }),
    [owned, tasks],
  );
}
