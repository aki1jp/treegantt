// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useImportExport } from '../hooks/useImportExport';
import { useToastStore } from '../store/toastStore';
import { useTaskStore } from '../store/taskStore';
import type { Task, Project } from '../types/task';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 't1', projectId: 'p1', parentId: null,
    title: 'タスク', summary: '', description: '',
    status: 'todo', priority: 'medium', progress: 0, assignee: '',
    startDate: null, endDate: null, isMilestone: false,
    predecessors: [], seq: 1, order: 1,
    createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    titleColor: null, titleBgColor: null, estimateMinutes: null,
    ...overrides,
  };
}

const project: Project = { id: 'p1', name: 'テストプロジェクト', color: null, capacityMinutesPerDay: null, workingDays: null, createdAt: '' };

// downloadFile で使われる URL API のモック
let origCreateElement: typeof document.createElement;
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  // 'a' タグのみインターセプト、他は元の実装を使う（無限再帰防止）
  origCreateElement = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    if (tag === 'a') {
      return { href: '', download: '', click: vi.fn() } as unknown as HTMLElement;
    }
    return origCreateElement(tag);
  });
  vi.spyOn(window, 'alert').mockImplementation(() => {});
  useToastStore.setState({ toasts: [] });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// ─── handleExportJson ───────────────────────────────────────────────────────

describe('useImportExport — handleExportJson', () => {
  it('currentProject が null のときは何も起きない', () => {
    const { result } = renderHook(() =>
      useImportExport(null, [], vi.fn())
    );
    expect(() => act(() => { result.current.handleExportJson(); })).not.toThrow();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('JSON ファイルをダウンロードする', () => {
    const tasks = [makeTask()];
    const setTasks = vi.fn();
    const { result } = renderHook(() => useImportExport(project, tasks, setTasks));

    act(() => { result.current.handleExportJson(); });

    expect(URL.createObjectURL).toHaveBeenCalledOnce();
  });
});

// ─── handleExportCsv ───────────────────────────────────────────────────────

describe('useImportExport — handleExportCsv', () => {
  it('currentProject が null のときは何も起きない', () => {
    const { result } = renderHook(() =>
      useImportExport(null, [], vi.fn())
    );
    expect(() => act(() => { result.current.handleExportCsv(); })).not.toThrow();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('CSV ファイルをダウンロードする', () => {
    const tasks = [makeTask()];
    const { result } = renderHook(() => useImportExport(project, tasks, vi.fn()));

    act(() => { result.current.handleExportCsv(); });

    expect(URL.createObjectURL).toHaveBeenCalledOnce();
  });
});

// ─── handleFileChange — JSON インポート ────────────────────────────────────

describe('useImportExport — handleFileChange (JSON)', () => {
  it('JSON ファイルをインポートしてタスクを更新する', async () => {
    const setTasks = vi.fn();
    const importedTask = makeTask({ id: 'new-1', title: 'インポートタスク' });
    const jsonContent = JSON.stringify({
      version: '1.1',
      project: { id: 'p1', name: 'P' },
      tasks: [importedTask],
    });

    // import POST → OK、tasks GET → タスクリスト
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({ imported: 1 }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({ tasks: [importedTask] }),
      } as Response);

    const { result } = renderHook(() => useImportExport(project, [], setTasks));

    const file = new File([jsonContent], 'export.json', { type: 'application/json' });
    const event = { target: { files: [file], value: '' } } as unknown as React.ChangeEvent<HTMLInputElement>;

    await act(async () => {
      await result.current.handleFileChange(event);
    });

    expect(setTasks).toHaveBeenCalledWith([importedTask]);
  });

  it('CSV ファイル名は CSV パーサーに渡される', async () => {
    const setTasks = vi.fn();
    const csvContent = 'title,status\nCSV Task,todo';

    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({ imported: 1 }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({ tasks: [] }),
      } as Response);

    const { result } = renderHook(() => useImportExport(project, [], setTasks));

    const file = new File([csvContent], 'export.csv', { type: 'text/csv' });
    const event = { target: { files: [file], value: '' } } as unknown as React.ChangeEvent<HTMLInputElement>;

    await act(async () => {
      await result.current.handleFileChange(event);
    });

    // POST の body に tasks が含まれているか確認
    const postBody = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string);
    expect(Array.isArray(postBody.tasks)).toBe(true);
    expect(postBody.tasks[0].title).toBe('CSV Task');
  });

  it('currentProject が null のときはインポートしない', async () => {
    const setTasks = vi.fn();
    const { result } = renderHook(() => useImportExport(null, [], setTasks));

    const file = new File(['{}'], 'export.json', { type: 'application/json' });
    const event = { target: { files: [file], value: '' } } as unknown as React.ChangeEvent<HTMLInputElement>;

    await act(async () => {
      await result.current.handleFileChange(event);
    });

    expect(fetch).not.toHaveBeenCalled();
    expect(setTasks).not.toHaveBeenCalled();
  });

  it('ファイルがないときはインポートしない', async () => {
    const { result } = renderHook(() => useImportExport(project, [], vi.fn()));
    const event = { target: { files: [], value: '' } } as unknown as React.ChangeEvent<HTMLInputElement>;

    await act(async () => {
      await result.current.handleFileChange(event);
    });

    expect(fetch).not.toHaveBeenCalled();
  });

  it('API エラー時はエラートーストを表示する（alert は使わない）', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false, status: 400,
      json: async () => ({ error: 'Invalid format' }),
    } as Response);

    const { result } = renderHook(() => useImportExport(project, [], vi.fn()));

    const file = new File(['{"tasks":[]}'], 'export.json', { type: 'application/json' });
    const event = { target: { files: [file], value: '' } } as unknown as React.ChangeEvent<HTMLInputElement>;

    await act(async () => {
      await result.current.handleFileChange(event);
    });

    expect(window.alert).not.toHaveBeenCalled();
    const toasts = useToastStore.getState().toasts;
    expect(toasts.some(t => t.type === 'error' && t.message.includes('インポートに失敗しました'))).toBe(true);
  });

  it('不正な JSON はエラートーストを表示する（alert は使わない）', async () => {
    const { result } = renderHook(() => useImportExport(project, [], vi.fn()));

    const file = new File(['{invalid json'], 'export.json', { type: 'application/json' });
    const event = { target: { files: [file], value: '' } } as unknown as React.ChangeEvent<HTMLInputElement>;

    await act(async () => {
      await result.current.handleFileChange(event);
    });

    expect(window.alert).not.toHaveBeenCalled();
    const toasts = useToastStore.getState().toasts;
    expect(toasts.some(t => t.type === 'error' && t.message.includes('インポートに失敗しました'))).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('mode=restore が API に送られる', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ imported: 0 }) } as Response)
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ tasks: [] }) } as Response);

    const { result } = renderHook(() => useImportExport(project, [], vi.fn()));

    // restore モードでインポートクリック
    act(() => { result.current.handleImportClick('restore'); });

    const file = new File(['{"tasks":[]}'], 'export.json', { type: 'application/json' });
    const event = { target: { files: [file], value: '' } } as unknown as React.ChangeEvent<HTMLInputElement>;

    await act(async () => {
      await result.current.handleFileChange(event);
    });

    const body = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string);
    expect(body.mode).toBe('restore');
  });
});

