// @vitest-environment jsdom
/**
 * フィルタ統合テスト — GanttChart がストアのフィルタ条件に従ってタスクを絞り込むことを検証
 */
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

function renderChart(tasks: Task[], filterOverrides: Partial<ReturnType<typeof useTaskStore.getState>> = {}) {
  useTaskStore.setState({ tasks, ...filterOverrides });
  return render(
    <GanttChart
      onEditTask={NOOP} onDeleteTask={NOOP} onInlineUpdate={NOOP}
      onQuickAdd={NOOP} onAddSubTask={NOOP} onReorder={NOOP}
    />
  );
}

function getWbsTitles(): string[] {
  const wbs = screen.getByTestId('wbs-panel');
  return Array.from(wbs.querySelectorAll('[draggable="true"]'))
    .map(row => {
      // タイトルスパン: draggable > div > div > span (title area)
      const spans = Array.from(row.querySelectorAll('span'));
      return spans.find(s => s.style.cursor === 'text')?.textContent ?? '';
    })
    .filter(Boolean);
}

// ─────────────────────────────────────────────────────────────────────────────
describe('GanttChart フィルタ統合: ステータス', () => {
  it('filterStatus="" のとき全タスクが表示される', () => {
    const tasks = [
      makeTask({ title: 'TodoTask',    status: 'todo' }),
      makeTask({ title: 'WipTask',     status: 'wip'  }),
      makeTask({ title: 'DoneTask',    status: 'done' }),
      makeTask({ title: 'PendingTask', status: 'pending' }),
    ];
    renderChart(tasks, { filterStatus: '' });
    const titles = getWbsTitles();
    expect(titles).toContain('TodoTask');
    expect(titles).toContain('WipTask');
    expect(titles).toContain('DoneTask');
    expect(titles).toContain('PendingTask');
  });

  it('filterStatus="wip" のとき wip タスクのみ表示される', () => {
    const tasks = [
      makeTask({ title: 'TodoTask', status: 'todo' }),
      makeTask({ title: 'WipTask',  status: 'wip'  }),
      makeTask({ title: 'DoneTask', status: 'done' }),
    ];
    renderChart(tasks, { filterStatus: 'wip' });
    const titles = getWbsTitles();
    expect(titles).toContain('WipTask');
    expect(titles).not.toContain('TodoTask');
    expect(titles).not.toContain('DoneTask');
  });

  it('filterStatus="!done" のとき done と pending を除外する', () => {
    const tasks = [
      makeTask({ title: 'TodoTask',    status: 'todo'    }),
      makeTask({ title: 'WipTask',     status: 'wip'     }),
      makeTask({ title: 'DoneTask',    status: 'done'    }),
      makeTask({ title: 'PendingTask', status: 'pending' }),
      makeTask({ title: 'WaitTask',    status: 'wait'    }),
    ];
    renderChart(tasks, { filterStatus: '!done' });
    const titles = getWbsTitles();
    expect(titles).toContain('TodoTask');
    expect(titles).toContain('WipTask');
    expect(titles).toContain('WaitTask');
    expect(titles).not.toContain('DoneTask');
    expect(titles).not.toContain('PendingTask');
  });

  it('filterStatus="pending" のとき保留タスクのみ表示される', () => {
    const tasks = [
      makeTask({ title: 'TodoTask',    status: 'todo'    }),
      makeTask({ title: 'PendingTask', status: 'pending' }),
    ];
    renderChart(tasks, { filterStatus: 'pending' });
    const titles = getWbsTitles();
    expect(titles).toContain('PendingTask');
    expect(titles).not.toContain('TodoTask');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('GanttChart フィルタ統合: 担当者', () => {
  it('filterAssignee で部分一致フィルタが効く', () => {
    const tasks = [
      makeTask({ title: 'AliceTask', assignee: 'Alice' }),
      makeTask({ title: 'BobTask',   assignee: 'Bob'   }),
    ];
    renderChart(tasks, { filterAssignee: 'Ali' });
    const titles = getWbsTitles();
    expect(titles).toContain('AliceTask');
    expect(titles).not.toContain('BobTask');
  });

  it('filterAssignee="" のとき全担当者が表示される', () => {
    const tasks = [
      makeTask({ title: 'AliceTask', assignee: 'Alice' }),
      makeTask({ title: 'BobTask',   assignee: 'Bob'   }),
    ];
    renderChart(tasks, { filterAssignee: '' });
    const titles = getWbsTitles();
    expect(titles).toContain('AliceTask');
    expect(titles).toContain('BobTask');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('GanttChart フィルタ統合: テキスト検索', () => {
  it('filterSearch でタイトル部分一致が効く', () => {
    const tasks = [
      makeTask({ title: 'BudgetReport', assignee: '' }),
      makeTask({ title: 'MeetingMemo',  assignee: '' }),
    ];
    renderChart(tasks, { filterSearch: 'budget' });
    const titles = getWbsTitles();
    expect(titles.some(t => t.toLowerCase().includes('budget'))).toBe(true);
    expect(titles.some(t => t.toLowerCase().includes('meeting'))).toBe(false);
  });

  it('filterSearch で担当者名検索も効く', () => {
    const tasks = [
      makeTask({ title: 'Task1', assignee: 'Alice' }),
      makeTask({ title: 'Task2', assignee: 'Bob'   }),
    ];
    renderChart(tasks, { filterSearch: 'Alice' });
    const titles = getWbsTitles();
    expect(titles).toContain('Task1');
    expect(titles).not.toContain('Task2');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('GanttChart フィルタ統合: 複合フィルタ（AND条件）', () => {
  it('status + assignee の AND フィルタが効く', () => {
    const tasks = [
      makeTask({ title: 'Alice-Todo', status: 'todo', assignee: 'Alice' }),
      makeTask({ title: 'Alice-Done', status: 'done', assignee: 'Alice' }),
      makeTask({ title: 'Bob-Todo',   status: 'todo', assignee: 'Bob'   }),
    ];
    renderChart(tasks, { filterStatus: 'todo', filterAssignee: 'Alice' });
    const titles = getWbsTitles();
    expect(titles).toContain('Alice-Todo');
    expect(titles).not.toContain('Alice-Done');
    expect(titles).not.toContain('Bob-Todo');
  });

  it('status + search の AND フィルタが効く', () => {
    const tasks = [
      makeTask({ title: 'AliceReport', status: 'todo' }),
      makeTask({ title: 'AliceMemo',   status: 'done' }),
      makeTask({ title: 'BobReport',   status: 'todo' }),
    ];
    renderChart(tasks, { filterStatus: 'todo', filterSearch: 'Alice' });
    const titles = getWbsTitles();
    expect(titles).toContain('AliceReport');
    expect(titles).not.toContain('AliceMemo');
    expect(titles).not.toContain('BobReport');
  });

  it('全フィルタが0件になる場合、WBSにタスク行が表示されない', () => {
    const tasks = [
      makeTask({ title: 'Task1', status: 'todo', assignee: 'Alice' }),
    ];
    renderChart(tasks, { filterStatus: 'done', filterAssignee: 'Bob' });
    const titles = getWbsTitles();
    expect(titles).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('GanttChart フィルタ統合: 優先度', () => {
  it('filterPriority="high" のとき high タスクのみ表示される', () => {
    const tasks = [
      makeTask({ title: 'HighTask',   priority: 'high'   }),
      makeTask({ title: 'MediumTask', priority: 'medium' }),
      makeTask({ title: 'LowTask',    priority: 'low'    }),
    ];
    renderChart(tasks, { filterPriority: 'high' });
    const titles = getWbsTitles();
    expect(titles).toContain('HighTask');
    expect(titles).not.toContain('MediumTask');
    expect(titles).not.toContain('LowTask');
  });
});
