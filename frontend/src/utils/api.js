const API_BASE = import.meta.env.VITE_API_URL ?? `http://${window.location.hostname}:4000`;
export async function apiFetch(path, init) {
    const res = await fetch(`${API_BASE}/api/v1${path}`, {
        headers: { 'Content-Type': 'application/json' },
        ...init,
    });
    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
    }
    return res.status === 204 ? null : res.json();
}
