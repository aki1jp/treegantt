// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
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
  useTaskStore.setState({ tasks: [], needsReload: false });
  useToastStore.setState({ toasts: [] });
});
afterEach(() => {
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
