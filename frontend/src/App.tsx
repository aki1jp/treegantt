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
import { DeleteTaskDialog, type DeleteMode } from './components/DeleteTaskDialog/DeleteTaskDialog';
import type { Task, Project } from './types/task';
import { apiFetch, fetchAllTasks, fetchHealth, fetchSettings } from './utils/api';
import { useSettingsStore } from './store/settingsStore';
import { resolveCapacityMinutes, resolveWorkingDays } from './utils/duration';
import { makeCopyTitle } from './utils/copyTitle';
import { mapInternalPredecessors } from './utils/copyDeps';
import { computeInsertOrder } from './utils/ganttCalc';

export default function App() {
  const [modalTask, setModalTask]           = useState<Task | null | undefined>(undefined);
  const [modalIsMilestone, setModalIsMilestone] = useState(false);
  const [modalInitialParentId, setModalInitialParentId] = useState<string | undefined>(undefined);

  const [taskCounts, setTaskCounts] = useState<Record<string, number>>({});
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);
  const [backendVersion, setBackendVersion] = useState<string | null>(null);

  const { tasks, setTasks, needsReload, setNeedsReload, theme, setTheme } = useTaskStore();
  const { projects, currentProject, setCurrentProject, loading, createProject, renameProject, updateProjectColor, deleteProject } = useProjects();

  useTheme();
  useWebSocket(currentProject?.id ?? null);

  const { createTask, updateTask, deleteTask, reorderTasks, batchCreateTasks } = useTasks(currentProject?.id ?? '');
  const { fileInputRef, handleExportJson, handleExportCsv, handleImportClick, handleFileChange } =
    useImportExport(currentProject, tasks, setTasks);

  // バックエンドのバージョンを初回ロード時に取得（ハンバーガーメニュー表示用）
  useEffect(() => {
    let alive = true;
    fetchHealth()
      .then(h => { if (alive) setBackendVersion(h.version ?? null); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // リソース設定（アプリ既定）を初回ロード時に取得（失敗時はハードコード既定のまま）
  const setAppSettings = useSettingsStore(s => s.setAppSettings);
  const appSettings = useSettingsStore(s => s.appSettings);
  useEffect(() => {
    let alive = true;
    fetchSettings()
      .then(s => { if (alive) setAppSettings(s); })
      .catch(() => {});
    return () => { alive = false; };
  }, [setAppSettings]);

  // 予定工数の 1d/1w 換算に使う実効値（プロジェクト上書き ?? アプリ既定 ?? ハードコード）
  const effectiveCapacityMinutes = resolveCapacityMinutes(
    currentProject?.capacityMinutesPerDay, appSettings.capacityMinutesPerDay);
  const effectiveWorkingDays = resolveWorkingDays(
    currentProject?.workingDays, appSettings.workingDays);

  // プロジェクト切り替え時: タスクを REST から即時取得
  useEffect(() => {
    if (!currentProject) return;
    fetchAllTasks(currentProject.id)
      .then(d => {
        setTasks(d.tasks);
        setTaskCounts(prev => ({ ...prev, [currentProject.id]: d.total }));
      })
      .catch(() => {});
  }, [currentProject?.id]);

  // 全プロジェクトのタスク件数を初回ロード時に並列取得
  useEffect(() => {
    if (projects.length === 0) return;
    Promise.all(
      projects.map(p =>
        apiFetch(`/projects/${p.id}/tasks?limit=1`)
          .then(d => ({ id: p.id, total: d.total as number }))
          .catch(() => ({ id: p.id, total: 0 }))
      )
    ).then(results => {
      setTaskCounts(Object.fromEntries(results.map(r => [r.id, r.total])));
    });
  }, [projects.map(p => p.id).join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  // reload イベント受信時（import 後など）: タスクを再フェッチ
  useEffect(() => {
    if (!needsReload || !currentProject) return;
    setNeedsReload(false);
    fetchAllTasks(currentProject.id)
      .then(d => setTasks(d.tasks))
      .catch(() => {});
  }, [needsReload]);

  async function handleCreateProject() {
    const name = prompt('プロジェクト名を入力してください');
    if (!name) return;
    await createProject(name);
  }

  async function handleRenameProject(project: Project) {
    const name = prompt('新しいプロジェクト名を入力してください', project.name);
    if (!name || name === project.name) return;
    try {
      await renameProject(project, name);
    } catch (err) {
      alert('名前の変更に失敗しました: ' + (err as Error).message);
    }
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

  function countDescendants(id: string): number {
    return tasks
      .filter(t => t.parentId === id)
      .reduce((sum, child) => sum + 1 + countDescendants(child.id), 0);
  }

  async function handleDeleteTask(id: string) {
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    // 子を持たないタスクは従来通りの確認ダイアログ
    if (!tasks.some(t => t.parentId === id)) {
      if (!confirm('このタスクを削除しますか？')) return;
      try {
        await deleteTask(id);
      } catch (err) {
        alert('削除に失敗しました: ' + (err as Error).message);
      }
      return;
    }
    setDeleteTarget(task);
  }

  async function handleDeleteResolve(mode: DeleteMode) {
    if (!deleteTarget) return;
    setDeleteTarget(null);
    try {
      await deleteTask(deleteTarget.id, mode);
    } catch (err) {
      alert('削除に失敗しました: ' + (err as Error).message);
    }
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

  function handleAddSubMilestone(parentId: string) {
    setModalIsMilestone(true);
    setModalInitialParentId(parentId);
    setModalTask(null);
  }

  async function handleCopyInsert(
    source: Task,
    parentId: string | null,
    afterTaskId: string | null,
    beforeTaskId?: string | null,
  ) {
    if (!currentProject) return;
    const allTasksSnapshot = [...tasks];

    // コピー先の兄弟タスク名と衝突する場合のみ「(コピー)」「(コピーN)」を採番
    const siblingTitles = new Set(
      allTasksSnapshot.filter(t => t.parentId === parentId).map(t => t.title)
    );
    const rootTitle = makeCopyTitle(source.title, siblingTitles);

    // ルートタスクの挿入 order を事前計算
    const rootSiblings = allTasksSnapshot.filter(t => t.parentId === parentId);
    const targetOrder = computeInsertOrder(rootSiblings, afterTaskId, beforeTaskId);

    // サブツリーをフラットな配列（parentRef インデックス方式）に展開
    type BatchInput = { parentRef: number | null; title: string; [key: string]: unknown };
    const batchInputs: BatchInput[] = [];
    const sourceTasksFlat: Task[] = [];

    function buildBatch(task: Task, parentRef: number | null, isRoot: boolean): void {
      const idx = batchInputs.length;
      batchInputs.push({
        parentRef,
        title:        isRoot ? rootTitle : task.title,
        summary:      task.summary,
        description:  task.description,
        status:       task.status,
        priority:     task.priority,
        progress:     task.progress,
        assignee:     task.assignee,
        startDate:    task.startDate,
        endDate:      task.endDate,
        isMilestone:  task.isMilestone,
        titleColor:   task.titleColor,
        titleBgColor: task.titleBgColor,
        estimateMinutes: task.estimateMinutes,
        order:        isRoot ? targetOrder : undefined,
      });
      sourceTasksFlat.push(task);
      const children = allTasksSnapshot
        .filter(t => t.parentId === task.id)
        .sort((a, b) => a.order - b.order);
      for (const child of children) {
        buildBatch(child, idx, false);
      }
    }

    buildBatch(source, null, true);

    try {
      // バッチ API で1リクエストにまとめる（v2.69 以前のシーケンシャル POST を置き換え）
      const newTasks = await batchCreateTasks(batchInputs, parentId);

      // 旧ID→新ID マップを構築して predecessor を付け替え
      const idMap = new Map<string, string>();
      sourceTasksFlat.forEach((t, i) => idMap.set(t.id, newTasks[i].id));
      for (const u of mapInternalPredecessors(sourceTasksFlat, idMap)) {
        await updateTask(u.id, { predecessors: u.predecessors });
      }

      const newRootTask = newTasks[0];
      const siblings = allTasksSnapshot
        .filter(t => t.parentId === parentId && t.id !== newRootTask.id)
        .sort((a, b) => a.order - b.order);

      let ordered: Task[];
      if (beforeTaskId) {
        const idx = siblings.findIndex(t => t.id === beforeTaskId);
        if (idx === -1) return;
        ordered = [...siblings.slice(0, idx), newRootTask, ...siblings.slice(idx)];
      } else if (afterTaskId) {
        const idx = siblings.findIndex(t => t.id === afterTaskId);
        ordered = idx === -1
          ? [...siblings, newRootTask]
          : [...siblings.slice(0, idx + 1), newRootTask, ...siblings.slice(idx + 1)];
      } else {
        return;
      }

      await reorderTasks(ordered.map((t, i) => ({ id: t.id, order: i + 1, parentId })));
    } catch (err) {
      alert('コピーに失敗しました: ' + (err as Error).message);
    }
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
        <div style={{ marginLeft: 16, display: 'flex', gap: 8, alignItems: 'center', flex: 1, minWidth: 0 }}>
          <ProjectTabs
            projects={projects}
            currentProject={currentProject}
            onSelect={setCurrentProject}
            onDelete={handleDeleteProject}
            onRename={handleRenameProject}
            onUpdateColor={(project, color) => updateProjectColor(project, color)}
            taskCounts={taskCounts}
          />
          <button onClick={handleCreateProject} style={{
            padding: '4px 12px', borderRadius: 4, border: '1px solid rgba(255,255,255,.3)',
            cursor: 'pointer', fontSize: 13, background: 'transparent', color: '#fff',
            flexShrink: 0,
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
            backendVersion={backendVersion ?? undefined}
          />
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <GanttChart
              projectId={currentProject.id}
              onEditTask={(task) => { setModalIsMilestone(task.isMilestone); setModalTask(task); }}
              onDeleteTask={handleDeleteTask}
              onInlineUpdate={handleInlineUpdate}
              onQuickAdd={handleQuickAdd}
              onAddSubTask={handleAddSubTask}
              onAddSubMilestone={handleAddSubMilestone}
              onReorder={reorderTasks}
              onCopyInsert={handleCopyInsert}
              capacityMinutesPerDay={effectiveCapacityMinutes}
              workingDays={effectiveWorkingDays}
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
            initialParentId={modalInitialParentId}
            onSave={handleSaveTask}
            onClose={() => { setModalTask(undefined); setModalInitialParentId(undefined); }}
          />
        ) : (
          <TaskModal
            task={modalTask}
            allTasks={tasks}
            initialParentId={modalInitialParentId}
            capacityMinutes={effectiveCapacityMinutes}
            workingDaysPerWeek={effectiveWorkingDays.length}
            onSave={handleSaveTask}
            onClose={() => { setModalTask(undefined); setModalInitialParentId(undefined); }}
          />
        )
      )}

      {deleteTarget && (
        <DeleteTaskDialog
          taskTitle={deleteTarget.title}
          descendantCount={countDescendants(deleteTarget.id)}
          onDelete={handleDeleteResolve}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      <input ref={fileInputRef} type="file" accept=".json,.csv" style={{ display: 'none' }}
        onChange={handleFileChange} />
    </div>
  );
}
