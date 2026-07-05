import Papa from 'papaparse';
import type { Task, Project } from '../types/task';
import { normalizeDateStr } from './ganttCalc';

export interface ExportData {
  version: string;
  exportedAt: string;
  project: Pick<Project, 'id' | 'name'>;
  tasks: Task[];
}

export function exportToJson(project: Pick<Project, 'id' | 'name'>, tasks: Task[]): string {
  const data: ExportData = {
    version: '1.1',
    exportedAt: new Date().toISOString(),
    project,
    tasks,
  };
  return JSON.stringify(data, null, 2);
}

export function importFromJson(jsonStr: string): { tasks: Task[]; project: Pick<Project, 'id' | 'name'> } {
  const data = JSON.parse(jsonStr) as ExportData;
  if (!Array.isArray(data.tasks)) throw new Error('Invalid format: tasks array missing');
  // 日付は ISO に正規化（スラッシュ区切り等の非 ISO 形式が比較で誤判定されるのを防ぐ）
  const tasks = data.tasks.map(t => ({
    ...t,
    startDate: t.startDate ? normalizeDateStr(t.startDate) : t.startDate,
    endDate:   t.endDate   ? normalizeDateStr(t.endDate)   : t.endDate,
  }));
  return { tasks, project: data.project };
}

// CSV 式インジェクション対策（OWASP推奨）: Excel等はセル先頭が =+-@ のとき数式として解釈する。
// ユーザー入力由来の文字列列（title/summary/description/assignee）にのみ適用し、
// 該当セルの先頭にシングルクォートを付与して無害化する。importFromCsv で往復復元する。
const RISKY_CSV_PREFIX = /^[=+\-@]/;
function neutralizeCsvFormula(val: string): string {
  return RISKY_CSV_PREFIX.test(val) ? `'${val}` : val;
}
// neutralizeCsvFormula で付与した先頭 ' を除去して元の値へ復元する（round-trip）。
// ' で始まっていても直後が =+-@ でなければ通常の値としてそのまま扱う。
function denormalizeCsvFormula(val: string): string {
  return val.length >= 2 && val[0] === "'" && RISKY_CSV_PREFIX.test(val[1]) ? val.slice(1) : val;
}

export function exportToCsv(tasks: Task[]): string {
  const seqMap = new Map(tasks.map(t => [t.id, t.seq]));
  const rows = tasks.map(t => ({
    id: t.seq,
    parentId: t.parentId != null ? (seqMap.get(t.parentId) ?? '') : '',
    title: neutralizeCsvFormula(t.title),
    summary: neutralizeCsvFormula(t.summary),
    description: neutralizeCsvFormula(t.description),
    status: t.status,
    priority: t.priority,
    progress: t.progress,
    assignee: neutralizeCsvFormula(t.assignee),
    startDate: t.startDate ?? '',
    endDate: t.endDate ?? '',
    isMilestone: t.isMilestone ? '1' : '0',
    titleColor: t.titleColor ?? '',
    titleBgColor: t.titleBgColor ?? '',
    estimateMinutes: t.estimateMinutes ?? '',
    predecessors: t.predecessors.map(p => seqMap.get(p)).filter(v => v != null).join(';'),
  }));
  return Papa.unparse(rows);
}

export function importFromCsv(csvStr: string): { tasks: Partial<Task>[] } {
  const result = Papa.parse<Record<string, string>>(csvStr, { header: true, skipEmptyLines: true });
  const tasks = result.data.map(row => ({
    id:           row.id || undefined,
    parentId:     row.parentId || null,
    title:        denormalizeCsvFormula(row.title ?? ''),
    summary:      denormalizeCsvFormula(row.summary ?? ''),
    description:  denormalizeCsvFormula(row.description ?? ''),
    status:       (row.status as Task['status']) || 'todo',
    priority:     (row.priority as Task['priority']) || 'medium',
    progress:     Number(row.progress) || 0,
    assignee:     denormalizeCsvFormula(row.assignee ?? ''),
    startDate:    row.startDate ? normalizeDateStr(row.startDate) : null,
    endDate:      row.endDate ? normalizeDateStr(row.endDate) : null,
    isMilestone:  row.isMilestone === '1',
    titleColor:   row.titleColor || null,
    titleBgColor: row.titleBgColor || null,
    estimateMinutes: row.estimateMinutes ? Number(row.estimateMinutes) : null,
    predecessors: row.predecessors ? row.predecessors.split(';').filter(Boolean) : [],
  }));
  return { tasks };
}

export function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
