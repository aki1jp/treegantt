// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import type { Task } from '../types/task';
import {
  dateToX,
  calcGanttRange,
  calcLightningPoints,
  calcTodayX,
  ganttTotalWidth,
} from '../utils/ganttCalc';
import {
  buildTree,
  flattenTree,
  calcEffectiveProgress,
  buildChildCountMap,
  includeAncestors,
} from '../utils/taskTree';
import {
  importFromJson,
  importFromCsv,
  exportToJson,
  exportToCsv,
} from '../utils/importExport';

function makeTask(override: Partial<Task> = {}): Task {
  return {
    id: 't1', projectId: 'p1', parentId: null,
    title: 'Task', summary: '', description: '',
    status: 'todo', priority: 'medium', progress: 0,
    assignee: '', startDate: '2025-01-01', endDate: '2025-01-10',
    isMilestone: false,
    predecessors: [], seq: 0, order: 0, createdAt: '', updatedAt: '',
    ...override,
  };
}

const MIN = new Date('2025-01-01');

// ─── ganttCalc ─────────────────────────────────────────────────────────────

describe('フロントエンド 悪意テスト — ganttCalc 境界値・不正入力', () => {
  it('不正な日付文字列 → dateToX は NaN を返す（クラッシュしない）', () => {
    const x = dateToX('not-a-date', MIN, 'day');
    expect(Number.isNaN(x)).toBe(true);
  });

  it('endDate < startDate のタスクでも calcLightningPoints はクラッシュしない', () => {
    const task = makeTask({ startDate: '2025-01-10', endDate: '2025-01-01', status: 'wip', progress: 50 });
    expect(() => calcLightningPoints([{ task, effectiveProgress: 50 }], MIN, 'day')).not.toThrow();
  });

  it('progress = 101（範囲超過）でも calcLightningPoints はクラッシュしない', () => {
    const task = makeTask({ status: 'wip', progress: 101 });
    expect(() => calcLightningPoints([{ task, effectiveProgress: 101 }], MIN, 'day')).not.toThrow();
  });

  it('progress = -1 でも calcLightningPoints はクラッシュしない', () => {
    const task = makeTask({ status: 'wip', progress: -1 });
    expect(() => calcLightningPoints([{ task, effectiveProgress: -1 }], MIN, 'day')).not.toThrow();
  });

  it('NaN の effectiveProgress でもクラッシュしない', () => {
    const task = makeTask({ status: 'wip' });
    expect(() => calcLightningPoints([{ task, effectiveProgress: NaN }], MIN, 'day')).not.toThrow();
  });

  it('全タスクが done のとき全点が todayX になる', () => {
    const todayX = calcTodayX(MIN, 'day');
    const tasks = [
      makeTask({ id: 'A', status: 'done' }),
      makeTask({ id: 'B', status: 'done' }),
    ];
    const pts = calcLightningPoints(
      tasks.map(t => ({ task: t, effectiveProgress: 100 })),
      MIN, 'day',
    );
    expect(pts).not.toBeNull();
    pts!.forEach(p => expect(p.x).toBe(todayX));
  });

  it('全タスクが wait のとき全点が todayX になる', () => {
    const todayX = calcTodayX(MIN, 'day');
    const tasks = [makeTask({ status: 'wait' }), makeTask({ id: 't2', status: 'wait' })];
    const pts = calcLightningPoints(
      tasks.map(t => ({ task: t, effectiveProgress: 0 })),
      MIN, 'day',
    );
    pts!.forEach(p => expect(p.x).toBe(todayX));
  });

  it('1000 件タスクでも ganttTotalWidth はクラッシュしない', () => {
    const tasks = Array.from({ length: 1000 }, (_, i) =>
      makeTask({ id: `t${i}`, startDate: '2020-01-01', endDate: '2030-12-31' }),
    );
    expect(() => ganttTotalWidth(tasks, 'day')).not.toThrow();
  });

  it('XSS ペイロードのタイトルを含むタスクでも calcLightningPoints はクラッシュしない', () => {
    const task = makeTask({ title: '<script>alert("xss")</script>' });
    expect(() => calcLightningPoints([{ task, effectiveProgress: 0 }], MIN, 'day')).not.toThrow();
  });

  it('タスクなしで calcGanttRange は today ベースの範囲を返す', () => {
    const { min, max } = calcGanttRange([]);
    expect(max.getTime()).toBeGreaterThan(min.getTime());
  });

  it('10 年スパンのタスク範囲でもクラッシュしない', () => {
    const tasks = [makeTask({ startDate: '2020-01-01', endDate: '2030-12-31' })];
    expect(() => ganttTotalWidth(tasks, 'month')).not.toThrow();
  });
});

// ─── taskTree ──────────────────────────────────────────────────────────────

