import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { calcGanttRange, calcTodayX, ganttTotalWidth, ZOOM_CONFIG } from '../utils/ganttCalc';
import type { Task } from '../types/task';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 't1', projectId: 'p1', parentId: null,
    title: 'T', summary: '', description: '',
    status: 'todo', priority: 'medium', progress: 0,
    assignee: '', startDate: null, endDate: null,
    predecessors: [], order: 0, createdAt: '', updatedAt: '',
    ...overrides,
  };
}

const TODAY = new Date('2026-05-21T00:00:00.000Z');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(TODAY);
});
afterEach(() => { vi.useRealTimers(); });

describe('calcGanttRange', () => {
  it('タスクがない場合は今日を中心に最低90日表示する', () => {
    const { min, max } = calcGanttRange([]);
    const span = (max.getTime() - min.getTime()) / 86400000;
    expect(span).toBeGreaterThanOrEqual(90);
    expect(min.getTime()).toBeLessThanOrEqual(TODAY.getTime());
    expect(max.getTime()).toBeGreaterThan(TODAY.getTime());
  });

  it('タスクの日付を含む範囲を返す', () => {
    const tasks = [
      makeTask({ startDate: '2026-04-01', endDate: '2026-07-31' }),
    ];
    const { min, max } = calcGanttRange(tasks);
    expect(min.getTime()).toBeLessThanOrEqual(new Date('2026-04-01').getTime());
    expect(max.getTime()).toBeGreaterThanOrEqual(new Date('2026-07-31').getTime());
  });

  it('最低90日のスパンを保証する', () => {
    // 開始〜終了が1日しかないタスクでも90日以上表示
    const tasks = [makeTask({ startDate: '2026-05-21', endDate: '2026-05-22' })];
    const { min, max } = calcGanttRange(tasks);
    const span = (max.getTime() - min.getTime()) / 86400000;
    expect(span).toBeGreaterThanOrEqual(90);
  });
});

describe('calcTodayX', () => {
  it('今日のX座標を正しく計算する（weekズーム）', () => {
    const { min } = calcGanttRange([]);
    const x = calcTodayX(min, 'week');
    const dayWidth = ZOOM_CONFIG['week'].dayWidth;
    const expectedDays = Math.round((TODAY.getTime() - min.getTime()) / 86400000);
    expect(x).toBe(expectedDays * dayWidth);
  });
});

describe('ganttTotalWidth', () => {
  it('タスクがなくても正の幅を返す', () => {
    const w = ganttTotalWidth([], 'week');
    expect(w).toBeGreaterThan(0);
  });

  it('ズームレベルによって幅が変わる', () => {
    const wDay   = ganttTotalWidth([], 'day');
    const wWeek  = ganttTotalWidth([], 'week');
    const wMonth = ganttTotalWidth([], 'month');
    expect(wDay).toBeGreaterThan(wWeek);
    expect(wWeek).toBeGreaterThan(wMonth);
  });
});
