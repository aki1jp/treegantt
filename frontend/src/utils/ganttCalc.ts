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

export function calcLightningX(tasks: Task[], minDate: Date, zoom: ZoomLevel): number | null {
  const done    = tasks.filter(t => t.status === 'done' && t.endDate);
  const notDone = tasks.filter(t => t.status !== 'done' && t.startDate);
  if (done.length === 0 || notDone.length === 0) return null;

  const maxDoneEnd   = done.reduce((a, t) => (t.endDate! > a ? t.endDate! : a), '');
  const minNotStart  = notDone.reduce((a, t) => (t.startDate! < a || !a ? t.startDate! : a), '');

  const x1 = dateToX(maxDoneEnd, minDate, zoom);
  const x2 = dateToX(minNotStart, minDate, zoom);
  return Math.round((x1 + x2) / 2);
}

export function ganttTotalWidth(tasks: Task[], zoom: ZoomLevel, startDate?: string, period?: GanttPeriod): number {
  const range = calcGanttRange(tasks, startDate, period);
  const { dayWidth } = ZOOM_CONFIG[zoom];
  const days = Math.ceil((range.max.getTime() - range.min.getTime()) / 86400000);
  return days * dayWidth;
}
