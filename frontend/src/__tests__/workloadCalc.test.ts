import { describe, it, expect } from 'vitest';
import dayjs from 'dayjs';
import {
  calcWorkloadMatrix, workloadColor, workloadBuckets,
  calcUtilizationMatrix, utilizationColor,
} from '../utils/workloadCalc';
import type { Task } from '../types/task';

// min/max は本番コード（parseDateStr = dayjs(str).toDate()）と同じくローカル解釈で作る。
// `new Date('YYYY-MM-DD')` は常に UTC 0 時として解釈されるため、UTC 背後（例: America/New_York
// 等の負オフセット）の環境では toDateStr（ローカル整形）との突き合わせで前日にズレて見える
// ことがある（本番では起こらない test-only の不整合）。

function makeTask(partial: Partial<Task>): Task {
  return {
    id: 'x',
    projectId: 'p',
    title: 'Task',
    summary: '',
    description: '',
    status: 'todo',
    priority: 'medium',
    progress: 0,
    assignee: '',
    startDate: null,
    endDate: null,
    parentId: null,
    predecessors: [],
    isMilestone: false,
    seq: 1,
    order: 1,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    titleColor: null, titleBgColor: null, estimateMinutes: null,
    ...partial,
  };
}

describe('calcWorkloadMatrix', () => {
  it('空タスクリストは空マトリクスを返す', () => {
    const result = calcWorkloadMatrix([], dayjs('2026-05-01').toDate(), dayjs('2026-05-03').toDate());
    expect(result.assignees).toEqual([]);
    expect(result.days).toEqual([]);
    expect(result.matrix).toEqual([]);
  });

  it('担当者なしのタスクは集計されない', () => {
    const tasks = [makeTask({ startDate: '2026-05-01', endDate: '2026-05-02', status: 'todo' })];
    const result = calcWorkloadMatrix(tasks, dayjs('2026-05-01').toDate(), dayjs('2026-05-02').toDate());
    expect(result.assignees).toEqual([]);
  });

  it('doneタスクは集計されない', () => {
    const tasks = [makeTask({ assignee: 'Alice', startDate: '2026-05-01', endDate: '2026-05-02', status: 'done' })];
    const result = calcWorkloadMatrix(tasks, dayjs('2026-05-01').toDate(), dayjs('2026-05-02').toDate());
    expect(result.assignees).toEqual([]);
  });

  it('startDate/endDate が null のタスクは集計されない', () => {
    const tasks = [makeTask({ assignee: 'Alice', startDate: null, endDate: null, status: 'todo' })];
    const result = calcWorkloadMatrix(tasks, dayjs('2026-05-01').toDate(), dayjs('2026-05-02').toDate());
    expect(result.assignees).toEqual([]);
  });

  it('1人1タスク: 対象稼働日に count=1 が返る', () => {
    // 2026-05-04(月)〜05-06(水) は全て平日
    const tasks = [
      makeTask({ id: 't1', assignee: 'Alice', startDate: '2026-05-04', endDate: '2026-05-06', status: 'todo' }),
    ];
    const result = calcWorkloadMatrix(tasks, dayjs('2026-05-04').toDate(), dayjs('2026-05-06').toDate());
    expect(result.assignees).toEqual(['Alice']);
    expect(result.days).toEqual(['2026-05-04', '2026-05-05', '2026-05-06']);
    // Alice の全3日（平日）count=1
    expect(result.matrix[0]).toEqual([1, 1, 1]);
  });

  it('土日は負荷に加算されない（キャパ0）', () => {
    // 2026-05-01(金)〜05-04(月): 金=平日, 土日=0, 月=平日
    const tasks = [
      makeTask({ id: 't1', assignee: 'Alice', startDate: '2026-05-01', endDate: '2026-05-04', status: 'todo' }),
    ];
    const result = calcWorkloadMatrix(tasks, dayjs('2026-05-01').toDate(), dayjs('2026-05-04').toDate());
    expect(result.days).toEqual(['2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04']);
    expect(result.matrix[0]).toEqual([1, 0, 0, 1]);
  });

  it('dayTasks に各稼働日の寄与タスク名が入る（土日は空）', () => {
    const tasks = [
      makeTask({ id: 't1', assignee: 'Alice', title: '設計', startDate: '2026-05-01', endDate: '2026-05-04', status: 'todo' }),
    ];
    const result = calcWorkloadMatrix(tasks, dayjs('2026-05-01').toDate(), dayjs('2026-05-04').toDate());
    expect(result.dayTasks[0][0]).toEqual(['設計']); // 金
    expect(result.dayTasks[0][1]).toEqual([]);        // 土
    expect(result.dayTasks[0][2]).toEqual([]);        // 日
    expect(result.dayTasks[0][3]).toEqual(['設計']); // 月
  });

  it('同日に2タスク: count=2 が返る', () => {
    const tasks = [
      makeTask({ id: 't1', assignee: 'Alice', startDate: '2026-05-01', endDate: '2026-05-01', status: 'wip' }),
      makeTask({ id: 't2', assignee: 'Alice', startDate: '2026-05-01', endDate: '2026-05-01', status: 'todo' }),
    ];
    const result = calcWorkloadMatrix(tasks, dayjs('2026-05-01').toDate(), dayjs('2026-05-01').toDate());
    expect(result.matrix[0][0]).toBe(2);
  });

  it('複数担当者が正しく分離される', () => {
    const tasks = [
      makeTask({ id: 't1', assignee: 'Alice', startDate: '2026-05-01', endDate: '2026-05-01', status: 'todo' }),
      makeTask({ id: 't2', assignee: 'Bob',   startDate: '2026-05-01', endDate: '2026-05-01', status: 'todo' }),
      makeTask({ id: 't3', assignee: 'Bob',   startDate: '2026-05-01', endDate: '2026-05-01', status: 'wip' }),
    ];
    const result = calcWorkloadMatrix(tasks, dayjs('2026-05-01').toDate(), dayjs('2026-05-01').toDate());
    expect(result.assignees).toContain('Alice');
    expect(result.assignees).toContain('Bob');
    const aliceIdx = result.assignees.indexOf('Alice');
    const bobIdx   = result.assignees.indexOf('Bob');
    expect(result.matrix[aliceIdx][0]).toBe(1);
    expect(result.matrix[bobIdx][0]).toBe(2);
  });

  it('範囲外の日は含まれない', () => {
    const tasks = [
      makeTask({ id: 't1', assignee: 'Alice', startDate: '2026-04-28', endDate: '2026-05-08', status: 'todo' }),
    ];
    const result = calcWorkloadMatrix(tasks, dayjs('2026-05-04').toDate(), dayjs('2026-05-06').toDate());
    // 範囲は5/4〜5/6 のみ（全て平日）
    expect(result.days).toEqual(['2026-05-04', '2026-05-05', '2026-05-06']);
    expect(result.matrix[0]).toEqual([1, 1, 1]);
  });

  it('担当者名はソートされる', () => {
    const tasks = [
      makeTask({ id: 't1', assignee: 'Zara',  startDate: '2026-05-01', endDate: '2026-05-01', status: 'todo' }),
      makeTask({ id: 't2', assignee: 'Alice', startDate: '2026-05-01', endDate: '2026-05-01', status: 'todo' }),
    ];
    const result = calcWorkloadMatrix(tasks, dayjs('2026-05-01').toDate(), dayjs('2026-05-01').toDate());
    expect(result.assignees[0]).toBe('Alice');
    expect(result.assignees[1]).toBe('Zara');
  });
});

