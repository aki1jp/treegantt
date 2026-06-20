import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import dayjs from 'dayjs';
import type { Task, ZoomLevel } from '../types/task';
import { calcWorkloadMatrix } from '../utils/workloadCalc';
import { dateToX, ZOOM_CONFIG } from '../utils/ganttCalc';

// リソースビューはガント本体と同じ日付グリッドで描画される必要がある。
// ガントは各日付を dateToX(date, min, zoom) の X 位置へ置き、リソースビューは
// 日インデックス i の列を i*dayWidth へ置く。両者が一致するには
//   dateToX(days[i], min, zoom) === i*dayWidth
// が全列で成り立つ必要がある。以前は calcWorkloadMatrix が日付リストを UTC
// （toISOString）で作っていたため、UTC+9（JST）等で min（ローカル深夜）が前日へ
// ずれ、リソースビューがガントより 1 日前から表示されていた。
// このリグレッションを、最もズレが出る JST に固定して検証する。
const origTZ = process.env.TZ;
beforeAll(() => { process.env.TZ = 'Asia/Tokyo'; });
afterAll(() => { process.env.TZ = origTZ; });

function task(partial: Partial<Task>): Task {
  return {
    id: 'x', projectId: 'p', parentId: null,
    title: 'T', summary: '', description: '',
    status: 'todo', priority: 'medium', progress: 0, assignee: '',
    startDate: null, endDate: null,
    isMilestone: false, predecessors: [], seq: 1, order: 1,
    createdAt: '', updatedAt: '', titleColor: null, titleBgColor: null, estimateMinutes: null,
    ...partial,
  };
}

describe('calcWorkloadMatrix: タイムゾーン整合（JST, UTC+9）', () => {
  it('days はガントと同じローカル日付に揃う（min を1日前にずらさない）', () => {
    const min = dayjs('2026-06-10').toDate();
    const max = dayjs('2026-06-12').toDate();
    const r = calcWorkloadMatrix(
      [task({ assignee: 'Alice', startDate: '2026-06-10', endDate: '2026-06-12' })],
      min, max,
    );
    expect(r.days[0]).toBe(dayjs(min).format('YYYY-MM-DD'));
    expect(r.days[0]).toBe('2026-06-10');
    expect(r.days).toEqual(['2026-06-10', '2026-06-11', '2026-06-12']);
    expect(r.matrix[0]).toEqual([1, 1, 1]);
  });
});

describe('リソースビューの日付列がガントチャートと一致する（JST, UTC+9）', () => {
  // parseDateStr と同じく dayjs(str).toDate() でローカル深夜の min/max を作る
  const min = dayjs('2026-06-10').toDate();
  const max = dayjs('2026-06-30').toDate();
  const tasks = [task({ assignee: 'Alice', startDate: '2026-06-10', endDate: '2026-06-30' })];

  it('先頭列はガント先頭日（min のローカル日付）と一致し、1日前へずれない', () => {
    const { days } = calcWorkloadMatrix(tasks, min, max);
    expect(days[0]).toBe(dayjs(min).format('YYYY-MM-DD')); // = '2026-06-10'
    expect(days[0]).toBe('2026-06-10');
  });

  it('全列で dateToX(days[i]) === i*dayWidth（ガントの測位と一致）', () => {
    for (const zoom of ['day', 'week', 'month'] as ZoomLevel[]) {
      const { days } = calcWorkloadMatrix(tasks, min, max);
      const { dayWidth } = ZOOM_CONFIG[zoom];
      days.forEach((d, i) => {
        // ガントがこの日付を置く X と、リソースビューが i 列目を置く X が一致すること
        expect(dateToX(d, min, zoom)).toBe(i * dayWidth);
      });
    }
  });
});
