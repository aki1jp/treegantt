// @vitest-environment jsdom
/**
 * a11y 自動チェック（`axe-core`, §9.10）。
 * 主要画面・コンポーネント（Toolbar/TaskModal/MilestoneModal/ConflictDialog/RefManagerModal/
 * GanttChart 主要行）に対して axe の critical/serious 違反がゼロであることを検証する。
 * moderate/minor は許容リストの対象（§9.10）だが、本導入時点では該当なし。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { Toolbar } from '../components/Toolbar/Toolbar';
import { TaskModal } from '../components/TaskModal/TaskModal';
import { MilestoneModal } from '../components/MilestoneModal/MilestoneModal';
import { ConflictDialog } from '../components/ConflictDialog/ConflictDialog';
import { RefManagerModal } from '../components/RefManager/RefManagerModal';
import { GanttChart } from '../components/Gantt/GanttChart';
import { useTaskStore } from '../store/taskStore';
import { runAxe, seriousOrCritical, describeViolations } from './a11yAxe';
import type { Task, Project, TaskRef, RefProject } from '../types/task';

afterEach(() => { cleanup(); });
const NOOP = vi.fn();

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 't1', projectId: 'p1', parentId: null,
    title: 'タスク1', summary: '', description: '',
    status: 'todo', priority: 'medium', progress: 0, assignee: '',
    startDate: '2026-06-01', endDate: '2026-06-10',
    isMilestone: false, predecessors: [], seq: 1, order: 1,
    createdAt: '', updatedAt: '', titleColor: null, titleBgColor: null, estimateMinutes: null,
    ...overrides,
  };
}

async function expectNoSeriousViolations(container: Element) {
  const results = await runAxe(container);
  const violations = seriousOrCritical(results);
  expect(violations, describeViolations(violations)).toEqual([]);
}

// ─── Toolbar ────────────────────────────────────────────────────────────────
describe('axe — Toolbar', () => {
  beforeEach(() => {
    localStorage.clear();
    useTaskStore.setState({
      tasks: [], needsReload: false,
      filterStatus: '', filterAssignee: '', filterPriority: '', filterColor: '', filterSearch: '',
      zoomLevel: 'week', ganttStartDate: '', ganttPeriod: '3m',
      showLightningLine: true, showWeekend: true, showCriticalPath: false, showResourceView: true,
      uiFontSize: 13, uiRowHeight: 36,
      ganttHeaderLevels: { year: true, month: true, week: true, day: true },
      theme: 'auto', ganttBarOpen: true,
    });
  });

  it('critical/serious 違反がない', async () => {
    const { container } = render(
      <Toolbar onAddTask={NOOP} onAddMilestone={NOOP} onImport={NOOP} onRestore={NOOP}
        onExportJson={NOOP} onExportCsv={NOOP} />
    );
    await expectNoSeriousViolations(container);
  });
});

// ─── TaskModal ──────────────────────────────────────────────────────────────
describe('axe — TaskModal', () => {
  it('編集モード: critical/serious 違反がない', async () => {
    const allTasks = [makeTask(), makeTask({ id: 't2', seq: 2, title: 'タスク2' })];
    const { container } = render(
      <TaskModal task={makeTask()} allTasks={allTasks} onSave={NOOP} onClose={NOOP} />
    );
    await expectNoSeriousViolations(container);
  });

  it('新規作成モード: critical/serious 違反がない', async () => {
    const { container } = render(
      <TaskModal task={null} allTasks={[]} onSave={NOOP} onClose={NOOP} />
    );
    await expectNoSeriousViolations(container);
  });
});

// ─── MilestoneModal ─────────────────────────────────────────────────────────
describe('axe — MilestoneModal', () => {
  it('編集モード: critical/serious 違反がない', async () => {
    const task = makeTask({ isMilestone: true, endDate: '2026-06-01' });
    const { container } = render(
      <MilestoneModal task={task} allTasks={[makeTask({ id: 't2', seq: 2 })]} onSave={NOOP} onClose={NOOP} />
    );
    await expectNoSeriousViolations(container);
  });

  it('新規作成モード: critical/serious 違反がない', async () => {
    const { container } = render(
      <MilestoneModal task={null} allTasks={[]} onSave={NOOP} onClose={NOOP} />
    );
    await expectNoSeriousViolations(container);
  });
});

// ─── ConflictDialog ─────────────────────────────────────────────────────────
describe('axe — ConflictDialog', () => {
  it('critical/serious 違反がない', async () => {
    const { container } = render(
      <ConflictDialog field="title" theirVal="リモートの変更" myVal="自分の変更" onResolve={NOOP} />
    );
    await expectNoSeriousViolations(container);
  });
});

// ─── RefManagerModal ────────────────────────────────────────────────────────
describe('axe — RefManagerModal', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ tasks: [], total: 0 }) })));
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('critical/serious 違反がない', async () => {
    const projects: Project[] = [
      { id: 'p1', name: 'プロジェクトA', color: null, capacityMinutesPerDay: null, workingDays: null, createdAt: '2026-01-01' },
      { id: 'p2', name: 'プロジェクトB', color: null, capacityMinutesPerDay: null, workingDays: null, createdAt: '2026-01-01' },
    ];
    const refs: TaskRef[] = [{ projectId: 'p1', refTaskId: 'r1', createdAt: '2026-01-01' }];
    const refTasks: Task[] = [makeTask({ id: 'r1', projectId: 'p2', seq: 3 })];
    const refProjects: RefProject[] = [{ id: 'p2', name: 'プロジェクトB', color: null }];
    const { container } = render(
      <RefManagerModal
        projects={projects} currentProjectId="p1" refs={refs} refTasks={refTasks} refProjects={refProjects}
        onAdd={async () => {}} onRemove={async () => {}} onRefresh={NOOP} onClose={NOOP}
      />
    );
    await expectNoSeriousViolations(container);
  });
});

// ─── GanttChart（主要行: 親/子/マイルストーン） ─────────────────────────────
describe('axe — GanttChart', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-01T00:00:00.000Z'));
    useTaskStore.setState({
      tasks: [
        makeTask({ id: 'p', title: '親タスク' }),
        makeTask({ id: 'c1', title: '子タスク1', parentId: 'p' }),
        makeTask({ id: 'm1', title: 'マイルストーン', isMilestone: true, startDate: '2026-06-05', endDate: '2026-06-05' }),
      ],
      needsReload: false,
      filterStatus: '', filterAssignee: '', filterPriority: '', filterColor: '', filterSearch: '',
      zoomLevel: 'week', ganttStartDate: '2026-06-01', ganttPeriod: '3m',
      showLightningLine: true, showWeekend: true, showCriticalPath: false, showResourceView: false,
      uiFontSize: 13, uiRowHeight: 36,
      ganttHeaderLevels: { year: true, month: true, week: true, day: true },
      theme: 'auto', ganttBarOpen: true, wbsPanelOpen: true,
    });
  });
  afterEach(() => { vi.useRealTimers(); });

  it('主要行に critical/serious 違反がない', async () => {
    const { container } = render(
      <GanttChart
        onEditTask={NOOP} onDeleteTask={NOOP} onInlineUpdate={NOOP}
        onQuickAdd={NOOP} onAddSubTask={NOOP} onReorder={NOOP} onCopyInsert={NOOP}
      />
    );
    // axe.run は非同期処理を内部で伴うため、fake timers のままだとハングする
    vi.useRealTimers();
    await expectNoSeriousViolations(container);
  }, 20000);
});
