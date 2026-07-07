// @vitest-environment node
/**
 * タスクの色によるフィルタ（filterColor）
 * - filterTasks（utils/sort.ts）の色条件
 * - getUniqueTaskColors（utils/ganttCalc.ts）: 使用中の実効色を動的収集
 *
 * 実効色の判定規則（右クリック色パレット TaskContextMenus の実態に合わせる）：
 *   titleBgColor ?? titleColor（背景色を優先し、背景色が未設定のときのみ文字色で判定）。
 *   titleColor/titleBgColor は独立に設定できるため、両方 null のタスクのみ「無色」。
 */
import { describe, it, expect } from 'vitest';
import { filterTasks } from '../utils/sort';
import { getUniqueTaskColors } from '../utils/ganttCalc';
import type { Task } from '../types/task';

let seq = 0;
function makeTask(overrides: Partial<Task> = {}): Task {
  seq++;
  return {
    id: `t${seq}`, projectId: 'p1', parentId: null,
    title: `Task${seq}`, summary: '', description: '',
    status: 'todo', priority: 'medium', progress: 0, assignee: '',
    startDate: null, endDate: null, isMilestone: false, predecessors: [],
    seq, order: seq, titleColor: null, titleBgColor: null, estimateMinutes: null,
    createdAt: '', updatedAt: '',
    ...overrides,
  };
}

describe('filterTasks — 色フィルタ (filterColor)', () => {
  it('filterColor 未指定（\'\'）のときは全タスクを返す（実効色に関係なく）', () => {
    const tasks = [
      makeTask({ id: 'a', titleBgColor: '#ef4444' }),
      makeTask({ id: 'b' }),
    ];
    expect(filterTasks(tasks, '', '', '', '', '')).toHaveLength(2);
  });

  it('filterColor="*"（色付き）は titleColor/titleBgColor いずれかが設定されたタスクのみ返す', () => {
    const tasks = [
      makeTask({ id: 'a', titleBgColor: '#ef4444' }),
      makeTask({ id: 'b', titleColor: '#3b82f6' }),
      makeTask({ id: 'c' }),
    ];
    const r = filterTasks(tasks, '', '', '', '', '*');
    expect(r.map(t => t.id).sort()).toEqual(['a', 'b']);
  });

  it('filterColor に実効色（titleBgColor優先）の値を指定すると一致するタスクのみ返す', () => {
    const tasks = [
      makeTask({ id: 'a', titleBgColor: '#ef4444', titleColor: '#000000' }),
      makeTask({ id: 'b', titleBgColor: '#3b82f6' }),
      makeTask({ id: 'c', titleBgColor: '#ef4444' }),
    ];
    const r = filterTasks(tasks, '', '', '', '', '#ef4444');
    expect(r.map(t => t.id).sort()).toEqual(['a', 'c']);
  });

  it('titleBgColor が null で titleColor のみ設定されたタスクは titleColor で判定される', () => {
    const tasks = [
      makeTask({ id: 'a', titleColor: '#22c55e', titleBgColor: null }),
      makeTask({ id: 'b', titleColor: '#8b5cf6', titleBgColor: null }),
    ];
    const r = filterTasks(tasks, '', '', '', '', '#22c55e');
    expect(r.map(t => t.id)).toEqual(['a']);
  });

  it('titleBgColor と titleColor が両方設定されている場合は titleBgColor が優先される（titleColor だけの値では一致しない）', () => {
    const tasks = [
      makeTask({ id: 'a', titleBgColor: '#ef4444', titleColor: '#000000' }),
    ];
    expect(filterTasks(tasks, '', '', '', '', '#000000')).toHaveLength(0);
    expect(filterTasks(tasks, '', '', '', '', '#ef4444')).toHaveLength(1);
  });

  it('色フィルタと他フィルタ（status）は AND 合成される', () => {
    const tasks = [
      makeTask({ id: 'a', status: 'todo', titleBgColor: '#ef4444' }),
      makeTask({ id: 'b', status: 'done', titleBgColor: '#ef4444' }),
    ];
    const r = filterTasks(tasks, 'todo', '', '', '', '#ef4444');
    expect(r.map(t => t.id)).toEqual(['a']);
  });

  it('既存呼び出し（filterColor省略）は従来どおり動作する（後方互換）', () => {
    const tasks = [makeTask({ id: 'a' }), makeTask({ id: 'b' })];
    expect(filterTasks(tasks, '', '', '')).toHaveLength(2);
  });
});

describe('getUniqueTaskColors', () => {
  it('実効色（titleBgColor優先・null時titleColor）を重複排除して返す', () => {
    const tasks = [
      makeTask({ titleBgColor: '#ef4444' }),
      makeTask({ titleBgColor: '#ef4444' }),
      makeTask({ titleColor: '#3b82f6', titleBgColor: null }),
      makeTask(),
    ];
    expect(getUniqueTaskColors(tasks)).toEqual(['#3b82f6', '#ef4444']);
  });

  it('無色（titleColor/titleBgColor とも null）のタスクは含まれない', () => {
    const tasks = [makeTask(), makeTask()];
    expect(getUniqueTaskColors(tasks)).toEqual([]);
  });

  it('titleBgColor と titleColor 両方設定時は titleBgColor のみが採用される', () => {
    const tasks = [makeTask({ titleBgColor: '#22c55e', titleColor: '#000000' })];
    expect(getUniqueTaskColors(tasks)).toEqual(['#22c55e']);
  });

  it('ソートされた順で返る', () => {
    const tasks = [
      makeTask({ titleBgColor: '#f97316' }),
      makeTask({ titleBgColor: '#3b82f6' }),
      makeTask({ titleBgColor: '#8b5cf6' }),
    ];
    expect(getUniqueTaskColors(tasks)).toEqual(['#3b82f6', '#8b5cf6', '#f97316']);
  });
});