describe('フロントエンド 悪意テスト — taskTree 循環・異常構造', () => {
  it('循環 parentId（A↔B）を buildTree に渡すと roots が空になる（クラッシュしない）', () => {
    const tasks: Task[] = [
      makeTask({ id: 'A', parentId: 'B' }),
      makeTask({ id: 'B', parentId: 'A' }),
    ];
    const { roots } = buildTree(tasks);
    expect(roots).toHaveLength(0);
  });

  it('自己 parentId（parentId = id）を buildTree に渡してもクラッシュしない', () => {
    const tasks: Task[] = [makeTask({ id: 'A', parentId: 'A' })];
    const { roots } = buildTree(tasks);
    // 自己参照は親が自身なので roots に現れない
    expect(roots).toHaveLength(0);
  });

  it('存在しない parentId は root 扱いになる', () => {
    const tasks: Task[] = [makeTask({ id: 'A', parentId: 'ghost-parent' })];
    const { roots } = buildTree(tasks);
    expect(roots).toHaveLength(1);
    expect(roots[0].task.id).toBe('A');
  });

  it('50 段ネストのツリーを flattenTree しても全件取得できる', () => {
    const tasks: Task[] = Array.from({ length: 50 }, (_, i) =>
      makeTask({ id: `t${i}`, parentId: i > 0 ? `t${i - 1}` : null }),
    );
    const { roots } = buildTree(tasks);
    const flat = flattenTree(roots, new Set());
    expect(flat).toHaveLength(50);
    expect(flat[49].depth).toBe(49);
  });

  it('循環 parentId があっても calcEffectiveProgress はクラッシュせず 0 を返す', () => {
    const tasks: Task[] = [
      makeTask({ id: 'A', parentId: 'B', progress: 50 }),
      makeTask({ id: 'B', parentId: 'A', progress: 50 }),
    ];
    const childCount = buildChildCountMap(tasks);
    expect(() => calcEffectiveProgress('A', childCount, tasks)).not.toThrow();
    expect(calcEffectiveProgress('A', childCount, tasks)).toBe(0);
  });

  it('循環 parentId があっても includeAncestors は無限ループしない', () => {
    const taskA = makeTask({ id: 'A', parentId: 'B' });
    const taskB = makeTask({ id: 'B', parentId: 'A' });
    const all = [taskA, taskB];
    expect(() => includeAncestors([taskA], all)).not.toThrow();
  });

  it('深さ 1000 の calcEffectiveProgress は葉ノードに到達できる', () => {
    const tasks: Task[] = Array.from({ length: 10 }, (_, i) =>
      makeTask({ id: `t${i}`, parentId: i > 0 ? `t${i - 1}` : null, progress: 80 }),
    );
    const childCount = buildChildCountMap(tasks);
    // t0 はルート。子 = [t1]。t1 の子 = [t2] ... t9 は葉(progress=80)
    const result = calcEffectiveProgress('t0', childCount, tasks);
    expect(result).toBe(80);
  });
});

// ─── importExport ──────────────────────────────────────────────────────────

describe('フロントエンド 悪意テスト — importExport 不正入力', () => {
  it('不正な JSON 文字列 → importFromJson は例外を投げる', () => {
    expect(() => importFromJson('{invalid')).toThrow();
  });

  it('tasks フィールドなし → importFromJson は "Invalid format" 例外', () => {
    expect(() => importFromJson('{"version":"1.0"}')).toThrow('Invalid format');
  });

  it('tasks が配列でない → importFromJson は "Invalid format" 例外', () => {
    expect(() => importFromJson('{"tasks":"not-array"}')).toThrow('Invalid format');
  });

  it('空文字列 → importFromCsv は空の tasks を返す', () => {
    const { tasks } = importFromCsv('');
    expect(tasks).toHaveLength(0);
  });

  it('ヘッダー行のみ → importFromCsv は空の tasks を返す', () => {
    const { tasks } = importFromCsv('id,title,progress');
    expect(tasks).toHaveLength(0);
  });

  it('progress が "abc" の CSV → 0 にフォールバック', () => {
    const { tasks } = importFromCsv('id,title,progress\nsome-id,T,abc');
    expect(tasks[0].progress).toBe(0);
  });

  it('XSS ペイロードを含む CSV タイトルはそのまま保持される', () => {
    const xss = '<script>alert("xss")</script>';
    const { tasks } = importFromCsv(`id,title,progress\nsome-id,"${xss}",0`);
    expect(tasks[0].title).toBe(xss);
  });

  it('タイトルにカンマ・引用符を含む → exportToCsv → importFromCsv でラウンドトリップ', () => {
    const task = makeTask({ title: 'Task, with "comma"', description: 'desc' });
    const csv = exportToCsv([task]);
    const { tasks } = importFromCsv(csv);
    expect(tasks[0].title).toBe('Task, with "comma"');
  });

  it('タイトルに改行を含む → exportToCsv → importFromCsv でラウンドトリップ', () => {
    const task = makeTask({ title: 'line1\nline2' });
    const csv = exportToCsv([task]);
    const { tasks } = importFromCsv(csv);
    expect(tasks[0].title).toBe('line1\nline2');
  });

  it('特殊文字・絵文字 → JSON ラウンドトリップで完全一致', () => {
    const task = makeTask({
      title: '<script>xss</script> 🚀 山田',
      description: 'tab\there\nnewline',
      assignee: 'テスト ユーザー',
    });
    const json = exportToJson({ id: 'p1', name: 'P' }, [task]);
    const { tasks } = importFromJson(json);
    expect(tasks[0].title).toBe(task.title);
    expect(tasks[0].description).toBe(task.description);
    expect(tasks[0].assignee).toBe(task.assignee);
  });

  it('空タスク配列を JSON エクスポート → インポートで空配列が戻る', () => {
    const json = exportToJson({ id: 'p1', name: 'P' }, []);
    const { tasks } = importFromJson(json);
    expect(tasks).toHaveLength(0);
  });

  it('predecessors が ";" 区切りで複数ある CSV → 配列に変換される', () => {
    const csv = 'id,title,predecessors\nt1,T,id1;id2;id3';
    const { tasks } = importFromCsv(csv);
    expect(tasks[0].predecessors).toEqual(['id1', 'id2', 'id3']);
  });

  it('predecessors が空文字 → 空配列になる', () => {
    const csv = 'id,title,predecessors\nt1,T,';
    const { tasks } = importFromCsv(csv);
    expect(tasks[0].predecessors).toEqual([]);
  });
});

