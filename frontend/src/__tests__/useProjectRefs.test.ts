// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
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
  useTaskStore.setState({ refTasks: [], refProjects: [] });
  useToastStore.setState({ toasts: [] });
});
afterEach(() => {
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
