import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import dayjs from 'dayjs';
import { calcGanttRange, calcTodayX, calcNowX, calcLightningPoints, calcVertexX, normalizeDateStr, ganttTotalWidth, ZOOM_CONFIG, calcCriticalPath, calcDuration, ROW_HEIGHT_PX, addDays, buildMultiLevelHeaders, defaultGanttStart, todayStr, dateToX, xToDateStr, getUniqueAssignees, buildCollapsedCriticalParents, isAncestorOf, isAncestorOrDescendant, calcParentSpanMap, computeInsertOrder } from '../utils/ganttCalc';
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
    titleColor: null, titleBgColor: null,
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
  it('day: 7日前を返す', () => {
    // 2026-05-21 の7日前 = 2026-05-14
    expect(defaultGanttStart('day')).toBe('2026-05-14');
  });
});

describe('calcGanttRange + zoom', () => {
  it('タスクがなく zoom=week のとき min が先週頭以前になる', () => {
    const { min } = calcGanttRange([], undefined, undefined, 'week');
    expect(min.getTime()).toBeLessThanOrEqual(new Date(2026, 4, 10).getTime());
  });
  it('タスクがなく zoom=month のとき min が前月1日以前になる', () => {
    const { min } = calcGanttRange([], undefined, undefined, 'month');
    expect(min.getTime()).toBeLessThanOrEqual(new Date('2026-04-01').getTime());
  });
  it('タスクの有無に関わらず min が defaultGanttStart と一致する', () => {
    const tasks = [makeTask({ startDate: '2026-06-01', endDate: '2026-06-30' })];
    const { min } = calcGanttRange(tasks, undefined, undefined, 'week');
    expect(min.getTime()).toBe(new Date(2026, 4, 10).getTime());
  });
  it('タスクが defaultGanttStart より前にあっても min は defaultGanttStart のまま', () => {
    const tasks = [makeTask({ startDate: '2026-01-01', endDate: '2026-01-31' })];
    const { min } = calcGanttRange(tasks, undefined, undefined, 'week');
    expect(min.getTime()).toBe(new Date(2026, 4, 10).getTime());
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

describe('calcNowX', () => {
  const minDate = new Date(2026, 4, 20); // ローカル0時（実装は parseDateStr のローカル時刻基準）
  const dayWidth = ZOOM_CONFIG['day'].dayWidth;

  it('ローカル0時はその日の列左端（calcTodayX と一致）', () => {
    vi.setSystemTime(new Date(2026, 4, 21)); // ローカル 2026-05-21 00:00
    const x = calcNowX(minDate, 'day');
    const todayX = calcTodayX(minDate, 'day');
    expect(x).toBeCloseTo(todayX, 0);
  });

  it('ローカル12:00 は1日分の列の中央', () => {
    vi.setSystemTime(new Date(2026, 4, 21, 12, 0, 0));
    const todayX = calcTodayX(minDate, 'day');
    const x = calcNowX(minDate, 'day');
    expect(x).toBeCloseTo(todayX + dayWidth * 0.5, 1);
  });

  it('ローカル06:00 は1日分の列の1/4', () => {
    vi.setSystemTime(new Date(2026, 4, 21, 6, 0, 0));
    const todayX = calcTodayX(minDate, 'day');
    const x = calcNowX(minDate, 'day');
    expect(x).toBeCloseTo(todayX + dayWidth * 0.25, 1);
  });

  it('週ズームでも同様にローカル時刻の分数を加算する', () => {
    vi.setSystemTime(new Date(2026, 4, 21, 18, 0, 0));
    const wDayWidth = ZOOM_CONFIG['week'].dayWidth;
    const todayX = calcTodayX(minDate, 'week');
    const x = calcNowX(minDate, 'week');
    expect(x).toBeCloseTo(todayX + wDayWidth * 0.75, 1);
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

  it('todo タスクは開始日が今日より前なら開始X（左＝遅れ）を返す', () => {
    // makeRow の startDate=2026-05-01 は today(2026-05-21)より前
    const startX = Math.round(dateToX('2026-05-01', minDate, zoom));
    const rows = [makeRow('todo', 0)];
    const pts = calcLightningPoints(rows, minDate, zoom)!;
    expect(pts[0].x).toBe(startX);
  });

  it('todo タスクは開始日が今日以降なら nowX を返す', () => {
    const todayX = Math.round(calcNowX(minDate, zoom));
    const rows = [{
      task: makeTask({ status: 'todo', progress: 0, startDate: '2026-05-25', endDate: '2026-05-30' }),
      effectiveProgress: 0,
    }];
    const pts = calcLightningPoints(rows, minDate, zoom)!;
    expect(pts[0].x).toBe(todayX);
  });

  it('done タスクは進捗率によらず nowX を返す', () => {
    const todayX = Math.round(calcNowX(minDate, zoom));
    const rows = [makeRow('done', 100)];
    const pts = calcLightningPoints(rows, minDate, zoom)!;
    expect(pts[0].x).toBe(todayX);
  });

  it('wait タスクは進捗率によらず nowX を返す', () => {
    const todayX = Math.round(calcNowX(minDate, zoom));
    const rows = [makeRow('wait', 30)];
    const pts = calcLightningPoints(rows, minDate, zoom)!;
    expect(pts[0].x).toBe(todayX);
  });

  it('done と wip が混在する場合、done は nowX・wip は進捗 X を返す', () => {
    const todayX = Math.round(calcNowX(minDate, zoom));
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

  it('折りたたみ親（wip）の頂点は effectiveStart/End（表示スパン）を優先する（v2.73）', () => {
    // DB 生値は 05-01〜05-21（20日）だが、表示スパンは 05-01〜05-11（10日）
    const collapsedParent = {
      task: makeTask({ status: 'wip', progress: 50, startDate: '2026-05-01', endDate: '2026-05-21' }),
      effectiveProgress: 50,
      hasChildren: true,
      isCollapsed: true,
      effectiveStart: '2026-05-01',
      effectiveEnd:   '2026-05-11',
    };
    const pts = calcLightningPoints([collapsedParent], minDate, zoom)!;
    // スパン基準: startX=0, endX=(10+1)*dayWidth, X=endX*50% = 154（生値なら 294 でズレる）
    const expectedX = Math.round((10 * dayWidth + dayWidth) * 0.5);
    expect(pts[0].x).toBe(expectedX);
  });

  it('日付なしの折りたたみ親も effectiveStart/End があれば頂点を描く（v2.73）', () => {
    const noDbDatesParent = {
      task: makeTask({ status: 'wip', progress: 40, startDate: null, endDate: null }),
      effectiveProgress: 40,
      hasChildren: true,
      isCollapsed: true,
      effectiveStart: '2026-05-01',
      effectiveEnd:   '2026-05-11',
    };
    const pts = calcLightningPoints([noDbDatesParent], minDate, zoom);
    expect(pts).not.toBeNull();
    expect(pts!).toHaveLength(1);
  });
});

describe('normalizeDateStr', () => {
  it('スラッシュ区切りを ISO（ハイフン）へ変換する', () => {
    expect(normalizeDateStr('2026/01/10')).toBe('2026-01-10');
  });
  it('ISO はそのまま返す', () => {
    expect(normalizeDateStr('2026-01-10')).toBe('2026-01-10');
  });
  it('解釈不能な文字列は原文を返す（データ消失防止）', () => {
    expect(normalizeDateStr('not-a-date')).toBe('not-a-date');
  });
});

describe('calcVertexX（スラッシュ日付）', () => {
  const minDate = new Date('2026-05-01T00:00:00.000Z');
  const zoom = 'day';
  const nowX = Math.round(calcNowX(minDate, zoom)); // today=2026-05-21（fake timer）

  it('スラッシュ区切りの過去開始 todo も開始X（遅れ）を返す', () => {
    const t = makeTask({ status: 'todo', progress: 0 });
    // '2026/05/05' は today(2026-05-21) より過去 → 開始X
    expect(calcVertexX(t, '2026/05/05', '2026/05/15', 0, minDate, zoom, nowX))
      .toBe(Math.round(dateToX('2026/05/05', minDate, zoom)));
  });
});

describe('calcVertexX', () => {
  const minDate = new Date('2026-05-01T00:00:00.000Z');
  const zoom = 'day';
  const dayWidth = ZOOM_CONFIG['day'].dayWidth;
  const nowX = Math.round(calcNowX(minDate, zoom)); // today=2026-05-21（fake timer）

  it('wip は進捗到達点を返す', () => {
    const t = makeTask({ status: 'wip', progress: 50 });
    const expected = Math.round((10 * dayWidth + dayWidth) * 0.5);
    expect(calcVertexX(t, '2026-05-01', '2026-05-11', 50, minDate, zoom, nowX)).toBe(expected);
  });

  it('todo（開始日が過去）は開始Xを返す', () => {
    const t = makeTask({ status: 'todo', progress: 0 });
    expect(calcVertexX(t, '2026-05-01', '2026-05-11', 0, minDate, zoom, nowX))
      .toBe(Math.round(dateToX('2026-05-01', minDate, zoom)));
  });

  it('todo（開始日が未来）は nowX を返す', () => {
    const t = makeTask({ status: 'todo', progress: 0 });
    expect(calcVertexX(t, '2026-05-25', '2026-05-30', 0, minDate, zoom, nowX)).toBe(nowX);
  });

  it('done / wait は nowX を返す', () => {
    expect(calcVertexX(makeTask({ status: 'done' }), '2026-05-01', '2026-05-11', 100, minDate, zoom, nowX)).toBe(nowX);
    expect(calcVertexX(makeTask({ status: 'wait' }), '2026-05-01', '2026-05-11', 30, minDate, zoom, nowX)).toBe(nowX);
  });

  it('pending / マイルストーン / 日付なし は null', () => {
    expect(calcVertexX(makeTask({ status: 'pending' }), '2026-05-01', '2026-05-11', 0, minDate, zoom, nowX)).toBeNull();
    expect(calcVertexX(makeTask({ status: 'wip', isMilestone: true }), '2026-05-01', '2026-05-11', 50, minDate, zoom, nowX)).toBeNull();
    expect(calcVertexX(makeTask({ status: 'wip' }), null, null, 50, minDate, zoom, nowX)).toBeNull();
  });

  it('親（isParent）は status=todo・開始日過去でも進捗到達点を返す', () => {
    const t = makeTask({ status: 'todo', progress: 40 });
    const expected = Math.round((10 * dayWidth + dayWidth) * 0.4);
    // isParent=true → status 分岐より優先して進捗％位置（開始Xではない）
    expect(calcVertexX(t, '2026-05-01', '2026-05-11', 40, minDate, zoom, nowX, true)).toBe(expected);
    // 回帰: 葉（isParent=false）は従来どおり開始X
    expect(calcVertexX(t, '2026-05-01', '2026-05-11', 40, minDate, zoom, nowX, false))
      .toBe(Math.round(dateToX('2026-05-01', minDate, zoom)));
  });

  it('親（isParent）でも pending / マイルストーン / 日付なし は null', () => {
    expect(calcVertexX(makeTask({ status: 'pending' }), '2026-05-01', '2026-05-11', 40, minDate, zoom, nowX, true)).toBeNull();
    expect(calcVertexX(makeTask({ status: 'todo', isMilestone: true }), '2026-05-01', '2026-05-11', 40, minDate, zoom, nowX, true)).toBeNull();
    expect(calcVertexX(makeTask({ status: 'todo' }), null, null, 40, minDate, zoom, nowX, true)).toBeNull();
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

describe('日付座標系の一貫性', () => {
  // calcGanttRange が返す min はローカル 0 時であること（UTC midnight ではない）
  it('calcGanttRange の min はローカル午前0時の Date を返す', () => {
    const { min } = calcGanttRange([], '2026-05-20', undefined, 'day');
    // dayjs('YYYY-MM-DD').toDate() はローカル 0 時。new Date('YYYY-MM-DD') は UTC 0 時なので
    // UTC 以外のタイムゾーンでは異なる値になる。min はローカル 0 時であるべき
    expect(min.getTime()).toBe(dayjs('2026-05-20').toDate().getTime());
  });

  it('dateToX の座標が buildMultiLevelHeaders の day セル x と一致する', () => {
    const { min, max } = calcGanttRange([], '2026-05-20', '3m', 'day');
    const dayWidth = ZOOM_CONFIG['day'].dayWidth;
    const headers = buildMultiLevelHeaders(min, max, 'day', { year: false, month: false, week: false, day: true });
    const dayRow = headers.find(r => r.level === 'day')!;
    dayRow.cells.forEach((cell, i) => {
      const dateStr = addDays('2026-05-20', i);
      expect(dateToX(dateStr, min, 'day')).toBe(i * dayWidth);
      expect(dateToX(dateStr, min, 'day')).toBe(cell.x);
    });
  });

  it('calcDuration: ローカル日付差が正しく計算される', () => {
    const task = { startDate: '2026-05-20', endDate: '2026-05-22' } as Task;
    // 3日間（20,21,22）
    expect(calcDuration(task)).toBe(3);
  });
});

describe('xToDateStr', () => {
  // calcGanttRange が返す min は dayjs('YYYY-MM-DD').toDate() で生成されたローカル午前0時の Date
  // toISOString() は UTC 基準のため JST 等では1日ずれる。dayjs を使ってローカル日付に変換する
  const dayWidth = ZOOM_CONFIG['day'].dayWidth; // 28px

  it('relX=0 は min の日付を返す', () => {
    const min = dayjs('2026-05-20').toDate();
    expect(xToDateStr(0, min, dayWidth)).toBe('2026-05-20');
  });

  it('relX=dayWidth で翌日を返す', () => {
    const min = dayjs('2026-05-20').toDate();
    expect(xToDateStr(dayWidth, min, dayWidth)).toBe('2026-05-21');
  });

  it('relX=dayWidth-1 はまだ同じ日（Math.floor）', () => {
    const min = dayjs('2026-05-20').toDate();
    expect(xToDateStr(dayWidth - 1, min, dayWidth)).toBe('2026-05-20');
  });

  it('7日分のピクセルで7日後を返す', () => {
    const min = dayjs('2026-05-20').toDate();
    expect(xToDateStr(7 * dayWidth, min, dayWidth)).toBe('2026-05-27');
  });

  it('week ズームの dayWidth でも正しく計算できる', () => {
    const weekWidth = ZOOM_CONFIG['week'].dayWidth; // 8px
    const min = dayjs('2026-05-20').toDate();
    // 56px / 8px = 7日 → 2026-05-27
    expect(xToDateStr(56, min, weekWidth)).toBe('2026-05-27');
  });

  it('addDays との一貫性: xToDateStr(n*dw, min, dw) = addDays(minStr, n)', () => {
    const min = dayjs('2026-06-01').toDate();
    for (let n = 0; n < 10; n++) {
      expect(xToDateStr(n * dayWidth, min, dayWidth)).toBe(addDays('2026-06-01', n));
    }
  });
});

describe('getUniqueAssignees', () => {
  function makeTask(id: string, assignee: string): Task {
    return {
      id, projectId: 'p1', parentId: null,
      title: 'T', summary: '', description: '',
      status: 'todo', priority: 'medium', progress: 0,
      assignee, startDate: null, endDate: null,
      isMilestone: false, predecessors: [], seq: 1, order: 1,
      createdAt: '', updatedAt: '', titleColor: null, titleBgColor: null,
    };
  }

  it('重複を除いてソートされた担当者リストを返す', () => {
    const tasks = [makeTask('t1', '山田'), makeTask('t2', '佐藤'), makeTask('t3', '山田')];
    expect(getUniqueAssignees(tasks)).toEqual(['佐藤', '山田']);
  });

  it('空文字の担当者を除外する', () => {
    const tasks = [makeTask('t1', ''), makeTask('t2', '田中')];
    expect(getUniqueAssignees(tasks)).toEqual(['田中']);
  });

  it('タスクが空のとき空配列を返す', () => {
    expect(getUniqueAssignees([])).toEqual([]);
  });

  it('全員担当者なしのとき空配列を返す', () => {
    const tasks = [makeTask('t1', ''), makeTask('t2', '')];
    expect(getUniqueAssignees(tasks)).toEqual([]);
  });
});

// ── v2.32: buildCollapsedCriticalParents ────────────────────────────────────
describe('buildCollapsedCriticalParents', () => {
  function makeTask(id: string, parentId: string | null = null): Task {
    return {
      id, projectId: 'p1', parentId,
      title: id, summary: '', description: '',
      status: 'todo', priority: 'medium', progress: 0, assignee: '',
      startDate: '2026-06-10', endDate: '2026-06-20',
      isMilestone: false, predecessors: [], seq: 1, order: 1,
      createdAt: '', updatedAt: '', titleColor: null, titleBgColor: null,
    };
  }

  it('criticalSet が空のとき空を返す', () => {
    const sorted = [makeTask('P'), makeTask('C', 'P')];
    expect(buildCollapsedCriticalParents(sorted, new Set(), new Set(['P']))).toEqual(new Set());
  });

  it('collapsed が空のとき空を返す', () => {
    const sorted = [makeTask('P'), makeTask('C', 'P')];
    expect(buildCollapsedCriticalParents(sorted, new Set(['C']), new Set())).toEqual(new Set());
  });

  it('折りたたまれた親の直接子がクリティカル → 親が含まれる', () => {
    const sorted = [makeTask('P'), makeTask('C', 'P')];
    const result = buildCollapsedCriticalParents(sorted, new Set(['C']), new Set(['P']));
    expect(result.has('P')).toBe(true);
  });

  it('折りたたまれた親の孫（2階層）がクリティカル → 親が含まれる', () => {
    const sorted = [makeTask('GP'), makeTask('P', 'GP'), makeTask('C', 'P')];
    const result = buildCollapsedCriticalParents(sorted, new Set(['C']), new Set(['GP']));
    expect(result.has('GP')).toBe(true);
  });

  it('クリティカルな子孫がいない折りたたまれた親 → 含まれない', () => {
    const sorted = [makeTask('P'), makeTask('C', 'P')];
    const result = buildCollapsedCriticalParents(sorted, new Set(['OTHER']), new Set(['P']));
    expect(result.has('P')).toBe(false);
  });

  it('折りたたまれていない親はクリティカルな子があっても含まれない', () => {
    const sorted = [makeTask('P'), makeTask('C', 'P')];
    // collapsed に P を含めない
    const result = buildCollapsedCriticalParents(sorted, new Set(['C']), new Set());
    expect(result.has('P')).toBe(false);
  });
});

// ── v2.33: isAncestorOf / isAncestorOrDescendant ────────────────────────────
describe('isAncestorOf', () => {
  function makeTask(id: string, parentId: string | null = null): Task {
    return {
      id, projectId: 'p1', parentId,
      title: id, summary: '', description: '',
      status: 'todo', priority: 'medium', progress: 0, assignee: '',
      startDate: null, endDate: null,
      isMilestone: false, predecessors: [], seq: 1, order: 1,
      createdAt: '', updatedAt: '', titleColor: null, titleBgColor: null,
    };
  }

  // GP → P → C のツリーを用意
  const tasks = [makeTask('GP'), makeTask('P', 'GP'), makeTask('C', 'P'), makeTask('S', 'GP')];
  const taskById = new Map(tasks.map(t => [t.id, t]));

  it('直接の親 GP は C の祖先ではなく P の祖先', () => {
    expect(isAncestorOf('GP', 'P', taskById)).toBe(true);
  });

  it('祖父 GP は C の祖先', () => {
    expect(isAncestorOf('GP', 'C', taskById)).toBe(true);
  });

  it('子 P は GP の祖先でない（逆方向）', () => {
    expect(isAncestorOf('P', 'GP', taskById)).toBe(false);
  });

  it('兄弟 S は C の祖先でない', () => {
    expect(isAncestorOf('S', 'C', taskById)).toBe(false);
  });

  it('自己参照は false', () => {
    expect(isAncestorOf('P', 'P', taskById)).toBe(false);
  });
});

describe('isAncestorOrDescendant', () => {
  function makeTask(id: string, parentId: string | null = null): Task {
    return {
      id, projectId: 'p1', parentId,
      title: id, summary: '', description: '',
      status: 'todo', priority: 'medium', progress: 0, assignee: '',
      startDate: null, endDate: null,
      isMilestone: false, predecessors: [], seq: 1, order: 1,
      createdAt: '', updatedAt: '', titleColor: null, titleBgColor: null,
    };
  }

  const tasks = [makeTask('GP'), makeTask('P', 'GP'), makeTask('C', 'P'), makeTask('S', 'GP')];
  const taskById = new Map(tasks.map(t => [t.id, t]));

  it('親子（GP↔P）は true', () => {
    expect(isAncestorOrDescendant('GP', 'P', taskById)).toBe(true);
    expect(isAncestorOrDescendant('P', 'GP', taskById)).toBe(true);
  });

  it('祖父孫（GP↔C）は true', () => {
    expect(isAncestorOrDescendant('GP', 'C', taskById)).toBe(true);
    expect(isAncestorOrDescendant('C', 'GP', taskById)).toBe(true);
  });

  it('兄弟（P↔S）は false', () => {
    expect(isAncestorOrDescendant('P', 'S', taskById)).toBe(false);
  });

  it('甥と叔父（C↔S）は false', () => {
    expect(isAncestorOrDescendant('C', 'S', taskById)).toBe(false);
  });
});

describe('calcParentSpanMap', () => {
  // ── 基本 ──────────────────────────────────────────────
  it('子タスクの min/max から親スパンを算出する', () => {
    const parent = makeTask({ id: 'p' });
    const c1     = makeTask({ id: 'c1', parentId: 'p', startDate: '2026-06-01', endDate: '2026-06-15' });
    const c2     = makeTask({ id: 'c2', parentId: 'p', startDate: '2026-06-10', endDate: '2026-06-30' });
    const map = calcParentSpanMap([parent, c1, c2]);
    expect(map.get('p')).toEqual({ startDate: '2026-06-01', endDate: '2026-06-30' });
  });

  it('子が1つだけの場合もその日付を使う', () => {
    const parent = makeTask({ id: 'p' });
    const child  = makeTask({ id: 'c', parentId: 'p', startDate: '2026-07-01', endDate: '2026-07-31' });
    const map = calcParentSpanMap([parent, child]);
    expect(map.get('p')).toEqual({ startDate: '2026-07-01', endDate: '2026-07-31' });
  });

  it('子に日付がない場合は startDate/endDate が null', () => {
    const parent = makeTask({ id: 'p' });
    const child  = makeTask({ id: 'c', parentId: 'p' });
    const map = calcParentSpanMap([parent, child]);
    expect(map.get('p')).toEqual({ startDate: null, endDate: null });
  });

  it('マイルストーン子タスクは除外する', () => {
    const parent = makeTask({ id: 'p' });
    const ms     = makeTask({ id: 'ms', parentId: 'p', isMilestone: true, startDate: '2026-06-01', endDate: '2026-06-01' });
    const map = calcParentSpanMap([parent, ms]);
    expect(map.get('p')).toEqual({ startDate: null, endDate: null });
  });

  it('葉タスクはマップに含まれない', () => {
    const parent = makeTask({ id: 'p' });
    const leaf   = makeTask({ id: 'leaf', parentId: 'p', startDate: '2026-06-01', endDate: '2026-06-30' });
    const map = calcParentSpanMap([parent, leaf]);
    expect(map.has('leaf')).toBe(false);
  });

  // ── 多段階 ────────────────────────────────────────────
  it('孫タスクまで包含する（2 階層）', () => {
    const gp     = makeTask({ id: 'gp' });
    const parent = makeTask({ id: 'p', parentId: 'gp' });
    const child  = makeTask({ id: 'c', parentId: 'p', startDate: '2026-07-01', endDate: '2026-07-31' });
    const map = calcParentSpanMap([gp, parent, child]);
    expect(map.get('gp')).toEqual({ startDate: '2026-07-01', endDate: '2026-07-31' });
    expect(map.get('p')).toEqual({ startDate: '2026-07-01', endDate: '2026-07-31' });
  });

  it('兄弟・孫混在でも全子孫の min/max を取る', () => {
    const parent = makeTask({ id: 'p' });
    const c1     = makeTask({ id: 'c1', parentId: 'p', startDate: '2026-06-01', endDate: '2026-06-10' });
    const c2     = makeTask({ id: 'c2', parentId: 'p' });
    const gc1    = makeTask({ id: 'gc1', parentId: 'c2', startDate: '2026-05-01', endDate: '2026-05-05' });
    const map = calcParentSpanMap([parent, c1, c2, gc1]);
    expect(map.get('p')).toEqual({ startDate: '2026-05-01', endDate: '2026-06-10' });
  });

  // ── ガントバードラッグ後（子の日付変更） ─────────────
  it('子の startDate 変更後にスパンが更新される（ガントドラッグ後の store 状態）', () => {
    const parent      = makeTask({ id: 'p' });
    const childBefore = makeTask({ id: 'c', parentId: 'p', startDate: '2026-06-01', endDate: '2026-06-30' });
    const childAfter  = { ...childBefore, startDate: '2026-05-01' };
    const map = calcParentSpanMap([parent, childAfter]);
    expect(map.get('p')?.startDate).toBe('2026-05-01');
  });

  it('子の endDate 変更後にスパンが延びる（ガントリサイズ後）', () => {
    const parent      = makeTask({ id: 'p' });
    const childBefore = makeTask({ id: 'c', parentId: 'p', startDate: '2026-06-01', endDate: '2026-06-30' });
    const childAfter  = { ...childBefore, endDate: '2026-07-31' };
    const map = calcParentSpanMap([parent, childAfter]);
    expect(map.get('p')?.endDate).toBe('2026-07-31');
  });

  // ── WBS ドラッグ後（移動元・移動先） ─────────────────
  it('タスクが別親に移動した後、移動元のスパンが縮小する', () => {
    const oldParent = makeTask({ id: 'old' });
    const child1    = makeTask({ id: 'c1', parentId: 'old', startDate: '2026-06-01', endDate: '2026-06-30' });
    const child2    = makeTask({ id: 'c2', parentId: 'old', startDate: '2026-07-01', endDate: '2026-07-31' });
    const newParent = makeTask({ id: 'new' });
    // child2 を new へ移動した後の task リスト
    const child2Moved = { ...child2, parentId: 'new' };
    const map = calcParentSpanMap([oldParent, child1, child2Moved, newParent]);
    expect(map.get('old')).toEqual({ startDate: '2026-06-01', endDate: '2026-06-30' });
  });

  it('タスクが別親に移動した後、移動先のスパンが拡大する', () => {
    const newParent = makeTask({ id: 'new' });
    const child3    = makeTask({ id: 'c3', parentId: 'new', startDate: '2026-09-01', endDate: '2026-09-30' });
    const child2    = makeTask({ id: 'c2', parentId: 'new', startDate: '2026-07-01', endDate: '2026-07-31' });
    const map = calcParentSpanMap([newParent, child3, child2]);
    expect(map.get('new')).toEqual({ startDate: '2026-07-01', endDate: '2026-09-30' });
  });

  // ── 子の追加・削除 ────────────────────────────────────
  it('子タスク追加後にスパンが拡大する', () => {
    const parent = makeTask({ id: 'p' });
    const child1 = makeTask({ id: 'c1', parentId: 'p', startDate: '2026-06-01', endDate: '2026-06-30' });
    const child2 = makeTask({ id: 'c2', parentId: 'p', startDate: '2026-07-01', endDate: '2026-07-31' });
    const map = calcParentSpanMap([parent, child1, child2]);
    expect(map.get('p')?.endDate).toBe('2026-07-31');
  });

  it('子タスク削除後にスパンが縮小する', () => {
    const parent = makeTask({ id: 'p' });
    const child1 = makeTask({ id: 'c1', parentId: 'p', startDate: '2026-06-01', endDate: '2026-06-30' });
    // child2 を削除した後の task リスト（child2 を含まない）
    const map = calcParentSpanMap([parent, child1]);
    expect(map.get('p')?.endDate).toBe('2026-06-30');
  });

  // ── 中間親の stale 日付は含めない ──────────────────────
  it('中間親の stale な日付は祖父スパン計算に含まれない', () => {
    // gp → parent(stale: 05-01〜05-31) → leaf(07-01〜07-31)
    const gp     = makeTask({ id: 'gp' });
    const parent = makeTask({ id: 'p', parentId: 'gp', startDate: '2026-05-01', endDate: '2026-05-31' }); // stale
    const leaf   = makeTask({ id: 'leaf', parentId: 'p', startDate: '2026-07-01', endDate: '2026-07-31' });
    const map = calcParentSpanMap([gp, parent, leaf]);
    expect(map.get('gp')?.startDate).toBe('2026-07-01');
    expect(map.get('gp')?.endDate).toBe('2026-07-31');
    expect(map.get('p')?.startDate).toBe('2026-07-01');
    expect(map.get('p')?.endDate).toBe('2026-07-31');
  });
});

describe('computeInsertOrder', () => {
  const s = (id: string, order: number) => ({ id, order });

  it('afterTaskId で中間挿入 → 両隣の中間値', () => {
    const siblings = [s('a', 1), s('b', 2), s('c', 3)];
    const result = computeInsertOrder(siblings, 'a', null);
    expect(result).toBeGreaterThan(1);
    expect(result).toBeLessThan(2);
  });

  it('afterTaskId で末尾挿入 → lastOrder + 1', () => {
    const siblings = [s('a', 1), s('b', 2), s('c', 3)];
    const result = computeInsertOrder(siblings, 'c', null);
    expect(result).toBe(4);
  });

  it('beforeTaskId で先頭挿入 → firstOrder - 1', () => {
    const siblings = [s('a', 1), s('b', 2), s('c', 3)];
    const result = computeInsertOrder(siblings, null, 'a');
    expect(result).toBe(0);
  });

  it('beforeTaskId で中間挿入 → 両隣の中間値', () => {
    const siblings = [s('a', 1), s('b', 3), s('c', 5)];
    const result = computeInsertOrder(siblings, null, 'b');
    expect(result).toBe(2); // (1 + 3) / 2
  });

  it('空の siblings → 1 を返す', () => {
    expect(computeInsertOrder([], null, null)).toBe(1);
  });

  it('afterTaskId が見つからない → 末尾 + 1', () => {
    const siblings = [s('a', 2), s('b', 4)];
    const result = computeInsertOrder(siblings, 'x', null);
    expect(result).toBe(5);
  });
});
