import { useState, useEffect } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { useTasks } from './hooks/useTasks';
import { useProjects } from './hooks/useProjects';
import { useImportExport } from './hooks/useImportExport';
import { useTaskStore } from './store/taskStore';
import { useTheme } from './hooks/useTheme';
import { Toolbar } from './components/Toolbar/Toolbar';
import { GanttChart } from './components/Gantt/GanttChart';
import { TaskModal } from './components/TaskModal/TaskModal';
import { MilestoneModal } from './components/MilestoneModal/MilestoneModal';
import { ProjectTabs } from './components/ProjectTabs/ProjectTabs';
import type { Task, Project } from './types/task';
import { apiFetch } from './utils/api';

export default function App() {
  const [modalTask, setModalTask]           = useState<Task | null | undefined>(undefined);
  const [modalIsMilestone, setModalIsMilestone] = useState(false);
  const [modalInitialParentId, setModalInitialParentId] = useState<string | undefined>(undefined);

  const { tasks, setTasks, needsReload, setNeedsReload, theme, setTheme } = useTaskStore();
  const { projects, currentProject, setCurrentProject, loading, createProject, deleteProject } = useProjects();

  useTheme();
  useWebSocket(currentProject?.id ?? null);

  const { createTask, updateTask, deleteTask, reorderTasks } = useTasks(currentProject?.id ?? '');
  const { fileInputRef, handleExportJson, handleExportCsv, handleImportClick, handleFileChange } =
    useImportExport(currentProject, tasks, setTasks);

  // プロジェクト切り替え時: タスクを REST から即時取得
  useEffect(() => {
    if (!currentProject) return;
    apiFetch(`/projects/${currentProject.id}/tasks`)
      .then(d => setTasks(d.tasks))
      .catch(() => {});
  }, [currentProject?.id]);

  // reload イベント受信時（import 後など）: タスクを再フェッチ
  useEffect(() => {
    if (!needsReload || !currentProject) return;
    setNeedsReload(false);
    apiFetch(`/projects/${currentProject.id}/tasks`)
      .then(d => setTasks(d.tasks))
      .catch(() => {});
  }, [needsReload]);

  async function handleCreateProject() {
    const name = prompt('プロジェクト名を入力してください');
    if (!name) return;
    await createProject(name);
  }

  async function handleDeleteProject(project: Project) {
    if (!confirm(`プロジェクト「${project.name}」を削除しますか？\n\n※ このプロジェクトのタスクもすべて削除されます。この操作は取り消せません。`)) return;
    try {
      await deleteProject(project);
    } catch (err) {
      alert('削除に失敗しました: ' + (err as Error).message);
    }
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
      setModalInitialParentId(undefined);
    } catch (err) {
      alert('保存に失敗しました: ' + (err as Error).message);
    }
  }

  async function handleInlineUpdate(id: string, patch: Partial<Task>) {
    try {
      await updateTask(id, patch);
    } catch (err) {
      alert('更新に失敗しました: ' + (err as Error).message);
    }
  }

  async function handleDeleteTask(id: string) {
    if (!confirm('このタスクを削除しますか？')) return;
    await deleteTask(id);
  }

  async function handleQuickAdd(title: string) {
    if (!currentProject) return;
    try {
      await createTask({ title, projectId: currentProject.id });
    } catch (err) {
      alert('追加に失敗しました: ' + (err as Error).message);
    }
  }

  function handleAddSubTask(parentId: string) {
    setModalIsMilestone(false);
    setModalInitialParentId(parentId);
    setModalTask(null);
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', background: 'var(--th-bg)', color: 'var(--th-text)' }}>読み込み中...</div>;

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--th-bg)', color: 'var(--th-text)' }}>
      {/* プロジェクト選択ヘッダー */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px',
        background: '#1e1b4b', color: '#fff', flexShrink: 0,
      }}>
        <span style={{ fontWeight: 700, fontSize: 16 }}>TreeGantt</span>
        <div style={{ marginLeft: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
          <ProjectTabs
            projects={projects}
            currentProject={currentProject}
            onSelect={setCurrentProject}
            onDelete={handleDeleteProject}
          />
          <button onClick={handleCreateProject} style={{
            padding: '4px 12px', borderRadius: 4, border: '1px solid rgba(255,255,255,.3)',
            cursor: 'pointer', fontSize: 13, background: 'transparent', color: '#fff',
          }}>
            + プロジェクト
          </button>
        </div>

        {/* テーマ選択（右端） */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 2 }}>
          {([
            { value: 'light', label: '☀', title: 'ライトモード' },
            { value: 'dark',  label: '🌙', title: 'ダークモード' },
            { value: 'auto',  label: '🖥', title: 'システム設定に従う' },
          ] as const).map(opt => (
            <button
              key={opt.value}
              title={opt.title}
              onClick={() => setTheme(opt.value)}
              style={{
                padding: '3px 7px', borderRadius: 4, border: 'none', cursor: 'pointer',
                fontSize: 14, lineHeight: 1,
                background: theme === opt.value ? 'rgba(255,255,255,0.2)' : 'transparent',
                color: theme === opt.value ? '#fff' : 'rgba(255,255,255,0.5)',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {currentProject ? (
        <>
          <Toolbar
            onAddTask={() => { setModalIsMilestone(false); setModalTask(null); }}
            onAddMilestone={() => { setModalIsMilestone(true); setModalTask(null); }}
            onImport={() => handleImportClick('append')}
            onRestore={() => handleImportClick('restore')}
            onExportJson={handleExportJson}
            onExportCsv={handleExportCsv}
          />
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <GanttChart
              onEditTask={(task) => { setModalIsMilestone(task.isMilestone); setModalTask(task); }}
              onDeleteTask={handleDeleteTask}
              onInlineUpdate={handleInlineUpdate}
              onQuickAdd={handleQuickAdd}
              onAddSubTask={handleAddSubTask}
              onReorder={reorderTasks}
            />
          </div>
        </>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          <p style={{ color: 'var(--th-text-muted)' }}>プロジェクトがありません</p>
          <button onClick={handleCreateProject} style={{
            padding: '10px 24px', background: '#4f46e5', color: '#fff',
            border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 15, fontWeight: 600,
          }}>
            最初のプロジェクトを作成
          </button>
        </div>
      )}

      {modalTask !== undefined && (
        modalIsMilestone ? (
          <MilestoneModal
            task={modalTask}
            allTasks={tasks}
            onSave={handleSaveTask}
            onClose={() => setModalTask(undefined)}
          />
        ) : (
          <TaskModal
            task={modalTask}
            allTasks={tasks}
            initialParentId={modalInitialParentId}
            onSave={handleSaveTask}
            onClose={() => { setModalTask(undefined); setModalInitialParentId(undefined); }}
          />
        )
      )}

      <input ref={fileInputRef} type="file" accept=".json,.csv" style={{ display: 'none' }}
        onChange={handleFileChange} />
    </div>
  );
}
