import type { ZoomLevel, Task } from '../types/task';

export type GanttPeriod = '2w' | '1m' | '3m' | '6m';

export const PERIOD_DAYS: Record<GanttPeriod, number> = {
  '2w': 14, '1m': 30, '3m': 91, '6m': 183,
};

export const ZOOM_CONFIG: Record<ZoomLevel, { dayWidth: number; headerFormat: string }> = {
  day:   { dayWidth: 28, headerFormat: 'M/D' },
  week:  { dayWidth: 8,  headerFormat: '[W]w' },
  month: { dayWidth: 3,  headerFormat: 'YYYY-MM' },
};

export const ROW_HEIGHT_PX = 36;

export function dateToX(date: string, minDate: Date, zoom: ZoomLevel): number {
  const { dayWidth } = ZOOM_CONFIG[zoom];
  const d = new Date(date);
  return Math.round((d.getTime() - minDate.getTime()) / 86400000) * dayWidth;
}

export function calcGanttRange(
  tasks: Task[],
  startDate?: string,
  period?: GanttPeriod,
): { min: Date; max: Date } {
  const today = Date.now();
  const periodDays = period ? PERIOD_DAYS[period] : 91;

  if (startDate) {
    // 手動モード: 明示的な開始日 + 期間
    const minTime = new Date(startDate).getTime();
    return { min: new Date(minTime), max: new Date(minTime + periodDays * 86400000) };
  }

  // 自動モード: タスク日付から範囲を計算し、最低でも period 分を確保
  const dates = tasks.flatMap(t => [t.startDate, t.endDate]).filter(Boolean) as string[];
  let minTime: number;
  let maxTime: number;

  if (dates.length === 0) {
    minTime = today - 7 * 86400000;
    maxTime = minTime + periodDays * 86400000;
  } else {
    const times = dates.map(d => new Date(d).getTime());
    minTime = Math.min(...times) - 3 * 86400000;
    const taskMaxEnd = Math.max(...times) + 5 * 86400000;
    maxTime = Math.max(taskMaxEnd, minTime + periodDays * 86400000);
  }

  return { min: new Date(minTime), max: new Date(maxTime) };
}

export function calcTodayX(minDate: Date, zoom: ZoomLevel): number {
  return dateToX(new Date().toISOString().slice(0, 10), minDate, zoom);
}

// イナズマライン: 各タスクの進捗率をX座標に変換し、行の中心点を斜線でつなぐ
export interface LightningPoint { x: number; y: number; }

export function calcLightningPoints(
  flatRows: { task: Task; effectiveProgress: number }[],
  minDate: Date,
  zoom: ZoomLevel,
): LightningPoint[] | null {
  const { dayWidth } = ZOOM_CONFIG[zoom];
  const todayX = calcTodayX(minDate, zoom);
  const pts: LightningPoint[] = [];

  flatRows.forEach(({ task, effectiveProgress }, i) => {
    const centerY = i * ROW_HEIGHT_PX + ROW_HEIGHT_PX / 2;

    if (task.startDate && task.endDate && !task.isMilestone) {
      let pointX: number;
      if (task.status === 'done' || task.status === 'wait') {
        // 完了・待機タスクは進捗位置ではなく今日の日付を頂点とする
        pointX = todayX;
      } else {
        const startX = dateToX(task.startDate, minDate, zoom);
        const endX   = dateToX(task.endDate,   minDate, zoom) + dayWidth;
        pointX = Math.round(startX + (endX - startX) * effectiveProgress / 100);
      }
      pts.push({ x: pointX, y: centerY });
    }
    // 日付なし行はスキップ（斜線が飛ぶだけで見た目が自然）
  });

  return pts.length > 0 ? pts : null;
}

export function calcCriticalPath(tasks: Task[]): Set<string> {
  const hasDeps = tasks.some(t => t.predecessors.length > 0);
  if (!hasDeps) return new Set();

  const taskMap = new Map(tasks.map(t => [t.id, t]));

  // Build successor map
  const successors = new Map<string, string[]>();
  tasks.forEach(t => successors.set(t.id, []));
  tasks.forEach(t => {
    t.predecessors.forEach(pid => {
      if (successors.has(pid)) successors.get(pid)!.push(t.id);
    });
  });

  // Duration in days (minimum 1)
  function dur(t: Task): number {
    if (!t.startDate || !t.endDate) return 1;
    return Math.max(1, Math.round((new Date(t.endDate).getTime() - new Date(t.startDate).getTime()) / 86400000) + 1);
  }

  // Topological sort (Kahn's algorithm)
  const inDeg = new Map(tasks.map(t => [t.id, t.predecessors.filter(p => taskMap.has(p)).length]));
  const queue = tasks.filter(t => inDeg.get(t.id) === 0).map(t => t.id);
  const sorted: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    sorted.push(id);
    successors.get(id)!.forEach(sid => {
      const d = inDeg.get(sid)! - 1;
      inDeg.set(sid, d);
      if (d === 0) queue.push(sid);
    });
  }

  // Forward pass: ES = earliest start, EF = earliest finish
  const ES = new Map<string, number>();
  const EF = new Map<string, number>();
  for (const id of sorted) {
    const task = taskMap.get(id)!;
    const predEFs = task.predecessors.filter(p => taskMap.has(p)).map(p => EF.get(p)!);
    const es = predEFs.length > 0 ? Math.max(...predEFs) : 0;
    ES.set(id, es);
    EF.set(id, es + dur(task));
  }

  const projectEF = Math.max(...EF.values());

  // Backward pass: LS = latest start
  const LS = new Map<string, number>();
  for (const id of [...sorted].reverse()) {
    const task = taskMap.get(id)!;
    const sucLSs = successors.get(id)!.filter(s => taskMap.has(s)).map(s => LS.get(s)!);
    const lf = sucLSs.length > 0 ? Math.min(...sucLSs) : projectEF;
    LS.set(id, lf - dur(task));
  }

  // Critical: total float = LS - ES == 0
  const critical = new Set<string>();
  for (const id of sorted) {
    if (LS.get(id)! === ES.get(id)!) {
      critical.add(id);
    }
  }
  return critical;
}

// 期間（日数）= endDate - startDate + 1。日付なし・逆順は null
export function calcDuration(task: Task): number | null {
  if (!task.startDate || !task.endDate) return null;
  const days = Math.round(
    (new Date(task.endDate).getTime() - new Date(task.startDate).getTime()) / 86400000,
  ) + 1;
  return days >= 1 ? days : null;
}

export function ganttTotalWidth(tasks: Task[], zoom: ZoomLevel, startDate?: string, period?: GanttPeriod): number {
  const range = calcGanttRange(tasks, startDate, period);
  const { dayWidth } = ZOOM_CONFIG[zoom];
  const days = Math.ceil((range.max.getTime() - range.min.getTime()) / 86400000);
  return days * dayWidth;
}
