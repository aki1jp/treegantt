// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { exportToCsv, importFromCsv, exportToJson, importFromJson, downloadFile } from '../utils/importExport';
import type { Task } from '../types/task';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1', projectId: 'proj-1', parentId: null,
    title: 'テストタスク', summary: 'サマリ', description: '説明',
    status: 'todo', priority: 'medium', progress: 0,
    assignee: '田中', startDate: '2026-05-01', endDate: '2026-05-10', isMilestone: false,
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
    const csv = 'title\n仮タスク';
    const { tasks } = importFromCsv(csv);
    expect(tasks[0].id).toBeUndefined();
    expect(tasks[0].title).toBe('仮タスク');
    expect(tasks[0].summary).toBe('');
    expect(tasks[0].description).toBe('');
    expect(tasks[0].status).toBe('todo');
    expect(tasks[0].priority).toBe('medium');
    expect(tasks[0].assignee).toBe('');
    expect(tasks[0].progress).toBe(0);
  });

  it('title 列が存在しない行では title が空文字になる', () => {
    const csv = 'id\nabc-123';
    const { tasks } = importFromCsv(csv);
    expect(tasks[0].title).toBe('');
  });
});

describe('importFromCsv — 複数タスク・意地悪テスト', () => {
  it('複数行が全件パースされる（最後だけにならない）', () => {
    const csv = exportToCsv([
      makeTask({ id: 'a', title: 'Task A', status: 'todo' }),
      makeTask({ id: 'b', title: 'Task B', status: 'wip' }),
      makeTask({ id: 'c', title: 'Task C', status: 'done' }),
    ]);
    const { tasks } = importFromCsv(csv);
    expect(tasks).toHaveLength(3);
    expect(tasks[0].title).toBe('Task A');
    expect(tasks[1].title).toBe('Task B');
    expect(tasks[2].title).toBe('Task C');
  });

  it('各タスクが独立したオブジェクト（参照共有なし）', () => {
    const csv = exportToCsv([
      makeTask({ id: 'a', title: 'Task A', predecessors: ['x'] }),
      makeTask({ id: 'b', title: 'Task B', predecessors: ['y'] }),
    ]);
    const { tasks } = importFromCsv(csv);
    expect(tasks[0]).not.toBe(tasks[1]);
    expect(tasks[0].predecessors).not.toBe(tasks[1].predecessors);
    expect(tasks[0].predecessors).toEqual(['x']);
    expect(tasks[1].predecessors).toEqual(['y']);
  });

  it('parentId を持つ複数タスクが正しくパースされる', () => {
    const csv = exportToCsv([
      makeTask({ id: 'parent', title: '親', parentId: null }),
      makeTask({ id: 'child',  title: '子', parentId: 'parent' }),
    ]);
    const { tasks } = importFromCsv(csv);
    expect(tasks).toHaveLength(2);
    expect(tasks[0].parentId).toBeNull();
    expect(tasks[1].parentId).toBe('parent');
  });

  it('空行がスキップされる', () => {
    const csv = 'title,status\nTask A,todo\n\nTask B,wip\n';
    const { tasks } = importFromCsv(csv);
    expect(tasks).toHaveLength(2);
  });

  it('100件のタスクが全件パースされる', () => {
    const manyTasks = Array.from({ length: 100 }, (_, i) =>
      makeTask({ id: `t${i}`, title: `Task ${i}`, order: i + 1 })
    );
    const csv = exportToCsv(manyTasks);
    const { tasks } = importFromCsv(csv);
    expect(tasks).toHaveLength(100);
    expect(tasks[0].title).toBe('Task 0');
    expect(tasks[99].title).toBe('Task 99');
  });

  it('カンマを含むフィールドが正しくパースされる', () => {
    const csv = exportToCsv([makeTask({ title: 'タスク, 特殊' })]);
    const { tasks } = importFromCsv(csv);
    expect(tasks[0].title).toBe('タスク, 特殊');
  });

  it('ダブルクォートを含むフィールドが正しくパースされる', () => {
    const csv = exportToCsv([makeTask({ title: '彼は"天才"だ' })]);
    const { tasks } = importFromCsv(csv);
    expect(tasks[0].title).toBe('彼は"天才"だ');
  });
});

describe('importFromJson — 意地悪テスト', () => {
  it('tasks が空配列でエラーにならない', () => {
    const json = JSON.stringify({ version: '1.1', project: { id: 'p1', name: 'P' }, tasks: [] });
    const result = importFromJson(json);
    expect(result.tasks).toHaveLength(0);
  });

  it('無効なJSONは例外を投げる', () => {
    expect(() => importFromJson('not-json{')).toThrow();
  });

  it('tasks が配列でない場合は例外を投げる', () => {
    const json = JSON.stringify({ tasks: 'string' });
    expect(() => importFromJson(json)).toThrow('Invalid format');
  });

  it('tasks キーがない場合は例外を投げる', () => {
    const json = JSON.stringify({ version: '1.1' });
    expect(() => importFromJson(json)).toThrow('Invalid format');
  });

  it('100件のラウンドトリップが全件復元できる', () => {
    const tasks = Array.from({ length: 100 }, (_, i) =>
      makeTask({ id: `task-${i}`, title: `Task ${i}`, order: i + 1 })
    );
    const json = exportToJson({ id: 'p1', name: 'Project' }, tasks);
    const result = importFromJson(json);
    expect(result.tasks).toHaveLength(100);
    expect(result.tasks[0].title).toBe('Task 0');
    expect(result.tasks[99].title).toBe('Task 99');
  });

  it('親子関係を含むJSONがラウンドトリップできる', () => {
    const tasks = [
      makeTask({ id: 'p1', title: '親', parentId: null }),
      makeTask({ id: 'c1', title: '子', parentId: 'p1' }),
    ];
    const json = exportToJson({ id: 'proj', name: 'P' }, tasks);
    const result = importFromJson(json);
    expect(result.tasks[1].parentId).toBe('p1');
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
