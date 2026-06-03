import Papa from 'papaparse';
export function exportToJson(project, tasks) {
    const data = {
        version: '1.1',
        exportedAt: new Date().toISOString(),
        project,
        tasks,
    };
    return JSON.stringify(data, null, 2);
}
export function importFromJson(jsonStr) {
    const data = JSON.parse(jsonStr);
    if (!Array.isArray(data.tasks))
        throw new Error('Invalid format: tasks array missing');
    return { tasks: data.tasks, project: data.project };
}
export function exportToCsv(tasks) {
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
export function importFromCsv(csvStr) {
    const result = Papa.parse(csvStr, { header: true, skipEmptyLines: true });
    const tasks = result.data.map(row => ({
        id: row.id || undefined,
        parentId: row.parentId || null,
        title: row.title ?? '',
        summary: row.summary ?? '',
        description: row.description ?? '',
        status: row.status || 'todo',
        priority: row.priority || 'medium',
        progress: Number(row.progress) || 0,
        assignee: row.assignee ?? '',
        startDate: row.startDate || null,
        endDate: row.endDate || null,
        isMilestone: row.isMilestone === '1',
        predecessors: row.predecessors ? row.predecessors.split(';').filter(Boolean) : [],
    }));
    return { tasks };
}
export function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}