describe('workloadColor', () => {
  it('count=0 は transparent', () => {
    expect(workloadColor(0)).toBe('transparent');
  });

  it('count=1 は green', () => {
    expect(workloadColor(1)).toContain('34,197,94');
  });

  it('count=2 は yellow', () => {
    expect(workloadColor(2)).toContain('234,179,8');
  });

  it('count=3 は orange', () => {
    expect(workloadColor(3)).toContain('249,115,22');
  });

  it('count=4 以上は red', () => {
    expect(workloadColor(4)).toContain('239,68,68');
    expect(workloadColor(100)).toContain('239,68,68');
  });
});

describe('workloadBuckets（ズーム集計）', () => {
  const days7 = ['2026-06-01','2026-06-02','2026-06-03','2026-06-04','2026-06-05','2026-06-06','2026-06-07'];

  it('day ズームは 1 日 1 バケット', () => {
    const buckets = workloadBuckets(days7, 'day');
    expect(buckets.length).toBe(days7.length);
    expect(buckets.every(b => b.span === 1)).toBe(true);
    expect(buckets[0].dayIdxs).toEqual([0]);
  });

  it('全バケットの span 合計は日数に一致し、dayIdxs は連続', () => {
    for (const zoom of ['day','week','month'] as const) {
      const buckets = workloadBuckets(days7, zoom);
      const total = buckets.reduce((s, b) => s + b.span, 0);
      expect(total).toBe(days7.length);
      for (const b of buckets) {
        expect(b.dayIdxs.length).toBe(b.span);
        for (let i = 1; i < b.dayIdxs.length; i++) {
          expect(b.dayIdxs[i]).toBe(b.dayIdxs[i - 1] + 1);
        }
      }
    }
  });

  it('month ズームは月境界でバケットが分割される', () => {
    const days = ['2026-06-28','2026-06-29','2026-06-30','2026-07-01','2026-07-02'];
    const buckets = workloadBuckets(days, 'month');
    expect(buckets.length).toBe(2);
    expect(buckets[0].span).toBe(3); // 6/28-6/30
    expect(buckets[1].span).toBe(2); // 7/1-7/2
  });

  it('空配列は空バケット', () => {
    expect(workloadBuckets([], 'week')).toEqual([]);
  });
});

const UOPTS = { capacityMinutesPerDay: 480, workingDays: [1, 2, 3, 4, 5] };

