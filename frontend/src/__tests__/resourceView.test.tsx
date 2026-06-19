// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import { GanttChart } from '../components/Gantt/GanttChart';
import { useTaskStore } from '../store/taskStore';
import type { Task } from '../types/task';

const NOOP = vi.fn();

let seq = 0;
function makeTask(overrides: Partial<Task> = {}): Task {
  seq++;
  return {
    id: `t${seq}`, projectId: 'p1', parentId: null,
    title: `Task${seq}`, summary: '', description: '',
    status: 'todo', priority: 'medium', progress: 0, assignee: '',
    startDate: '2026-06-10', endDate: '2026-06-15',
    isMilestone: false, predecessors: [], seq, order: seq,
    createdAt: '', updatedAt: '', titleColor: null, titleBgColor: null,
    ...overrides,
  };
}

beforeEach(() => {
  seq = 0;
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-06-01T00:00:00.000Z'));
  localStorage.clear();
  useTaskStore.setState({
    tasks: [], needsReload: false,
    filterStatus: '', filterAssignee: '', filterPriority: '', filterSearch: '',
    zoomLevel: 'week', ganttStartDate: '2026-06-01', ganttPeriod: '3m',
    showLightningLine: false, showWeekend: false, showCriticalPath: false,
    showResourceView: true,
    uiFontSize: 13, uiRowHeight: 36,
    ganttHeaderLevels: { year: false, month: false, week: false, day: false },
    theme: 'auto', ganttBarOpen: true,
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function renderChart(tasks: Task[]) {
  useTaskStore.setState({ tasks });
  return render(
    <GanttChart
      onEditTask={NOOP} onDeleteTask={NOOP} onInlineUpdate={NOOP}
      onQuickAdd={NOOP} onAddSubTask={NOOP} onReorder={NOOP} onCopyInsert={NOOP}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
describe('ResourceView: 表示条件', () => {
  it('showResourceView=true でも担当者なしタスクのみなら workload-panel は表示されない', () => {
    renderChart([makeTask({ assignee: '' })]);
    expect(screen.queryByTestId('workload-panel')).toBeNull();
  });

  it('担当者あり・startDate ありのタスクがあれば workload-panel が表示される', () => {
    renderChart([makeTask({ assignee: 'Alice', startDate: '2026-06-10', endDate: '2026-06-15' })]);
    expect(screen.getByTestId('workload-panel')).toBeTruthy();
  });

  it('showResourceView=false のとき workload-panel は表示されない', () => {
    useTaskStore.setState({ showResourceView: false });
    renderChart([makeTask({ assignee: 'Alice', startDate: '2026-06-10', endDate: '2026-06-15' })]);
    expect(screen.queryByTestId('workload-panel')).toBeNull();
  });

  it('startDate=null のタスクは担当者があっても集計されない', () => {
    renderChart([makeTask({ assignee: 'Alice', startDate: null, endDate: null })]);
    expect(screen.queryByTestId('workload-panel')).toBeNull();
  });

  it('done タスクのみなら workload-panel は表示されない', () => {
    renderChart([makeTask({ assignee: 'Alice', status: 'done', startDate: '2026-06-10', endDate: '2026-06-15' })]);
    expect(screen.queryByTestId('workload-panel')).toBeNull();
  });

  it('endDate=null のタスクは担当者があっても集計されない', () => {
    renderChart([makeTask({ assignee: 'Alice', startDate: '2026-06-10', endDate: null })]);
    expect(screen.queryByTestId('workload-panel')).toBeNull();
  });
});

describe('ResourceView: 色凡例', () => {
  it('負荷の色凡例がパネルに表示される', () => {
    renderChart([makeTask({ assignee: 'Alice', startDate: '2026-06-10', endDate: '2026-06-15' })]);
    expect(screen.getByTestId('workload-panel').textContent).toContain('凡例');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('ResourceView: 担当者表示', () => {
  it('担当者名が workload-panel 内に表示される', () => {
    renderChart([makeTask({ assignee: 'Alice', startDate: '2026-06-10', endDate: '2026-06-15' })]);
    const panel = screen.getByTestId('workload-panel');
    expect(panel.textContent).toContain('Alice');
  });

  it('複数担当者がアルファベット順でリスト表示される', () => {
    renderChart([
      makeTask({ assignee: 'Zara',  startDate: '2026-06-10', endDate: '2026-06-12' }),
      makeTask({ assignee: 'Alice', startDate: '2026-06-10', endDate: '2026-06-12' }),
      makeTask({ assignee: 'Bob',   startDate: '2026-06-10', endDate: '2026-06-12' }),
    ]);
    const panel = screen.getByTestId('workload-panel');
    const text = panel.textContent ?? '';
    expect(text.indexOf('Alice')).toBeLessThan(text.indexOf('Bob'));
    expect(text.indexOf('Bob')).toBeLessThan(text.indexOf('Zara'));
  });

  it('同じ担当者は1行だけ表示される（重複なし）', () => {
    renderChart([
      makeTask({ assignee: 'Alice', startDate: '2026-06-10', endDate: '2026-06-11' }),
      makeTask({ assignee: 'Alice', startDate: '2026-06-12', endDate: '2026-06-13' }),
    ]);
    const panel = screen.getByTestId('workload-panel');
    const matches = panel.querySelectorAll('div');
    const aliceCells = Array.from(matches).filter(d =>
      d.textContent?.trim() === 'Alice' && d.children.length === 0
    );
    expect(aliceCells.length).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('ResourceView: タイトルヘッダー', () => {
  it('"リソースビュー（担当者別負荷）" のラベルが表示される', () => {
    renderChart([makeTask({ assignee: 'Alice', startDate: '2026-06-10', endDate: '2026-06-15' })]);
    expect(screen.getByTestId('workload-panel').textContent).toContain('リソースビュー（担当者別負荷）');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('ResourceView: 負荷セル tooltip', () => {
  it('担当期間内のセルに title 属性が付与される', () => {
    renderChart([makeTask({ assignee: 'Alice', startDate: '2026-06-01', endDate: '2026-06-01' })]);
    const panel = screen.getByTestId('workload-panel');
    const cell = Array.from(panel.querySelectorAll('[title]'))
      .find(el => el.getAttribute('title')?.includes('Alice'));
    expect(cell).toBeTruthy();
  });

  it('title 属性に件数が含まれる', () => {
    renderChart([
      makeTask({ assignee: 'Alice', startDate: '2026-06-01', endDate: '2026-06-01' }),
      makeTask({ assignee: 'Alice', startDate: '2026-06-01', endDate: '2026-06-01' }),
    ]);
    const panel = screen.getByTestId('workload-panel');
    const cell = Array.from(panel.querySelectorAll('[title]'))
      .find(el => el.getAttribute('title')?.includes('Alice') && el.getAttribute('title')?.includes('2'));
    expect(cell).toBeTruthy();
  });
});
