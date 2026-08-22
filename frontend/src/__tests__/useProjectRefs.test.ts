// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useProjectRefs } from '../hooks/useProjectRefs';
import { useTaskStore } from '../store/taskStore';
import { useToastStore } from '../store/toastStore';
import type { Task } from '../types/task';

function makeTask(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id, projectId: 'p2', parentId: null,
    title: 'タスク', summary: '', description: '',
    status: 'todo', priority: 'medium', progress: 0, assignee: '',
    startDate: null, endDate: null, isMilestone: false,
    predecessors: [], seq: 1, order: 1,
    createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    titleColor: null, titleBgColor: null, estimateMinutes: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
  useTaskStore.setState({ refTasks: [], refProjects: [], refOwnerProjectId: null });
  useToastStore.setState({ toasts: [] });
});
afterEach(() => {
  // 前テストのフックが残ると needsReload 等のストア変更に反応して
  // 後続テストの fetch を撹乱するため、毎回アンマウントする
  cleanup();
  vi.unstubAllGlobals();
});

describe('useProjectRefs', () => {
  it('projectId 指定時に参照一覧を取得しストアへ反映する', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({
        refs: [{ projectId: 'p1', refTaskId: 'r1', createdAt: '2026-01-01' }],
        tasks: [makeTask('r1')],
        projects: [{ id: 'p2', name: 'B', color: null }],
      }),
    } as Response);

    const { result } = renderHook(() => useProjectRefs('p1'));
    await act(async () => {});

    expect(useTaskStore.getState().refTasks).toHaveLength(1);
    expect(useTaskStore.getState().refProjects).toHaveLength(1);
    expect(result.current.refs).toHaveLength(1);
  });

  it('取得失敗時にエラートーストを出す', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('boom'));
    renderHook(() => useProjectRefs('p1'));
    await act(async () => {});
    expect(useToastStore.getState().toasts.some(t => t.type === 'error')).toBe(true);
  });

  it('projectId が未指定のときは何も取得しない', async () => {
    renderHook(() => useProjectRefs(undefined));
    await act(async () => {});
    expect(fetch).not.toHaveBeenCalled();
  });

  it('add は POST 後に一覧を再取得する', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ refs: [], tasks: [], projects: [] }) } as Response)
      .mockResolvedValueOnce({ ok: true, status: 201, json: async () => ({ ref: { projectId: 'p1', refTaskId: 'r1', createdAt: '2026-01-01' } }) } as Response)
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({
          refs: [{ projectId: 'p1', refTaskId: 'r1', createdAt: '2026-01-01' }],
          tasks: [makeTask('r1')],
          projects: [{ id: 'p2', name: 'B', color: null }],
        }),
      } as Response);

    const { result } = renderHook(() => useProjectRefs('p1'));
    await act(async () => {});
    await act(async () => { await result.current.add('r1'); });

    expect(fetch).toHaveBeenCalledTimes(3);
    expect(useTaskStore.getState().refTasks).toHaveLength(1);
  });

  it('remove は DELETE 後に一覧を再取得する', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ refs: [], tasks: [], projects: [] }) } as Response)
      .mockResolvedValueOnce({ ok: true, status: 204, json: async () => ({}) } as Response)
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ refs: [], tasks: [], projects: [] }) } as Response);

    const { result } = renderHook(() => useProjectRefs('p1'));
    await act(async () => {});
    await act(async () => { await result.current.remove('r1'); });

    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('add 失敗時はエラートーストを出し例外を投げる', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ refs: [], tasks: [], projects: [] }) } as Response)
      .mockRejectedValueOnce(new Error('add failed'));

    const { result } = renderHook(() => useProjectRefs('p1'));
    await act(async () => {});
    await expect(result.current.add('r1')).rejects.toThrow();
    expect(useToastStore.getState().toasts.some(t => t.type === 'error')).toBe(true);
  });

  it('updateExternalPredecessors は PATCH 応答を upsertRefTask で反映し、tasks スロットを汚染しない', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ refs: [], tasks: [], projects: [] }) } as Response)
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ task: makeTask('r1', { predecessors: ['other'] }) }) } as Response);

    useTaskStore.setState({ tasks: [] });
    const { result } = renderHook(() => useProjectRefs('p1'));
    await act(async () => {});
    await act(async () => { await result.current.updateExternalPredecessors('r1', ['other']); });

    expect(useTaskStore.getState().refTasks.find(t => t.id === 'r1')?.predecessors).toEqual(['other']);
    expect(useTaskStore.getState().tasks).toEqual([]);
  });

  it('updateExternalPredecessors 失敗時はエラートーストを出す', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ refs: [], tasks: [], projects: [] }) } as Response)
      .mockRejectedValueOnce(new Error('patch failed'));

    const { result } = renderHook(() => useProjectRefs('p1'));
    await act(async () => {});
    await expect(result.current.updateExternalPredecessors('r1', [])).rejects.toThrow();
    expect(useToastStore.getState().toasts.some(t => t.type === 'error')).toBe(true);
  });

  it('refresh を呼ぶと一覧を再取得する', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, status: 200, json: async () => ({ refs: [], tasks: [], projects: [] }) } as Response);
    const { result } = renderHook(() => useProjectRefs('p1'));
    await act(async () => {});
    vi.mocked(fetch).mockClear();
    await act(async () => { await result.current.refresh(); });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// stale ガード（世代カウンタ方式）: プロジェクト切替と非同期レスポンスの競合対策