describe('calcUtilizationMatrix（工数ベース稼働率）', () => {
  it('予定工数を稼働日へ均等配分し稼働率を出す', () => {
    const tasks = [makeTask({ id: 't1', assignee: 'Alice', startDate: '2026-05-04', endDate: '2026-05-06', estimateMinutes: 720, status: 'todo' })];
    const r = calcUtilizationMatrix(tasks, dayjs('2026-05-04').toDate(), dayjs('2026-05-06').toDate(), UOPTS);
    expect(r.assignees).toEqual(['Alice']);
    expect(r.demand[0]).toEqual([240, 240, 240]);   // 720 / 3 稼働日
    expect(r.utilization[0]).toEqual([0.5, 0.5, 0.5]);
    expect(r.peakUtil[0]).toBeCloseTo(0.5);
    expect(r.totalMinutes[0]).toBe(720);
  });

  it('土日は需要0（非稼働日）、稼働日のみへ配分', () => {
    const tasks = [makeTask({ id: 't1', assignee: 'Alice', startDate: '2026-05-01', endDate: '2026-05-04', estimateMinutes: 480, status: 'todo' })];
    const r = calcUtilizationMatrix(tasks, dayjs('2026-05-01').toDate(), dayjs('2026-05-04').toDate(), UOPTS);
    // 金,土,日,月 → 稼働 金/月=2 → 240 ずつ
    expect(r.demand[0]).toEqual([240, 0, 0, 240]);
  });

  it('estimateMinutes=null は需要0だが担当者行は表示される', () => {
    const tasks = [makeTask({ id: 't1', assignee: 'Alice', startDate: '2026-05-04', endDate: '2026-05-04', estimateMinutes: null, status: 'todo' })];
    const r = calcUtilizationMatrix(tasks, dayjs('2026-05-04').toDate(), dayjs('2026-05-04').toDate(), UOPTS);
    expect(r.assignees).toEqual(['Alice']);
    expect(r.demand[0]).toEqual([0]);
    expect(r.totalMinutes[0]).toBe(0);
  });

  it('done は行にも需要にも含めない', () => {
    const tasks = [makeTask({ id: 't1', assignee: 'Alice', startDate: '2026-05-04', endDate: '2026-05-04', estimateMinutes: 240, status: 'done' })];
    const r = calcUtilizationMatrix(tasks, dayjs('2026-05-04').toDate(), dayjs('2026-05-04').toDate(), UOPTS);
    expect(r.assignees).toEqual([]);
  });

  it('親（非リーフ）は除外しリーフのみ集計', () => {
    const tasks = [
      makeTask({ id: 'p', assignee: 'Alice', startDate: '2026-05-04', endDate: '2026-05-04', estimateMinutes: 240, status: 'todo' }),
      makeTask({ id: 'c', parentId: 'p', assignee: 'Bob', startDate: '2026-05-04', endDate: '2026-05-04', estimateMinutes: 480, status: 'todo' }),
    ];
    const r = calcUtilizationMatrix(tasks, dayjs('2026-05-04').toDate(), dayjs('2026-05-04').toDate(), UOPTS);
    expect(r.assignees).toEqual(['Bob']);          // 親 p は除外
    expect(r.demand[0]).toEqual([480]);
    expect(r.utilization[0]).toEqual([1]);
  });

  it('dayTasks は各タスクの按分時間 {title, minutes} を保持する', () => {
    const tasks = [makeTask({ id: 't1', assignee: 'Alice', title: '設計', startDate: '2026-05-04', endDate: '2026-05-06', estimateMinutes: 720, status: 'todo' })];
    const r = calcUtilizationMatrix(tasks, dayjs('2026-05-04').toDate(), dayjs('2026-05-06').toDate(), UOPTS);
    // 720 を 3 稼働日 → 各日 {title:'設計', minutes:240}
    expect(r.dayTasks[0][0]).toEqual([{ title: '設計', minutes: 240 }]);
    expect(r.dayTasks[0][1]).toEqual([{ title: '設計', minutes: 240 }]);
  });

  it('複数タスクの需要は合算（過負荷）', () => {
    const tasks = [
      makeTask({ id: 't1', assignee: 'Alice', startDate: '2026-05-04', endDate: '2026-05-04', estimateMinutes: 240, status: 'todo' }),
      makeTask({ id: 't2', assignee: 'Alice', startDate: '2026-05-04', endDate: '2026-05-04', estimateMinutes: 480, status: 'wip' }),
    ];
    const r = calcUtilizationMatrix(tasks, dayjs('2026-05-04').toDate(), dayjs('2026-05-04').toDate(), UOPTS);
    expect(r.demand[0]).toEqual([720]);
    expect(r.utilization[0]).toEqual([1.5]);
  });
});

describe('utilizationColor（バンド）', () => {
  it('0=透明 / 〜80%・〜100%=緑 / 〜120%=黄 / >120%=赤', () => {
    expect(utilizationColor(0)).toBe('transparent');
    expect(utilizationColor(0.5)).toContain('34,197,94');
    expect(utilizationColor(0.9)).toContain('34,197,94');
    expect(utilizationColor(1.1)).toContain('234,179,8');
    expect(utilizationColor(1.5)).toContain('239,68,68');
  });
});
