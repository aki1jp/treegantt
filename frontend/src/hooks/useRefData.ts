import { useMemo } from 'react';
import type { Task, RefProject } from '../types/task';
import { useTaskStore } from '../store/taskStore';

// 空配列はモジュールスコープの定数で参照同一性を保つ（React.memo / useMemo 依存への影響を避ける）
const EMPTY_TASKS: Task[] = [];
const EMPTY_PROJECTS: RefProject[] = [];

/**
 * クロスプロジェクト参照（§5.8）の読み出し口を一本化するフック。
 * ストアの refTasks/refProjects/refOwnerProjectId を読み、持ち主（refOwnerProjectId）が
 * 現在プロジェクトと一致するときだけ実データを返す。不一致（プロジェクト切替と非同期
 * レスポンスの競合で stale なデータが残っている等）は空扱いにする＝最終防衛線。
 */
export function useRefData(currentProjectId: string | undefined): { refTasks: Task[]; refProjects: RefProject[] } {
  const refTasks          = useTaskStore(s => s.refTasks);
  const refProjects       = useTaskStore(s => s.refProjects);
  const refOwnerProjectId = useTaskStore(s => s.refOwnerProjectId);

  const owned = currentProjectId != null && refOwnerProjectId === currentProjectId;

  return useMemo(
    () => (owned ? { refTasks, refProjects } : { refTasks: EMPTY_TASKS, refProjects: EMPTY_PROJECTS }),
    [owned, refTasks, refProjects],
  );
}
