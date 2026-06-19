// @vitest-environment jsdom
/**
 * GanttBar / GanttLeftRow の React.memo 化テスト（v2.62）
 *
 * 再レンダリング回数を、各行コンポーネントのレンダリングで必ず1回呼ばれる関数の
 * 呼び出し回数で間接計測する:
 * - GanttLeftRow → calcDuration（行ごとに1回）
 * - GanttBar     → dateToX（バーごとに1回以上）
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, act } from '@testing-library/react';
import { GanttChart } from '../components/Gantt/GanttChart';
import { useTaskStore } from '../store/taskStore';
import { calcDuration, dateToX } from '../utils/ganttCalc';
import type { Task } from '../types/task';

vi.mock('../utils/ganttCalc', async importOriginal => {
  const mod = await importOriginal<typeof import('../utils/ganttCalc')>();
  return {
    ...mod,
    calcDuration: vi.fn(mod.calcDuration),
    dateToX: vi.fn(mod.dateToX),
  };
});

const NOOP = vi.fn();

function makeTask(partial: Partial<Task> & { id: string; order: number }): Task {
  return {
    projectId: 'p1',
    parentId: null,
    title: partial.id,
    summary: '',
    description: '',
    status: 'todo',
    priority: 'medium',
    progress: 20,
    assignee: '',
    startDate: '2026-05-05',
    endDate: '2026-05-10',
    isMilestone: false,
    predecessors: [],
    seq: partial.order,
    titleColor: null,
    titleBgColor: null, estimateMinutes: null,
    createdAt: '',
    updatedAt: '',
    ...partial,
  };
}

// 親2 + 子5×2 + 単独3 = 15行
function makeTasks(): Task[] {
  const tasks: Task[] = [];
  let order = 0;
  for (const p of ['p1', 'p2']) {
    tasks.push(makeTask({ id: p, order: ++order }));
    for (let i = 1; i <= 5; i++) {
      tasks.push(makeTask({ id: `${p}-c${i}`, parentId: p, order: ++order }));
    }
  }
  for (let i = 1; i <= 3; i++) tasks.push(makeTask({ id: `solo${i}`, order: ++order }));
  return tasks;
}

const ROW_COUNT = 15;

afterEach(() => { cleanup(); });

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  useTaskStore.setState({
    tasks: makeTasks(),
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

describe('GanttBar / GanttLeftRow の React.memo（v2.62）', () => {
  it('ホバー再レンダリングで行コンポーネントが再レンダリングされない', () => {
    const { container } = renderChart();
    const svg = container.querySelector('svg')!;

    const durBefore = vi.mocked(calcDuration).mock.calls.length;
    const xBefore   = vi.mocked(dateToX).mock.calls.length;
    expect(durBefore).toBeGreaterThanOrEqual(ROW_COUNT); // 初回は全行レンダリング

    fireEvent.mouseMove(svg, { clientX: 50, clientY: 10 });
    expect(container.querySelector('[data-connector-dot]')).toBeTruthy();

    // GanttLeftRow は1行も再レンダリングされない
    expect(vi.mocked(calcDuration).mock.calls.length).toBe(durBefore);
    // GanttBar も再レンダリングされない（コネクタドット位置計算の dateToX 数回分のみ許容）
    expect(vi.mocked(dateToX).mock.calls.length - xBefore).toBeLessThanOrEqual(4);
  });

  it('1タスクの進捗更新で再レンダリングされる行が「更新行＋祖先」以下に収まる', () => {
    renderChart();
    const durBefore = vi.mocked(calcDuration).mock.calls.length;

    act(() => {
      const { tasks } = useTaskStore.getState();
      useTaskStore.setState({
        tasks: tasks.map(t => (t.id === 'p1-c3' ? { ...t, progress: 95 } : t)),
      });
    });

    // 更新行(p1-c3) + 祖先(p1) の2行分以下（マージン込みで3行分まで許容）
    // memo なしだと全15行が再レンダリングされ +15 になる
    const delta = vi.mocked(calcDuration).mock.calls.length - durBefore;
    expect(delta).toBeLessThanOrEqual(3);
    expect(delta).toBeGreaterThanOrEqual(1); // 更新行自体は必ず再レンダリングされる
  });
});
