import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { calcGanttRange, calcTodayX, calcLightningPoints, ganttTotalWidth, ZOOM_CONFIG, calcCriticalPath, calcDuration, ROW_HEIGHT_PX, addDays, buildMultiLevelHeaders, defaultGanttStart, todayStr } from '../utils/ganttCalc';
import type { Task } from '../types/task';

let _seq = 0;
function makeTask(overrides: Partial<Task> = {}): Task {
  _seq++;
  return {
    id: `t${_seq}`, projectId: 'p1', parentId: null,
    title: 'T', summary: '', description: '',
    status: 'todo', priority: 'medium', progress: 0,
    assignee: '', startDate: null, endDate: null, isMilestone: false,
    predecessors: [], seq: _seq, order: _seq, createdAt: '', updatedAt: '',
    ...overrides,
  };
}

beforeEach(() => { _seq = 0; });

const TODAY = new Date('2026-05-21T00:00:00.000Z');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(TODAY);
});
afterEach(() => { vi.useRealTimers(); _seq = 0; });

describe('calcGanttRange', () => {
  it('タスクがない場合は今日を中心に最低90日表示する', () => {
    const { min, max } = calcGanttRange([]);
    const span = (max.getTime() - min.getTime()) / 86400000;
    expect(span).toBeGreaterThanOrEqual(90);
    expect(min.getTime()).toBeLessThanOrEqual(TODAY.getTime());
    expect(max.getTime()).toBeGreaterThan(TODAY.getTime());
  });

  it('タスクの endDate を max が含む', () => {
    const tasks = [
      makeTask({ startDate: '2026-04-01', endDate: '2026-07-31' }),
    ];
    const { max } = calcGanttRange(tasks);
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

describe('defaultGanttStart', () => {
  // TODAY = 2026-05-21 (木)
  it('month: 前月1日を返す', () => {
    expect(defaultGanttStart('month')).toBe('2026-04-01');
  });
  it('week: 先週の週頭（日曜）を返す', () => {
    // 2026-05-21 の1週前 = 2026-05-14(木)、その週の日曜 = 2026-05-10
    expect(defaultGanttStart('week')).toBe('2026-05-10');
  });
  it('day: 昨日を返す', () => {
    expect(defaultGanttStart('day')).toBe('2026-05-20');
  });
});

describe('calcGanttRange + zoom', () => {
  it('タスクがなく zoom=week のとき min が先週頭以前になる', () => {
    const { min } = calcGanttRange([], undefined, undefined, 'week');
    expect(min.getTime()).toBeLessThanOrEqual(new Date('2026-05-10').getTime());
  });
  it('タスクがなく zoom=month のとき min が前月1日以前になる', () => {
    const { min } = calcGanttRange([], undefined, undefined, 'month');
    expect(min.getTime()).toBeLessThanOrEqual(new Date('2026-04-01').getTime());
  });
  it('タスクの有無に関わらず min が defaultGanttStart と一致する', () => {
    const tasks = [makeTask({ startDate: '2026-06-01', endDate: '2026-06-30' })];
    const { min } = calcGanttRange(tasks, undefined, undefined, 'week');
    expect(min.getTime()).toBe(new Date('2026-05-10').getTime());
  });
  it('タスクが defaultGanttStart より前にあっても min は defaultGanttStart のまま', () => {
    const tasks = [makeTask({ startDate: '2026-01-01', endDate: '2026-01-31' })];
    const { min } = calcGanttRange(tasks, undefined, undefined, 'week');
    expect(min.getTime()).toBe(new Date('2026-05-10').getTime());
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

describe('todayStr', () => {
  it('YYYY-MM-DD 形式のローカル日付を返す', () => {
    // vi.setSystemTime で 2026-05-21T00:00:00Z にセット済み（テスト環境は UTC）
    expect(todayStr()).toBe('2026-05-21');
    expect(todayStr()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
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

  it('マイルストーンはスキップされる', () => {
    const milestone = {
      task: makeTask({ status: 'wip', progress: 0, startDate: '2026-05-01', endDate: '2026-05-01', isMilestone: true }),
      effectiveProgress: 0,
    };
    const pts = calcLightningPoints([milestone], minDate, zoom);
    expect(pts).toBeNull();
  });

  it('マイルストーンと通常タスクが混在 → 通常タスクのみ点が生成される', () => {
    const milestone = {
      task: makeTask({ status: 'wip', progress: 50, startDate: '2026-05-01', endDate: '2026-05-01', isMilestone: true }),
      effectiveProgress: 50,
    };
    const normal = {
      task: makeTask({ status: 'wip', progress: 50, startDate: '2026-05-01', endDate: '2026-05-11' }),
      effectiveProgress: 50,
    };
    const pts = calcLightningPoints([milestone, normal], minDate, zoom)!;
    expect(pts).toHaveLength(1); // マイルストーンの行はスキップ
    expect(pts[0].y).toBe(1 * ROW_HEIGHT_PX + ROW_HEIGHT_PX / 2); // 2行目（index=1）の中心Y
  });
});

describe('calcDuration', () => {
  it('1日タスク（開始日=終了日）→ 1', () => {
    expect(calcDuration(makeTask({ startDate: '2026-05-01', endDate: '2026-05-01' }))).toBe(1);
  });

  it('10日タスク → 10', () => {
    expect(calcDuration(makeTask({ startDate: '2026-05-01', endDate: '2026-05-10' }))).toBe(10);
  });

  it('startDate が null → null', () => {
    expect(calcDuration(makeTask({ startDate: null, endDate: '2026-05-10' }))).toBeNull();
  });

  it('endDate が null → null', () => {
    expect(calcDuration(makeTask({ startDate: '2026-05-01', endDate: null }))).toBeNull();
  });

  it('終了日 < 開始日 → null', () => {
    expect(calcDuration(makeTask({ startDate: '2026-05-10', endDate: '2026-05-01' }))).toBeNull();
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

describe('calcCriticalPath', () => {
  it('依存関係がない場合は空セットを返す', () => {
    const tasks = [
      makeTask({ startDate: '2026-05-01', endDate: '2026-05-10' }),
      makeTask({ startDate: '2026-05-01', endDate: '2026-05-20' }),
    ];
    expect(calcCriticalPath(tasks).size).toBe(0);
  });

  it('単純な A→B 依存でどちらもクリティカル', () => {
    const a = makeTask({ startDate: '2026-05-01', endDate: '2026-05-10' });
    const b = makeTask({ startDate: '2026-05-11', endDate: '2026-05-20', predecessors: [a.id] });
    const cp = calcCriticalPath([a, b]);
    expect(cp.has(a.id)).toBe(true);
    expect(cp.has(b.id)).toBe(true);
  });

  it('並列タスクで最長経路のみクリティカル', () => {
    // short(5日) と long(15日) が並列、どちらも merge に接続
    const short = makeTask({ startDate: '2026-05-01', endDate: '2026-05-05' });
    const long  = makeTask({ startDate: '2026-05-01', endDate: '2026-05-15' });
    const merge = makeTask({ startDate: '2026-05-16', endDate: '2026-05-20', predecessors: [short.id, long.id] });
    const cp = calcCriticalPath([short, long, merge]);
    expect(cp.has(long.id)).toBe(true);
    expect(cp.has(merge.id)).toBe(true);
    expect(cp.has(short.id)).toBe(false);
  });

  it('A→B→C の全チェーンがクリティカル（唯一経路）', () => {
    const a = makeTask({ startDate: '2026-05-01', endDate: '2026-05-05' });
    const b = makeTask({ startDate: '2026-05-06', endDate: '2026-05-10', predecessors: [a.id] });
    const c = makeTask({ startDate: '2026-05-11', endDate: '2026-05-15', predecessors: [b.id] });
    const cp = calcCriticalPath([a, b, c]);
    expect(cp.has(a.id)).toBe(true);
    expect(cp.has(b.id)).toBe(true);
    expect(cp.has(c.id)).toBe(true);
  });

  it('日付なしタスクが混在しても例外を投げない', () => {
    const a = makeTask({ startDate: '2026-05-01', endDate: '2026-05-10' });
    const b = makeTask({ startDate: null, endDate: null, predecessors: [a.id] });
    expect(() => calcCriticalPath([a, b])).not.toThrow();
  });
});

describe('addDays', () => {
  it('n日後を返す', () => {
    expect(addDays('2026-01-01', 10)).toBe('2026-01-11');
  });

  it('月をまたいで正しく計算する', () => {
    expect(addDays('2026-01-28', 5)).toBe('2026-02-02');
  });

  it('n=0 のとき同日を返す', () => {
    expect(addDays('2026-05-15', 0)).toBe('2026-05-15');
  });

  it('負数のとき過去日を返す', () => {
    expect(addDays('2026-05-15', -3)).toBe('2026-05-12');
  });
});

describe('buildMultiLevelHeaders', () => {
  const min = new Date('2026-01-01');
  const max = new Date('2026-04-01');
  const allLevels = { year: true, month: true, week: true, day: true };

  it('全レベルONで5行を返す（day行 + dow行）', () => {
    const rows = buildMultiLevelHeaders(min, max, 'week', allLevels);
    expect(rows.length).toBe(5);
    const levels = rows.map(r => r.level);
    expect(levels).toContain('year');
    expect(levels).toContain('month');
    expect(levels).toContain('week');
    expect(levels).toContain('day');
    expect(levels).toContain('dow');
  });

  it('レベル指定で行数が変わる', () => {
    const rows = buildMultiLevelHeaders(min, max, 'week', { year: true, month: true, week: false, day: false });
    expect(rows.length).toBe(2);
    const levels = rows.map(r => r.level);
    expect(levels).toContain('year');
    expect(levels).toContain('month');
  });

  it('全レベルOFFで0行を返す', () => {
    const rows = buildMultiLevelHeaders(min, max, 'week', { year: false, month: false, week: false, day: false });
    expect(rows.length).toBe(0);
  });

  it('yearヘッダーは2026が含まれるセルを返す', () => {
    const rows = buildMultiLevelHeaders(min, max, 'week', { year: true, month: false, week: false, day: false });
    const yearRow = rows[0];
    expect(yearRow.cells.some(c => c.label === '2026')).toBe(true);
  });

  it('day行のセルの dow プロパティが0-6の範囲', () => {
    const rows = buildMultiLevelHeaders(new Date('2026-01-01'), new Date('2026-01-10'), 'day', { year: false, month: false, week: false, day: true });
    const dayRow = rows.find(r => r.level === 'day');
    expect(dayRow).toBeDefined();
    dayRow!.cells.forEach(c => {
      expect(c.dow).toBeGreaterThanOrEqual(0);
      expect(c.dow).toBeLessThanOrEqual(6);
    });
  });
});
