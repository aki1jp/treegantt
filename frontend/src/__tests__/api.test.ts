import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// window.location.hostname を使うモジュールレベルコードのため jsdom 環境が必要
// @vitest-environment jsdom

// apiFetch は動的インポートで fetch を呼ぶため、stubGlobal で fetch を差し替える
import { apiFetch, fetchAllTasks } from '../utils/api';

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

describe('fetchAllTasks', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // limit/offset に応じて total 件のタスクをページ分割して返すモックサーバー
  function mockTaskPages(total: number) {
    vi.mocked(fetch).mockImplementation(async input => {
      const u = new URL(String(input));
      const limit = Number(u.searchParams.get('limit') ?? 500);
      const offset = Number(u.searchParams.get('offset') ?? 0);
      const count = Math.max(0, Math.min(limit, total - offset));
      const tasks = Array.from({ length: count }, (_, i) => ({ id: `t${offset + i}` }));
      return {
        ok: true,
        status: 200,
        json: async () => ({ tasks, total }),
      } as Response;
    });
  }

  it('total が1ページ以下なら1リクエストで全件返す', async () => {
    mockTaskPages(300);
    const result = await fetchAllTasks('p1');
    expect(result.tasks).toHaveLength(300);
    expect(result.total).toBe(300);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });

  it('total がちょうど1ページ分なら追加リクエストしない', async () => {
    mockTaskPages(1000);
    const result = await fetchAllTasks('p1');
    expect(result.tasks).toHaveLength(1000);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });

  it('total=2500 は3リクエストで全件を順序通り結合する', async () => {
    mockTaskPages(2500);
    const result = await fetchAllTasks('p1');
    expect(result.tasks).toHaveLength(2500);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(3);
    // 欠落・重複・順序乱れがないこと
    expect(result.tasks.map(t => t.id)).toEqual(
      Array.from({ length: 2500 }, (_, i) => `t${i}`),
    );
    // 2ページ目以降は offset を進めてリクエストしていること
    const urls = vi.mocked(fetch).mock.calls.map(c => String(c[0]));
    expect(urls[1]).toContain('offset=1000');
    expect(urls[2]).toContain('offset=2000');
  });

  it('total=0 の空プロジェクトは1リクエストで空配列を返す', async () => {
    mockTaskPages(0);
    const result = await fetchAllTasks('p1');
    expect(result.tasks).toEqual([]);
    expect(result.total).toBe(0);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });

  it('total と不整合な空ページが返っても無限ループせず打ち切る', async () => {
    // total=5000 を主張しつつ2ページ目以降が常に空、という壊れたサーバー
    let call = 0;
    vi.mocked(fetch).mockImplementation(async () => {
      call++;
      const tasks = call === 1 ? Array.from({ length: 1000 }, (_, i) => ({ id: `t${i}` })) : [];
      return { ok: true, status: 200, json: async () => ({ tasks, total: 5000 }) } as Response;
    });
    const result = await fetchAllTasks('p1');
    expect(result.tasks).toHaveLength(1000);
    expect(vi.mocked(fetch).mock.calls.length).toBeLessThanOrEqual(2);
  });
});
