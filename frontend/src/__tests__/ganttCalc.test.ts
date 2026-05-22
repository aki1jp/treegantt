import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { calcGanttRange, calcTodayX, calcLightningPoints, ganttTotalWidth, ZOOM_CONFIG } from '../utils/ganttCalc';
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

describe('calcLightningPoints', () => {
  const minDate = new Date('2026-05-01T00:00:00.000Z');
  const zoom = 'day';
  const dayWidth = ZOOM_CONFIG['day'].dayWidth;

  function makeRow(status: Task['status'], progress: number) {
    return {
      task: makeTask({
        status,
        progress,
        startDate: '2026-05-01',
        endDate:   '2026-05-11', // 10日間
      }),
      effectiveProgress: progress,
    };
  }

  it('wip タスクは進捗率に応じた X 座標を返す', () => {
    const rows = [makeRow('wip', 50)];
    const pts = calcLightningPoints(rows, minDate, zoom)!;
    // startX=0, endX=(10+1)*dayWidth (endDate の翌日まで), progressX=endX*50%
    const expectedX = Math.round((10 * dayWidth + dayWidth) * 0.5);
    expect(pts[0].x).toBe(expectedX);
  });

  it('todo タスクは進捗率 0 → startX を返す', () => {
    const rows = [makeRow('todo', 0)];
    const pts = calcLightningPoints(rows, minDate, zoom)!;
    expect(pts[0].x).toBe(0);
  });

  it('done タスクは進捗率によらず todayX を返す', () => {
    const todayX = calcTodayX(minDate, zoom);
    const rows = [makeRow('done', 100)];
    const pts = calcLightningPoints(rows, minDate, zoom)!;
    expect(pts[0].x).toBe(todayX);
  });

  it('wait タスクは進捗率によらず todayX を返す', () => {
    const todayX = calcTodayX(minDate, zoom);
    const rows = [makeRow('wait', 30)];
    const pts = calcLightningPoints(rows, minDate, zoom)!;
    expect(pts[0].x).toBe(todayX);
  });

  it('done と wip が混在する場合、done は todayX・wip は進捗 X を返す', () => {
    const todayX = calcTodayX(minDate, zoom);
    const rows = [makeRow('done', 100), makeRow('wip', 50)];
    const pts = calcLightningPoints(rows, minDate, zoom)!;
    const expectedWipX = Math.round((10 * dayWidth + dayWidth) * 0.5);
    expect(pts[0].x).toBe(todayX);
    expect(pts[1].x).toBe(expectedWipX);
  });

  it('日付がないタスクはスキップされる', () => {
    const noDate = { task: makeTask({ status: 'wip', progress: 50 }), effectiveProgress: 50 };
    const pts = calcLightningPoints([noDate], minDate, zoom);
    expect(pts).toBeNull();
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
