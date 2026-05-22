// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { exportToCsv, importFromCsv, exportToJson, importFromJson, downloadFile } from '../utils/importExport';
import type { Task } from '../types/task';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1', projectId: 'proj-1', parentId: null,
    title: 'テストタスク', summary: 'サマリ', description: '説明',
    status: 'todo', priority: 'medium', progress: 0,
    assignee: '田中', startDate: '2026-05-01', endDate: '2026-05-10',
    predecessors: [], order: 1, createdAt: '2026-05-01T00:00:00Z', updatedAt: '2026-05-01T00:00:00Z',
    ...overrides,
  };
}

describe('exportToCsv', () => {
  it('parentId列を含む', () => {
    const csv = exportToCsv([makeTask({ parentId: 'parent-1' })]);
    expect(csv).toContain('parentId');
    expect(csv).toContain('parent-1');
  });

  it('predecessorsをセミコロン区切りで出力する', () => {
    const csv = exportToCsv([makeTask({ predecessors: ['a', 'b'] })]);
    expect(csv).toContain('a;b');
  });

  it('空のタスクリストは空文字を返す', () => {
    const csv = exportToCsv([]);
    expect(csv).toBe('');
  });
});

describe('importFromCsv', () => {
  it('基本フィールドをパースする', () => {
    const csv = exportToCsv([makeTask()]);
    const { tasks } = importFromCsv(csv);
    expect(tasks[0].title).toBe('テストタスク');
    expect(tasks[0].status).toBe('todo');
    expect(tasks[0].priority).toBe('medium');
    expect(tasks[0].progress).toBe(0);
  });

  it('parentIdをパースする', () => {
    const csv = exportToCsv([makeTask({ parentId: 'parent-999' })]);
    const { tasks } = importFromCsv(csv);
    expect(tasks[0].parentId).toBe('parent-999');
  });

  it('parentIdが空のときnullになる', () => {
    const csv = exportToCsv([makeTask({ parentId: null })]);
    const { tasks } = importFromCsv(csv);
    expect(tasks[0].parentId).toBeNull();
  });

  it('predecessorsをセミコロン区切りで復元する', () => {
    const csv = exportToCsv([makeTask({ predecessors: ['x', 'y', 'z'] })]);
    const { tasks } = importFromCsv(csv);
    expect(tasks[0].predecessors).toEqual(['x', 'y', 'z']);
  });

  it('日付フィールドをパースする', () => {
    const csv = exportToCsv([makeTask()]);
    const { tasks } = importFromCsv(csv);
    expect(tasks[0].startDate).toBe('2026-05-01');
    expect(tasks[0].endDate).toBe('2026-05-10');
  });
});

describe('exportToJson / importFromJson', () => {
  it('ラウンドトリップでタスクが復元できる', () => {
    const project = { id: 'proj-1', name: 'テストプロジェクト' };
    const tasks = [makeTask(), makeTask({ id: 'task-2', title: '2つ目' })];
    const json = exportToJson(project, tasks);
    const result = importFromJson(json);
    expect(result.tasks).toHaveLength(2);
    expect(result.tasks[0].title).toBe('テストタスク');
    expect(result.project.name).toBe('テストプロジェクト');
  });
});

describe('importFromCsv — 欠損フィールドのフォールバック', () => {
  it('最低限 title だけのCSVで全フォールバック値が適用される', () => {
    // id なし・status/priority/assignee なし → デフォルト値が使われるケース
    const csv = 'title\n仮タスク';
    const { tasks } = importFromCsv(csv);
    expect(tasks[0].id).toBeUndefined();       // row.id || undefined
    expect(tasks[0].title).toBe('仮タスク');
    expect(tasks[0].summary).toBe('');          // ?? ''
    expect(tasks[0].description).toBe('');      // ?? ''
    expect(tasks[0].status).toBe('todo');       // || 'todo'
    expect(tasks[0].priority).toBe('medium');   // || 'medium'
    expect(tasks[0].assignee).toBe('');         // ?? ''
    expect(tasks[0].progress).toBe(0);          // || 0
  });

  it('title 列が存在しない行では title が空文字になる', () => {
    // row.title が undefined → ?? '' のフォールバックを通す
    const csv = 'id\nabc-123';
    const { tasks } = importFromCsv(csv);
    expect(tasks[0].title).toBe('');  // undefined ?? '' = ''
  });
});

describe('downloadFile', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('Blob を生成してアンカーをクリックし URL を解放する', () => {
    const mockUrl = 'blob:mock-url';
    vi.spyOn(URL, 'createObjectURL').mockReturnValue(mockUrl);
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const clickMock = vi.fn();
    vi.spyOn(document, 'createElement').mockReturnValue(
      { href: '', download: '', click: clickMock } as unknown as HTMLElement,
    );

    downloadFile('{"foo":1}', 'export.json', 'application/json');

    expect(URL.createObjectURL).toHaveBeenCalledOnce();
    expect(clickMock).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(mockUrl);
  });
});
