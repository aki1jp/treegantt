import { describe, it, expect, vi, afterEach } from 'vitest';
import { apiFetch, apiMutate } from '../client.js';

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

  it('エラー時、レスポンスボディが JSON として壊れていても HTTP ステータスでフォールバックする', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => {
        throw new SyntaxError('Unexpected token in JSON');
      },
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiFetch('/projects')).rejects.toThrow('HTTP 502');
  });

  it('エラーボディに error フィールドが無ければ HTTP ステータスでフォールバックする', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ message: 'internal' }), // error フィールドではない
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiFetch('/settings')).rejects.toThrow('HTTP 500');
  });

  it('fetch 自体が失敗（ネットワークエラー）した場合はそのまま伝播する（握りつぶさない）', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiFetch('/projects')).rejects.toThrow('network down');
  });

  it('成功時でもレスポンスボディが壊れたJSONなら失敗を伝播する（黙って握りつぶさない）', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected end of JSON input');
      },
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiFetch('/projects')).rejects.toThrow(/Unexpected end of JSON input/);
  });

  it('GET 以外のメソッドやボディを送りようがない（read-onlyであることを構造的に保証）', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    });
    vi.stubGlobal('fetch', fetchMock);

    await apiFetch('/projects');

    // apiFetch は URL 文字列のみを fetch に渡す。第2引数(RequestInit)自体が存在しない
    // ＝呼び出し側からメソッドやボディを注入する経路がない。
    expect(fetchMock.mock.calls[0]).toHaveLength(1);
  });
});

describe('apiMutate', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('ボディ付きPOSTはメソッド・Content-Type・JSON文字列化したボディを送る', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ task: { id: 't1', title: '新規タスク' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await apiMutate('POST', '/projects/p1/tasks', { title: '新規タスク' });

    expect(fetchMock).toHaveBeenCalledWith('http://localhost:4000/api/v1/projects/p1/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '新規タスク' }),
    });
    expect(result).toEqual({ task: { id: 't1', title: '新規タスク' } });
  });

  it('ボディ無しDELETEはContent-Type・bodyを付けない', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);

    const result = await apiMutate('DELETE', '/tasks/t1');

    expect(fetchMock).toHaveBeenCalledWith('http://localhost:4000/api/v1/tasks/t1', {
      method: 'DELETE',
      headers: undefined,
      body: undefined,
    });
    expect(result).toBeNull();
  });

  it('PATCHもAPI_BASE_URL環境変数を反映する', async () => {
    vi.stubEnv('API_BASE_URL', 'http://example.test:9999');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ task: {} }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await apiMutate('PATCH', '/tasks/t1', { progress: 50 });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://example.test:9999/api/v1/tasks/t1',
      expect.objectContaining({ method: 'PATCH' }),
    );
  });

  it('レスポンスが ok でなければ apiFetch と同じ規則でエラーを投げる', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: 'Task not found' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiMutate('DELETE', '/tasks/missing')).rejects.toThrow('Task not found');
  });

  it('fetch自体が失敗した場合はそのまま伝播する（握りつぶさない）', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiMutate('POST', '/projects/p1/tasks', { title: 'x' })).rejects.toThrow(
      'network down',
    );
  });
});
