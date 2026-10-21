// @vitest-environment jsdom
/**
 * フィルタ中の親判定と集計（全タスク基準, 設計書 §9.3）
 * フィルタは表示行の選択だけを決め、親判定・親の期間・実効進捗はフィルタ前の全タスクで求める。
 */
import type { Mock } from 'vitest';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, screen, fireEvent, within } from '@testing-library/react';
import { GanttChart } from '../components/Gantt/GanttChart';
import { useTaskStore } from '../store/taskStore';
import type { Task } from '../types/task';

const NOOP = vi.fn();
let onInlineUpdate: Mock;
let onShiftSubtree: Mock;
const DAY_W = 8; // zoom='week'

let seq = 0;
function makeTask(overrides: Partial<Task> = {}): Task {
  seq++;
  return {
    id: `t${seq}`, projectId: 'p1', parentId: null,
    title: `Task${seq}`, summary: '', description: '',
    status: 'todo', priority: 'medium', progress: 0, assignee: '',
    startDate: null, endDate: null,
    isMilestone: false, predecessors: [], seq, order: seq,
    createdAt: '', updatedAt: '', titleColor: null, titleBgColor: null, estimateMinutes: null,
    ...overrides,
  };
}

beforeEach(() => {
  seq = 0;
  onInlineUpdate = vi.fn();
  onShiftSubtree = vi.fn();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-01T00:00:00.000Z'));
  localStorage.clear();
  useTaskStore.setState({
    tasks: [], needsReload: false,
    filterStatus: '', filterAssignee: '', filterPriority: '', filterOverdue: '', filterSearch: '',
    zoomLevel: 'week', ganttStartDate: '2026-10-01', ganttPeriod: '3m',
    showLightningLine: false, showWeekend: false, showCriticalPath: false, showResourceView: false,
    uiFontSize: 13, uiRowHeight: 36,
    ganttHeaderLevels: { year: false, month: false, week: false, day: false },
    theme: 'auto', ganttBarOpen: true,
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function renderChart(tasks: Task[], filters: Partial<ReturnType<typeof useTaskStore.getState>>) {
  useTaskStore.setState({ tasksOwnerProjectId: 'p1', tasks, ...filters });
  return render(
    <GanttChart projectId="p1"
      onEditTask={NOOP} onDeleteTask={NOOP} onInlineUpdate={onInlineUpdate}
      onShiftSubtree={onShiftSubtree}
      onQuickAdd={NOOP} onAddSubTask={NOOP} onReorder={NOOP} onCopyInsert={NOOP}
    />
  );
}

function family() {
  const p = makeTask({ id: 'P', title: 'Parent', status: 'wip' });
  const c1 = makeTask({ id: 'C1', parentId: 'P', title: 'Child1', status: 'done', progress: 100,
    assignee: 'A', startDate: '2026-10-01', endDate: '2026-10-05' });
  const c2 = makeTask({ id: 'C2', parentId: 'P', title: 'Child2', status: 'done', progress: 50,
    assignee: 'B', startDate: '2026-10-06', endDate: '2026-10-10' });
  return [p, c1, c2];
}

describe('フィルタで子が全て非表示の親（§9.3）', () => {
  it('折りたたみトグルが表示される', () => {
    renderChart(family(), { filterStatus: '!done' });
    const wbs = screen.getByTestId('wbs-panel');
    expect(within(wbs).getByRole('button', { name: '折りたたむ' })).toBeTruthy();
  });

  it('開始日/終了日は読み取り専用で全子孫の派生期間を表示する', () => {
    renderChart(family(), { filterStatus: '!done' });
    const wbs = screen.getByTestId('wbs-panel');
    const cells = within(wbs).getAllByTestId('date-readonly');
    expect(cells.map(c => c.textContent)).toEqual(['2026-10-01', '2026-10-10']);
  });

  it('進捗は全子の実効進捗（75%）になる', () => {
    renderChart(family(), { filterStatus: '!done' });
    const wbs = screen.getByTestId('wbs-panel');
    const cell = within(wbs).getByTitle('子タスクの平均（自動計算）');
    expect(cell.textContent).toBe('75%');
  });

  it('親バーを移動すると onShiftSubtree が呼ばれ onInlineUpdate は呼ばれない', () => {
    const { container } = renderChart(family(), { filterStatus: '!done' });
    const zone = container.querySelector<SVGRectElement>('rect[data-parent-move="true"]');
    expect(zone).toBeTruthy();
    fireEvent.mouseDown(zone!, { button: 0, clientX: 100 });
    fireEvent.mouseMove(window, { clientX: 100 + 2 * DAY_W });
    fireEvent.mouseUp(window);
    expect(onShiftSubtree).toHaveBeenCalledWith('P', 2);
    expect(onInlineUpdate).not.toHaveBeenCalled();
  });
});

describe('子の一部だけ表示されている親（§9.3）', () => {
  it('担当者フィルタで C1 のみ一致しても親の期間は全子孫（10-01〜10-10）', () => {
    renderChart(family(), { filterAssignee: 'A' });
    const wbs = screen.getByTestId('wbs-panel');
    const cells = within(wbs).getAllByTestId('date-readonly');
    expect(cells.map(c => c.textContent)).toEqual(['2026-10-01', '2026-10-10']);
  });
});
