// @vitest-environment jsdom
/**
 * GanttChart レイアウト構造テスト
 *
 * 横スクロールバーが WBS 左パネルではなくガントパネルのみに表示されることを検証する。
 * - WBS パネル: overflow: hidden（スクロールバーなし）
 * - ガントパネル: overflow: auto（横スクロールバーあり）
 * - 垂直スクロールはガントパネルの onScroll で WBS パネルの scrollTop を同期
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { GanttChart } from '../components/Gantt/GanttChart';
import { useTaskStore } from '../store/taskStore';
import type { Task } from '../types/task';

const NOOP = vi.fn();

afterEach(() => { cleanup(); });

beforeEach(() => {
  localStorage.clear();
  useTaskStore.setState({
    tasks: [],
    needsReload: false,
    filterStatus: '',
    filterAssignee: '',
    filterPriority: '',
    filterSearch: '',
    zoomLevel: 'week',
    ganttStartDate: '',
    ganttPeriod: '3m',
    showLightningLine: true,
    showWeekend: true,
    showCriticalPath: false,
    showResourceView: true,
    uiFontSize: 13,
    uiRowHeight: 36,
    ganttHeaderLevels: { year: true, month: true, week: true, day: true },
    theme: 'auto',
    ganttBarOpen: true,
  });
});

describe('GanttChart スクロール分離レイアウト', () => {
  function renderChart() {
    return render(
      <GanttChart
        onEditTask={NOOP}
        onDeleteTask={NOOP}
        onInlineUpdate={NOOP}
        onQuickAdd={NOOP}
        onAddSubTask={NOOP}
        onReorder={NOOP}
      />
    );
  }

  it('WBS左パネルに data-testid="wbs-panel" が存在する', () => {
    const { getByTestId } = renderChart();
    expect(getByTestId('wbs-panel')).toBeTruthy();
  });

  it('ガント右パネルに data-testid="gantt-panel" が存在する', () => {
    const { getByTestId } = renderChart();
    expect(getByTestId('gantt-panel')).toBeTruthy();
  });

  it('WBSパネルは overflow: hidden（横スクロールバーなし）', () => {
    const { getByTestId } = renderChart();
    const wbs = getByTestId('wbs-panel') as HTMLElement;
    expect(wbs.style.overflow).toBe('hidden');
  });

  it('ガントパネルは overflow: auto（横スクロールバーあり）', () => {
    const { getByTestId } = renderChart();
    const gantt = getByTestId('gantt-panel') as HTMLElement;
    expect(gantt.style.overflow).toBe('auto');
  });

  it('WBSヘッダーの高さが n×HEADER_ROW_H+2 である（グローバルborder-box補正）', () => {
    // デフォルト: ganttHeaderLevels={year,month,week,day} すべてON
    // buildMultiLevelHeaders が year/month/week/day/dow の5行を生成
    // HEADER_ROW_H=26、borderBottom=2px（border-box内に含まれる）
    // 正しい height = 5*26+2 = 132px
    const { getByTestId } = renderChart();
    const wbsHeader = getByTestId('wbs-header') as HTMLElement;
    const HEADER_ROW_H = 26;
    const expectedRows = 5; // year + month + week + day + dow
    expect(wbsHeader.style.height).toBe(`${expectedRows * HEADER_ROW_H + 2}px`);
  });

  it('ガントヘッダーに data-testid="gantt-header" が存在する', () => {
    const { getByTestId } = renderChart();
    expect(getByTestId('gantt-header')).toBeTruthy();
  });

  it('ガントヘッダーの内行すべてに boxSizing:border-box が設定されている', () => {
    // borderTop:1px が付く ri>0 の行も合計高さ26pxになるよう border-box が必須
    const { getByTestId } = renderChart();
    const ganttHeader = getByTestId('gantt-header') as HTMLElement;
    const innerRows = Array.from(ganttHeader.children) as HTMLElement[];
    expect(innerRows.length).toBeGreaterThan(0);
    innerRows.forEach(row => {
      expect(row.style.boxSizing).toBe('border-box');
    });
  });

  it('WBSパネル上でホイール操作するとガントパネルの scrollTop が変化する', () => {
    const { getByTestId } = renderChart();
    const wbs  = getByTestId('wbs-panel') as HTMLElement;
    const gantt = getByTestId('gantt-panel') as HTMLElement;

    // jsdom では実際のスクロール量は増えないが scrollTop への代入は反映される
    // deltaY=100 のホイールイベントを WBS 上で発火
    fireEvent.wheel(wbs, { deltaY: 100, deltaX: 0 });
    expect(gantt.scrollTop).toBe(100);
  });

  it('WBSパネル上でホイール操作すると WBS ボディの scrollTop も同期される', () => {

    const { getByTestId, container } = renderChart();
    const gantt = getByTestId('gantt-panel') as HTMLElement;

    // ガントパネルの scrollTop を直接設定 → onScroll が発火し WBS が同期される
    Object.defineProperty(gantt, 'scrollTop', { value: 200, writable: true, configurable: true });
    fireEvent.scroll(gantt);

    // WBS ボディ（wbsBodyRef）の scrollTop が更新されていること
    const wbsBody = container.querySelector('[data-testid="wbs-panel"] > div:last-child') as HTMLElement;
    expect(wbsBody?.scrollTop).toBe(200);
  });
});

describe('親タスク WBS日付セル 読み取り専用スタイル', () => {
  function makeTask(overrides: Partial<Task>): Task {
    return {
      id: 'x', projectId: 'p1', parentId: null,
      title: 'Task', summary: '', description: '',
      status: 'todo', priority: 'medium', progress: 0, assignee: '',
      startDate: '2026-05-01', endDate: '2026-05-31',
      isMilestone: false, predecessors: [], seq: 1, order: 1,
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
      ...overrides,
    };
  }

  function renderWithParentChild() {
    useTaskStore.setState({
      tasks: [
        makeTask({ id: 'parent', title: '親タスク', startDate: '2026-05-01', endDate: '2026-05-31' }),
        makeTask({ id: 'child',  title: '子タスク', parentId: 'parent', startDate: '2026-05-01', endDate: '2026-05-15' }),
      ],
      ganttStartDate: '2026-05-01',
      showResourceView: false,
    });
    return render(
      <GanttChart onEditTask={NOOP} onDeleteTask={NOOP} onInlineUpdate={NOOP}
        onQuickAdd={NOOP} onAddSubTask={NOOP} onReorder={NOOP} />
    );
  }

  it('親タスクの日付セルに data-testid="date-readonly" が付与される', () => {
    const { container } = renderWithParentChild();
    const cells = container.querySelectorAll('[data-testid="date-readonly"]');
    expect(cells.length).toBeGreaterThan(0);
  });

  it('親タスク日付セルの cursor は "default"', () => {
    const { container } = renderWithParentChild();
    const cell = container.querySelector('[data-testid="date-readonly"]') as HTMLElement;
    expect(cell?.style.cursor).toBe('default');
  });

  it('親タスク日付セルのテキスト色は var(--th-text-dim)（薄グレー）', () => {
    const { container } = renderWithParentChild();
    const cell = container.querySelector('[data-testid="date-readonly"]') as HTMLElement;
    expect(cell?.style.color).toBe('var(--th-text-dim)');
  });

  it('子タスクの日付セルには data-testid="date-readonly" が付与されない', () => {
    const { container } = renderWithParentChild();
    // 子タスク行は通常スタイル（date-readonly なし）
    const allRows = container.querySelectorAll('[data-testid="date-readonly"]');
    // 親のみ → startDate + endDate の 2 セルだけのはず
    expect(allRows.length).toBe(2);
  });
});

describe('ガントヘッダー 曜日表示', () => {
  function renderDayZoom() {
    useTaskStore.setState({
      zoomLevel: 'day',
      ganttStartDate: '2026-05-18',
      ganttPeriod: '1m',
      ganttHeaderLevels: { year: false, month: false, week: false, day: true },
    });
    return render(
      <GanttChart onEditTask={NOOP} onDeleteTask={NOOP} onInlineUpdate={NOOP} onQuickAdd={NOOP} onAddSubTask={NOOP} onReorder={NOOP} />
    );
  }

  it('日ヘッダーセルに data-dow 属性が付与される', () => {
    const { container } = renderDayZoom();
    expect(container.querySelector('[data-dow]')).toBeTruthy();
  });

  it('土曜日セルに data-dow="6" が付与される', () => {
    const { container } = renderDayZoom();
    expect(container.querySelector('[data-dow="6"]')).toBeTruthy();
  });

  it('日曜日セルに data-dow="0" が付与される', () => {
    const { container } = renderDayZoom();
    expect(container.querySelector('[data-dow="0"]')).toBeTruthy();
  });

  it('土曜日セルのテキストに "土" が含まれる', () => {
    const { container } = renderDayZoom();
    const satCell = container.querySelector('[data-dow="6"]');
    expect(satCell?.textContent).toContain('土');
  });

  it('日曜日セルのテキストに "日" が含まれる', () => {
    const { container } = renderDayZoom();
    const sunCell = container.querySelector('[data-dow="0"]');
    expect(sunCell?.textContent).toContain('日');
  });
});

describe('WBS 行D&D — インライン編集中のテキスト選択干渉防止', () => {
  const TASK: Task = {
    id: 'drag-t1', projectId: 'p1', parentId: null,
    title: 'ドラッグテスト', summary: '', description: '',
    status: 'todo', priority: 'medium', progress: 0, assignee: '',
    startDate: '2026-05-01', endDate: '2026-05-31',
    isMilestone: false, predecessors: [], seq: 1, order: 1,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  };

  function renderWithTask() {
    useTaskStore.setState({ tasks: [TASK], ganttStartDate: '2026-05-01', showResourceView: false });
    return render(
      <GanttChart onEditTask={NOOP} onDeleteTask={NOOP} onInlineUpdate={NOOP}
        onQuickAdd={NOOP} onAddSubTask={NOOP} onReorder={NOOP} />
    );
  }

  it('INPUTにフォーカスがある状態でdragstartはpreventDefaultされる（行D&Dが発動しない）', () => {
    // ブラウザは dragstart を draggable な行ラッパーに発火する（e.target は行ラッパー）。
    // そのため document.activeElement で編集中かを判定する必要がある。
    const { getByTestId } = renderWithTask();
    const wbsPanel = getByTestId('wbs-panel');
    const rowWrapper = wbsPanel.querySelector('[draggable="true"]') as HTMLElement;
    expect(rowWrapper).toBeTruthy();

    const input = document.createElement('input');
    rowWrapper.appendChild(input);
    input.focus(); // 編集中を再現: activeElement = input

    // 実ブラウザ同様に行ラッパーから dragstart を発火
    const notPrevented = fireEvent.dragStart(rowWrapper);
    expect(notPrevented).toBe(false); // false = preventDefault が呼ばれた

    rowWrapper.removeChild(input);
  });

  it('INPUTにフォーカスがない状態でdragstartはpreventDefaultされない（通常の行D&D発動）', () => {
    const { getByTestId } = renderWithTask();
    const wbsPanel = getByTestId('wbs-panel');
    const rowWrapper = wbsPanel.querySelector('[draggable="true"]') as HTMLElement;
    expect(rowWrapper).toBeTruthy();

    // アクティブ要素が input でない状態（編集していない）
    (document.activeElement as HTMLElement)?.blur?.();

    const notPrevented = fireEvent.dragStart(rowWrapper);
    expect(notPrevented).toBe(true); // true = preventDefault されていない

  });
});
