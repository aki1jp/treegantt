// @vitest-environment jsdom
/**
 * GanttChart の派生計算メモ化テスト（v2.61）
 *
 * ホバー（hoveredBarId 変更）による再レンダリングでは、データが変わらない限り
 * 重い派生計算（フィルタ・ツリー構築・親スパン集計・進捗集計）を再実行しないことを検証する。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, act } from '@testing-library/react';
import { GanttChart } from '../components/Gantt/GanttChart';
import { useTaskStore } from '../store/taskStore';
import { calcParentSpanMap } from '../utils/ganttCalc';
import { calcAllEffectiveProgress } from '../utils/taskTree';
import { filterTasks } from '../utils/sort';
import type { Task } from '../types/task';

vi.mock('../utils/ganttCalc', async importOriginal => {
  const mod = await importOriginal<typeof import('../utils/ganttCalc')>();
  return { ...mod, calcParentSpanMap: vi.fn(mod.calcParentSpanMap) };
});
vi.mock('../utils/taskTree', async importOriginal => {
  const mod = await importOriginal<typeof import('../utils/taskTree')>();
  return { ...mod, calcAllEffectiveProgress: vi.fn(mod.calcAllEffectiveProgress) };
});
vi.mock('../utils/sort', async importOriginal => {
  const mod = await importOriginal<typeof import('../utils/sort')>();
  return { ...mod, filterTasks: vi.fn(mod.filterTasks) };
});

const NOOP = vi.fn();

function makeTask(partial: Partial<Task> & { id: string }): Task {
  return {
    projectId: 'p1',
    parentId: null,
    title: partial.id,
    summary: '',
    description: '',
    status: 'todo',
    priority: 'medium',
    progress: 0,
    assignee: '',
    startDate: '2026-05-05',
    endDate: '2026-05-10',
    isMilestone: false,
    predecessors: [],
    seq: 1,
    order: 1,
    titleColor: null,
    titleBgColor: null,
    createdAt: '',
    updatedAt: '',
    ...partial,
  };
}

const TASKS: Task[] = [
  makeTask({ id: 'parent', order: 1 }),
  makeTask({ id: 'c1', parentId: 'parent', order: 2, progress: 40 }),
  makeTask({ id: 'c2', parentId: 'parent', order: 3, progress: 80, startDate: '2026-05-08', endDate: '2026-05-15' }),
  makeTask({ id: 'solo', order: 4, progress: 10 }),
];

afterEach(() => { cleanup(); });

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  useTaskStore.setState({
    tasks: TASKS,
    needsReload: false,
    filterStatus: '',
    filterAssignee: '',
    filterPriority: '',
    filterSearch: '',
    zoomLevel: 'week',
    ganttStartDate: '2026-05-01',
    ganttPeriod: '3m',
    showLightningLine: true,
    showWeekend: true,
    showCriticalPath: false,
    showResourceView: false,
    uiFontSize: 13,
    uiRowHeight: 36,
    ganttHeaderLevels: { year: true, month: true, week: true, day: true },
    theme: 'auto',
    ganttBarOpen: true,
  });
});

function renderChart() {
  return render(
    <GanttChart
      onEditTask={NOOP}
      onDeleteTask={NOOP}
      onInlineUpdate={NOOP}
      onQuickAdd={NOOP}
      onAddSubTask={NOOP}
      onReorder={NOOP}
      onCopyInsert={NOOP}
    />
  );
}

describe('GanttChart 派生計算のメモ化（v2.61）', () => {
  it('progressMap は calcAllEffectiveProgress（O(N) 1パス版）で計算する', () => {
    renderChart();
    expect(vi.mocked(calcAllEffectiveProgress).mock.calls.length).toBeGreaterThan(0);
  });

  it('ホバーによる再レンダリングで重い派生計算が再実行されない', () => {
    const { container } = renderChart();
    const svg = container.querySelector('svg')!;
    expect(svg).toBeTruthy();

    const spanCallsBefore   = vi.mocked(calcParentSpanMap).mock.calls.length;
    const filterCallsBefore = vi.mocked(filterTasks).mock.calls.length;
    expect(spanCallsBefore).toBeGreaterThan(0);

    // 行0 → 行1 へのホバー移動で hoveredBarId が2回変わり、再レンダリングが2回起きる
    fireEvent.mouseMove(svg, { clientX: 50, clientY: 10 });
    // 再レンダリングが実際に起きた証拠: コネクタドットが出現する
    expect(container.querySelector('[data-connector-dot]')).toBeTruthy();
    fireEvent.mouseMove(svg, { clientX: 50, clientY: 46 });

    expect(vi.mocked(calcParentSpanMap).mock.calls.length).toBe(spanCallsBefore);
    expect(vi.mocked(filterTasks).mock.calls.length).toBe(filterCallsBefore);
  });

  it('タスクデータが変わったときは派生計算が再実行される（メモの依存配列が正しい）', () => {
    renderChart();
    const spanCallsBefore = vi.mocked(calcParentSpanMap).mock.calls.length;

    const updated = TASKS.map(t => (t.id === 'c1' ? { ...t, progress: 99 } : t));
    act(() => { useTaskStore.setState({ tasks: updated }); });

    expect(vi.mocked(calcParentSpanMap).mock.calls.length).toBeGreaterThan(spanCallsBefore);
  });
});
