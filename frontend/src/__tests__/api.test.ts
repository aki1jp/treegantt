import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// window.location.hostname を使うモジュールレベルコードのため jsdom 環境が必要
// @vitest-environment jsdom

// apiFetch は動的インポートで fetch を呼ぶため、stubGlobal で fetch を差し替える
import { apiFetch } from '../utils/api';

describe('apiFetch', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('200 レスポンスは JSON を返す', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: '1', title: 'test' }),
    } as Response);

    const result = await apiFetch('/projects');
    expect(result).toEqual({ id: '1', title: 'test' });
  });

  it('204 レスポンスは null を返す', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 204,
      json: async () => null,
    } as Response);

    const result = await apiFetch('/tasks/1', { method: 'DELETE' });
    expect(result).toBeNull();
  });

  it('エラーレスポンスは error フィールドのメッセージで throw する', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: 'Not found' }),
    } as Response);

    await expect(apiFetch('/tasks/999')).rejects.toThrow('Not found');
  });

  it('エラーレスポンスで JSON パース失敗時は HTTP ステータスで throw する', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => { throw new Error('parse error'); },
    } as unknown as Response);

    await expect(apiFetch('/tasks/999')).rejects.toThrow('HTTP 500');
  });
});
