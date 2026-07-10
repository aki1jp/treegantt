import { useState, useEffect } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { useTasks } from './hooks/useTasks';
import { useProjects } from './hooks/useProjects';
import { useImportExport } from './hooks/useImportExport';
import { useTaskStore } from './store/taskStore';
import { useTheme } from './hooks/useTheme';
import { useTranslation } from './i18n/useTranslation';
import { apiErrorMessage, dictionaries } from './i18n/apiError';
import { Toolbar } from './components/Toolbar/Toolbar';
import { GanttChart } from './components/Gantt/GanttChart';
import { TaskModal } from './components/TaskModal/TaskModal';
import { MilestoneModal } from './components/MilestoneModal/MilestoneModal';
import { ProjectTabs } from './components/ProjectTabs/ProjectTabs';
import { DeleteTaskDialog, type DeleteMode } from './components/DeleteTaskDialog/DeleteTaskDialog';
import type { Task, Project } from './types/task';
import { apiFetch, fetchHealth, fetchSettings, updateAppSettings } from './utils/api';
import { useSettingsStore } from './store/settingsStore';
import { resolveCapacityMinutes, resolveWorkingDays } from './utils/duration';
import { ResourceSettingsModal } from './components/ResourceSettingsModal/ResourceSettingsModal';
import { RefManagerModal } from './components/RefManager/RefManagerModal';
import { mapInternalPredecessors } from './utils/copyDeps';
import { buildCopyBatch, computeCopyInsertOrder } from './utils/copyBatch';
import { useProjectTasks } from './hooks/useProjectTasks';
import { useProjectRefs } from './hooks/useProjectRefs';
import { isReadonlyTask } from './utils/refTasks';
import { showToast } from './store/toastStore';
import { ToastContainer } from './components/Toast/Toast';

