import { useState, useEffect, useRef } from 'react';
import * as Y from 'yjs';
import { useYjs } from './hooks/useYjs';
import { useTasks } from './hooks/useTasks';
import { useTaskStore } from './store/taskStore';
import { Toolbar } from './components/Toolbar/Toolbar';
import { TodoList } from './components/TodoList/TodoList';
import { GanttChart } from './components/Gantt/GanttChart';
import { TaskModal } from './components/TaskModal/TaskModal';
import type { Task, Project } from './types/task';
import { exportToJson, exportToCsv, importFromJson, downloadFile } from './utils/importExport';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

async function apiFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${API_BASE}/api/v1${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.status === 204 ? null : res.json();
}

export default function App() {
  const [projects, setProjects]         = useState<Project[]>([]);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [modalTask, setModalTask]       = useState<Task | null | undefined>(undefined);
  const [loading, setLoading]           = useState(true);

  const { activeTab, tasks, setTasks } = useTaskStore();

  const { yTasks } = useYjs(currentProject?.id ?? '_none');
  const { createTask, updateTask, deleteTask } = useTasks(yTasks, currentProject?.id ?? '');

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    apiFetch('/projects').then(d => {
      setProjects(d.projects);
      if (d.projects.length > 0) setCurrentProject(d.projects[0]);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!currentProject) return;
    apiFetch(`/projects/${currentProject.id}/tasks`).then(d => {
      setTasks(d.tasks);
      // Y.js に既存タスクを同期
      const ydoc = yTasks.doc!;
      ydoc.transact(() => {
        for (const task of d.tasks as Task[]) {
          const yTask = new Y.Map<unknown>();
          for (const [k, v] of Object.entries(task)) yTask.set(k, v);
          yTasks.set(task.id, yTask);
        }
      });
    });
  }, [currentProject]);

  async function handleCreateProject() {
    const name = prompt('プロジェクト名を入力してください');
    if (!name) return;
    const data = await apiFetch('/projects', { method: 'POST', body: JSON.stringify({ name }) });
    setProjects(prev => [data.project, ...prev]);
    setCurrentProject(data.project);
  }

  async function handleSaveTask(data: Partial<Task> & { title: string }) {
    if (!currentProject) return;
    try {
      if (modalTask) {
        await updateTask(modalTask.id, data);
      } else {
        await createTask({ ...data, projectId: currentProject.id });
      }
      setModalTask(undefined);
    } catch (err) {
      alert('保存に失敗しました: ' + (err as Error).message);
    }
  }

  async function handleDeleteTask(id: string) {
    if (!confirm('このタスクを削除しますか？')) return;
    await deleteTask(id);
  }

  function handleExportJson() {
    if (!currentProject) return;
    const json = exportToJson(currentProject, tasks);
    downloadFile(json, `taskflow-${currentProject.id}.json`, 'application/json');
  }

  function handleExportCsv() {
    if (!currentProject) return;
    const csv = exportToCsv(tasks);
    downloadFile(csv, `taskflow-${currentProject.id}.csv`, 'text/csv');
  }

  async function handleImport() {
    fileInputRef.current?.click();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !currentProject) return;
    const text = await file.text();
    try {
      const { tasks: importedTasks } = importFromJson(text);
      await apiFetch(`/projects/${currentProject.id}/import`, {
        method: 'POST',
        body: JSON.stringify({ tasks: importedTasks }),
      });
      const data = await apiFetch(`/projects/${currentProject.id}/tasks`);
      setTasks(data.tasks);
    } catch (err) {
      alert('インポートに失敗しました: ' + (err as Error).message);
    }
    e.target.value = '';
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}>読み込み中...</div>;

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* プロジェクト選択ヘッダー */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px',
        background: '#1e1b4b', color: '#fff',
      }}>
        <span style={{ fontWeight: 700, fontSize: 16 }}>TaskFlow</span>
        <div style={{ marginLeft: 16, display: 'flex', gap: 8 }}>
          {projects.map(p => (
            <button key={p.id} onClick={() => setCurrentProject(p)} style={{
              padding: '4px 12px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: 13,
              background: currentProject?.id === p.id ? '#4f46e5' : 'transparent',
              color: '#fff',
            }}>
              {p.name}
            </button>
          ))}
          <button onClick={handleCreateProject} style={{
            padding: '4px 12px', borderRadius: 4, border: '1px solid rgba(255,255,255,.3)',
            cursor: 'pointer', fontSize: 13, background: 'transparent', color: '#fff',
          }}>
            + プロジェクト
          </button>
        </div>
      </div>

      {currentProject ? (
        <>
          <Toolbar
            onAddTask={() => setModalTask(null)}
            onImport={handleImport}
            onExportJson={handleExportJson}
            onExportCsv={handleExportCsv}
          />

          <div style={{ flex: 1, overflow: 'hidden' }}>
            {activeTab === 'todo' ? (
              <div style={{ height: '100%', overflowY: 'auto' }}>
                <TodoList
                  onEditTask={(task) => setModalTask(task)}
                  onDeleteTask={handleDeleteTask}
                />
              </div>
            ) : (
              <GanttChart onEditTask={(task) => setModalTask(task)} />
            )}
          </div>
        </>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          <p style={{ color: '#6b7280' }}>プロジェクトがありません</p>
          <button onClick={handleCreateProject} style={{
            padding: '10px 24px', background: '#4f46e5', color: '#fff',
            border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 15, fontWeight: 600,
          }}>
            最初のプロジェクトを作成
          </button>
        </div>
      )}

      {/* タスクモーダル */}
      {modalTask !== undefined && (
        <TaskModal
          task={modalTask}
          allTasks={tasks}
          onSave={handleSaveTask}
          onClose={() => setModalTask(undefined)}
        />
      )}

      <input ref={fileInputRef} type="file" accept=".json" style={{ display: 'none' }}
        onChange={handleFileChange} />
    </div>
  );
}