// ─── 長大タイトル・特殊文字 ────────────────────────────────────────────────────

describe('フロントエンド 悪意テスト — 長大タイトル・特殊文字の堅牢性', () => {
  it('200文字のタイトルは buildTree でクラッシュしない', () => {
    const longTitle = 'あ'.repeat(200);
    const tasks: Task[] = [makeTask({ title: longTitle })];
    expect(() => buildTree(tasks)).not.toThrow();
  });

  it('10000文字のタイトルも exportToJson → importFromJson でラウンドトリップできる', () => {
    const longTitle = 'x'.repeat(10000);
    const task = makeTask({ title: longTitle });
    const json = exportToJson({ id: 'p1', name: 'P' }, [task]);
    const { tasks } = importFromJson(json);
    expect(tasks[0].title).toBe(longTitle);
  });

  it('null文字（\\0）を含むタイトルも exportToCsv → importFromCsv でラウンドトリップできる', () => {
    const task = makeTask({ title: 'title\x00with\x00null' });
    const csv = exportToCsv([task]);
    const { tasks } = importFromCsv(csv);
    expect(tasks[0].title).toBe('title\x00with\x00null');
  });

  it('全フィールドが空文字・null のタスクも buildTree でクラッシュしない', () => {
    const task = makeTask({ title: '', summary: '', description: '', assignee: '',
      startDate: null, endDate: null, predecessors: [] });
    expect(() => buildTree([task])).not.toThrow();
  });

  it('絵文字・マルチバイト文字を含むタイトルが CSV ラウンドトリップで保持される', () => {
    const task = makeTask({ title: '🚀タスク「完了」★彡' });
    const csv = exportToCsv([task]);
    const { tasks } = importFromCsv(csv);
    expect(tasks[0].title).toBe('🚀タスク「完了」★彡');
  });

  it('改行・タブを含む description が JSON ラウンドトリップで保持される', () => {
    const task = makeTask({ description: '行1\n行2\t\t行3\r\n行4' });
    const json = exportToJson({ id: 'p1', name: 'P' }, [task]);
    const { tasks } = importFromJson(json);
    expect(tasks[0].description).toBe('行1\n行2\t\t行3\r\n行4');
  });

  it('calcEffectiveProgress: progress が 100 超でも正常に計算される', () => {
    const tasks: Task[] = [
      makeTask({ id: 'parent', parentId: null }),
      makeTask({ id: 'child1', parentId: 'parent', progress: 150 }),
      makeTask({ id: 'child2', parentId: 'parent', progress: -50 }),
    ];
    const childCount = buildChildCountMap(tasks);
    expect(() => calcEffectiveProgress('parent', childCount, tasks)).not.toThrow();
  });

  it('1000件のタスクを buildTree してもクラッシュしない', () => {
    const tasks: Task[] = Array.from({ length: 1000 }, (_, i) =>
      makeTask({ id: `t${i}`, parentId: i > 0 ? `t${Math.floor(i / 2)}` : null })
    );
    expect(() => buildTree(tasks)).not.toThrow();
    const { roots } = buildTree(tasks);
    const flat = flattenTree(roots, new Set());
    expect(flat.length).toBe(1000);
  });
});
