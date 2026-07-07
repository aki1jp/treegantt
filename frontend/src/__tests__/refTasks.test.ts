import { describe, it, expect } from 'vitest';
import { refGroupId, isRefGroupId, isReadonlyTask, mergeRefTasks, canCreateOnRow } from '../utils/refTasks';
import type { Task, RefProject } from '../types/task';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 't1', projectId: 'p1', parentId: null,
    title: 'タスク', summary: '', description: '',
    status: 'todo', priority: 'medium', progress: 0,
    assignee: '', startDate: null, endDate: null, isMilestone: false,
    predecessors: [], seq: 1, order: 1, createdAt: '', updatedAt: '',
    titleColor: null, titleBgColor: null, estimateMinutes: null,
    ...overrides,
  };
}

describe('refGroupId / isRefGroupId', () => {
  it('refGroupId はプロジェクトIDから ref: プレフィックス付きIDを生成する', () => {
    expect(refGroupId('proj-a')).toBe('ref:proj-a');
  });

  it('isRefGroupId は ref: プレフィックスを判定する', () => {
    expect(isRefGroupId('ref:proj-a')).toBe(true);
    expect(isRefGroupId('proj-a')).toBe(false);
    expect(isRefGroupId('task-123')).toBe(false);
  });
});

describe('isReadonlyTask', () => {
  it('現在プロジェクトのタスクは読み取り専用ではない', () => {
    const t = makeTask({ id: 't1', projectId: 'p1' });
    expect(isReadonlyTask(t, 'p1')).toBe(false);
  });

  it('他プロジェクトのタスクは読み取り専用', () => {
    const t = makeTask({ id: 't1', projectId: 'p2' });
    expect(isReadonlyTask(t, 'p1')).toBe(true);
  });

  it('合成グループ行（ref:プレフィックス）は常に読み取り専用', () => {
    const t = makeTask({ id: 'ref:p2', projectId: 'p2' });
    expect(isReadonlyTask(t, 'p1')).toBe(true);
    // 自プロジェクト id が偶然一致していてもグループ行は読み取り専用
    const t2 = makeTask({ id: 'ref:p1', projectId: 'p1' });
    expect(isReadonlyTask(t2, 'p1')).toBe(true);
  });

  it('currentProjectId が未指定のときは通常タスクを読み取り専用にしない', () => {
    const t = makeTask({ id: 't1', projectId: 'p1' });
    expect(isReadonlyTask(t, undefined)).toBe(false);
  });
});

const projects: RefProject[] = [
  { id: 'p2', name: 'プロジェクトB', color: '#3b82f6' },
];

describe('mergeRefTasks', () => {
  it('参照タスクが空のときは何も足さない（同一参照を返す）', () => {
    const tasks = [makeTask({ id: 't1' })];
    const result = mergeRefTasks(tasks, [], []);
    expect(result).toBe(tasks);
  });

  it('参照先プロジェクトごとに合成グループ行を末尾に生成する', () => {
    const tasks = [makeTask({ id: 't1', projectId: 'p1', order: 1 })];
    const refTasks = [makeTask({ id: 'r1', projectId: 'p2', order: 1, parentId: null })];
    const result = mergeRefTasks(tasks, refTasks, projects);

    const group = result.find(t => t.id === 'ref:p2');
    expect(group).toBeDefined();
    expect(group!.title).toContain('プロジェクトB');
    expect(group!.titleBgColor).toBe('#3b82f6');
    // 末尾固定: order は他の通常タスクよりずっと大きい
    expect(group!.order).toBeGreaterThan(1e8);
  });

  it('参照セット外の parentId を持つ参照タスクはグループ行の子に差し替える', () => {
    const tasks = [makeTask({ id: 't1', projectId: 'p1' })];
    // r1 の親 'external-parent' は refTasks セットに含まれない
    const refTasks = [makeTask({ id: 'r1', projectId: 'p2', parentId: 'external-parent' })];
    const result = mergeRefTasks(tasks, refTasks, projects);
    const r1 = result.find(t => t.id === 'r1');
    expect(r1!.parentId).toBe('ref:p2');
  });

  it('参照セット内の parentId はそのまま維持する（サブツリー構造を保持）', () => {
    const tasks = [makeTask({ id: 't1', projectId: 'p1' })];
    const refParent = makeTask({ id: 'r-parent', projectId: 'p2', parentId: null, order: 1 });
    const refChild  = makeTask({ id: 'r-child', projectId: 'p2', parentId: 'r-parent', order: 2 });
    const result = mergeRefTasks(tasks, [refParent, refChild], projects);
    const child = result.find(t => t.id === 'r-child');
    expect(child!.parentId).toBe('r-parent');
  });

  it('複数プロジェクトの参照は order 昇順でグループが末尾に並ぶ', () => {
    const multiProjects: RefProject[] = [
      { id: 'p2', name: 'B', color: null },
      { id: 'p3', name: 'C', color: null },
    ];
    const refTasks = [
      makeTask({ id: 'r1', projectId: 'p2' }),
      makeTask({ id: 'r2', projectId: 'p3' }),
    ];
    const result = mergeRefTasks([makeTask({ id: 't1' })], refTasks, multiProjects);
    const g1 = result.find(t => t.id === 'ref:p2')!;
    const g2 = result.find(t => t.id === 'ref:p3')!;
    expect(g1.order).toBeLessThan(g2.order);
  });

});

describe('canCreateOnRow（作成ドラッグの可否）', () => {
  it('日付未設定・非親・非マイルストーン・現プロジェクトのタスクは作成可', () => {
    const t = makeTask({ id: 't1', projectId: 'p1', startDate: null });
    expect(canCreateOnRow(t, false, 'p1')).toBe(true);
  });

  it('日付未設定でも参照タスク（他プロジェクト）は作成不可', () => {
    const t = makeTask({ id: 'r1', projectId: 'p2', startDate: null });
    expect(canCreateOnRow(t, false, 'p1')).toBe(false);
  });

  it('合成グループ行は作成不可', () => {
    const t = makeTask({ id: 'ref:p2', projectId: 'p2', startDate: null });
    expect(canCreateOnRow(t, false, 'p1')).toBe(false);
  });

  it('親タスク・マイルストーン・日付設定済みは従来どおり作成不可', () => {
    expect(canCreateOnRow(makeTask({ startDate: null }), true, 'p1')).toBe(false);
    expect(canCreateOnRow(makeTask({ startDate: null, isMilestone: true }), false, 'p1')).toBe(false);
    expect(canCreateOnRow(makeTask({ startDate: '2026-01-01' }), false, 'p1')).toBe(false);
  });
});

describe('mergeRefTasks — 非破壊確認', () => {
  it('元の tasks 配列を変更しない（非破壊）', () => {
    const tasks = [makeTask({ id: 't1' })];
    const refTasks = [makeTask({ id: 'r1', projectId: 'p2' })];
    const before = [...tasks];
    mergeRefTasks(tasks, refTasks, projects);
    expect(tasks).toEqual(before);
  });
});
