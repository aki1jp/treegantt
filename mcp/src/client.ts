// TreeGantt の REST API を叩くだけの薄いクライアント。
// frontend/src/utils/api.ts の apiFetch と同じ立場（api内部の services/* は直接importしない）。
export async function apiFetch(path: string): Promise<unknown> {
  const base = process.env.API_BASE_URL ?? 'http://localhost:4000';
  const res = await fetch(`${base}/api/v1${path}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json();
}
