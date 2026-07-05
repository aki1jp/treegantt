// @vitest-environment jsdom
/**
 * アクセシビリティ基本方針（D3・§9.10）のユニットテスト。
 * 記号・絵文字のみのアイコンボタンに aria-label があること、
 * Toolbar のフィルタ入力に aria-label があることを検証する。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { Toolbar } from '../components/Toolbar/Toolbar';
import { ProjectTabs } from '../components/ProjectTabs/ProjectTabs';
import { GanttLeftRow } from '../components/Gantt/GanttLeftRow';
import { GanttChart } from '../components/Gantt/GanttChart';
import { useTaskStore } from '../store/taskStore';
import type { Task, Project } from '../types/task';

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

// ─── Toolbar ────────────────────────────────────────────────────────────────
describe('a11y — Toolbar', () => {
  beforeEach(() => {
    localStorage.clear();
    useTaskStore.setState({
      tasks: [], needsReload: false,
      filterStatus: '', filterAssignee: '', filterPriority: '', filterSearch: '',
      zoomLevel: 'week', ganttStartDate: '', ganttPeriod: '3m',
      showLightningLine: true, showWeekend: true, showCriticalPath: false, showResourceView: true,
      uiFontSize: 13, uiRowHeight: 36,
      ganttHeaderLevels: { year: true, month: true, week: true, day: true },
      theme: 'auto', ganttBarOpen: true,
    });
  });

  function renderToolbar() {
    return render(
      <Toolbar onAddTask={NOOP} onAddMilestone={NOOP} onImport={NOOP} onRestore={NOOP}
        onExportJson={NOOP} onExportCsv={NOOP} />
    );
  }

  it('ハンバーガーメニューボタンに aria-label="メニュー" がある', () => {
    renderToolbar();
    expect(screen.getByRole('button', { name: 'メニュー' })).toBeTruthy();
  });

  it('検索入力に aria-label がある', () => {
    renderToolbar();
    expect(screen.getByLabelText('タスク検索')).toBeTruthy();
  });

  it('ステータス・優先度・担当者フィルタに aria-label がある', () => {
    renderToolbar();
    expect(screen.getByLabelText('ステータスで絞り込み')).toBeTruthy();
    expect(screen.getByLabelText('優先度で絞り込み')).toBeTruthy();
    expect(screen.getByLabelText('担当者で絞り込み')).toBeTruthy();
  });

  it('ズーム・開始日・表示期間の入力に aria-label がある', () => {
    renderToolbar();
    expect(screen.getByLabelText('ズームレベル')).toBeTruthy();
    expect(screen.getByLabelText('開始日')).toBeTruthy();
    expect(screen.getByLabelText('表示期間')).toBeTruthy();
  });

  it('担当者フィルタをクリアするボタンに aria-label がある', () => {
    useTaskStore.setState({ filterAssignee: '花子' });
    renderToolbar();
    expect(screen.getByRole('button', { name: '担当者フィルターをクリア' })).toBeTruthy();
  });

  it('開始日リセットボタンに aria-label がある', () => {
    useTaskStore.setState({ ganttStartDate: '2026-06-01' });
    renderToolbar();
    expect(screen.getByRole('button', { name: /開始日をリセット/ })).toBeTruthy();
  });
});

// ─── ProjectTabs ────────────────────────────────────────────────────────────
describe('a11y — ProjectTabs', () => {
  function makeProject(id: string, name: string): Project {
    return { id, name, createdAt: '2026-01-01', color: null, capacityMinutesPerDay: null, workingDays: null };
  }

  it('タブ右クリックの色選択パレットのボタンに aria-label がある', () => {
    const projects = [makeProject('p1', 'Alpha')];
    render(
      <ProjectTabs
        projects={projects} currentProject={projects[0]}
        onSelect={NOOP} onDelete={NOOP} onRename={NOOP}
        onUpdateColor={NOOP}
      />
    );
    fireEvent.contextMenu(screen.getByText('Alpha'));
    // プリセット色の1つ（#ef4444 系など）と「なし」ボタンに aria-label がある
    expect(screen.getByRole('button', { name: 'なし' })).toBeTruthy();
    const colorButtons = screen.getAllByRole('button').filter(b => b.getAttribute('aria-label')?.startsWith('#'));
    expect(colorButtons.length).toBeGreaterThan(0);
  });
});

// ─── GanttLeftRow ───────────────────────────────────────────────────────────
describe('a11y — GanttLeftRow', () => {
  function rowProps(task: Task) {
    return {
      task, depth: 0, hasChildren: true, isCollapsed: false,
      effectiveProgress: task.progress, fontSize: 12, rowHeight: 32,
      titleWidth: 200, assigneeWidth: 80, dateColWidth: 90,
      onToggleCollapse: vi.fn(), onInlineUpdate: vi.fn(), onRowContextMenu: vi.fn(),
    };
  }

  it('展開/折りたたみトグルに aria-label がある', () => {
    render(<GanttLeftRow {...rowProps(makeTask())} />);
    expect(screen.getByRole('button', { name: '折りたたむ' })).toBeTruthy();
  });

  it('折りたたみ済みのときは aria-label が「展開」になる', () => {
    render(<GanttLeftRow {...rowProps(makeTask())} isCollapsed />);
    expect(screen.getByRole('button', { name: '展開' })).toBeTruthy();
  });
});

// ─── GanttChart（WBS 開閉・展開折りたたみクラスタ） ─────────────────────────
describe('a11y — GanttChart', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-01T00:00:00.000Z'));
    useTaskStore.setState({
      tasks: [], needsReload: false,
      filterStatus: '', filterAssignee: '', filterPriority: '', filterSearch: '',
      zoomLevel: 'week', ganttStartDate: '2026-06-01', ganttPeriod: '3m',
      showLightningLine: false, showWeekend: false, showCriticalPath: false, showResourceView: false,
      uiFontSize: 13, uiRowHeight: 36,
      ganttHeaderLevels: { year: false, month: false, week: false, day: false },
      theme: 'auto', ganttBarOpen: true, wbsPanelOpen: true,
    });
  });
  afterEach(() => { vi.useRealTimers(); });

  function renderChart(tasks: Task[]) {
    useTaskStore.setState({ tasks });
    return render(
      <GanttChart
        onEditTask={NOOP} onDeleteTask={NOOP} onInlineUpdate={NOOP}
        onQuickAdd={NOOP} onAddSubTask={NOOP} onReorder={NOOP} onCopyInsert={NOOP}
      />
    );
  }

  it('WBS を閉じるボタン（◁）に aria-label がある', () => {
    renderChart([makeTask()]);
    expect(screen.getByRole('button', { name: 'WBSを隠す' })).toBeTruthy();
  });

  it('WBS を閉じると、開くボタン（▷）に aria-label が付く', () => {
    useTaskStore.setState({ wbsPanelOpen: false });
    renderChart([makeTask()]);
    expect(screen.getByRole('button', { name: 'WBSを表示' })).toBeTruthy();
  });

  it('子を持つタスクがあるとき、全展開/全折りたたみボタンに aria-label がある', () => {
    renderChart([
      makeTask({ id: 'p', title: '親' }),
      makeTask({ id: 'c', title: '子', parentId: 'p' }),
    ]);
    expect(screen.getByRole('button', { name: '全て折りたたむ' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '全て展開' })).toBeTruthy();
  });
});
