// @vitest-environment node
/**
 * 期限遅れタスクのフィルタ（filterOverdue）
 * - isOverdueTask（utils/ganttCalc.ts）: 期限超過判定を一本化した純粋関数
 *   （GanttBar.tsx のローカル変数 isOverdue と同じ式を切り出したもの）
 * - filterTasks（utils/sort.ts）の期限条件（第7引数）
 *
 * 遅延（overdue）の定義：
 *   task.endDate !== null && normalizeDateStr(task.endDate) < todayStr()
 *   && task.status !== 'done' && task.status !== 'pending'
 *
 * 日付は実行日を基準に相対生成する（固定日付をハードコードすると将来壊れるため）。
 */
import dayjs from 'dayjs';
import { describe, it, expect } from 'vitest';
import { filterTasks } from '../utils/sort';
import { isOverdueTask, todayStr } from '../utils/ganttCalc';
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

const today = todayStr();
const yesterday = dayjs(today).subtract(1, 'day').format('YYYY-MM-DD');
const tomorrow = dayjs(today).add(1, 'day').format('YYYY-MM-DD');
// スラッシュ区切りの非 ISO 形式（正規化を経由しないと誤判定する）
const yesterdaySlash = dayjs(today).subtract(1, 'day').format('YYYY/MM/DD');

describe('isOverdueTask', () => {
  it('endDate が過去なら true', () => {
    expect(isOverdueTask({ endDate: yesterday, status: 'todo' })).toBe(true);
  });

  it('endDate が今日なら false（境界）', () => {
    expect(isOverdueTask({ endDate: today, status: 'todo' })).toBe(false);
  });

  it('endDate が未来なら false', () => {
    expect(isOverdueTask({ endDate: tomorrow, status: 'todo' })).toBe(false);
  });

  it('endDate が null なら false', () => {
    expect(isOverdueTask({ endDate: null, status: 'todo' })).toBe(false);
  });

  it('status が done なら false（期限超過日付でも）', () => {
    expect(isOverdueTask({ endDate: yesterday, status: 'done' })).toBe(false);
  });

  it('status が pending なら false（期限超過日付でも）', () => {
    expect(isOverdueTask({ endDate: yesterday, status: 'pending' })).toBe(false);
  });

  it('スラッシュ区切りの日付も normalizeDateStr 経由で正しく判定される', () => {
    expect(isOverdueTask({ endDate: yesterdaySlash, status: 'todo' })).toBe(true);
  });

  it('第2引数 today を明示指定できる', () => {
    // 基準日を yesterday よりさらに過去にずらすと、yesterday は基準日より
    // 「未来」になるため遅延ではなくなる（実行日基準の today では true になる日付）
    const earlierBase = dayjs(today).subtract(2, 'day').format('YYYY-MM-DD');
    expect(isOverdueTask({ endDate: yesterday, status: 'todo' }, earlierBase)).toBe(false);
    // 基準日を tomorrow より未来にずらすと、tomorrow が基準日より過去になり遅延扱いになる
    // （実行日基準の today では false になる日付）
    const laterBase = dayjs(today).add(10, 'day').format('YYYY-MM-DD');
    expect(isOverdueTask({ endDate: tomorrow, status: 'todo' }, laterBase)).toBe(true);
  });
});

describe('filterTasks — 期限フィルタ (filterOverdue)', () => {
  it("filterOverdue='overdue' のとき遅延タスクのみ残る", () => {
    const tasks = [
      makeTask({ id: 'a', endDate: yesterday, status: 'todo' }),
      makeTask({ id: 'b', endDate: tomorrow, status: 'todo' }),
      makeTask({ id: 'c', endDate: yesterday, status: 'done' }),
      makeTask({ id: 'd', endDate: null }),
    ];
    const r = filterTasks(tasks, '', '', '', '', '', 'overdue');
    expect(r.map(t => t.id)).toEqual(['a']);
  });

  it("filterOverdue='' のとき全件返す", () => {
    const tasks = [
      makeTask({ id: 'a', endDate: yesterday, status: 'todo' }),
      makeTask({ id: 'b', endDate: tomorrow, status: 'todo' }),
    ];
    const r = filterTasks(tasks, '', '', '', '', '', '');
    expect(r).toHaveLength(2);
  });

  it('他フィルタ（priority）と AND 合成される', () => {
    const tasks = [
      makeTask({ id: 'a', endDate: yesterday, status: 'todo', priority: 'high' }),
      makeTask({ id: 'b', endDate: yesterday, status: 'todo', priority: 'low' }),
    ];
    const r = filterTasks(tasks, '', '', 'high', '', '', 'overdue');
    expect(r.map(t => t.id)).toEqual(['a']);
  });

  it('第7引数を省略した既存呼び出しは従来どおり動作する（後方互換）', () => {
    const tasks = [
      makeTask({ id: 'a', endDate: yesterday, status: 'todo' }),
      makeTask({ id: 'b', endDate: tomorrow, status: 'todo' }),
    ];
    expect(filterTasks(tasks, '', '', '', '', '')).toHaveLength(2);
  });

  it('マイルストーンも特別扱いされず判定対象になる', () => {
    const tasks = [
      makeTask({ id: 'a', endDate: yesterday, status: 'todo', isMilestone: true, startDate: yesterday }),
      makeTask({ id: 'b', endDate: tomorrow, status: 'todo', isMilestone: true, startDate: tomorrow }),
    ];
    const r = filterTasks(tasks, '', '', '', '', '', 'overdue');
    expect(r.map(t => t.id)).toEqual(['a']);
  });
});
