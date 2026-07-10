import type { Task, AppSettings, Project, TaskRef, RefProject } from '../types/task';

const API_BASE = import.meta.env.VITE_API_URL ?? `http://${window.location.hostname}:4000`;

export const API_DOCS_URL = `${API_BASE}/docs`;

// バックエンドが返す { error, code } の code を保持するエラー型。
// i18n/apiError.ts の apiErrorMessage() が code を辞書引きして表示用文言へ変換する。
export class ApiError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
    this.name = 'ApiError';
  }
}

export async function apiFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${API_BASE}/api/v1${path}`, {
    ...init,
    headers: {
      // ボディがある時だけ付与する。空ボディ（DELETE 等）に application/json を
      // 付けると Fastify が FST_ERR_CTP_EMPTY_JSON_BODY(400) を返すため。
      ...(init?.body != null ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers as Record<string, string> | undefined),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const { error, code } = body as { error?: string; code?: string };
    throw new ApiError(error ?? `HTTP ${res.status}`, code);
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

// ── リソース設定（アプリ既定） ───────────────────────────────────────────────
export async function fetchSettings(): Promise<AppSettings> {
  return (await apiFetch('/settings')) as AppSettings;
}

export async function updateAppSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  return (await apiFetch('/settings', { method: 'PUT', body: JSON.stringify(patch) })) as AppSettings;
}

// ── プロジェクトのリソース設定上書き（継承）─────────────────────────────────
export async function updateProjectResource(
  projectId: string,
  patch: { capacityMinutesPerDay?: number | null; workingDays?: number[] | null },
): Promise<Project> {
  const data = (await apiFetch(`/projects/${projectId}`, {
    method: 'PATCH', body: JSON.stringify(patch),
  })) as { project: Project };
  return data.project;
}

// ── クロスプロジェクト参照（task_refs, §5.8）───────────────────────────────
export async function fetchProjectRefs(
  projectId: string,
): Promise<{ refs: TaskRef[]; tasks: Task[]; projects: RefProject[] }> {
  return (await apiFetch(`/projects/${projectId}/refs`)) as {
    refs: TaskRef[]; tasks: Task[]; projects: RefProject[];
  };
}

export async function addProjectRef(projectId: string, refTaskId: string): Promise<TaskRef> {
  const data = (await apiFetch(`/projects/${projectId}/refs`, {
    method: 'POST', body: JSON.stringify({ refTaskId }),
  })) as { ref: TaskRef };
  return data.ref;
}

export async function removeProjectRef(projectId: string, refTaskId: string): Promise<void> {
  await apiFetch(`/projects/${projectId}/refs/${refTaskId}`, { method: 'DELETE' });
}
