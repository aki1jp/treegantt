// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, screen } from '@testing-library/react';
import { GanttChart } from '../components/Gantt/GanttChart';
import { useTaskStore } from '../store/taskStore';
import type { Task } from '../types/task';

let onEditTask: ReturnType<typeof vi.fn>;
let onDeleteTask: ReturnType<typeof vi.fn>;
let onInlineUpdate: ReturnType<typeof vi.fn>;
let onAddSubTask: ReturnType<typeof vi.fn>;
let onAddSubMilestone: ReturnType<typeof vi.fn>;
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
  onEditTask    = vi.fn();
  onDeleteTask  = vi.fn();
  onInlineUpdate = vi.fn();
  onAddSubTask  = vi.fn();
  onAddSubMilestone = vi.fn();
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
      onEditTask={onEditTask}
      onDeleteTask={onDeleteTask}
      onInlineUpdate={onInlineUpdate}
      onQuickAdd={NOOP}
      onAddSubTask={onAddSubTask}
      onAddSubMilestone={onAddSubMilestone}
      onReorder={NOOP}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
describe('ガントバー右クリックメニュー（barCtxMenu）', () => {
  it('バー上で右クリックするとコンテキストメニューが表示される', () => {
    const task = makeTask();
    const { container } = renderChart([task]);

    const barG = container.querySelector(`[data-task-id="${task.id}"]`);
    expect(barG).toBeTruthy();
    fireEvent.contextMenu(barG!);

    expect(screen.getByText('編集（詳細）')).toBeTruthy();
    expect(screen.getByText('削除')).toBeTruthy();
  });

  it('非マイルストーンタスクのメニューに「＋ 追加」が表示される', () => {
    const task = makeTask({ isMilestone: false });
    const { container } = renderChart([task]);

    fireEvent.contextMenu(container.querySelector(`[data-task-id="${task.id}"]`)!);

    expect(screen.getByText('＋ 追加', { exact: false })).toBeTruthy();
  });

  it('マイルストーンのメニューに「＋ 追加」は表示されない', () => {
    const task = makeTask({ isMilestone: true });
    const { container } = renderChart([task]);

    fireEvent.contextMenu(container.querySelector(`[data-task-id="${task.id}"]`)!);

    expect(screen.queryByText('＋ 追加', { exact: false })).toBeNull();
  });

  it('「＋ 追加」にホバーすると「子タスク」「子マイルストーン」の子メニューが出る', () => {
    const task = makeTask();
    const { container } = renderChart([task]);

    fireEvent.contextMenu(container.querySelector(`[data-task-id="${task.id}"]`)!);
    expect(screen.queryByText('子タスク')).toBeNull();      // ホバー前は出ない
    fireEvent.mouseEnter(screen.getByText('＋ 追加', { exact: false }));
    expect(screen.getByText('子タスク')).toBeTruthy();
    expect(screen.getByText('子マイルストーン')).toBeTruthy();
  });

  it('「削除」クリックで onDeleteTask が呼ばれメニューが閉じる', () => {
    const task = makeTask();
    const { container } = renderChart([task]);

    fireEvent.contextMenu(container.querySelector(`[data-task-id="${task.id}"]`)!);
    fireEvent.click(screen.getByText('削除'));

    expect(onDeleteTask).toHaveBeenCalledWith(task.id);
    expect(screen.queryByText('削除')).toBeNull();
  });

  it('「編集（詳細）」クリックで onEditTask が呼ばれメニューが閉じる', () => {
    const task = makeTask();
    const { container } = renderChart([task]);

    fireEvent.contextMenu(container.querySelector(`[data-task-id="${task.id}"]`)!);
    fireEvent.click(screen.getByText('編集（詳細）'));

    expect(onEditTask).toHaveBeenCalledWith(task);
    expect(screen.queryByText('編集（詳細）')).toBeNull();
  });

  it('子メニュー「子タスク」クリックで onAddSubTask が呼ばれメニューが閉じる', () => {
    const task = makeTask();
    const { container } = renderChart([task]);

    fireEvent.contextMenu(container.querySelector(`[data-task-id="${task.id}"]`)!);
    fireEvent.mouseEnter(screen.getByText('＋ 追加', { exact: false }));
    fireEvent.click(screen.getByText('子タスク'));

    expect(onAddSubTask).toHaveBeenCalledWith(task.id);
    expect(screen.queryByText('＋ 追加', { exact: false })).toBeNull();
  });

  it('子メニュー「子マイルストーン」クリックで onAddSubMilestone が呼ばれメニューが閉じる', () => {
    const task = makeTask();
    const { container } = renderChart([task]);

    fireEvent.contextMenu(container.querySelector(`[data-task-id="${task.id}"]`)!);
    fireEvent.mouseEnter(screen.getByText('＋ 追加', { exact: false }));
    fireEvent.click(screen.getByText('子マイルストーン'));

    expect(onAddSubMilestone).toHaveBeenCalledWith(task.id);
    expect(screen.queryByText('＋ 追加', { exact: false })).toBeNull();
  });

  it('メニューが開いているときに window でマウスダウンするとメニューが閉じる', () => {
    const task = makeTask();
    const { container } = renderChart([task]);

    fireEvent.contextMenu(container.querySelector(`[data-task-id="${task.id}"]`)!);
    expect(screen.getByText('削除')).toBeTruthy();

    fireEvent.mouseDown(window);

    expect(screen.queryByText('削除')).toBeNull();
  });

  it('SVG 上で data-task-id のない場所を右クリックしてもメニューは表示されない', () => {
    const task = makeTask();
    const { container } = renderChart([task]);

    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    // SVG 直接（data-task-id のない場所）を右クリック
    fireEvent.contextMenu(svg!);

    expect(screen.queryByText('編集（詳細）')).toBeNull();
  });

  it('色パレットボタンクリックで onInlineUpdate が titleColor で呼ばれる', () => {
    const task = makeTask();
    const { container } = renderChart([task]);

    fireEvent.contextMenu(container.querySelector(`[data-task-id="${task.id}"]`)!);

    // リセットボタン（✕）以外の最初の色ボタン（null でない色）をクリック
    const colorBtns = Array.from(screen.getAllByRole('button'))
      .filter(b => b.getAttribute('title') !== 'リセット' && b.textContent === '');
    expect(colorBtns.length).toBeGreaterThan(0);
    fireEvent.click(colorBtns[0]);

    expect(onInlineUpdate).toHaveBeenCalledWith(task.id, expect.objectContaining({
      titleColor: expect.any(String),
    }));
  });
});

