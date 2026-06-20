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
  // ガント本体（dateToX / buildMultiLevelHeaders）はローカル時刻の dayjs で日付グリッドを
  // 作るため、ここも UTC（toISOString）ではなくローカルで整形して列を一致させる。
  // UTC にすると UTC+9（JST）等でローカル深夜の min が前日へずれ、リソースビューが
  // ガントより 1 日前から表示されてしまう。
  return dayjs(d).format('YYYY-MM-DD');
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

// ── 工数ベースの稼働率モデル（FEATURES.md Step 2 / §8.9） ─────────────────────

export interface UtilizationOpts {
  /** 1 稼働日あたりのキャパシティ（分） */
  capacityMinutesPerDay: number;
  /** 稼働日とみなす曜日（0=日…6=土） */
  workingDays: number[];
}

export interface UtilizationMatrix {
  assignees: string[];
  days: string[];
  /** demand[a][d] = その日の需要（分） */
  demand: number[][];
  /** utilization[a][d] = demand / capacity（非稼働日は 0） */
  utilization: number[][];
  /** dayTasks[a][d] = その日に需要を持つ寄与タスク（按分後の分つき） */
  dayTasks: { title: string; minutes: number }[][][];
  /** totalMinutes[a] = 担当者の合計予定工数（分） */
  totalMinutes: number[];
  /** peakUtil[a] = 期間内の最大稼働率 */
  peakUtil: number[];
}

/**
 * 予定工数ベースの稼働率マトリクスを算出する。
 * - 行（担当者）対象: assignee あり・done 除外・両日付あり・リーフのみ。
 * - 需要: estimateMinutes!=null のタスクを「タスク期間の稼働日数」で均等配分し各稼働日へ積算。
 * - 稼働率 = 需要 ÷ capacityMinutesPerDay。非稼働日（workingDays 外）は需要 0。
 */
export function calcUtilizationMatrix(
  tasks: Task[], min: Date, max: Date, opts: UtilizationOpts,
): UtilizationMatrix {
  const minStr = toDateStr(min);
  const maxStr = toDateStr(max);

  const days: string[] = [];
  let cur = minStr;
  while (cur <= maxStr) { days.push(cur); cur = addDays(cur, 1); }

  const workingSet = new Set(opts.workingDays);
  const isWorking = (dateStr: string): boolean => workingSet.has(new Date(dateStr).getUTCDay());

  // リーフ判定: 他タスクの parentId に現れない id
  const parentIds = new Set(tasks.map(t => t.parentId).filter((p): p is string => p != null));
  const isLeaf = (t: Task): boolean => !parentIds.has(t.id);

  const rowTasks = tasks.filter(
    t => t.assignee && t.status !== 'done' && t.startDate && t.endDate && isLeaf(t),
  );

  const assignees = [...new Set(rowTasks.map(t => t.assignee))].sort();
  const empty: UtilizationMatrix = {
    assignees: [], days: assignees.length === 0 ? [] : days,
    demand: [], utilization: [], dayTasks: [], totalMinutes: [], peakUtil: [],
  };
  if (assignees.length === 0 || days.length === 0) return empty;

  const aIdx = new Map(assignees.map((a, i) => [a, i]));
  const dayIndex = new Map(days.map((d, i) => [d, i]));
  const demand: number[][] = assignees.map(() => new Array(days.length).fill(0));
  const dayTasks: { title: string; minutes: number }[][][] = assignees.map(() => days.map(() => [] as { title: string; minutes: number }[]));
  const totalMinutes: number[] = assignees.map(() => 0);

  for (const t of rowTasks) {
    if (t.estimateMinutes == null) continue;
    const ai = aIdx.get(t.assignee)!;
    totalMinutes[ai] += t.estimateMinutes;

    // タスク期間（全体）の稼働日を収集 → 均等配分の分母
    const spanWorking: string[] = [];
    let d = t.startDate!;
    while (d <= t.endDate!) {
      if (isWorking(d)) spanWorking.push(d);
      d = addDays(d, 1);
    }
    if (spanWorking.length === 0) continue; // 配分先なし
    const perDay = t.estimateMinutes / spanWorking.length;

    for (const dd of spanWorking) {
      const di = dayIndex.get(dd);
      if (di !== undefined) {
        demand[ai][di] += perDay;
        dayTasks[ai][di].push({ title: t.title, minutes: perDay });
      }
    }
  }

  const cap = opts.capacityMinutesPerDay > 0 ? opts.capacityMinutesPerDay : 1;
  const utilization = demand.map(row => row.map(m => m / cap));
  const peakUtil = utilization.map(row => row.reduce((mx, v) => Math.max(mx, v), 0));

  return { assignees, days, demand, utilization, dayTasks, totalMinutes, peakUtil };
}

/** 稼働率（比率）→ バンド色。0=透明／〜80%淡緑（余裕）／〜100%緑（適正）／〜120%黄（注意）／>120%赤（過負荷） */
export function utilizationColor(ratio: number): string {
  if (ratio <= 0)   return 'transparent';
  if (ratio <= 0.8) return 'rgba(34,197,94,0.35)';
  if (ratio <= 1.0) return 'rgba(34,197,94,0.65)';
  if (ratio <= 1.2) return 'rgba(234,179,8,0.8)';
  return 'rgba(239,68,68,0.85)';
}

/** Map count to heat color */
export function workloadColor(count: number): string {
  if (count === 0) return 'transparent';
  if (count === 1) return 'rgba(34,197,94,0.55)';   // green
  if (count === 2) return 'rgba(234,179,8,0.65)';    // yellow
  if (count === 3) return 'rgba(249,115,22,0.7)';    // orange
  return 'rgba(239,68,68,0.8)';                       // red 4+
}
