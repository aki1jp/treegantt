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
  const rows = tasks.map(t => ({
    id: t.id,
    title: t.title,
    summary: t.summary,
    description: t.description,
    status: t.status,
    priority: t.priority,
    progress: t.progress,
    assignee: t.assignee,
    startDate: t.startDate ?? '',
    endDate: t.endDate ?? '',
    predecessors: t.predecessors.join(';'),
  }));
  return Papa.unparse(rows);
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
