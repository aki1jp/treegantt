import dayjs from 'dayjs';
import type { Task, ZoomLevel } from '../types/task';

export interface WorkloadMatrix {
  assignees: string[];
  days: string[];
  /** matrix[assigneeIndex][dayIndex] = 同時進行タスク数（土日は 0） */
  matrix: number[][];
  /** dayTasks[assigneeIndex][dayIndex] = その日に寄与するタスク名（土日は空） */
  dayTasks: string[][][];
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** 土日（曜日 0=日・6=土）は非稼働日 */
function isWeekend(dateStr: string): boolean {
  const dow = new Date(dateStr).getUTCDay();
  return dow === 0 || dow === 6;
}

export function calcWorkloadMatrix(tasks: Task[], min: Date, max: Date): WorkloadMatrix {
  const minStr = toDateStr(min);
  const maxStr = toDateStr(max);

  // Build day list
  const days: string[] = [];
  let cur = minStr;
  while (cur <= maxStr) {
    days.push(cur);
    cur = addDays(cur, 1);
  }

  // Filter tasks: must have assignee, not done, have both dates
  const eligible = tasks.filter(
    t => t.assignee && t.status !== 'done' && t.startDate && t.endDate
  );

  // Collect unique assignees (sorted)
  const assigneeSet = new Set<string>();
  for (const t of eligible) assigneeSet.add(t.assignee);
  const assignees = [...assigneeSet].sort();

  if (assignees.length === 0 || days.length === 0) {
    return { assignees: [], days: assignees.length === 0 ? [] : days, matrix: [], dayTasks: [] };
  }

  // Initialize matrix / dayTasks
  const matrix: number[][] = assignees.map(() => new Array(days.length).fill(0));
  const dayTasks: string[][][] = assignees.map(() => days.map(() => [] as string[]));
  const dayIndex = new Map(days.map((d, i) => [d, i]));

  for (const t of eligible) {
    const aIdx = assignees.indexOf(t.assignee);
    // clamp task dates to [minStr, maxStr]
    const taskStart = t.startDate! < minStr ? minStr : t.startDate!;
    const taskEnd   = t.endDate!   > maxStr ? maxStr : t.endDate!;
    let d = taskStart;
    while (d <= taskEnd) {
      const dIdx = dayIndex.get(d);
      // 土日（非稼働日）は負荷に加算しない（キャパ 0）
      if (dIdx !== undefined && !isWeekend(d)) {
        matrix[aIdx][dIdx]++;
        dayTasks[aIdx][dIdx].push(t.title);
      }
      d = addDays(d, 1);
    }
  }

  return { assignees, days, matrix, dayTasks };
}

export interface WorkloadBucket {
  /** バケット先頭の日インデックス（days 配列基準） */
  startIdx: number;
  /** バケットが含む日数 */
  span: number;
  /** バケットが含む日インデックスの配列 */
  dayIdxs: number[];
  /** ヘッダー表示用ラベル */
  label: string;
}

/** ズームに応じて日インデックスを期間バケットへまとめる（day=1日, week=週, month=暦月） */
export function workloadBuckets(days: string[], zoom: ZoomLevel): WorkloadBucket[] {
  if (days.length === 0) return [];

  const keyOf = (dateStr: string): string => {
    if (zoom === 'day')   return dateStr;
    if (zoom === 'week')  return dayjs(dateStr).startOf('week').format('YYYY-MM-DD');
    return dateStr.slice(0, 7); // month: YYYY-MM
  };
  const labelOf = (dateStr: string): string => {
    if (zoom === 'day')   return dayjs(dateStr).format('D');
    if (zoom === 'week')  return dayjs(dateStr).format('M/D');
    return dayjs(dateStr).format('YYYY-MM');
  };

  const buckets: WorkloadBucket[] = [];
  let curKey: string | null = null;
  for (let i = 0; i < days.length; i++) {
    const k = keyOf(days[i]);
    if (curKey !== k) {
      curKey = k;
      buckets.push({ startIdx: i, span: 1, dayIdxs: [i], label: labelOf(days[i]) });
    } else {
      const b = buckets[buckets.length - 1];
      b.span++;
      b.dayIdxs.push(i);
    }
  }
  return buckets;
}

/** Map count to heat color */
export function workloadColor(count: number): string {
  if (count === 0) return 'transparent';
  if (count === 1) return 'rgba(34,197,94,0.55)';   // green
  if (count === 2) return 'rgba(234,179,8,0.65)';    // yellow
  if (count === 3) return 'rgba(249,115,22,0.7)';    // orange
  return 'rgba(239,68,68,0.8)';                       // red 4+
}
