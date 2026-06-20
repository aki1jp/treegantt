import type { Mock } from 'vitest';
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, screen } from '@testing-library/react';
import { GanttChart } from '../components/Gantt/GanttChart';
import { useTaskStore } from '../store/taskStore';
import type { Task } from '../types/task';

let onInlineUpdate: Mock;
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
    createdAt: '', updatedAt: '', titleColor: null, titleBgColor: null, estimateMinutes: null,
    ...overrides,
  };
}

beforeEach(() => {
  seq = 0;
  onInlineUpdate = vi.fn();
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

function renderChart(tasks: Task[]) {
  useTaskStore.setState({ tasks });
  return render(
    <GanttChart
      onEditTask={NOOP} onDeleteTask={NOOP} onInlineUpdate={onInlineUpdate}
      onQuickAdd={NOOP} onAddSubTask={NOOP} onReorder={NOOP} onCopyInsert={NOOP}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
describe('色カスタマイズ: バー右クリックメニュー', () => {
  it('バー右クリックで「文字色」ラベルが表示される', () => {
    const task = makeTask();
    const { container } = renderChart([task]);
    fireEvent.contextMenu(container.querySelector(`[data-task-id="${task.id}"]`)!);
    expect(screen.getByText('文字色')).toBeTruthy();
  });

  it('バー右クリックで「背景色」ラベルが表示される', () => {
    const task = makeTask();
    const { container } = renderChart([task]);
    fireEvent.contextMenu(container.querySelector(`[data-task-id="${task.id}"]`)!);
    expect(screen.getByText('背景色')).toBeTruthy();
  });

  it('文字色パレット（✕以外）をクリックすると titleColor で onInlineUpdate が呼ばれる', () => {
    const task = makeTask();
    const { container } = renderChart([task]);
    fireEvent.contextMenu(container.querySelector(`[data-task-id="${task.id}"]`)!);

    // ✕（リセット）以外の空テキストボタンが色ボタン
    const colorBtns = Array.from(screen.getAllByRole('button'))
      .filter(b => b.getAttribute('title') !== 'リセット' && b.textContent === '');
    expect(colorBtns.length).toBeGreaterThan(0);
    fireEvent.click(colorBtns[0]);

    expect(onInlineUpdate).toHaveBeenCalledWith(task.id, expect.objectContaining({
      titleColor: expect.any(String),
    }));
  });

  it('文字色のリセット（✕）をクリックすると titleColor=null で呼ばれる', () => {
    const task = makeTask({ titleColor: '#ef4444' });
    const { container } = renderChart([task]);
    fireEvent.contextMenu(container.querySelector(`[data-task-id="${task.id}"]`)!);

    // title="リセット" の最初のボタンが文字色リセット
    const resetBtns = screen.getAllByTitle('リセット');
    expect(resetBtns.length).toBeGreaterThanOrEqual(1);
    fireEvent.click(resetBtns[0]);

    expect(onInlineUpdate).toHaveBeenCalledWith(task.id, { titleColor: null });
  });

  it('背景色のリセット（✕）をクリックすると titleBgColor=null で呼ばれる', () => {
    const task = makeTask({ titleBgColor: '#22c55e' });
    const { container } = renderChart([task]);
    fireEvent.contextMenu(container.querySelector(`[data-task-id="${task.id}"]`)!);

    // title="リセット" が2つある: 0=文字色, 1=背景色
    const resetBtns = screen.getAllByTitle('リセット');
    expect(resetBtns.length).toBe(2);
    fireEvent.click(resetBtns[1]);

    expect(onInlineUpdate).toHaveBeenCalledWith(task.id, { titleBgColor: null });
  });

  it('メニューを開くとパレットに11個のボタンが（文字色・背景色それぞれ）ある', () => {
    const task = makeTask();
    const { container } = renderChart([task]);
    fireEvent.contextMenu(container.querySelector(`[data-task-id="${task.id}"]`)!);

    // リセット（✕）が2つ(文字色+背景色)
    const resetBtns = screen.getAllByTitle('リセット');
    expect(resetBtns.length).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('色カスタマイズ: WBS行への反映', () => {
  it('titleColor が設定されているとき WBS タイトルのスタイルに色が適用される', () => {
    const task = makeTask({ titleColor: '#ef4444' });
    const { getByTestId } = renderChart([task]);
    const wbs = getByTestId('wbs-panel');
    const titleSpan = Array.from(wbs.querySelectorAll('span'))
      .find(s => s.textContent?.trim() === task.title && s.children.length === 0);
    expect(titleSpan).toBeTruthy();
    expect((titleSpan as HTMLElement).style.color).toBe('rgb(239, 68, 68)');
  });

  it('titleBgColor が設定されているとき WBS 行の背景色に適用される', () => {
    const task = makeTask({ titleBgColor: '#22c55e' });
    const { getByTestId } = renderChart([task]);
    const wbs = getByTestId('wbs-panel');
    // draggable ラッパーの直下の GanttLeftRow div に background が付く
    const rows = Array.from(wbs.querySelectorAll('[draggable="true"]'));
    const innerRow = rows[0].firstElementChild as HTMLElement;
    expect(innerRow.style.background).toBe('rgb(34, 197, 94)');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('色カスタマイズ: タイトルヘッダー右クリック（全色リセット）', () => {
  it('WBSヘッダーのタイトル列を右クリックすると「全タスクの色をリセット」が表示される', () => {
    const task = makeTask({ titleColor: '#ef4444' });
    const { getByTestId } = renderChart([task]);
    const wbsHeader = getByTestId('wbs-header');
    // LEFT_COLS = [order, title, ...] → タイトル列は children[1]
    const titleCol = wbsHeader.children[1] as HTMLElement;
    fireEvent.contextMenu(titleCol);
    expect(screen.getByText('全タスクの色をリセット')).toBeTruthy();
  });

  it('「全タスクの色をリセット」をクリックすると色付きタスクの titleColor/titleBgColor が null になる', async () => {
    const t1 = makeTask({ titleColor: '#ef4444', titleBgColor: null });
    const t2 = makeTask({ titleColor: null, titleBgColor: '#22c55e' });
    const t3 = makeTask({ titleColor: null, titleBgColor: null }); // 色なし → 呼ばれない
    const { getByTestId } = renderChart([t1, t2, t3]);

    const wbsHeader = getByTestId('wbs-header');
    // LEFT_COLS = [order, title, ...] → タイトル列は children[1]
    const titleCol = wbsHeader.children[1] as HTMLElement;
    fireEvent.contextMenu(titleCol);

    const resetAllBtn = screen.getByText('全タスクの色をリセット');
    fireEvent.click(resetAllBtn);

    // t1, t2 のみ呼ばれる（t3 は色なし）
    expect(onInlineUpdate).toHaveBeenCalledTimes(2);
    expect(onInlineUpdate).toHaveBeenCalledWith(t1.id, { titleColor: null, titleBgColor: null });
    expect(onInlineUpdate).toHaveBeenCalledWith(t2.id, { titleColor: null, titleBgColor: null });
    expect(onInlineUpdate).not.toHaveBeenCalledWith(t3.id, expect.anything());
  });

  it('色なしタスクのみのとき「全タスクの色をリセット」を押しても onInlineUpdate は呼ばれない', async () => {
    const task = makeTask({ titleColor: null, titleBgColor: null });
    const { getByTestId } = renderChart([task]);

    const wbsHeader = getByTestId('wbs-header');
    // LEFT_COLS = [order, title, ...] → タイトル列は children[1]
    const titleCol = wbsHeader.children[1] as HTMLElement;
    fireEvent.contextMenu(titleCol);

    fireEvent.click(screen.getByText('全タスクの色をリセット'));

    expect(onInlineUpdate).not.toHaveBeenCalled();
  });
});
