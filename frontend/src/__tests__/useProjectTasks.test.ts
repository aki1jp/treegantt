// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useProjectTasks } from '../hooks/useProjectTasks';
import { useTaskStore } from '../store/taskStore';
import { useToastStore } from '../store/toastStore';
import type { Task } from '../types/task';

function makeTask(id: string): Task {
  return {
    id, projectId: 'p1', parentId: null,
    title: 'タスク', summary: '', description: '',
    status: 'todo', priority: 'medium', progress: 0, assignee: '',
    startDate: null, endDate: null, isMilestone: false,
    predecessors: [], seq: 1, order: 1,
    createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    titleColor: null, titleBgColor: null, estimateMinutes: null,
  };
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
  useTaskStore.setState({ tasks: [], tasksOwnerProjectId: null, needsReload: false });
  useToastStore.setState({ toasts: [] });
});
afterEach(() => {
  // 前テストのフックが残ると needsReload 等のストア変更に反応して
  // 後続テストの fetch を撹乱するため、毎回アンマウントする
  cleanup();
  vi.unstubAllGlobals();
});

describe('useProjectTasks', () => {
  it('projectId 指定時に全タスクを取得してストアへ反映する', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ tasks: [makeTask('t1')], total: 1 }),
    } as Response);

    const { result } = renderHook(() => useProjectTasks('p1'));
    await act(async () => {});
    expect(useTaskStore.getState().tasks).toHaveLength(1);
    expect(result.current.error).toBeNull();
  });

  it('取得失敗時に error を返しエラートーストを出す', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() => useProjectTasks('p1'));
    await act(async () => {});
    expect(result.current.error).toBeTruthy();
    expect(useToastStore.getState().toasts.some(t => t.type === 'error')).toBe(true);
  });

  it('retry で再取得し、成功すると error が消える', async () => {
    vi.mocked(fetch)
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ tasks: [], total: 0 }) } as Response);

    const { result } = renderHook(() => useProjectTasks('p1'));
    await act(async () => {});
    expect(result.current.error).toBeTruthy();

    await act(async () => { result.current.retry(); });
    expect(result.current.error).toBeNull();
  });

  it('projectId が未指定のときは何も取得しない', async () => {
    renderHook(() => useProjectTasks(undefined));
    await act(async () => {});
    expect(fetch).not.toHaveBeenCalled();
  });

  it('needsReload が true のとき再取得し、完了後 false に戻す', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ tasks: [makeTask('t2')], total: 1 }),
    } as Response);

    renderHook(() => useProjectTasks('p1'));
    await act(async () => {});
    vi.mocked(fetch).mockClear();
    useTaskStore.getState().setNeedsReload(true);
    await act(async () => {});
    expect(useTaskStore.getState().needsReload).toBe(false);
    expect(fetch).toHaveBeenCalled();
  });

  it('reload 失敗時はエラートーストを出す', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => ({ tasks: [], total: 0 }),
    } as Response);

    renderHook(() => useProjectTasks('p1'));
    await act(async () => {});
    vi.mocked(fetch).mockRejectedValue(new Error('reload failed'));
    useTaskStore.getState().setNeedsReload(true);
    await act(async () => {});
    expect(useToastStore.getState().toasts.some(t => t.type === 'error')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// stale レスポンスガード: プロジェクト切替と取得の競合で他プロジェクトのタスクが
// 表示されるのを防ぐ（A→B 切替後に A の遅延レスポンスが届いても無視すること）
describe('useProjectTasks — stale レスポンスガード', () => {
  function deferred<T>() {
    let resolve!: (v: T) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
  }

  it('A→B に切り替えた後で A の fetchAllTasks が遅延解決しても、ストアの tasks が A のもので上書きされない', async () => {
    const defA = deferred<Response>();
    const defB = deferred<Response>();
    vi.mocked(fetch).mockImplementation((url: unknown) => {
      const u = String(url);
      if (u.includes('/projects/pA/')) return defA.promise;
      if (u.includes('/projects/pB/')) return defB.promise;
      return Promise.reject(new Error('unexpected url: ' + u));
    });

    const { rerender } = renderHook(
      ({ projectId }) => useProjectTasks(projectId),
      { initialProps: { projectId: 'pA' } },
    );
    await act(async () => {}); // A への取得が発火（未解決のまま）

    rerender({ projectId: 'pB' });
    await act(async () => {}); // B への取得が発火（未解決のまま）

    // B のレスポンスが先に返る
    await act(async () => {
      defB.resolve({ ok: true, status: 200, json: async () => ({ tasks: [makeTask('tB')], total: 1 }) } as Response);
    });
    expect(useTaskStore.getState().tasks.map(t => t.id)).toEqual(['tB']);

    // 遅れて A のレスポンスが返っても、既に切り替わった B の表示を上書きしない
    await act(async () => {
      defA.resolve({ ok: true, status: 200, json: async () => ({ tasks: [makeTask('tA')], total: 1 }) } as Response);
    });
    expect(useTaskStore.getState().tasks.map(t => t.id)).toEqual(['tB']);
  });

  it('stale なレスポンスの失敗ではエラートースト／error state を出さない', async () => {
    const defA = deferred<Response>();
    vi.mocked(fetch).mockImplementation((url: unknown) => {
      const u = String(url);
      if (u.includes('/projects/pA/')) return defA.promise;
      if (u.includes('/projects/pB/')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ tasks: [], total: 0 }) } as Response);
      }
      return Promise.reject(new Error('unexpected url: ' + u));
    });

    const { result, rerender } = renderHook(
      ({ projectId }) => useProjectTasks(projectId),
      { initialProps: { projectId: 'pA' } },
    );
    await act(async () => {}); // A への取得が発火（未解決のまま）

    rerender({ projectId: 'pB' });
    await act(async () => {}); // B への取得が発火・解決（成功）

    // 遅れて A の取得が失敗しても、既に B に切り替わっているので無視される
    await act(async () => {
      defA.reject(new Error('boom'));
    });
    expect(result.current.error).toBeNull();
    expect(useToastStore.getState().toasts.some(t => t.type === 'error')).toBe(false);
  });

  it('reload 経路でも、A→B 切替後に届いた A の再取得レスポンスが B の表示を上書きしない', async () => {
    const defAReload = deferred<Response>();
    let aCalls = 0;
    vi.mocked(fetch).mockImplementation((url: unknown) => {
      const u = String(url);
      if (u.includes('/projects/pA/')) {
        aCalls += 1;
        // 1回目＝切替時の初回取得（即解決）、2回目＝needsReload 経由の再取得（保留したまま）
        return aCalls === 1
          ? Promise.resolve({ ok: true, status: 200, json: async () => ({ tasks: [makeTask('tA')], total: 1 }) } as Response)
          : defAReload.promise;
      }
      if (u.includes('/projects/pB/')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ tasks: [makeTask('tB')], total: 1 }) } as Response);
      }
      return Promise.reject(new Error('unexpected url: ' + u));
    });

    const { rerender } = renderHook(
      ({ projectId }) => useProjectTasks(projectId),
      { initialProps: { projectId: 'pA' } },
    );
    await act(async () => {});
    expect(useTaskStore.getState().tasks.map(t => t.id)).toEqual(['tA']);

    // import 後などの reload イベントで A の再取得が始まる（未解決のまま）
    await act(async () => { useTaskStore.setState({ needsReload: true }); });

    rerender({ projectId: 'pB' });
    await act(async () => {});
    expect(useTaskStore.getState().tasks.map(t => t.id)).toEqual(['tB']);

    // 遅れて A の再取得が返っても、既に切り替わった B の表示を上書きしない
    await act(async () => {
      defAReload.resolve({ ok: true, status: 200, json: async () => ({ tasks: [makeTask('tA2')], total: 1 }) } as Response);
    });
    expect(useTaskStore.getState().tasks.map(t => t.id)).toEqual(['tB']);
  });

  it('取得結果を持ち主 tasksOwnerProjectId と同時にストアへ反映する', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ tasks: [makeTask('t1')], total: 1 }),
    } as Response);
    renderHook(() => useProjectTasks('p1'));
    await act(async () => {});
    expect(useTaskStore.getState().tasksOwnerProjectId).toBe('p1');
  });

  it('切替後に届いた旧プロジェクトの後着レスポンスで tasks / 持ち主を上書きしない', async () => {
    let resolveOld!: (r: Response) => void;
    const oldRes = new Promise<Response>(r => { resolveOld = r; });
    const newTask = { ...makeTask('n1'), projectId: 'p2' };
    vi.mocked(fetch)
      .mockReturnValueOnce(oldRes)
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ tasks: [newTask], total: 1 }) } as Response);

    const { rerender } = renderHook(({ id }) => useProjectTasks(id), { initialProps: { id: 'p1' } });
    rerender({ id: 'p2' });
    await act(async () => {});
    expect(useTaskStore.getState().tasksOwnerProjectId).toBe('p2');

    await act(async () => {
      resolveOld({ ok: true, status: 200, json: async () => ({ tasks: [makeTask('o1')], total: 1 }) } as Response);
    });
    expect(useTaskStore.getState().tasks.map(t => t.id)).toEqual(['n1']);
    expect(useTaskStore.getState().tasksOwnerProjectId).toBe('p2');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 多言語対応（i18n）: locale: 'en' でのトースト/エラー表示テスト（既存の ja テストは変更しない）
describe('useProjectTasks — 多言語対応（locale: en）', () => {
  afterEach(() => {
    useTaskStore.setState({ locale: 'ja' });
  });

  it('取得失敗時、error とトーストが英語表示になる', async () => {
    useTaskStore.setState({ locale: 'en' });
    vi.mocked(fetch).mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() => useProjectTasks('p1'));
    await act(async () => {});
    expect(result.current.error).toBe('Failed to fetch tasks');
    expect(useToastStore.getState().toasts.some(t => t.message.includes('Failed to fetch tasks: boom'))).toBe(true);
  });

  it('reload 失敗時、トーストが英語表示になる', async () => {
    useTaskStore.setState({ locale: 'en' });
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => ({ tasks: [], total: 0 }),
    } as Response);

    renderHook(() => useProjectTasks('p1'));
    await act(async () => {});
    vi.mocked(fetch).mockRejectedValue(new Error('reload failed'));
    useTaskStore.getState().setNeedsReload(true);
    await act(async () => {});
    expect(useToastStore.getState().toasts.some(t => t.message.includes('Failed to reload: reload failed'))).toBe(true);
  });
});
