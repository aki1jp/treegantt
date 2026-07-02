// TreeGantt の REST API を叩くだけの薄いクライアント。
// frontend/src/utils/api.ts の apiFetch と同じ立場（api内部の services/* は直接importしない）。

function apiUrl(path: string): string {
  const base = process.env.API_BASE_URL ?? 'http://localhost:4000';
  return `${base}/api/v1${path}`;
}

async function parseResponse(res: Response): Promise<unknown> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.status === 204 ? null : res.json();
}

// 読み取り専用ツール用。GETのみで、メソッドやボディを渡す経路が無い
// （docs/ai_integration_policy.md §4.1）。
export async function apiFetch(path: string): Promise<unknown> {
  const res = await fetch(apiUrl(path));
  return parseResponse(res);
}

// 書き込みツール（段階1）用。POST/PATCH/DELETEのみ許可する
// （docs/ai_integration_policy.md §4.2）。
export async function apiMutate(
  method: 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<unknown> {
  const hasBody = body !== undefined;
  const res = await fetch(apiUrl(path), {
    method,
    headers: hasBody ? { 'Content-Type': 'application/json' } : undefined,
    body: hasBody ? JSON.stringify(body) : undefined,
  });
  return parseResponse(res);
}
