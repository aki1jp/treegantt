// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchHealth, apiFetch } from '../utils/api';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchHealth', () => {
  it('成功時に JSON（version 含む）を返す', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok', version: '1.0.0' }),
    } as Response);
    const h = await fetchHealth();
    expect(h.status).toBe('ok');
    expect(h.version).toBe('1.0.0');
  });

  it('!ok のとき throw する', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 500 } as Response);
    await expect(fetchHealth()).rejects.toThrow();
  });
});

describe('apiFetch', () => {
  it('!ok のとき body.error を含む Error を throw する', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'bad request' }),
    } as Response);
    await expect(apiFetch('/x')).rejects.toThrow('bad request');
  });

  it('204 No Content は null を返す', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, status: 204 } as Response);
    expect(await apiFetch('/x', { method: 'DELETE' })).toBeNull();
  });

  it('200 は JSON を返す', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ tasks: [] }),
    } as Response);
    expect(await apiFetch('/projects/p/tasks')).toEqual({ tasks: [] });
  });
});
