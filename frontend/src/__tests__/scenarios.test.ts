/**
 * シナリオテスト — FEATURES.md に記載された機能の動作を検証する
 * 各テストグループは FEATURES.md のセクション番号に対応
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Task } from '../types/task';
import { sortAndFilter } from '../utils/sort';
import {
  calcGanttRange,
  calcLightningPoints,
  calcCriticalPath,
  calcDuration,
  calcTodayX,
  ganttTotalWidth,
  dateToX,
  PERIOD_DAYS,
  ZOOM_CONFIG,
  ROW_HEIGHT_PX,
} from '../utils/ganttCalc';
import {
  exportToJson,
  importFromJson,
  exportToCsv,
  importFromCsv,
} from '../utils/importExport';
import {
  buildChildCountMap,
  buildTree,
  flattenTree,
  calcEffectiveProgress,
} from '../utils/taskTree';
import { clampMenuPos } from '../utils/menuPos';

// ── テストデータファクトリ ──────────────────────────

let _seq = 0;
function makeTask(overrides: Partial<Task> = {}): Task {
  _seq++;
  return {
    id: `t${_seq}`,
    projectId: 'p1',
    parentId: null,
    title: `タスク${_seq}`,
    summary: '',
    description: '',
    status: 'todo',
    priority: 'medium',
    progress: 0,
    assignee: '',
    startDate: null,
    endDate: null,
    isMilestone: false,
    predecessors: [],
    order: _seq,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const TODAY = new Date('2026-05-22T00:00:00.000Z');
beforeEach(() => {
  _seq = 0;
  vi.useFakeTimers();
  vi.setSystemTime(TODAY);
});
afterEach(() => { vi.useRealTimers(); });

// ═══════════════════════════════════════════════════
// §3 タスクデータ項目
// ═══════════════════════════════════════════════════
describe('§3 タスクデータ項目', () => {
  it('ステータス値は todo / wip / done / wait の4種類', () => {
    const statuses: Task['status'][] = ['todo', 'wip', 'done', 'wait'];
    for (const s of statuses) expect(makeTask({ status: s }).status).toBe(s);
  });

  it('優先度値は critical / high / medium / low の4種類', () => {
    const priorities: Task['priority'][] = ['critical', 'high', 'medium', 'low'];
    for (const p of priorities) expect(makeTask({ priority: p }).priority).toBe(p);
  });

  it('progress は 0〜100 の整数', () => {
    expect(makeTask({ progress: 0 }).progress).toBe(0);
    expect(makeTask({ progress: 50 }).progress).toBe(50);
    expect(makeTask({ progress: 100 }).progress).toBe(100);
  });

  it('startDate / endDate は null または YYYY-MM-DD 文字列', () => {
    const t1 = makeTask({ startDate: null, endDate: null });
    expect(t1.startDate).toBeNull();
    expect(t1.endDate).toBeNull();

    const t2 = makeTask({ startDate: '2026-05-01', endDate: '2026-05-31' });
    expect(t2.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(t2.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('predecessors はデフォルト空配列', () => {
    expect(makeTask().predecessors).toEqual([]);
  });

  it('複数の先行タスク ID を持てる', () => {
    const t = makeTask({ predecessors: ['a', 'b', 'c'] });
    expect(t.predecessors).toHaveLength(3);
  });

  it('parentId = null はルートタスクを意味する', () => {
    expect(makeTask({ parentId: null }).parentId).toBeNull();
  });

  it('isMilestone はデフォルト false', () => {
    expect(makeTask().isMilestone).toBe(false);
  });

  it('isMilestone: true のタスクを生成できる', () => {
    const t = makeTask({ isMilestone: true, startDate: '2026-06-01', endDate: '2026-06-01' });
    expect(t.isMilestone).toBe(true);
    expect(t.startDate).toBe(t.endDate); // マイルストーンは期間ゼロ
  });
});

// ═══════════════════════════════════════════════════
// §4.3 ズームレベル
// ═══════════════════════════════════════════════════
describe('§4.3 ズームレベル', () => {
  it('day / week / month の3段階が存在する', () => {
    const levels = ['day', 'week', 'month'] as const;
    for (const l of levels) expect(ZOOM_CONFIG[l]).toBeDefined();
  });

  it('day ズームが最も dayWidth が大きい', () => {
    expect(ZOOM_CONFIG['day'].dayWidth).toBeGreaterThan(ZOOM_CONFIG['week'].dayWidth);
    expect(ZOOM_CONFIG['week'].dayWidth).toBeGreaterThan(ZOOM_CONFIG['month'].dayWidth);
  });

  it('ganttTotalWidth はズームが細かいほど幅が広い', () => {
    const tasks = [makeTask({ startDate: '2026-05-01', endDate: '2026-07-31' })];
    expect(ganttTotalWidth(tasks, 'day')).toBeGreaterThan(ganttTotalWidth(tasks, 'week'));
    expect(ganttTotalWidth(tasks, 'week')).toBeGreaterThan(ganttTotalWidth(tasks, 'month'));
  });
});

// ═══════════════════════════════════════════════════
// §4.4 表示期間コントロール
// ═══════════════════════════════════════════════════
describe('§4.4 表示期間コントロール', () => {
  describe('自動モード — タスクなし', () => {
    it('今日を含む範囲を返す', () => {
      const { min, max } = calcGanttRange([]);
      expect(min.getTime()).toBeLessThanOrEqual(TODAY.getTime());
      expect(max.getTime()).toBeGreaterThan(TODAY.getTime());
    });

    it('デフォルト期間（3ヶ月）以上の幅を確保する', () => {
      const { min, max } = calcGanttRange([]);
      const days = (max.getTime() - min.getTime()) / 86400000;
      expect(days).toBeGreaterThanOrEqual(PERIOD_DAYS['3m']);
    });

    it('期間 2w → 14 日以上', () => {
      const { min, max } = calcGanttRange([], undefined, '2w');
      expect((max.getTime() - min.getTime()) / 86400000).toBeGreaterThanOrEqual(PERIOD_DAYS['2w']);
    });

    it('期間 1m → 30 日以上', () => {
      const { min, max } = calcGanttRange([], undefined, '1m');
      expect((max.getTime() - min.getTime()) / 86400000).toBeGreaterThanOrEqual(PERIOD_DAYS['1m']);
    });

    it('期間 3m → 91 日以上', () => {
      const { min, max } = calcGanttRange([], undefined, '3m');
      expect((max.getTime() - min.getTime()) / 86400000).toBeGreaterThanOrEqual(PERIOD_DAYS['3m']);
    });

    it('期間 6m → 183 日以上', () => {
      const { min, max } = calcGanttRange([], undefined, '6m');
      expect((max.getTime() - min.getTime()) / 86400000).toBeGreaterThanOrEqual(PERIOD_DAYS['6m']);
    });
  });

  describe('自動モード — タスクあり', () => {
    it('タスクの startDate / endDate を含む範囲を返す', () => {
      const tasks = [makeTask({ startDate: '2026-03-01', endDate: '2026-08-31' })];
      const { min, max } = calcGanttRange(tasks);
      expect(min.getTime()).toBeLessThanOrEqual(new Date('2026-03-01').getTime());
      expect(max.getTime()).toBeGreaterThanOrEqual(new Date('2026-08-31').getTime());
    });

    it('タスクの期間が period より短くても最低 period 分を確保する', () => {
      const tasks = [makeTask({ startDate: '2026-05-22', endDate: '2026-05-23' })];
      const { min, max } = calcGanttRange(tasks, undefined, '3m');
      expect((max.getTime() - min.getTime()) / 86400000).toBeGreaterThanOrEqual(PERIOD_DAYS['3m']);
    });

    it('startDate のみ持つタスクも範囲計算に使われる', () => {
      const tasks = [makeTask({ startDate: '2026-01-01', endDate: null })];
      const { min } = calcGanttRange(tasks);
      expect(min.getTime()).toBeLessThanOrEqual(new Date('2026-01-01').getTime());
    });

    it('複数タスクで最小・最大を正しく取る', () => {
      const tasks = [
        makeTask({ startDate: '2026-06-01', endDate: '2026-06-30' }),
        makeTask({ startDate: '2026-03-01', endDate: '2026-09-30' }),
      ];
      const { min, max } = calcGanttRange(tasks);
      expect(min.getTime()).toBeLessThanOrEqual(new Date('2026-03-01').getTime());
      expect(max.getTime()).toBeGreaterThanOrEqual(new Date('2026-09-30').getTime());
    });
  });

  describe('手動モード — startDate 指定', () => {
    it('指定した日付が min になる', () => {
      const { min } = calcGanttRange([], '2026-06-01', '1m');
      expect(min.toISOString().slice(0, 10)).toBe('2026-06-01');
    });

    it('min から period 分だけの固定範囲を返す', () => {
      const { min, max } = calcGanttRange([], '2026-06-01', '1m');
      expect((max.getTime() - min.getTime()) / 86400000).toBe(PERIOD_DAYS['1m']);
    });

    it('タスクの日付は無視する（手動モード優先）', () => {
      const tasks = [makeTask({ startDate: '2025-01-01', endDate: '2027-12-31' })];
      const { min, max } = calcGanttRange(tasks, '2026-06-01', '1m');
      expect((max.getTime() - min.getTime()) / 86400000).toBe(PERIOD_DAYS['1m']);
    });

    it('期間 2w で正確に 14 日', () => {
      const { min, max } = calcGanttRange([], '2026-06-01', '2w');
      expect((max.getTime() - min.getTime()) / 86400000).toBe(PERIOD_DAYS['2w']);
    });

    it('期間 6m で正確に 183 日', () => {
      const { min, max } = calcGanttRange([], '2026-01-01', '6m');
      expect((max.getTime() - min.getTime()) / 86400000).toBe(PERIOD_DAYS['6m']);
    });
  });

  describe('ganttTotalWidth / dateToX', () => {
    it('タスクがなくても正の幅を返す', () => {
      expect(ganttTotalWidth([], 'week')).toBeGreaterThan(0);
    });

    it('dateToX: minDate と同日は 0', () => {
      const minDate = new Date('2026-05-01');
      expect(dateToX('2026-05-01', minDate, 'day')).toBe(0);
    });

    it('dateToX: 1日後は dayWidth 分進む', () => {
      const minDate = new Date('2026-05-01');
      expect(dateToX('2026-05-02', minDate, 'day')).toBe(ZOOM_CONFIG['day'].dayWidth);
    });

    it('calcTodayX: 今日の X を正しく計算する', () => {
      const { min } = calcGanttRange([]);
      const x = calcTodayX(min, 'week');
      const days = Math.round((TODAY.getTime() - min.getTime()) / 86400000);
      expect(x).toBe(days * ZOOM_CONFIG['week'].dayWidth);
    });
  });
});

// ═══════════════════════════════════════════════════
// §4.5 ガントバー（表示条件）
// ═══════════════════════════════════════════════════
describe('§4.5 ガントバー表示条件', () => {
  const minDate = new Date('2026-01-01');

  it('startDate と endDate 両方ある → X 座標が計算できる', () => {
    const t = makeTask({ startDate: '2026-01-10', endDate: '2026-01-20' });
    expect(t.startDate).not.toBeNull();
    expect(t.endDate).not.toBeNull();
    const x = dateToX(t.startDate!, minDate, 'day');
    expect(x).toBeGreaterThan(0);
  });

  it('startDate が null → バー非表示（X 計算は行わない）', () => {
    const t = makeTask({ startDate: null, endDate: '2026-01-20' });
    expect(t.startDate).toBeNull();
  });

  it('endDate が null → バー非表示', () => {
    const t = makeTask({ startDate: '2026-01-10', endDate: null });
    expect(t.endDate).toBeNull();
  });

  it('開始日 = 終了日 → 最小でも 1 日分の幅', () => {
    const x1 = dateToX('2026-01-10', minDate, 'day');
    const x2 = dateToX('2026-01-10', minDate, 'day');
    const barWidth = Math.max(x2 - x1, ZOOM_CONFIG['day'].dayWidth);
    expect(barWidth).toBeGreaterThanOrEqual(ZOOM_CONFIG['day'].dayWidth);
  });
});

// ═══════════════════════════════════════════════════
// §4.8 イナズマライン（進捗折れ線）
// ═══════════════════════════════════════════════════
describe('§4.8 イナズマライン (calcLightningPoints)', () => {
  const minDate = new Date('2026-01-01');

  function makeRow(task: Task, effectiveProgress = task.progress) {
    return { task, effectiveProgress };
  }

  it('タスクが 0 件 → null', () => {
    expect(calcLightningPoints([], minDate, 'day')).toBeNull();
  });

  it('日付なしタスクのみ → null（点を打てない）', () => {
    const rows = [makeRow(makeTask({ startDate: null, endDate: null }))];
    expect(calcLightningPoints(rows, minDate, 'day')).toBeNull();
  });

  it('日付ありタスクが 1 件 → 1 点（行の中心Y）を返す', () => {
    const rows = [makeRow(makeTask({ startDate: '2026-01-10', endDate: '2026-01-20', progress: 50 }))];
    const pts = calcLightningPoints(rows, minDate, 'day')!;
    expect(pts).toHaveLength(1);
    expect(pts[0].y).toBe(ROW_HEIGHT_PX / 2);
  });

  it('進捗 0% → startX に点が打たれる', () => {
    const { dayWidth } = ZOOM_CONFIG['day'];
    const rows = [makeRow(makeTask({ startDate: '2026-01-10', endDate: '2026-01-20', progress: 0 }))];
    const pts = calcLightningPoints(rows, minDate, 'day')!;
    const expectedX = 9 * dayWidth; // Jan10 - Jan01 = 9 days
    expect(pts[0].x).toBe(expectedX);
  });

  it('進捗 100% → endX（終了日の翌日）に点が打たれる', () => {
    const { dayWidth } = ZOOM_CONFIG['day'];
    const rows = [makeRow(makeTask({ startDate: '2026-01-10', endDate: '2026-01-20', progress: 100 }))];
    const pts = calcLightningPoints(rows, minDate, 'day')!;
    // endX = (Jan20 - Jan01) + 1dayWidth = 19 * 28 + 28 = 20 * 28
    const expectedX = 20 * dayWidth;
    expect(pts[0].x).toBe(expectedX);
  });

  it('進捗 50% → startX と endX の中間', () => {
    const { dayWidth } = ZOOM_CONFIG['day'];
    const startX = 9 * dayWidth;  // Jan10
    const endX   = 20 * dayWidth; // Jan20 + 1day
    const rows = [makeRow(makeTask({ startDate: '2026-01-10', endDate: '2026-01-20', progress: 50 }))];
    const pts = calcLightningPoints(rows, minDate, 'day')!;
    expect(pts[0].x).toBe(Math.round(startX + (endX - startX) * 0.5));
  });

  it('2 行のとき 2 点 → 斜線でつながる', () => {
    const rows = [
      makeRow(makeTask({ startDate: '2026-01-01', endDate: '2026-01-10', progress: 0 })),
      makeRow(makeTask({ startDate: '2026-01-11', endDate: '2026-01-20', progress: 100 })),
    ];
    const pts = calcLightningPoints(rows, minDate, 'day')!;
    expect(pts).toHaveLength(2);
    // 行0と行1でXが異なる → 斜線になる
    expect(pts[0].x).not.toBe(pts[1].x);
  });

  it('Y座標は各行の中心（行インデックス × ROW_HEIGHT + ROW_HEIGHT/2）', () => {
    const rows = [
      makeRow(makeTask({ startDate: '2026-01-01', endDate: '2026-01-10', progress: 50 })),
      makeRow(makeTask({ startDate: '2026-01-11', endDate: '2026-01-20', progress: 50 })),
      makeRow(makeTask({ startDate: '2026-01-21', endDate: '2026-01-31', progress: 50 })),
    ];
    const pts = calcLightningPoints(rows, minDate, 'day')!;
    expect(pts).toHaveLength(3);
    expect(pts[0].y).toBe(ROW_HEIGHT_PX * 0 + ROW_HEIGHT_PX / 2);
    expect(pts[1].y).toBe(ROW_HEIGHT_PX * 1 + ROW_HEIGHT_PX / 2);
    expect(pts[2].y).toBe(ROW_HEIGHT_PX * 2 + ROW_HEIGHT_PX / 2);
  });

  it('日付なし行はスキップされる（斜線が飛ぶ）', () => {
    const rows = [
      makeRow(makeTask({ startDate: '2026-01-01', endDate: '2026-01-10', progress: 0 })),
      makeRow(makeTask({ startDate: null, endDate: null })),
      makeRow(makeTask({ startDate: '2026-01-21', endDate: '2026-01-31', progress: 50 })),
    ];
    const pts = calcLightningPoints(rows, minDate, 'day')!;
    // 日付なし行を除いた 2 点だけ
    expect(pts).toHaveLength(2);
    expect(pts[0].y).toBe(ROW_HEIGHT_PX / 2);           // 0行目の中心
    expect(pts[1].y).toBe(ROW_HEIGHT_PX * 2 + ROW_HEIGHT_PX / 2); // 2行目の中心
  });

  it('先頭行が日付なしでもスキップされ後続行から始まる', () => {
    const rows = [
      makeRow(makeTask({ startDate: null, endDate: null })),
      makeRow(makeTask({ startDate: '2026-01-11', endDate: '2026-01-20', progress: 50 })),
    ];
    const pts = calcLightningPoints(rows, minDate, 'day')!;
    expect(pts).toHaveLength(1);
    expect(pts[0].y).toBe(ROW_HEIGHT_PX + ROW_HEIGHT_PX / 2);  // 1行目の中心
  });

  it('effectiveProgress が使われる（親タスク）', () => {
    const { dayWidth } = ZOOM_CONFIG['day'];
    const task = makeTask({ startDate: '2026-01-01', endDate: '2026-01-10', progress: 0 });
    const rows = [{ task, effectiveProgress: 60 }]; // 実際の progress は 0 だが有効進捗は 60%
    const pts = calcLightningPoints(rows, minDate, 'day')!;
    const startX = 0;
    const endX   = 10 * dayWidth;
    const expected = Math.round(startX + (endX - startX) * 0.6);
    expect(pts[0].x).toBe(expected);
  });

  it('ズームレベルが小さいほど X 座標が小さい（同じ進捗）', () => {
    const rows = [makeRow(makeTask({ startDate: '2026-01-01', endDate: '2026-01-10', progress: 50 }))];
    const ptsDay   = calcLightningPoints(rows, minDate, 'day')!;
    const ptsWeek  = calcLightningPoints(rows, minDate, 'week')!;
    const ptsMonth = calcLightningPoints(rows, minDate, 'month')!;
    expect(ptsDay[0].x).toBeGreaterThan(ptsWeek[0].x);
    expect(ptsWeek[0].x).toBeGreaterThan(ptsMonth[0].x);
  });

  it('マイルストーンは頂点としてスキップされる', () => {
    const ms = makeRow(makeTask({ startDate: '2026-05-10', endDate: '2026-05-10', isMilestone: true }));
    const pts = calcLightningPoints([ms], minDate, 'day');
    expect(pts).toBeNull();
  });

  it('マイルストーンと通常タスクが混在 → 通常タスクの点のみ返す', () => {
    const ms     = makeRow(makeTask({ startDate: '2026-05-10', endDate: '2026-05-10', isMilestone: true, progress: 50 }));
    const normal = makeRow(makeTask({ startDate: '2026-05-01', endDate: '2026-05-10', progress: 0 }));
    const pts = calcLightningPoints([ms, normal], minDate, 'day')!;
    expect(pts).toHaveLength(1); // ms 行はスキップ
    expect(pts[0].y).toBe(1 * ROW_HEIGHT_PX + ROW_HEIGHT_PX / 2); // 2行目（index 1）
  });
});

// ═══════════════════════════════════════════════════
// §5.5 ツリー構造・折りたたみ
// ═══════════════════════════════════════════════════
describe('§5.5 ツリー構造・折りたたみ', () => {
  describe('buildTree', () => {
    it('parentId なしタスクはルートに置かれる', () => {
      const tasks = [makeTask({ id: 'a' }), makeTask({ id: 'b' })];
      const { roots } = buildTree(tasks);
      expect(roots).toHaveLength(2);
    });

    it('parentId ありタスクは親の children に入る', () => {
      const tasks = [
        makeTask({ id: 'p' }),
        makeTask({ id: 'c', parentId: 'p' }),
      ];
      const { roots } = buildTree(tasks);
      expect(roots).toHaveLength(1);
      expect(roots[0].children[0].task.id).toBe('c');
    });

    it('depth が正しく設定される（ルート=0、子=1、孫=2）', () => {
      const tasks = [
        makeTask({ id: 'a' }),
        makeTask({ id: 'b', parentId: 'a' }),
        makeTask({ id: 'c', parentId: 'b' }),
      ];
      const { roots } = buildTree(tasks);
      expect(roots[0].depth).toBe(0);
      expect(roots[0].children[0].depth).toBe(1);
      expect(roots[0].children[0].children[0].depth).toBe(2);
    });

    it('存在しない parentId のタスクはルートに昇格する', () => {
      const tasks = [makeTask({ id: 'orphan', parentId: 'non-existent' })];
      const { roots } = buildTree(tasks);
      expect(roots).toHaveLength(1);
      expect(roots[0].task.id).toBe('orphan');
    });

    it('タスクが 0 件のとき roots は空', () => {
      const { roots } = buildTree([]);
      expect(roots).toHaveLength(0);
    });
  });

  describe('buildChildCountMap', () => {
    it('子数を正しくカウントする', () => {
      const tasks = [
        makeTask({ id: 'p' }),
        makeTask({ id: 'c1', parentId: 'p' }),
        makeTask({ id: 'c2', parentId: 'p' }),
      ];
      const map = buildChildCountMap(tasks);
      expect(map.get('p')).toBe(2);
    });

    it('葉タスクはマップに含まれない', () => {
      const tasks = [makeTask({ id: 'leaf' })];
      const map = buildChildCountMap(tasks);
      expect(map.has('leaf')).toBe(false);
    });

    it('複数の親それぞれをカウントする', () => {
      const tasks = [
        makeTask({ id: 'p1' }),
        makeTask({ id: 'p2' }),
        makeTask({ id: 'c1', parentId: 'p1' }),
        makeTask({ id: 'c2', parentId: 'p2' }),
        makeTask({ id: 'c3', parentId: 'p2' }),
      ];
      const map = buildChildCountMap(tasks);
      expect(map.get('p1')).toBe(1);
      expect(map.get('p2')).toBe(2);
    });
  });

  describe('flattenTree', () => {
    it('折りたたみなしで全行を返す', () => {
      const tasks = [
        makeTask({ id: 'a' }),
        makeTask({ id: 'b', parentId: 'a' }),
        makeTask({ id: 'c', parentId: 'a' }),
      ];
      const { roots } = buildTree(tasks);
      expect(flattenTree(roots, new Set())).toHaveLength(3);
    });

    it('折りたたまれた行の子は非表示になる', () => {
      const tasks = [
        makeTask({ id: 'p' }),
        makeTask({ id: 'c1', parentId: 'p' }),
        makeTask({ id: 'c2', parentId: 'p' }),
      ];
      const { roots } = buildTree(tasks);
      const flat = flattenTree(roots, new Set(['p']));
      expect(flat).toHaveLength(1);
      expect(flat[0].task.id).toBe('p');
    });

    it('折りたたみは直接の子だけを隠す（孫ごと）', () => {
      const tasks = [
        makeTask({ id: 'grand' }),
        makeTask({ id: 'parent', parentId: 'grand' }),
        makeTask({ id: 'child', parentId: 'parent' }),
      ];
      const { roots } = buildTree(tasks);
      // grand を折りたたむと parent も child も非表示
      const flat = flattenTree(roots, new Set(['grand']));
      expect(flat).toHaveLength(1);
    });

    it('子は折りたたまれていても、親が展開されていれば表示される', () => {
      const tasks = [
        makeTask({ id: 'grand' }),
        makeTask({ id: 'parent', parentId: 'grand' }),
        makeTask({ id: 'child', parentId: 'parent' }),
      ];
      const { roots } = buildTree(tasks);
      // parent だけ折りたたみ → grand, parent は表示, child は非表示
      const flat = flattenTree(roots, new Set(['parent']));
      expect(flat).toHaveLength(2);
      expect(flat.map(r => r.task.id)).toEqual(['grand', 'parent']);
    });

    it('depth が正しく伝達される', () => {
      const tasks = [
        makeTask({ id: 'a' }),
        makeTask({ id: 'b', parentId: 'a' }),
      ];
      const { roots } = buildTree(tasks);
      const flat = flattenTree(roots, new Set());
      expect(flat[0].depth).toBe(0);
      expect(flat[1].depth).toBe(1);
    });

    it('ルートタスクのみ depth === 0（中間親は depth > 0）', () => {
      // root(depth=0) > mid(depth=1) > leaf(depth=2) の 3 階層
      const tasks = [
        makeTask({ id: 'root' }),
        makeTask({ id: 'mid',  parentId: 'root' }),
        makeTask({ id: 'leaf', parentId: 'mid'  }),
      ];
      const { roots, childCount } = buildTree(tasks);
      const flat = flattenTree(roots, new Set());
      // depth 値
      expect(flat[0].depth).toBe(0); // root
      expect(flat[1].depth).toBe(1); // mid
      expect(flat[2].depth).toBe(2); // leaf
      // isRootParent 相当: depth === 0 && hasChildren
      const isRootParent = (row: { task: Task; depth: number }) =>
        row.depth === 0 && (childCount.get(row.task.id) ?? 0) > 0;
      expect(isRootParent(flat[0])).toBe(true);  // root は背景色あり
      expect(isRootParent(flat[1])).toBe(false); // mid は背景色なし（depth > 0）
      expect(isRootParent(flat[2])).toBe(false); // leaf は子なし
    });

    it('子のないルートタスクは isRootParent = false', () => {
      const tasks = [makeTask({ id: 'solo' })];
      const { roots, childCount } = buildTree(tasks);
      const flat = flattenTree(roots, new Set());
      const isRootParent = (row: { task: Task; depth: number }) =>
        row.depth === 0 && (childCount.get(row.task.id) ?? 0) > 0;
      expect(flat[0].depth).toBe(0);
      expect(isRootParent(flat[0])).toBe(false);
    });
  });
});

// ═══════════════════════════════════════════════════
// §列幅リサイズ — タイトル・担当者列の最小幅制約
// ═══════════════════════════════════════════════════
describe('列幅リサイズ — 最小幅制約', () => {
  const COL_MIN_WIDTHS: Record<string, number> = { title: 80, assignee: 50 };
  const clamp = (key: string, w: number) => Math.max(COL_MIN_WIDTHS[key] ?? 40, w);

  it('title: 通常幅はそのまま', () => expect(clamp('title', 200)).toBe(200));
  it('title: 最小幅 80px を下回らない', () => expect(clamp('title', 50)).toBe(80));
  it('assignee: 通常幅はそのまま', () => expect(clamp('assignee', 120)).toBe(120));
  it('assignee: 最小幅 50px を下回らない', () => expect(clamp('assignee', 30)).toBe(50));
  it('リサイズ結果 = max(min, startWidth + delta)', () => {
    const startWidth = 180;
    const delta = -120; // 60px まで縮小しようとする
    expect(clamp('title', startWidth + delta)).toBe(80); // 60 < 80 → クランプ
  });
});

// ═══════════════════════════════════════════════════
// §5.6 親タスクの進捗自動計算
// ═══════════════════════════════════════════════════
describe('§5.6 親タスクの進捗自動計算', () => {
  it('子なしタスクは自身の progress をそのまま返す', () => {
    const tasks = [makeTask({ id: 'a', progress: 40 })];
    expect(calcEffectiveProgress('a', buildChildCountMap(tasks), tasks)).toBe(40);
  });

  it('子の算術平均を返す（2 件）', () => {
    const tasks = [
      makeTask({ id: 'p', progress: 0 }),
      makeTask({ id: 'c1', parentId: 'p', progress: 60 }),
      makeTask({ id: 'c2', parentId: 'p', progress: 40 }),
    ];
    expect(calcEffectiveProgress('p', buildChildCountMap(tasks), tasks)).toBe(50);
  });

  it('子の算術平均を返す（3 件）', () => {
    const tasks = [
      makeTask({ id: 'p', progress: 0 }),
      makeTask({ id: 'c1', parentId: 'p', progress: 0 }),
      makeTask({ id: 'c2', parentId: 'p', progress: 0 }),
      makeTask({ id: 'c3', parentId: 'p', progress: 90 }),
    ];
    // (0 + 0 + 90) / 3 = 30
    expect(calcEffectiveProgress('p', buildChildCountMap(tasks), tasks)).toBe(30);
  });

  it('再帰: 孫の進捗も含めて計算する', () => {
    const tasks = [
      makeTask({ id: 'grand', progress: 0 }),
      makeTask({ id: 'parent', parentId: 'grand', progress: 0 }),
      makeTask({ id: 'c1', parentId: 'parent', progress: 100 }),
      makeTask({ id: 'c2', parentId: 'parent', progress: 0 }),
    ];
    const map = buildChildCountMap(tasks);
    // parent = (100 + 0) / 2 = 50
    // grand = 50 (parent の実効値)
    expect(calcEffectiveProgress('parent', map, tasks)).toBe(50);
    expect(calcEffectiveProgress('grand', map, tasks)).toBe(50);
  });

  it('全子タスクが 100% → 親も 100%', () => {
    const tasks = [
      makeTask({ id: 'p', progress: 0 }),
      makeTask({ id: 'c1', parentId: 'p', progress: 100 }),
      makeTask({ id: 'c2', parentId: 'p', progress: 100 }),
    ];
    expect(calcEffectiveProgress('p', buildChildCountMap(tasks), tasks)).toBe(100);
  });

  it('全子タスクが 0% → 親も 0%', () => {
    const tasks = [
      makeTask({ id: 'p', progress: 0 }),
      makeTask({ id: 'c1', parentId: 'p', progress: 0 }),
      makeTask({ id: 'c2', parentId: 'p', progress: 0 }),
    ];
    expect(calcEffectiveProgress('p', buildChildCountMap(tasks), tasks)).toBe(0);
  });

  it('端数は四捨五入する（100/3 ≈ 33）', () => {
    const tasks = [
      makeTask({ id: 'p', progress: 0 }),
      makeTask({ id: 'c1', parentId: 'p', progress: 100 }),
      makeTask({ id: 'c2', parentId: 'p', progress: 0 }),
      makeTask({ id: 'c3', parentId: 'p', progress: 0 }),
    ];
    expect(calcEffectiveProgress('p', buildChildCountMap(tasks), tasks)).toBe(33);
  });

  it('端数の四捨五入: 50/3 ≈ 17', () => {
    const tasks = [
      makeTask({ id: 'p', progress: 0 }),
      makeTask({ id: 'c1', parentId: 'p', progress: 50 }),
      makeTask({ id: 'c2', parentId: 'p', progress: 0 }),
      makeTask({ id: 'c3', parentId: 'p', progress: 0 }),
    ];
    expect(calcEffectiveProgress('p', buildChildCountMap(tasks), tasks)).toBe(17);
  });

  it('存在しない taskId は 0 を返す', () => {
    const tasks: Task[] = [];
    expect(calcEffectiveProgress('not-exist', buildChildCountMap(tasks), tasks)).toBe(0);
  });

  it('childCountMap が子ありを示すが allTasks に子が存在しない（不整合）場合は自身の progress を返す', () => {
    // L55 の防御コード: childCountMap と allTasks が不整合なケース
    const tasks = [makeTask({ id: 'p', progress: 42 })];
    const inconsistentMap = new Map([['p', 1]]); // 子が1件あると嘘をつく
    expect(calcEffectiveProgress('p', inconsistentMap, tasks)).toBe(42);
  });

  it('childCountMap が子ありを示すが allTasks にタスク自体も存在しない場合は 0 を返す', () => {
    // L55 の ?. が undefined を返し ?? 0 が発動するケース
    const inconsistentMap = new Map([['ghost', 1]]);
    expect(calcEffectiveProgress('ghost', inconsistentMap, [])).toBe(0);
  });
});

// ═══════════════════════════════════════════════════
// §7 フィルタ・ソート
// ═══════════════════════════════════════════════════
describe('§7 フィルタ・ソート', () => {
  const tasks = () => [
    makeTask({ id: 't1', status: 'todo',  priority: 'high',     assignee: 'Alice', order: 1, progress: 0,   startDate: '2026-05-10', endDate: '2026-05-20' }),
    makeTask({ id: 't2', status: 'wip',   priority: 'medium',   assignee: 'Bob',   order: 2, progress: 50,  startDate: '2026-03-01', endDate: '2026-04-30' }),
    makeTask({ id: 't3', status: 'done',  priority: 'low',      assignee: 'Alice', order: 3, progress: 100, startDate: '2026-01-01', endDate: '2026-02-28' }),
    makeTask({ id: 't4', status: 'wait',  priority: 'critical', assignee: 'Carol', order: 4, progress: 20,  startDate: null,         endDate: null         }),
  ];

  describe('ステータスフィルタ', () => {
    it('空文字 → 全件返す', () => {
      expect(sortAndFilter(tasks(), '', 'asc', '', '', '')).toHaveLength(4);
    });

    it('todo → todo のみ 1 件', () => {
      const r = sortAndFilter(tasks(), '', 'asc', 'todo', '', '');
      expect(r).toHaveLength(1);
      expect(r[0].status).toBe('todo');
    });

    it('wip → wip のみ 1 件（DB 値は wip、表示ラベルは Doing）', () => {
      const r = sortAndFilter(tasks(), '', 'asc', 'wip', '', '');
      expect(r).toHaveLength(1);
      expect(r[0].status).toBe('wip');
    });

    it('done → done のみ 1 件', () => {
      const r = sortAndFilter(tasks(), '', 'asc', 'done', '', '');
      expect(r).toHaveLength(1);
      expect(r[0].status).toBe('done');
    });

    it('wait → wait のみ 1 件', () => {
      const r = sortAndFilter(tasks(), '', 'asc', 'wait', '', '');
      expect(r).toHaveLength(1);
      expect(r[0].status).toBe('wait');
    });

    it('!done → done 以外の 3 件', () => {
      const r = sortAndFilter(tasks(), '', 'asc', '!done', '', '');
      expect(r).toHaveLength(3);
      expect(r.every(t => t.status !== 'done')).toBe(true);
    });

    it('!done: todo / wip / wait がすべて含まれる', () => {
      const r = sortAndFilter(tasks(), '', 'asc', '!done', '', '');
      const statuses = r.map(t => t.status);
      expect(statuses).toContain('todo');
      expect(statuses).toContain('wip');
      expect(statuses).toContain('wait');
    });

    it('!done: 全タスクが done のとき 0 件', () => {
      const allDone = tasks().map(t => ({ ...t, status: 'done' as const }));
      expect(sortAndFilter(allDone, '', 'asc', '!done', '', '')).toHaveLength(0);
    });

    it('!done: タスクが 0 件のとき 0 件', () => {
      expect(sortAndFilter([], '', 'asc', '!done', '', '')).toHaveLength(0);
    });
  });

  describe('担当者フィルタ（部分一致）', () => {
    it('完全一致: Alice → 2 件', () => {
      expect(sortAndFilter(tasks(), '', 'asc', '', 'Alice', '')).toHaveLength(2);
    });

    it('部分一致: "li" → Alice 2 件', () => {
      const r = sortAndFilter(tasks(), '', 'asc', '', 'li', '');
      expect(r.every(t => t.assignee.includes('li'))).toBe(true);
    });

    it('大文字小文字は区別する', () => {
      expect(sortAndFilter(tasks(), '', 'asc', '', 'alice', '')).toHaveLength(0);
    });

    it('一致なし → 0 件', () => {
      expect(sortAndFilter(tasks(), '', 'asc', '', 'Zara', '')).toHaveLength(0);
    });

    it('空文字 → フィルタなし（全件）', () => {
      expect(sortAndFilter(tasks(), '', 'asc', '', '', '')).toHaveLength(4);
    });
  });

  describe('優先度フィルタ', () => {
    it('critical → 1 件', () => {
      expect(sortAndFilter(tasks(), '', 'asc', '', '', 'critical')).toHaveLength(1);
    });

    it('high → 1 件', () => {
      expect(sortAndFilter(tasks(), '', 'asc', '', '', 'high')).toHaveLength(1);
    });

    it('medium → 1 件', () => {
      expect(sortAndFilter(tasks(), '', 'asc', '', '', 'medium')).toHaveLength(1);
    });

    it('low → 1 件', () => {
      expect(sortAndFilter(tasks(), '', 'asc', '', '', 'low')).toHaveLength(1);
    });

    it('空文字 → 全件', () => {
      expect(sortAndFilter(tasks(), '', 'asc', '', '', '')).toHaveLength(4);
    });
  });

  describe('フィルタの AND 組み合わせ', () => {
    it('ステータス todo + 担当者 Alice → 1 件', () => {
      const r = sortAndFilter(tasks(), '', 'asc', 'todo', 'Alice', '');
      expect(r).toHaveLength(1);
      expect(r[0].id).toBe('t1');
    });

    it('!done + 担当者 Alice → 1 件 (t1 のみ)', () => {
      const r = sortAndFilter(tasks(), '', 'asc', '!done', 'Alice', '');
      expect(r).toHaveLength(1);
      expect(r[0].id).toBe('t1');
    });

    it('wip + 優先度 medium → 1 件', () => {
      const r = sortAndFilter(tasks(), '', 'asc', 'wip', '', 'medium');
      expect(r).toHaveLength(1);
      expect(r[0].id).toBe('t2');
    });

    it('ステータス + 担当者 + 優先度の 3 重フィルタ', () => {
      const r = sortAndFilter(tasks(), '', 'asc', 'todo', 'Alice', 'high');
      expect(r).toHaveLength(1);
      expect(r[0].id).toBe('t1');
    });

    it('条件を満たすものがない → 0 件', () => {
      const r = sortAndFilter(tasks(), '', 'asc', 'done', 'Bob', '');
      expect(r).toHaveLength(0);
    });
  });

  describe('ソート — デフォルト（order 順）', () => {
    it('ソートキーなしは order 昇順', () => {
      const shuffled = [...tasks()].reverse();
      const r = sortAndFilter(shuffled, '', 'asc', '', '', '');
      expect(r.map(t => t.id)).toEqual(['t1', 't2', 't3', 't4']);
    });
  });

  describe('ソート — ステータス固定順', () => {
    it('昇順: todo → wip → done → wait', () => {
      const r = sortAndFilter(tasks(), 'status', 'asc', '', '', '');
      expect(r.map(t => t.status)).toEqual(['todo', 'wip', 'done', 'wait']);
    });

    it('降順: wait → done → wip → todo', () => {
      const r = sortAndFilter(tasks(), 'status', 'desc', '', '', '');
      expect(r.map(t => t.status)).toEqual(['wait', 'done', 'wip', 'todo']);
    });
  });

  describe('ソート — 優先度固定順', () => {
    it('昇順: critical → high → medium → low', () => {
      const r = sortAndFilter(tasks(), 'priority', 'asc', '', '', '');
      expect(r.map(t => t.priority)).toEqual(['critical', 'high', 'medium', 'low']);
    });

    it('降順: low → medium → high → critical', () => {
      const r = sortAndFilter(tasks(), 'priority', 'desc', '', '', '');
      expect(r.map(t => t.priority)).toEqual(['low', 'medium', 'high', 'critical']);
    });
  });

  describe('ソート — 進捗率', () => {
    it('昇順: 0 → 20 → 50 → 100', () => {
      const r = sortAndFilter(tasks(), 'progress', 'asc', '', '', '');
      expect(r.map(t => t.progress)).toEqual([0, 20, 50, 100]);
    });

    it('降順: 100 → 50 → 20 → 0', () => {
      const r = sortAndFilter(tasks(), 'progress', 'desc', '', '', '');
      expect(r.map(t => t.progress)).toEqual([100, 50, 20, 0]);
    });
  });

  describe('ソート — 日付（null は常に末尾）', () => {
    it('startDate 昇順: 古い順、null 末尾', () => {
      const r = sortAndFilter(tasks(), 'startDate', 'asc', '', '', '');
      expect(r[0].startDate).toBe('2026-01-01');
      expect(r[1].startDate).toBe('2026-03-01');
      expect(r[2].startDate).toBe('2026-05-10');
      expect(r[3].startDate).toBeNull();
    });

    it('startDate 降順: 新しい順、null 末尾', () => {
      const r = sortAndFilter(tasks(), 'startDate', 'desc', '', '', '');
      expect(r[0].startDate).toBe('2026-05-10');
      expect(r[1].startDate).toBe('2026-03-01');
      expect(r[2].startDate).toBe('2026-01-01');
      expect(r[3].startDate).toBeNull();  // ← バグ修正確認
    });

    it('endDate 昇順: 古い順、null 末尾', () => {
      const r = sortAndFilter(tasks(), 'endDate', 'asc', '', '', '');
      expect(r[0].endDate).toBe('2026-02-28');
      expect(r[3].endDate).toBeNull();
    });

    it('endDate 降順: 新しい順、null 末尾', () => {
      const r = sortAndFilter(tasks(), 'endDate', 'desc', '', '', '');
      expect(r[0].endDate).toBe('2026-05-20');
      expect(r[3].endDate).toBeNull();  // ← バグ修正確認
    });

    it('null が複数あっても末尾に集まる', () => {
      const ts = [
        makeTask({ id: 'x1', startDate: '2026-05-01' }),
        makeTask({ id: 'x2', startDate: null }),
        makeTask({ id: 'x3', startDate: null }),
        makeTask({ id: 'x4', startDate: '2026-03-01' }),
      ];
      const ascResult  = sortAndFilter(ts, 'startDate', 'asc',  '', '', '');
      const descResult = sortAndFilter(ts, 'startDate', 'desc', '', '', '');
      // 両方向とも null が末尾 2 件
      expect(ascResult.slice(2).every(t => t.startDate === null)).toBe(true);
      expect(descResult.slice(2).every(t => t.startDate === null)).toBe(true);
    });
  });

  describe('ソート — テキスト列', () => {
    it('title ロケール昇順', () => {
      const ts = [
        makeTask({ id: 'a', title: 'ガントチャート' }),
        makeTask({ id: 'b', title: 'アイコン' }),
        makeTask({ id: 'c', title: 'ツールバー' }),
      ];
      const r = sortAndFilter(ts, 'title', 'asc', '', '', '');
      // 日本語ロケール順: ア < ガ < ツ
      expect(r[0].title).toBe('アイコン');
    });

    it('assignee 降順', () => {
      const r = sortAndFilter(tasks(), 'assignee', 'desc', '', '', '');
      expect(r[0].assignee >= r[1].assignee).toBe(true);
    });

    it('null になりうるフィールド（parentId）のソートで ?? フォールバックを通る', () => {
      const ts = [
        makeTask({ id: 'a', parentId: 'parent-1' }),
        makeTask({ id: 'b', parentId: null }),
        makeTask({ id: 'c', parentId: 'parent-2' }),
      ];
      const r = sortAndFilter(ts, 'parentId', 'asc', '', '', '');
      // null は '' に変換されるので昇順先頭になる
      expect(r[0].parentId).toBeNull();
    });
  });

  describe('ソート — 同一値での安定動作', () => {
    it('同一 startDate が複数あっても全件返る（cmp = 0 を通す）', () => {
      // 3要素で比較関数が必ず呼ばれ、等値ケース(cmp=0)を強制的に通す
      const ts = [
        makeTask({ id: 'a', startDate: '2026-03-01', order: 1 }),
        makeTask({ id: 'b', startDate: '2026-05-01', order: 2 }),
        makeTask({ id: 'c', startDate: '2026-05-01', order: 3 }),
      ];
      const r = sortAndFilter(ts, 'startDate', 'asc', '', '', '');
      expect(r).toHaveLength(3);
      expect(r[0].startDate).toBe('2026-03-01');
      expect(r.filter(t => t.startDate === '2026-05-01')).toHaveLength(2);
    });
  });
});

// ═══════════════════════════════════════════════════
// §8 Import / Export
// ═══════════════════════════════════════════════════
describe('§8 Import / Export', () => {
  const project = { id: 'p1', name: 'テストプロジェクト' };

  const sampleTasks = (): Task[] => [
    makeTask({
      id: 'task-a', projectId: 'p1',
      title: 'タスクA', status: 'todo', priority: 'high', progress: 0,
      assignee: 'Alice', startDate: '2026-05-01', endDate: '2026-05-10',
      predecessors: [],
    }),
    makeTask({
      id: 'task-b', projectId: 'p1',
      title: 'タスクB', status: 'wip', priority: 'medium', progress: 50,
      assignee: 'Bob', startDate: '2026-05-11', endDate: '2026-05-20',
      predecessors: ['task-a'],
    }),
    makeTask({
      id: 'task-c', projectId: 'p1',
      title: 'タスクC', status: 'done', priority: 'low', progress: 100,
      startDate: '2026-05-01', endDate: '2026-05-30',
      predecessors: ['task-a', 'task-b'],
    }),
    makeTask({
      id: 'task-d', projectId: 'p1',
      title: '日付なしタスク', status: 'wait',
      startDate: null, endDate: null,
      predecessors: [],
    }),
  ];

  describe('JSON エクスポート', () => {
    it('JSON 文字列を返す', () => {
      expect(() => JSON.parse(exportToJson(project, sampleTasks()))).not.toThrow();
    });

    it('version フィールドを含む', () => {
      const data = JSON.parse(exportToJson(project, sampleTasks()));
      expect(data.version).toBeTruthy();
    });

    it('exportedAt フィールドを含む（ISO 8601 形式）', () => {
      const data = JSON.parse(exportToJson(project, sampleTasks()));
      expect(data.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('プロジェクト情報（id・name）を含む', () => {
      const data = JSON.parse(exportToJson(project, sampleTasks()));
      expect(data.project.id).toBe('p1');
      expect(data.project.name).toBe('テストプロジェクト');
    });

    it('全タスクを含む', () => {
      const data = JSON.parse(exportToJson(project, sampleTasks()));
      expect(data.tasks).toHaveLength(4);
    });

    it('predecessors 配列がそのまま保持される', () => {
      const data = JSON.parse(exportToJson(project, sampleTasks()));
      const tc = data.tasks.find((t: Task) => t.id === 'task-c');
      expect(tc.predecessors).toEqual(['task-a', 'task-b']);
    });

    it('null の日付フィールドが保持される', () => {
      const data = JSON.parse(exportToJson(project, sampleTasks()));
      const td = data.tasks.find((t: Task) => t.id === 'task-d');
      expect(td.startDate).toBeNull();
      expect(td.endDate).toBeNull();
    });

    it('0 件タスクでもエクスポートできる', () => {
      const data = JSON.parse(exportToJson(project, []));
      expect(data.tasks).toHaveLength(0);
    });
  });

  describe('JSON インポート', () => {
    it('エクスポートした JSON をインポートして件数が一致する', () => {
      const json = exportToJson(project, sampleTasks());
      const { tasks } = importFromJson(json);
      expect(tasks).toHaveLength(4);
    });

    it('プロジェクト情報が復元される', () => {
      const json = exportToJson(project, sampleTasks());
      const { project: proj } = importFromJson(json);
      expect(proj.id).toBe('p1');
      expect(proj.name).toBe('テストプロジェクト');
    });

    it('各フィールドが正しく復元される', () => {
      const json = exportToJson(project, sampleTasks());
      const { tasks } = importFromJson(json);
      const tb = tasks.find(t => t.id === 'task-b')!;
      expect(tb.title).toBe('タスクB');
      expect(tb.status).toBe('wip');
      expect(tb.priority).toBe('medium');
      expect(tb.progress).toBe(50);
      expect(tb.assignee).toBe('Bob');
    });

    it('predecessors 配列が復元される', () => {
      const json = exportToJson(project, sampleTasks());
      const { tasks } = importFromJson(json);
      const tc = tasks.find(t => t.id === 'task-c')!;
      expect(tc.predecessors).toEqual(['task-a', 'task-b']);
    });

    it('空の predecessors が空配列として復元される', () => {
      const json = exportToJson(project, sampleTasks());
      const { tasks } = importFromJson(json);
      const ta = tasks.find(t => t.id === 'task-a')!;
      expect(ta.predecessors).toEqual([]);
    });

    it('不正な JSON → 例外', () => {
      expect(() => importFromJson('not-json')).toThrow();
    });

    it('tasks 配列がない JSON → "Invalid format" 例外', () => {
      expect(() => importFromJson('{"version":"1.0","project":{}}')).toThrow('Invalid format');
    });

    it('空文字 JSON → 例外', () => {
      expect(() => importFromJson('')).toThrow();
    });
  });

  describe('CSV エクスポート', () => {
    it('ヘッダー行を含む CSV を返す', () => {
      const csv = exportToCsv(sampleTasks());
      const header = csv.split('\n')[0];
      expect(header).toContain('id');
      expect(header).toContain('title');
      expect(header).toContain('status');
      expect(header).toContain('predecessors');
      expect(header).toContain('isMilestone');
    });

    it('isMilestone: false のタスクは "0" で出力される', () => {
      const csv = exportToCsv([makeTask({ id: 'ms', isMilestone: false })]);
      const dataLine = csv.split('\n').find(l => l.startsWith('ms'))!;
      expect(dataLine).toContain('0');
    });

    it('isMilestone: true のタスクは "1" で出力される', () => {
      const csv = exportToCsv([makeTask({ id: 'ms', isMilestone: true, startDate: '2026-06-01', endDate: '2026-06-01' })]);
      const dataLine = csv.split('\n').find(l => l.startsWith('ms'))!;
      expect(dataLine).toContain('1');
    });

    it('predecessors はセミコロン区切りで 1 列（CSV カンマと混在しない）', () => {
      const csv = exportToCsv(sampleTasks());
      expect(csv).toContain('task-a;task-b');
    });

    it('predecessors が 1 件のときはセミコロンなし', () => {
      const csv = exportToCsv(sampleTasks());
      expect(csv).toContain('task-a');
      // task-b の行に "task-a" が単独で含まれる（セミコロンなし）
      const taskBLine = csv.split('\n').find(l => l.startsWith('task-b'))!;
      expect(taskBLine).toBeTruthy();
    });

    it('predecessors が空のタスクは空文字列', () => {
      const csv = exportToCsv(sampleTasks());
      const taskALine = csv.split('\n').find(l => l.startsWith('task-a'))!;
      expect(taskALine).toBeTruthy();
    });

    it('タスク数分の行（+ヘッダー）が生成される', () => {
      const csv = exportToCsv(sampleTasks());
      const nonEmptyLines = csv.split('\n').filter(l => l.trim());
      expect(nonEmptyLines).toHaveLength(5); // 1 header + 4 tasks
    });

    it('0 件タスクのとき PapaParse は空文字列を返す（ヘッダー行も生成されない）', () => {
      const csv = exportToCsv([]);
      // PapaParse は空配列からヘッダー列名を推定できないため空文字を返す
      expect(csv.trim()).toBe('');
    });

    it('null の日付は空文字列になる', () => {
      const csv = exportToCsv(sampleTasks());
      const taskDLine = csv.split('\n').find(l => l.startsWith('task-d'))!;
      expect(taskDLine).toBeTruthy();
    });
  });

  describe('CSV インポート', () => {
    it('エクスポートした CSV をインポートして件数が一致する', () => {
      const { tasks } = importFromCsv(exportToCsv(sampleTasks()));
      expect(tasks).toHaveLength(4);
    });

    it('セミコロン区切り predecessors が配列に復元される', () => {
      const { tasks } = importFromCsv(exportToCsv(sampleTasks()));
      const tc = tasks.find(t => t.id === 'task-c')!;
      expect(tc.predecessors).toEqual(['task-a', 'task-b']);
    });

    it('predecessors が空のタスクは空配列', () => {
      const { tasks } = importFromCsv(exportToCsv(sampleTasks()));
      const ta = tasks.find(t => t.id === 'task-a')!;
      expect(ta.predecessors).toEqual([]);
    });

    it('ステータス・優先度が復元される', () => {
      const { tasks } = importFromCsv(exportToCsv(sampleTasks()));
      const tb = tasks.find(t => t.id === 'task-b')!;
      expect(tb.status).toBe('wip');
      expect(tb.priority).toBe('medium');
    });

    it('progress 数値が復元される', () => {
      const { tasks } = importFromCsv(exportToCsv(sampleTasks()));
      const tb = tasks.find(t => t.id === 'task-b')!;
      expect(tb.progress).toBe(50);
    });

    it('startDate・endDate が復元される', () => {
      const { tasks } = importFromCsv(exportToCsv(sampleTasks()));
      const ta = tasks.find(t => t.id === 'task-a')!;
      expect(ta.startDate).toBe('2026-05-01');
      expect(ta.endDate).toBe('2026-05-10');
    });

    it('isMilestone が CSV インポートで復元される（true）', () => {
      const original = [makeTask({ id: 'ms', isMilestone: true, startDate: '2026-06-01', endDate: '2026-06-01' })];
      const { tasks } = importFromCsv(exportToCsv(original));
      expect(tasks.find(t => t.id === 'ms')!.isMilestone).toBe(true);
    });

    it('isMilestone が CSV インポートで復元される（false）', () => {
      const original = [makeTask({ id: 'nm', isMilestone: false })];
      const { tasks } = importFromCsv(exportToCsv(original));
      expect(tasks.find(t => t.id === 'nm')!.isMilestone).toBe(false);
    });

    it('空の CSV → 0 件', () => {
      expect(importFromCsv('').tasks).toHaveLength(0);
    });

    it('ヘッダー行だけの CSV → 0 件', () => {
      const headerOnly = exportToCsv([]);
      expect(importFromCsv(headerOnly).tasks).toHaveLength(0);
    });
  });

  describe('JSON ラウンドトリップ', () => {
    it('全タスクのすべてのフィールドが完全に復元される', () => {
      const original = sampleTasks();
      const json = exportToJson(project, original);
      const { tasks } = importFromJson(json);
      for (const orig of original) {
        const imp = tasks.find(t => t.id === orig.id)!;
        expect(imp.title).toBe(orig.title);
        expect(imp.status).toBe(orig.status);
        expect(imp.priority).toBe(orig.priority);
        expect(imp.progress).toBe(orig.progress);
        expect(imp.assignee).toBe(orig.assignee);
        expect(imp.startDate).toBe(orig.startDate);
        expect(imp.endDate).toBe(orig.endDate);
        expect(imp.predecessors).toEqual(orig.predecessors);
        expect(imp.parentId).toBe(orig.parentId);
        expect(imp.isMilestone).toBe(orig.isMilestone);
      }
    });

    it('isMilestone: true のタスクが JSON ラウンドトリップで保持される', () => {
      const ms = makeTask({ id: 'ms', isMilestone: true, startDate: '2026-06-01', endDate: '2026-06-01' });
      const { tasks } = importFromJson(exportToJson(project, [ms]));
      expect(tasks[0].isMilestone).toBe(true);
    });
  });

  describe('CSV ラウンドトリップ', () => {
    it('主要フィールドが復元される', () => {
      const original = sampleTasks();
      const { tasks } = importFromCsv(exportToCsv(original));
      for (const orig of original) {
        const imp = tasks.find(t => t.id === orig.id)!;
        expect(imp.title).toBe(orig.title);
        expect(imp.status).toBe(orig.status);
        expect(imp.predecessors).toEqual(orig.predecessors);
        expect(imp.isMilestone).toBe(orig.isMilestone);
      }
    });
  });
});

// ═══════════════════════════════════════════════════
// §Phase 2-A  ガント拡張機能
// ═══════════════════════════════════════════════════
describe('§Phase 2-A クリティカルパス (calcCriticalPath)', () => {
  it('依存関係がない場合は空セットを返す', () => {
    const tasks = [
      makeTask({ startDate: '2026-05-01', endDate: '2026-05-10' }),
      makeTask({ startDate: '2026-05-01', endDate: '2026-05-20' }),
    ];
    expect(calcCriticalPath(tasks).size).toBe(0);
  });

  it('タスクが 0 件のとき空セットを返す', () => {
    expect(calcCriticalPath([]).size).toBe(0);
  });

  it('A→B の 2 タスク: 両方がクリティカル', () => {
    const a = makeTask({ startDate: '2026-05-01', endDate: '2026-05-10' });
    const b = makeTask({ startDate: '2026-05-11', endDate: '2026-05-20', predecessors: [a.id] });
    const cp = calcCriticalPath([a, b]);
    expect(cp.has(a.id)).toBe(true);
    expect(cp.has(b.id)).toBe(true);
  });

  it('並列タスク: 長い経路のみクリティカル', () => {
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

  it('存在しない predecessor ID を持つタスクでも例外を投げない（孤立 predecessor）', () => {
    const a = makeTask({ startDate: '2026-05-01', endDate: '2026-05-10', predecessors: ['ghost-id'] });
    expect(() => calcCriticalPath([a])).not.toThrow();
  });
});

describe('§Phase 2-A 期間フィールド (calcDuration)', () => {
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

  it('終了日 < 開始日 → null（不正範囲）', () => {
    expect(calcDuration(makeTask({ startDate: '2026-05-10', endDate: '2026-05-01' }))).toBeNull();
  });

  it('マイルストーン（開始日=終了日）→ 1', () => {
    expect(calcDuration(makeTask({ startDate: '2026-06-01', endDate: '2026-06-01', isMilestone: true }))).toBe(1);
  });
});

describe('§Phase 2-A 期限超過判定', () => {
  const TODAY_STR = '2026-05-22';

  function isOverdue(task: Task): boolean {
    return task.endDate !== null && task.endDate < TODAY_STR && task.status !== 'done';
  }

  it('endDate が今日より前かつ未完了 → 超過', () => {
    expect(isOverdue(makeTask({ endDate: '2026-05-20', status: 'todo' }))).toBe(true);
    expect(isOverdue(makeTask({ endDate: '2026-05-21', status: 'wip' }))).toBe(true);
    expect(isOverdue(makeTask({ endDate: '2026-05-21', status: 'wait' }))).toBe(true);
  });

  it('endDate が今日以降 → 超過ではない', () => {
    expect(isOverdue(makeTask({ endDate: '2026-05-22', status: 'todo' }))).toBe(false);
    expect(isOverdue(makeTask({ endDate: '2026-05-30', status: 'wip' }))).toBe(false);
  });

  it('status が done → 期限超過扱いにならない', () => {
    expect(isOverdue(makeTask({ endDate: '2026-05-01', status: 'done' }))).toBe(false);
  });

  it('endDate が null → 超過ではない', () => {
    expect(isOverdue(makeTask({ endDate: null, status: 'todo' }))).toBe(false);
  });
});

// ═══════════════════════════════════════════════════
// 右クリックメニュー位置クランプ
// ═══════════════════════════════════════════════════
describe('右クリックメニュー位置クランプ (clampMenuPos)', () => {
  const VW = 1280, VH = 800;
  const W = 144, H = 82;

  it('画面内クリックはそのままの座標を返す', () => {
    const pos = clampMenuPos(300, 400, W, H, VW, VH);
    expect(pos.left).toBe(300);
    expect(pos.top).toBe(400);
  });

  it('下端超過 → top をクランプ', () => {
    const pos = clampMenuPos(300, 760, W, H, VW, VH);
    expect(pos.top).toBe(VH - H - 4); // 714
  });

  it('右端超過 → left をクランプ', () => {
    const pos = clampMenuPos(1200, 300, W, H, VW, VH);
    expect(pos.left).toBe(VW - W - 4); // 1132
  });

  it('左上隅（負値）→ 最小値 4px に丸める', () => {
    const pos = clampMenuPos(-10, -10, W, H, VW, VH);
    expect(pos.top).toBe(4);
    expect(pos.left).toBe(4);
  });

  it('右下隅クリック → 両軸ともクランプ', () => {
    const pos = clampMenuPos(VW - 10, VH - 10, W, H, VW, VH);
    expect(pos.top).toBe(VH - H - 4);
    expect(pos.left).toBe(VW - W - 4);
  });
});
