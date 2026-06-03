// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useImportExport } from '../hooks/useImportExport';
function makeTask(overrides = {}) {
    return {
        id: 't1', projectId: 'p1', parentId: null,
        title: 'タスク', summary: '', description: '',
        status: 'todo', priority: 'medium', progress: 0, assignee: '',
        startDate: null, endDate: null, isMilestone: false,
        predecessors: [], seq: 1, order: 1,
        createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
        ...overrides,
    };
}
const project = { id: 'p1', name: 'テストプロジェクト', createdAt: '' };
// downloadFile で使われる URL API のモック
let origCreateElement;
beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => { });
    // 'a' タグのみインターセプト、他は元の実装を使う（無限再帰防止）
    origCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
        if (tag === 'a') {
            return { href: '', download: '', click: vi.fn() };
        }
        return origCreateElement(tag);
    });
    vi.spyOn(window, 'alert').mockImplementation(() => { });
});
afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});
// ─── handleExportJson ───────────────────────────────────────────────────────
describe('useImportExport — handleExportJson', () => {
    it('currentProject が null のときは何も起きない', () => {
        const { result } = renderHook(() => useImportExport(null, [], vi.fn()));
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
        const { result } = renderHook(() => useImportExport(null, [], vi.fn()));
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
        })
            .mockResolvedValueOnce({
            ok: true, status: 200,
            json: async () => ({ tasks: [importedTask] }),
        });
        const { result } = renderHook(() => useImportExport(project, [], setTasks));
        const file = new File([jsonContent], 'export.json', { type: 'application/json' });
        const event = { target: { files: [file], value: '' } };
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
        })
            .mockResolvedValueOnce({
            ok: true, status: 200,
            json: async () => ({ tasks: [] }),
        });
        const { result } = renderHook(() => useImportExport(project, [], setTasks));
        const file = new File([csvContent], 'export.csv', { type: 'text/csv' });
        const event = { target: { files: [file], value: '' } };
        await act(async () => {
            await result.current.handleFileChange(event);
        });
        // POST の body に tasks が含まれているか確認
        const postBody = JSON.parse(vi.mocked(fetch).mock.calls[0][1].body);
        expect(Array.isArray(postBody.tasks)).toBe(true);
        expect(postBody.tasks[0].title).toBe('CSV Task');
    });
    it('currentProject が null のときはインポートしない', async () => {
        const setTasks = vi.fn();
        const { result } = renderHook(() => useImportExport(null, [], setTasks));
        const file = new File(['{}'], 'export.json', { type: 'application/json' });
        const event = { target: { files: [file], value: '' } };
        await act(async () => {
            await result.current.handleFileChange(event);
        });
        expect(fetch).not.toHaveBeenCalled();
        expect(setTasks).not.toHaveBeenCalled();
    });
    it('ファイルがないときはインポートしない', async () => {
        const { result } = renderHook(() => useImportExport(project, [], vi.fn()));
        const event = { target: { files: [], value: '' } };
        await act(async () => {
            await result.current.handleFileChange(event);
        });
        expect(fetch).not.toHaveBeenCalled();
    });
    it('API エラー時は alert を表示する', async () => {
        vi.mocked(fetch).mockResolvedValue({
            ok: false, status: 400,
            json: async () => ({ error: 'Invalid format' }),
        });
        const { result } = renderHook(() => useImportExport(project, [], vi.fn()));
        const file = new File(['{"tasks":[]}'], 'export.json', { type: 'application/json' });
        const event = { target: { files: [file], value: '' } };
        await act(async () => {
            await result.current.handleFileChange(event);
        });
        expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('インポートに失敗しました'));
    });
    it('不正な JSON は alert を表示する', async () => {
        const { result } = renderHook(() => useImportExport(project, [], vi.fn()));
        const file = new File(['{invalid json'], 'export.json', { type: 'application/json' });
        const event = { target: { files: [file], value: '' } };
        await act(async () => {
            await result.current.handleFileChange(event);
        });
        expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('インポートに失敗しました'));
        expect(fetch).not.toHaveBeenCalled();
    });
    it('mode=restore が API に送られる', async () => {
        vi.mocked(fetch)
            .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ imported: 0 }) })
            .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ tasks: [] }) });
        const { result } = renderHook(() => useImportExport(project, [], vi.fn()));
        // restore モードでインポートクリック
        act(() => { result.current.handleImportClick('restore'); });
        const file = new File(['{"tasks":[]}'], 'export.json', { type: 'application/json' });
        const event = { target: { files: [file], value: '' } };
        await act(async () => {
            await result.current.handleFileChange(event);
        });
        const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1].body);
        expect(body.mode).toBe('restore');
    });
});
