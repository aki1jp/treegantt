import dayjs from 'dayjs';
import type { ZoomLevel, Task } from '../types/task';

/**
 * 'YYYY-MM-DD' 文字列をブラウザのローカル午前0時の Date に変換する。
 * `new Date('YYYY-MM-DD')` は常に UTC 0 時として解釈されるため、
 * ローカルタイムゾーンがある環境では列の境界がズレる。dayjs 経由でローカル解釈する。
 */
function parseDateStr(str: string): Date {
  return dayjs(str).toDate();
}

export type GanttPeriod = '2w' | '1m' | '3m' | '6m';

export const PERIOD_DAYS: Record<GanttPeriod, number> = {
  '2w': 14, '1m': 30, '3m': 91, '6m': 183,
};

export const ZOOM_CONFIG: Record<ZoomLevel, { dayWidth: number; headerFormat: string }> = {
  day:   { dayWidth: 28, headerFormat: 'M/D' },
  week:  { dayWidth: 8,  headerFormat: 'M月WW' },
  month: { dayWidth: 3,  headerFormat: 'YYYY-MM' },
};

export const ROW_HEIGHT_PX = 36;

export function dateToX(date: string, minDate: Date, zoom: ZoomLevel): number {
  const { dayWidth } = ZOOM_CONFIG[zoom];
  return Math.round((parseDateStr(date).getTime() - minDate.getTime()) / 86400000) * dayWidth;
}

export function defaultGanttStart(zoom: ZoomLevel): string {
  const d = dayjs();
  if (zoom === 'month') return d.subtract(1, 'month').startOf('month').format('YYYY-MM-DD');
  if (zoom === 'week')  return d.subtract(1, 'week').startOf('week').format('YYYY-MM-DD');
  return d.subtract(1, 'day').format('YYYY-MM-DD');
}

export function calcGanttRange(
  tasks: Task[],
  startDate?: string,
  period?: GanttPeriod,
  zoom?: ZoomLevel,
): { min: Date; max: Date } {
  const periodDays = period ? PERIOD_DAYS[period] : 91;

  if (startDate) {
    // 手動モード: 明示的な開始日 + 期間
    const minTime = parseDateStr(startDate).getTime();
    return { min: new Date(minTime), max: new Date(minTime + periodDays * 86400000) };
  }

  // 自動モード: タスク日付から範囲を計算し、最低でも period 分を確保
  const dates = tasks.flatMap(t => [t.startDate, t.endDate]).filter(Boolean) as string[];
  const defaultStart = zoom
    ? parseDateStr(defaultGanttStart(zoom)).getTime()
    : dayjs().subtract(7, 'day').startOf('day').valueOf();
  let minTime: number;
  let maxTime: number;

  if (dates.length === 0) {
    minTime = defaultStart;
    maxTime = minTime + periodDays * 86400000;
  } else {
    const times = dates.map(d => parseDateStr(d).getTime());
    minTime = defaultStart;
    const taskMaxEnd = Math.max(...times) + 5 * 86400000;
    maxTime = Math.max(taskMaxEnd, minTime + periodDays * 86400000);
  }

  return { min: new Date(minTime), max: new Date(maxTime) };
}

/** ブラウザのローカル日付を YYYY-MM-DD で返す（toISOString は UTC 基準になるため使わない） */
export function todayStr(): string {
  return dayjs().format('YYYY-MM-DD');
}

export function calcTodayX(minDate: Date, zoom: ZoomLevel): number {
  return dateToX(todayStr(), minDate, zoom);
}

/** 現在時刻（ローカル時・分を含む）の X 座標を返す */
export function calcNowX(minDate: Date, zoom: ZoomLevel, now = new Date()): number {
  const { dayWidth } = ZOOM_CONFIG[zoom];
  const todayColX = dateToX(dayjs(now).format('YYYY-MM-DD'), minDate, zoom);
  const fraction = (now.getHours() * 60 + now.getMinutes()) / 1440;
  return todayColX + fraction * dayWidth;
}

// イナズマライン: 各タスクの進捗率をX座標に変換し、行の中心点を斜線でつなぐ
export interface LightningPoint { x: number; y: number; }