// ─── i18n（locale='en'）───────────────────────────────────────────────────
describe('useImportExport — i18n（locale="en"）', () => {
  beforeEach(() => { useTaskStore.setState({ locale: 'en' }); });
  afterEach(() => { useTaskStore.setState({ locale: 'ja' }); });

  it('API エラー時、locale=en なら英語のトーストを表示する（生の err.message 連結ではなく apiErrorMessage 経由）', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false, status: 400,
      json: async () => ({ error: 'Invalid format' }),
    } as Response);

    const { result } = renderHook(() => useImportExport(project, [], vi.fn()));

    const file = new File(['{"tasks":[]}'], 'export.json', { type: 'application/json' });
    const event = { target: { files: [file], value: '' } } as unknown as React.ChangeEvent<HTMLInputElement>;

    await act(async () => {
      await result.current.handleFileChange(event);
    });

    const toasts = useToastStore.getState().toasts;
    expect(toasts.some(t => t.type === 'error' && t.message.startsWith('Failed to import:'))).toBe(true);
    expect(toasts.some(t => t.message.includes('インポートに失敗しました'))).toBe(false);
  });

  it('不正な JSON でも locale=en なら英語のトーストを表示する', async () => {
    const { result } = renderHook(() => useImportExport(project, [], vi.fn()));

    const file = new File(['{invalid json'], 'export.json', { type: 'application/json' });
    const event = { target: { files: [file], value: '' } } as unknown as React.ChangeEvent<HTMLInputElement>;

    await act(async () => {
      await result.current.handleFileChange(event);
    });

    const toasts = useToastStore.getState().toasts;
    expect(toasts.some(t => t.type === 'error' && t.message.startsWith('Failed to import:'))).toBe(true);
  });
});
