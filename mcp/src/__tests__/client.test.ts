import { describe, it, expect, vi, afterEach } from 'vitest';
import { apiFetch } from '../client.js';

describe('apiFetch', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('既定のベースURL(http://localhost:4000)に /api/v1 を付けて GET する', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ projects: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await apiFetch('/projects');

    expect(fetchMock).toHaveBeenCalledWith('http://localhost:4000/api/v1/projects');
    expect(result).toEqual({ projects: [] });
  });

  it('API_BASE_URL 環境変数が設定されていればそちらを使う', async () => {
    vi.stubEnv('API_BASE_URL', 'http://example.test:9999');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ settings: {} }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await apiFetch('/settings');

    expect(fetchMock).toHaveBeenCalledWith('http://example.test:9999/api/v1/settings');
  });

  it('レスポンスが ok でなければエラーを投げる', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: 'not found' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiFetch('/tasks/missing')).rejects.toThrow('not found');
  });
});
