import { useState, useRef } from 'react';
import { apiFetch } from '../utils/api';
import { exportToJson, exportToCsv, importFromJson, importFromCsv, downloadFile } from '../utils/importExport';
function exportFileName(project, ext) {
    const safeName = project.name.replace(/[/\\:*?"<>|]/g, '_');
    const now = new Date();
    const ts = now.getFullYear().toString()
        + String(now.getMonth() + 1).padStart(2, '0')
        + String(now.getDate()).padStart(2, '0')
        + '-'
        + String(now.getHours()).padStart(2, '0')
        + String(now.getMinutes()).padStart(2, '0')
        + String(now.getSeconds()).padStart(2, '0');
    return `treegantt-${safeName}-${ts}.${ext}`;
}
export function useImportExport(currentProject, tasks, setTasks) {
    const [importMode, setImportMode] = useState(null);
    const fileInputRef = useRef(null);
    function handleExportJson() {
        if (!currentProject)
            return;
        downloadFile(exportToJson(currentProject, tasks), exportFileName(currentProject, 'json'), 'application/json');
    }
    function handleExportCsv() {
        if (!currentProject)
            return;
        downloadFile(exportToCsv(tasks), exportFileName(currentProject, 'csv'), 'text/csv');
    }
    function handleImportClick(mode) {
        setImportMode(mode);
        fileInputRef.current?.click();
    }
    async function handleFileChange(e) {
        const file = e.target.files?.[0];
        if (!file || !currentProject)
            return;
        const text = await file.text();
        const mode = importMode ?? 'append';
        setImportMode(null);
        try {
            const isCsv = file.name.endsWith('.csv') || file.type === 'text/csv';
            const { tasks: importedTasks } = isCsv ? importFromCsv(text) : importFromJson(text);
            await apiFetch(`/projects/${currentProject.id}/import`, {
                method: 'POST',
                body: JSON.stringify({ tasks: importedTasks, mode }),
            });
            const data = await apiFetch(`/projects/${currentProject.id}/tasks`);
            setTasks(data.tasks);
        }
        catch (err) {
            alert('インポートに失敗しました: ' + err.message);
        }
        e.target.value = '';
    }
    return { fileInputRef, handleExportJson, handleExportCsv, handleImportClick, handleFileChange };
}
