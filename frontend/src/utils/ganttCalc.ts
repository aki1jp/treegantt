import type { ZoomLevel, Task } from '../types/task';

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

const THREE_MONTHS_MS = 90 * 86400000;

export function calcGanttRange(tasks: Task[]): { min: Date; max: Date } {
  const today = Date.now();
  const dates = tasks.flatMap(t => [t.startDate, t.endDate]).filter(Boolean) as string[];

  let minTime: number;
  let maxTime: number;

  if (dates.length === 0) {
    // No tasks with dates — show today ± 45 days
    minTime = today - 7 * 86400000;
    maxTime = today + THREE_MONTHS_MS;
  } else {
    const times = dates.map(d => new Date(d).getTime());
    minTime = Math.min(...times) - 3 * 86400000;
    maxTime = Math.max(...times) + 5 * 86400000;
  }

  // Ensure at least 3 months are shown
  if (maxTime - minTime < THREE_MONTHS_MS) {
    maxTime = minTime + THREE_MONTHS_MS;
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

export function ganttTotalWidth(tasks: Task[], zoom: ZoomLevel): number {
  const range = calcGanttRange(tasks);
  if (!range) return 800;
  const { dayWidth } = ZOOM_CONFIG[zoom];
  const days = Math.ceil((range.max.getTime() - range.min.getTime()) / 86400000);
  return days * dayWidth;
}
