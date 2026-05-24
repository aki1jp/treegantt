import type { Task } from '../types/task';

export interface WorkloadMatrix {
  assignees: string[];
  days: string[];
  /** matrix[assigneeIndex][dayIndex] = task count */
  matrix: number[][];
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
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
    return { assignees: [], days: assignees.length === 0 ? [] : days, matrix: [] };
  }

  // Initialize matrix
  const matrix: number[][] = assignees.map(() => new Array(days.length).fill(0));
  const dayIndex = new Map(days.map((d, i) => [d, i]));

  for (const t of eligible) {
    const aIdx = assignees.indexOf(t.assignee);
    // clamp task dates to [minStr, maxStr]
    const taskStart = t.startDate! < minStr ? minStr : t.startDate!;
    const taskEnd   = t.endDate!   > maxStr ? maxStr : t.endDate!;
    let d = taskStart;
    while (d <= taskEnd) {
      const dIdx = dayIndex.get(d);
      if (dIdx !== undefined) matrix[aIdx][dIdx]++;
      d = addDays(d, 1);
    }
  }

  return { assignees, days, matrix };
}

/** Map count to heat color */
export function workloadColor(count: number): string {
  if (count === 0) return 'transparent';
  if (count === 1) return 'rgba(34,197,94,0.55)';   // green
  if (count === 2) return 'rgba(234,179,8,0.65)';    // yellow
  if (count === 3) return 'rgba(249,115,22,0.7)';    // orange
  return 'rgba(239,68,68,0.8)';                       // red 4+
}