export default function App() {
  const [modalTask, setModalTask]           = useState<Task | null | undefined>(undefined);
  const [modalIsMilestone, setModalIsMilestone] = useState(false);
  const [modalInitialParentId, setModalInitialParentId] = useState<string | undefined>(undefined);

  const [taskCounts, setTaskCounts] = useState<Record<string, number>>({});
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);
  // リソース設定モーダル: 'app'=アプリ既定 / Project=そのプロジェクト上書き / null=非表示
  const [settingsModal, setSettingsModal] = useState<'app' | Project | null>(null);
  // クロスプロジェクト参照の管理モーダル（§5.8）
  const [refManagerOpen, setRefManagerOpen] = useState(false);
  const [backendVersion, setBackendVersion] = useState<string | null>(null);

  const { tasks, refTasks, refProjects, setTasks, theme, setTheme, locale, setLocale } = useTaskStore();
  const { t } = useTranslation();
  const {
    projects, currentProject, setCurrentProject, loading, error: projectsError, retry: retryProjects,
    createProject, renameProject, updateProjectColor, updateProjectResource, deleteProject,
  } = useProjects();

  useTheme();
  useWebSocket(currentProject?.id ?? null);

  const { createTask, updateTask, deleteTask, reorderTasks, batchCreateTasks } = useTasks(currentProject?.id ?? '');
  // クロスプロジェクト参照（§5.8）: プロジェクト切替でスナップショットロード（R1）
  const projectRefs = useProjectRefs(currentProject?.id);
  const { fileInputRef, handleExportJson, handleExportCsv, handleImportClick, handleFileChange } =
    useImportExport(currentProject, tasks, setTasks);

  // バックエンドのバージョンを初回ロード時に取得（ハンバーガーメニュー表示用。失敗は付加情報のためトーストのみ）
  useEffect(() => {
    let alive = true;
    fetchHealth()
      .then(h => { if (alive) setBackendVersion(h.version ?? null); })
      .catch((err: Error) => {
        // 空 dep のクロージャで t/locale を固定せず、catch 実行時点の最新 locale を読み直す
        const currentLocale = useTaskStore.getState().locale;
        const msg = dictionaries[currentLocale]['app.toast.versionFetchFailed']
          .replaceAll('{message}', apiErrorMessage(err, currentLocale));
        showToast(msg, 'error');
      });
    return () => { alive = false; };
  }, []);

  // リソース設定（アプリ既定）を初回ロード時に取得（失敗時はハードコード既定のまま。トーストで可視化）
  const setAppSettings = useSettingsStore(s => s.setAppSettings);
  const appSettings = useSettingsStore(s => s.appSettings);
  useEffect(() => {
    let alive = true;
    fetchSettings()
      .then(s => { if (alive) setAppSettings(s); })
      .catch((err: Error) => {
        // 空 dep のクロージャで t/locale を固定せず、catch 実行時点の最新 locale を読み直す
        const currentLocale = useTaskStore.getState().locale;
        const msg = dictionaries[currentLocale]['app.toast.settingsFetchFailed']
          .replaceAll('{message}', apiErrorMessage(err, currentLocale));
        showToast(msg, 'error');
      });
    return () => { alive = false; };
  }, [setAppSettings]);

  // 予定工数の 1d/1w 換算に使う実効値（プロジェクト上書き ?? アプリ既定 ?? ハードコード）
  const effectiveCapacityMinutes = resolveCapacityMinutes(
    currentProject?.capacityMinutesPerDay, appSettings.capacityMinutesPerDay);
  const effectiveWorkingDays = resolveWorkingDays(
    currentProject?.workingDays, appSettings.workingDays);

  // プロジェクト切り替え時・reload イベント受信時のタスク取得（失敗時トースト＋再試行, §9.9）
  const { error: tasksError, retry: retryTasks } = useProjectTasks(currentProject?.id, (total) => {
    if (currentProject) setTaskCounts(prev => ({ ...prev, [currentProject.id]: total }));
  });

  // 全プロジェクトのタスク件数を初回ロード時に並列取得（1件でも失敗したら集約トースト）
  useEffect(() => {
    if (projects.length === 0) return;
    let anyFailed = false;
    // 各要素で .catch() 済みのため Promise.all 自体は reject しない（意図的な fire-and-forget）
    void Promise.all(
      projects.map(p =>
        apiFetch(`/projects/${p.id}/tasks?limit=1`)
          .then(d => ({ id: p.id, total: d.total as number }))
          .catch(() => { anyFailed = true; return { id: p.id, total: 0 }; })
      )
    ).then(results => {
      setTaskCounts(Object.fromEntries(results.map(r => [r.id, r.total])));
      if (anyFailed) showToast(t('app.toast.taskCountsFetchFailed'), 'error');
    });
  }, [projects.map(p => p.id).join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleCreateProject() {
    const name = prompt(t('app.projectNamePrompt'));
    if (!name) return;
    await createProject(name);
  }

  async function handleRenameProject(project: Project) {
    const name = prompt(t('app.renameProjectPrompt'), project.name);
    if (!name || name === project.name) return;
    try {
      await renameProject(project, name);
    } catch (err) {
      showToast(t('app.toast.renameProjectFailed', { message: apiErrorMessage(err, locale) }), 'error');
    }
  }

  async function handleDeleteProject(project: Project) {
    if (!confirm(t('app.deleteProjectConfirm', { name: project.name }))) return;
    try {
      await deleteProject(project);
    } catch (err) {
      showToast(t('app.toast.deleteFailed', { message: apiErrorMessage(err, locale) }), 'error');
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
      showToast(t('app.toast.saveFailed', { message: apiErrorMessage(err, locale) }), 'error');
    }
  }

  // tasks / refTasks のどちらかから id のタスクを引く（クロスプロジェクト参照, §5.8）
  function findAnyTask(id: string): Task | undefined {
    return tasks.find(t => t.id === id) ?? refTasks.find(t => t.id === id);
  }

  // 多層防御（§5.8）: 参照タスク（readonly）への更新は、predecessors 単独のときのみ
  // 専用経路（tasks スロットを汚染しない updateExternalPredecessors）へ回し、
  // それ以外のフィールドを含む更新は拒否する。他の8経路のガードをすり抜けても
  // ここで最終的に弾く／正しい経路へ振り分ける。
  async function handleInlineUpdate(id: string, patch: Partial<Task>) {
    const task = findAnyTask(id);
    if (task && isReadonlyTask(task, currentProject?.id)) {
      const keys = Object.keys(patch);
      if (keys.length === 1 && keys[0] === 'predecessors') {
        await projectRefs.updateExternalPredecessors(id, patch.predecessors ?? []).catch(() => {
          // updateExternalPredecessors は失敗時に自前でトースト表示済み
        });
        return;
      }
      showToast(t('app.toast.refReadonly'), 'error');
      return;
    }
    try {
      await updateTask(id, patch);
    } catch (err) {
      showToast(t('app.toast.updateFailed', { message: apiErrorMessage(err, locale) }), 'error');
    }
  }

  // GanttChart（useLinkDrag）向け: patch 形式 { predecessors } を受けて専用経路へ委譲する
  function handleUpdateExternalDeps(id: string, patch: Partial<Task>) {
    projectRefs.updateExternalPredecessors(id, patch.predecessors ?? []).catch(() => {});
  }

  // 参照先プロジェクトへジャンプする（コンテキストメニュー「参照先プロジェクトを開く」）
  function handleOpenRefProject(projectId: string) {
    const target = projects.find(p => p.id === projectId);
    if (target) setCurrentProject(target);
    else showToast(t('app.toast.refProjectNotFound'), 'error');
  }

  function countDescendants(id: string): number {
    return tasks
      .filter(t => t.parentId === id)
      .reduce((sum, child) => sum + 1 + countDescendants(child.id), 0);
  }

  async function handleDeleteTask(id: string) {
    const anyTask = findAnyTask(id);
    if (anyTask && isReadonlyTask(anyTask, currentProject?.id)) {
      showToast(t('app.toast.refDeleteForbidden'), 'error');
      return;
    }
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    // 子を持たないタスクは従来通りの確認ダイアログ
    if (!tasks.some(t => t.parentId === id)) {
      if (!confirm(t('app.deleteTaskConfirm'))) return;
      try {
        await deleteTask(id);
      } catch (err) {
        showToast(t('app.toast.deleteFailed', { message: apiErrorMessage(err, locale) }), 'error');
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
      showToast(t('app.toast.deleteFailed', { message: apiErrorMessage(err, locale) }), 'error');
    }
  }

  async function handleReorder(orders: { id: string; order: number; parentId?: string | null }[]) {
    try {
      await reorderTasks(orders);
    } catch (err) {
      showToast(t('app.toast.reorderFailed', { message: apiErrorMessage(err, locale) }), 'error');
    }
  }

  async function handleQuickAdd(title: string) {
    if (!currentProject) return;
    try {
      await createTask({ title, projectId: currentProject.id });
    } catch (err) {
      showToast(t('app.toast.addFailed', { message: apiErrorMessage(err, locale) }), 'error');
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
    const { batchInputs, sourceTasksFlat } = buildCopyBatch(source, parentId, afterTaskId, beforeTaskId, allTasksSnapshot, locale);

    try {
      // バッチ API で1リクエストにまとめる（v2.69 以前のシーケンシャル POST を置き換え）
      const newTasks = await batchCreateTasks(batchInputs, parentId);

      // 旧ID→新ID マップを構築して predecessor を付け替え
      const idMap = new Map<string, string>();
      sourceTasksFlat.forEach((t, i) => idMap.set(t.id, newTasks[i].id));
      for (const u of mapInternalPredecessors(sourceTasksFlat, idMap)) {
        await updateTask(u.id, { predecessors: u.predecessors });
      }

      const orders = computeCopyInsertOrder(allTasksSnapshot, parentId, newTasks[0], afterTaskId, beforeTaskId);
      if (!orders) return;
      await reorderTasks(orders);
    } catch (err) {
      showToast(t('app.toast.copyFailed', { message: apiErrorMessage(err, locale) }), 'error');
    }
  }

  if (loading) return (
    <>
      <div style={{ padding: 40, textAlign: 'center', background: 'var(--th-bg)', color: 'var(--th-text)' }}>{t('app.loading')}</div>
      <ToastContainer />
    </>
  );

  // プロジェクト一覧の初回取得に失敗（無言で握りつぶさず、再試行ボタン付きで可視化, §9.9）
  if (projectsError) return (
    <>
      <div style={{
        height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 16, background: 'var(--th-bg)', color: 'var(--th-text)',
      }}>
        <p>{projectsError}</p>
        <button onClick={retryProjects} style={{
          padding: '10px 24px', background: '#4f46e5', color: '#fff',
          border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 15, fontWeight: 600,
        }}>
          {t('app.retry')}
        </button>
      </div>
      <ToastContainer />
    </>
  );

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
            onProjectSettings={(project) => setSettingsModal(project)}
            taskCounts={taskCounts}
          />
          <button onClick={handleCreateProject} style={{
            padding: '4px 12px', borderRadius: 4, border: '1px solid rgba(255,255,255,.3)',
            cursor: 'pointer', fontSize: 13, background: 'transparent', color: '#fff',
            flexShrink: 0,
          }}>
            {t('app.addProject')}
          </button>
        </div>

        {/* テーマ選択／言語切替（右端） */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            {([
              { value: 'light', label: '☀', title: t('theme.light') },
              { value: 'dark',  label: '🌙', title: t('theme.dark') },
              { value: 'auto',  label: '🖥', title: t('theme.auto') },
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

          {/* 言語切替（テーマ選択の隣） */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            {(['ja', 'en'] as const).map(l => (
              <button
                key={l}
                aria-label={t('app.locale.switchAriaLabel')}
                onClick={() => setLocale(l)}
                style={{
                  padding: '3px 7px', borderRadius: 4, border: 'none', cursor: 'pointer',
                  fontSize: 12, fontWeight: 600, lineHeight: 1,
                  background: locale === l ? 'rgba(255,255,255,0.2)' : 'transparent',
                  color: locale === l ? '#fff' : 'rgba(255,255,255,0.5)',
                }}
              >
                {t(l === 'ja' ? 'locale.ja' : 'locale.en')}
              </button>
            ))}
          </div>
        </div>
      </div>

      {currentProject ? (
        tasksError ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
            <p style={{ color: 'var(--th-text-muted)' }}>{tasksError}</p>
            <button onClick={retryTasks} style={{
              padding: '10px 24px', background: '#4f46e5', color: '#fff',
              border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 15, fontWeight: 600,
            }}>
              {t('app.retry')}
            </button>
          </div>
        ) : (
          <>
            <Toolbar
              onAddTask={() => { setModalIsMilestone(false); setModalTask(null); }}
              onAddMilestone={() => { setModalIsMilestone(true); setModalTask(null); }}
              onImport={() => handleImportClick('append')}
              onRestore={() => handleImportClick('restore')}
              onExportJson={handleExportJson}
              onExportCsv={handleExportCsv}
              onOpenResourceSettings={() => setSettingsModal('app')}
              onOpenRefManager={() => setRefManagerOpen(true)}
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
                onReorder={handleReorder}
                onCopyInsert={handleCopyInsert}
                capacityMinutesPerDay={effectiveCapacityMinutes}
                workingDays={effectiveWorkingDays}
                onAddRef={() => setRefManagerOpen(true)}
                onUpdateExternalDeps={handleUpdateExternalDeps}
                onOpenRefProject={handleOpenRefProject}
                onRemoveRef={(refTaskId) => { projectRefs.remove(refTaskId).catch(() => {}); }}
                onRefreshRefs={() => { void projectRefs.refresh(); }}
              />
            </div>
          </>
        )
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          <p style={{ color: 'var(--th-text-muted)' }}>{t('app.noProjects')}</p>
          <button onClick={handleCreateProject} style={{
            padding: '10px 24px', background: '#4f46e5', color: '#fff',
            border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 15, fontWeight: 600,
          }}>
            {t('app.createFirstProject')}
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
            currentProjectId={currentProject?.id}
            refTasks={refTasks}
            refProjects={refProjects}
            onOpenRefProject={(pid) => { setModalTask(undefined); setModalInitialParentId(undefined); handleOpenRefProject(pid); }}
            onSave={handleSaveTask}
            onClose={() => { setModalTask(undefined); setModalInitialParentId(undefined); }}
          />
        )
      )}

      {settingsModal === 'app' && (
        <ResourceSettingsModal
          title={t('app.resourceSettingsAppTitle')}
          initialCapacityMinutes={appSettings.capacityMinutesPerDay}
          initialWorkingDays={appSettings.workingDays}
          fallbackCapacityMinutes={appSettings.capacityMinutesPerDay}
          fallbackWorkingDays={appSettings.workingDays}
          onClose={() => setSettingsModal(null)}
          onSave={async (patch) => {
            try {
              const updated = await updateAppSettings({
                capacityMinutesPerDay: patch.capacityMinutesPerDay ?? undefined,
                workingDays: patch.workingDays ?? undefined,
              });
              setAppSettings(updated);
            } catch (err) { showToast(t('app.toast.saveFailed', { message: apiErrorMessage(err, locale) }), 'error'); }
            setSettingsModal(null);
          }}
        />
      )}

      {settingsModal && settingsModal !== 'app' && (
        <ResourceSettingsModal
          title={t('app.resourceSettingsProjectTitle', { name: settingsModal.name })}
          inheritable
          initialCapacityMinutes={settingsModal.capacityMinutesPerDay}
          initialWorkingDays={settingsModal.workingDays}
          fallbackCapacityMinutes={appSettings.capacityMinutesPerDay}
          fallbackWorkingDays={appSettings.workingDays}
          onClose={() => setSettingsModal(null)}
          onSave={async (patch) => {
            try {
              await updateProjectResource(settingsModal, patch);
            } catch (err) { showToast(t('app.toast.saveFailed', { message: apiErrorMessage(err, locale) }), 'error'); }
            setSettingsModal(null);
          }}
        />
      )}

      {refManagerOpen && currentProject && (
        <RefManagerModal
          projects={projects}
          currentProjectId={currentProject.id}
          refs={projectRefs.refs}
          refTasks={refTasks}
          refProjects={refProjects}
          onAdd={(refTaskId) => projectRefs.add(refTaskId)}
          onRemove={(refTaskId) => projectRefs.remove(refTaskId)}
          onRefresh={() => { void projectRefs.refresh(); }}
          onClose={() => setRefManagerOpen(false)}
        />
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

      <ToastContainer />
    </div>
  );
}
