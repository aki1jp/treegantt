import type { Task } from '../types/task';

const API_BASE = import.meta.env.VITE_API_URL ?? `http://${window.location.hostname}:4000`;

export async function apiFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${API_BASE}/api/v1${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.status === 204 ? null : res.json();
}

export interface HealthInfo {
  status: string;
  version?: string;
  timestamp?: string;
}

// バックエンドの /health（API_PREFIX 外に登録されている）を取得する。
// バージョン表示用。失敗時は呼び出し側で握りつぶす。
export async function fetchHealth(): Promise<HealthInfo> {
  const res = await fetch(`${API_BASE}/health`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const TASK_PAGE_SIZE = 1000;

// プロジェクトの全タスクをページングで取得する。
// API の listTasks はデフォルト limit=500 で切り捨てるため、レスポンスの total に
// 達するまで offset を進めて取得・結合する（固定 limit 明示だと件数増で再発する）。
export async function fetchAllTasks(
  projectId: string,
): Promise<{ tasks: Task[]; total: number }> {
  const tasks: Task[] = [];
  let total = 0;
  for (;;) {
    const page = (await apiFetch(
      `/projects/${projectId}/tasks?limit=${TASK_PAGE_SIZE}&offset=${tasks.length}`,
    )) as { tasks: Task[]; total?: number };
    tasks.push(...page.tasks);
    total = page.total ?? tasks.length;
    // 全件揃ったら終了。total と不整合な空ページは無限ループ防止のため打ち切る
    if (tasks.length >= total || page.tasks.length === 0) break;
  }
  return { tasks, total };
}