// WBSパネル内のタスクタイトル要素を返す（SVGテキストと区別するため）
function getWbsTitleEl(title: string): Element {
  const wbs = screen.getByTestId('wbs-panel');
  const el = Array.from(wbs.querySelectorAll('*'))
    .find(e => e.textContent?.trim() === title && e.children.length === 0);
  if (!el) throw new Error(`WBS title "${title}" not found`);
  return el;
}

// ─────────────────────────────────────────────────────────────────────────────
describe('WBS行右クリックメニュー（rowCtxMenu）', () => {
  it('WBS行を右クリックするとコンテキストメニューが表示される', () => {
    const task = makeTask();
    renderChart([task]);

    fireEvent.contextMenu(getWbsTitleEl(task.title));

    expect(screen.getByText('編集（詳細）')).toBeTruthy();
    expect(screen.getByText('削除')).toBeTruthy();
  });

  it('WBS行右クリックメニューの「削除」で onDeleteTask が呼ばれる', () => {
    const task = makeTask();
    renderChart([task]);

    fireEvent.contextMenu(getWbsTitleEl(task.title));
    fireEvent.click(screen.getByText('削除'));

    expect(onDeleteTask).toHaveBeenCalledWith(task.id);
  });

  it('WBS行右クリックメニューの「編集（詳細）」で onEditTask が呼ばれる', () => {
    const task = makeTask();
    renderChart([task]);

    fireEvent.contextMenu(getWbsTitleEl(task.title));
    fireEvent.click(screen.getByText('編集（詳細）'));

    expect(onEditTask).toHaveBeenCalledWith(task);
  });

  it('window マウスダウンで行メニューが閉じる', () => {
    const task = makeTask();
    renderChart([task]);

    fireEvent.contextMenu(getWbsTitleEl(task.title));
    expect(screen.getByText('削除')).toBeTruthy();

    fireEvent.mouseDown(window);

    expect(screen.queryByText('削除')).toBeNull();
  });

  it('バー右クリック後に行右クリックすると barCtxMenu が閉じて rowCtxMenu が開く', () => {
    const task = makeTask();
    const { container } = renderChart([task]);

    // バー右クリック
    fireEvent.contextMenu(container.querySelector(`[data-task-id="${task.id}"]`)!);
    expect(screen.getAllByText('削除').length).toBe(1);

    // 行右クリック（barCtxMenu が閉じて rowCtxMenu が開く）
    fireEvent.contextMenu(getWbsTitleEl(task.title));
    expect(screen.getAllByText('削除').length).toBe(1);
  });
});