describe('useProjectRefs — stale ガード', () => {
  it('projectId を A→B に切替後、A の fetch が遅延解決しても B のデータが上書きされない', async () => {
    let resolveA!: (v: Response) => void;
    const pendingA = new Promise<Response>(resolve => { resolveA = resolve; });
    vi.mocked(fetch)
      .mockImplementationOnce(() => pendingA) // A（p1）向け: 保留のまま
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({
          refs: [{ projectId: 'p2', refTaskId: 'rb', createdAt: '2026-01-01' }],
          tasks: [makeTask('rb', { projectId: 'pB' })],
          projects: [{ id: 'pB', name: 'B先', color: null }],
        }),
      } as Response); // B（p2）向け: 即時解決

    const { rerender } = renderHook(
      ({ projectId }) => useProjectRefs(projectId),
      { initialProps: { projectId: 'p1' } },
    );
    await act(async () => {}); // A の fetch は pendingA のまま止まる

    rerender({ projectId: 'p2' });
    await act(async () => {}); // B のロードが完了する

    expect(useTaskStore.getState().refOwnerProjectId).toBe('p2');
    expect(useTaskStore.getState().refTasks.map(t => t.id)).toEqual(['rb']);

    // ここで A のレスポンスが遅れて解決する（stale）
    await act(async () => {
      resolveA({
        ok: true, status: 200,
        json: async () => ({
          refs: [{ projectId: 'p1', refTaskId: 'ra', createdAt: '2026-01-01' }],
          tasks: [makeTask('ra')],
          projects: [{ id: 'p2', name: 'A先', color: null }],
        }),
      } as Response);
    });

    // B のデータのまま。A の stale レスポンスで上書きされていない
    expect(useTaskStore.getState().refOwnerProjectId).toBe('p2');
    expect(useTaskStore.getState().refTasks.map(t => t.id)).toEqual(['rb']);
  });

  it('stale なレスポンスの失敗ではエラートーストを出さない', async () => {
    let rejectA!: (err: Error) => void;
    const pendingA = new Promise<Response>((_, reject) => { rejectA = reject; });
    vi.mocked(fetch)
      .mockImplementationOnce(() => pendingA) // A（p1）向け: 保留のまま
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ refs: [], tasks: [], projects: [] }) } as Response); // B（p2）向け

    const { rerender } = renderHook(
      ({ projectId }) => useProjectRefs(projectId),
      { initialProps: { projectId: 'p1' } },
    );
    await act(async () => {});
    rerender({ projectId: 'p2' });
    await act(async () => {});

    expect(useToastStore.getState().toasts).toHaveLength(0);

    // A（stale）の fetch が後から失敗してもエラートーストは出ない
    await act(async () => { rejectA(new Error('stale boom')); });
    expect(useToastStore.getState().toasts.some(t => t.type === 'error')).toBe(false);
  });

  it('updateExternalPredecessors は refOwnerProjectId 不一致のとき upsertRefTask しない（PATCH成功時もエラーは出さない）', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ refs: [], tasks: [], projects: [] }) } as Response)
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ task: makeTask('r1', { predecessors: ['other'] }) }) } as Response);

    const { result } = renderHook(() => useProjectRefs('p1'));
    await act(async () => {});

    // 別プロジェクトへ切り替わった状態（refOwnerProjectId が projectId と食い違う）を模す
    useTaskStore.setState({ refOwnerProjectId: 'other-project' });

    await act(async () => { await result.current.updateExternalPredecessors('r1', ['other']); });

    expect(useTaskStore.getState().refTasks.find(t => t.id === 'r1')).toBeUndefined();
    expect(useToastStore.getState().toasts.some(t => t.type === 'error')).toBe(false);
  });

  it('プロジェクト未選択（全削除など）へ切り替わっても loading が true のまま固着しない', async () => {
    // 保留のまま解決しない fetch。切替後は世代違いで finally が破棄されるため、
    // load() 側で projectId 未選択時に loading を落とせないと永久に true になる。
    vi.mocked(fetch).mockImplementation(() => new Promise<Response>(() => {}));

    const { result, rerender } = renderHook(
      ({ projectId }) => useProjectRefs(projectId),
      { initialProps: { projectId: 'p1' as string | undefined } },
    );
    await act(async () => {});
    expect(result.current.loading).toBe(true);

    rerender({ projectId: undefined });
    await act(async () => {});
    expect(result.current.loading).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 多言語対応（i18n）: locale: 'en' でのトースト表示テスト（既存の ja テストは変更しない）
describe('useProjectRefs — 多言語対応（locale: en）', () => {
  afterEach(() => {
    useTaskStore.setState({ locale: 'ja' });
  });

  it('取得失敗時、トーストが英語表示になる', async () => {
    useTaskStore.setState({ locale: 'en' });
    vi.mocked(fetch).mockRejectedValue(new Error('boom'));
    renderHook(() => useProjectRefs('p1'));
    await act(async () => {});
    expect(useToastStore.getState().toasts.some(t => t.message.includes('Failed to fetch references: boom'))).toBe(true);
  });

  it('add 失敗時、トーストが英語表示になる', async () => {
    useTaskStore.setState({ locale: 'en' });
    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ refs: [], tasks: [], projects: [] }) } as Response)
      .mockRejectedValueOnce(new Error('add failed'));

    const { result } = renderHook(() => useProjectRefs('p1'));
    await act(async () => {});
    await expect(result.current.add('r1')).rejects.toThrow();
    expect(useToastStore.getState().toasts.some(t => t.message.includes('Failed to add reference: add failed'))).toBe(true);
  });

  it('remove 失敗時、トーストが英語表示になる', async () => {
    useTaskStore.setState({ locale: 'en' });
    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ refs: [], tasks: [], projects: [] }) } as Response)
      .mockRejectedValueOnce(new Error('remove failed'));

    const { result } = renderHook(() => useProjectRefs('p1'));
    await act(async () => {});
    await expect(result.current.remove('r1')).rejects.toThrow();
    expect(useToastStore.getState().toasts.some(t => t.message.includes('Failed to remove reference: remove failed'))).toBe(true);
  });

  it('updateExternalPredecessors 失敗時、トーストが英語表示になる', async () => {
    useTaskStore.setState({ locale: 'en' });
    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ refs: [], tasks: [], projects: [] }) } as Response)
      .mockRejectedValueOnce(new Error('patch failed'));

    const { result } = renderHook(() => useProjectRefs('p1'));
    await act(async () => {});
    await expect(result.current.updateExternalPredecessors('r1', [])).rejects.toThrow();
    expect(useToastStore.getState().toasts.some(t => t.message.includes('Failed to update dependency: patch failed'))).toBe(true);
  });
});
