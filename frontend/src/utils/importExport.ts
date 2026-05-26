import Papa from 'papaparse';
import type { Task, Project } from '../types/task';

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
  return { tasks: data.tasks, project: data.project };
}

export function exportToCsv(tasks: Task[]): string {
  const seqMap = new Map(tasks.map(t => [t.id, t.seq]));
  const rows = tasks.map(t => ({
    id: t.seq,
    parentId: t.parentId != null ? (seqMap.get(t.parentId) ?? '') : '',
    title: t.title,
    summary: t.summary,
    description: t.description,
    status: t.status,
    priority: t.priority,
    progress: t.progress,
    assignee: t.assignee,
    startDate: t.startDate ?? '',
    endDate: t.endDate ?? '',
    isMilestone: t.isMilestone ? '1' : '0',
    predecessors: t.predecessors.map(p => seqMap.get(p)).filter(v => v != null).join(';'),
  }));
  return Papa.unparse(rows);
}

export function importFromCsv(csvStr: string): { tasks: Partial<Task>[] } {
  const result = Papa.parse<Record<string, string>>(csvStr, { header: true, skipEmptyLines: true });
  const tasks = result.data.map(row => ({
    id:           row.id || undefined,
    parentId:     row.parentId || null,
    title:        row.title ?? '',
    summary:      row.summary ?? '',
    description:  row.description ?? '',
    status:       (row.status as Task['status']) || 'todo',
    priority:     (row.priority as Task['priority']) || 'medium',
    progress:     Number(row.progress) || 0,
    assignee:     row.assignee ?? '',
    startDate:    row.startDate || null,
    endDate:      row.endDate || null,
    isMilestone:  row.isMilestone === '1',
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
