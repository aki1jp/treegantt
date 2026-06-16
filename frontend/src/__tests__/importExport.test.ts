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
    predecessors: [], seq: 1, order: 1, createdAt: '2026-05-01T00:00:00Z', updatedAt: '2026-05-01T00:00:00Z',
    titleColor: null, titleBgColor: null,
    ...overrides,
  };
}

describe('exportToCsv', () => {
  it('CSV の id 列は seq（不変 ID）を使う', () => {
    // seq=10 で order=99（並び替え後）のタスク：CSV には seq=10 が出力されるべき
    const task = makeTask({ id: 'x', seq: 10, order: 99 });
    const csv = exportToCsv([task]);
    const { tasks } = importFromCsv(csv);
    expect(tasks[0].id).toBe('10');
  });

  it('parentId列を含む', () => {
    const parent = makeTask({ id: 'p', seq: 1, order: 1, parentId: null });
    const child  = makeTask({ id: 'c', seq: 2, order: 2, parentId: 'p' });
    const csv = exportToCsv([parent, child]);
    expect(csv).toContain('parentId');
    // 子行の parentId は親の seq 値
    const { tasks } = importFromCsv(csv);
    expect(tasks[1].parentId).toBe('1');
  });

  it('predecessorsをセミコロン区切りで出力する', () => {
    const taskA = makeTask({ id: 'a', seq: 1, order: 1 });
    const taskB = makeTask({ id: 'b', seq: 2, order: 2 });
    const taskC = makeTask({ id: 'c', seq: 3, order: 3, predecessors: ['a', 'b'] });
    const csv = exportToCsv([taskA, taskB, taskC]);
    expect(csv).toContain('1;2'); // seq 値でセミコロン区切り
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
    const parent = makeTask({ id: 'p', seq: 5, order: 5, parentId: null });
    const child  = makeTask({ id: 'c', seq: 6, order: 6, parentId: 'p' });
    const csv = exportToCsv([parent, child]);
    const { tasks } = importFromCsv(csv);
    // parentId は親の seq 値（数値文字列）
    expect(tasks[1].parentId).toBe('5');
  });

  it('parentIdが空のときnullになる', () => {
    const csv = exportToCsv([makeTask({ parentId: null })]);
    const { tasks } = importFromCsv(csv);
    expect(tasks[0].parentId).toBeNull();
  });

  it('predecessorsをセミコロン区切りで復元する', () => {
    const taskX = makeTask({ id: 'x', seq: 10, order: 10 });
    const taskY = makeTask({ id: 'y', seq: 11, order: 11 });
    const taskZ = makeTask({ id: 'z', seq: 12, order: 12 });
    const taskT = makeTask({ id: 't', seq: 13, order: 13, predecessors: ['x', 'y', 'z'] });
    const csv = exportToCsv([taskX, taskY, taskZ, taskT]);
    const { tasks } = importFromCsv(csv);
    // predecessors は参照先の seq 値（数値文字列）
    expect(tasks[3].predecessors).toEqual(['10', '11', '12']);
  });

  it('日付フィールドをパースする', () => {
    const csv = exportToCsv([makeTask()]);
    const { tasks } = importFromCsv(csv);
    expect(tasks[0].startDate).toBe('2026-05-01');
    expect(tasks[0].endDate).toBe('2026-05-10');
  });

  it('スラッシュ区切りの日付を ISO（YYYY-MM-DD）へ正規化する', () => {
    const csv = 'title,startDate,endDate\nスラッシュ,2026/01/10,2026/01/20';
    const { tasks } = importFromCsv(csv);
    expect(tasks[0].startDate).toBe('2026-01-10');
    expect(tasks[0].endDate).toBe('2026-01-20');
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

  it('スラッシュ区切りの日付を ISO へ正規化する', () => {
    const json = JSON.stringify({
      version: '1.0',
      project: { id: 'p1', name: 'P' },
      tasks: [{ ...makeTask(), startDate: '2026/01/10', endDate: '2026/01/20' }],
    });
    const result = importFromJson(json);
    expect(result.tasks[0].startDate).toBe('2026-01-10');
    expect(result.tasks[0].endDate).toBe('2026-01-20');
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
    const predA = makeTask({ id: 'x', seq: 1, order: 1 });
    const predB = makeTask({ id: 'y', seq: 2, order: 2 });
    const taskA = makeTask({ id: 'a', seq: 3, order: 3, title: 'Task A', predecessors: ['x'] });
    const taskB = makeTask({ id: 'b', seq: 4, order: 4, title: 'Task B', predecessors: ['y'] });
    const csv = exportToCsv([predA, predB, taskA, taskB]);
    const { tasks } = importFromCsv(csv);
    expect(tasks[2]).not.toBe(tasks[3]);
    expect(tasks[2].predecessors).not.toBe(tasks[3].predecessors);
    expect(tasks[2].predecessors).toEqual(['1']); // predA の seq
    expect(tasks[3].predecessors).toEqual(['2']); // predB の seq
  });

  it('parentId を持つ複数タスクが正しくパースされる', () => {
    const parent = makeTask({ id: 'parent', seq: 1, order: 1, title: '親', parentId: null });
    const child  = makeTask({ id: 'child',  seq: 2, order: 2, title: '子', parentId: 'parent' });
    const csv = exportToCsv([parent, child]);
    const { tasks } = importFromCsv(csv);
    expect(tasks).toHaveLength(2);
    expect(tasks[0].parentId).toBeNull();
    expect(tasks[1].parentId).toBe('1'); // 親の seq（数値文字列）
  });

  it('空行がスキップされる', () => {
    const csv = 'title,status\nTask A,todo\n\nTask B,wip\n';
    const { tasks } = importFromCsv(csv);
    expect(tasks).toHaveLength(2);
  });

  it('100件のタスクが全件パースされる', () => {
    const manyTasks = Array.from({ length: 100 }, (_, i) =>
      makeTask({ id: `t${i}`, title: `Task ${i}`, seq: i + 1, order: i + 1 })
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
      makeTask({ id: `task-${i}`, title: `Task ${i}`, seq: i + 1, order: i + 1 })
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