export function calcLightningPoints(
  flatRows: { task: Task; effectiveProgress: number; hasChildren?: boolean; isCollapsed?: boolean }[],
  minDate: Date,
  zoom: ZoomLevel,
  rowHeight: number = ROW_HEIGHT_PX,
): LightningPoint[] | null {
  const { dayWidth } = ZOOM_CONFIG[zoom];
  const nowX = Math.round(calcNowX(minDate, zoom));
  const pts: LightningPoint[] = [];

  flatRows.forEach(({ task, effectiveProgress, hasChildren = false, isCollapsed = false }, i) => {
    // 親タスクが展開中 → 子が各自描画するのでスキップ
    if (hasChildren && !isCollapsed) return;

    const centerY = i * rowHeight + rowHeight / 2;

    if (task.startDate && task.endDate && !task.isMilestone) {
      if (task.status === 'pending') return; // pending はイナズマラインをスキップ
      let pointX: number;
      if (task.status === 'wip') {
        const startX = dateToX(task.startDate, minDate, zoom);
        const endX   = dateToX(task.endDate,   minDate, zoom) + dayWidth;
        pointX = Math.round(startX + (endX - startX) * effectiveProgress / 100);
      } else {
        // todo / done / wait → 現在時刻を頂点とする（時・分を含む）
        pointX = nowX;
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
    return Math.max(1, Math.round((parseDateStr(t.endDate).getTime() - parseDateStr(t.startDate).getTime()) / 86400000) + 1);
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

// fromId の先行チェーンを DFS し toId に到達できれば循環依存
export function wouldCreateDepCycle(fromId: string, toId: string, taskById: Map<string, Task>): boolean {
  const visited = new Set<string>();
  const queue = [fromId];
  while (queue.length > 0) {
    const cur = queue.pop()!;
    if (cur === toId) return true;
    if (visited.has(cur)) continue;
    visited.add(cur);
    taskById.get(cur)?.predecessors.forEach(p => queue.push(p));
  }
  return false;
}

// 期間（日数）= endDate - startDate + 1。日付なし・逆順は null
export function calcDuration(task: Task): number | null {
  if (!task.startDate || !task.endDate) return null;
  const days = Math.round(
    (parseDateStr(task.endDate).getTime() - parseDateStr(task.startDate).getTime()) / 86400000,
  ) + 1;
  return days >= 1 ? days : null;
}

export function ganttTotalWidth(tasks: Task[], zoom: ZoomLevel, startDate?: string, period?: GanttPeriod): number {
  const range = calcGanttRange(tasks, startDate, period);
  const { dayWidth } = ZOOM_CONFIG[zoom];
  const days = Math.ceil((range.max.getTime() - range.min.getTime()) / 86400000);
  return days * dayWidth;
}

export function addDays(date: string, n: number): string {
  return dayjs(date).add(n, 'day').format('YYYY-MM-DD');
}

/** ピクセルオフセット → ローカル日付文字列。toISOString は UTC 基準になるため dayjs を使う */
export function xToDateStr(relX: number, minDate: Date, dayWidth: number): string {
  const days = Math.floor(relX / dayWidth);
  return dayjs(minDate).add(days, 'day').format('YYYY-MM-DD');
}

// ── マルチレベルヘッダー ─────────────────────────────

export type HeaderCell = { label: string; x: number; width: number; dow?: number };
export type HeaderRow  = { level: 'year' | 'month' | 'week' | 'day' | 'dow'; cells: HeaderCell[] };

const DOW_LABELS = ['日', '月', '火', '水', '木', '金', '土'] as const;

export function buildMultiLevelHeaders(
  min: Date, max: Date, zoom: ZoomLevel,
  levels: { year: boolean; month: boolean; week: boolean; day: boolean },
): HeaderRow[] {
  const { dayWidth } = ZOOM_CONFIG[zoom];
  const toX = (d: dayjs.Dayjs) =>
    Math.round((d.toDate().getTime() - min.getTime()) / 86400000) * dayWidth;

  const rows: HeaderRow[] = [];

  if (levels.year) {
    const cells: HeaderCell[] = [];
    let cur = dayjs(min).startOf('year');
    const end = dayjs(max);
    while (cur.isBefore(end)) {
      const next = cur.add(1, 'year');
      const x = Math.max(0, toX(cur));
      cells.push({ label: cur.format('YYYY'), x, width: toX(next.isBefore(end) ? next : end) - x });
      cur = next;
    }
    rows.push({ level: 'year', cells });
  }

  if (levels.month) {
    const cells: HeaderCell[] = [];
    let cur = dayjs(min).startOf('month');
    const end = dayjs(max);
    while (cur.isBefore(end)) {
      const next = cur.add(1, 'month');
      const x = Math.max(0, toX(cur));
      cells.push({ label: cur.format('YYYY-MM'), x, width: toX(next.isBefore(end) ? next : end) - x });
      cur = next;
    }
    rows.push({ level: 'month', cells });
  }

  if (levels.week) {
    const cells: HeaderCell[] = [];
    let cur = dayjs(min).startOf('week');
    const end = dayjs(max);
    while (cur.isBefore(end)) {
      const next = cur.add(1, 'week');
      const x = Math.max(0, toX(cur));
      const thu = cur.add(3, 'day'); // 木曜日でどの月の週かを決定（ISO基準）
      const label = `${thu.month() + 1}月${Math.ceil(thu.date() / 7)}W`;
      cells.push({ label, x, width: toX(next.isBefore(end) ? next : end) - x });
      cur = next;
    }
    rows.push({ level: 'week', cells });
  }

  if (levels.day) {
    const dayCells: HeaderCell[] = [];
    const dowCells: HeaderCell[] = [];
    let cur = dayjs(min);
    const end = dayjs(max);
    while (cur.isBefore(end)) {
      const x = toX(cur);
      const dow = cur.day();
      dayCells.push({ label: cur.format('D'), x, width: dayWidth, dow });
      dowCells.push({ label: DOW_LABELS[dow], x, width: dayWidth, dow });
      cur = cur.add(1, 'day');
    }
    rows.push({ level: 'day', cells: dayCells });
    rows.push({ level: 'dow', cells: dowCells });
  }

  return rows;
}
