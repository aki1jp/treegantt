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

const NOOP = vi.fn();

afterEach(() => { cleanup(); });

beforeEach(() => {
  localStorage.clear();
  useTaskStore.setState({
    tasks: [],
    needsReload: false,
    sortKey: '',
    sortDir: 'asc',
    filterStatus: '',
    filterAssignee: '',
    filterPriority: '',
    zoomLevel: 'week',
    ganttStartDate: '',
    ganttPeriod: '3m',
    showLightningLine: true,
    showWeekend: true,
    showCriticalPath: false,
    uiFontSize: 13,
    uiRowHeight: 36,
    ganttHeaderLevels: { year: true, month: true, week: true, day: true },
    theme: 'auto',
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
    const wbs  = getByTestId('wbs-panel') as HTMLElement;
    const gantt = getByTestId('gantt-panel') as HTMLElement;

    // ガントパネルの scrollTop を直接設定 → onScroll が発火し WBS が同期される
    Object.defineProperty(gantt, 'scrollTop', { value: 200, writable: true, configurable: true });
    fireEvent.scroll(gantt);

    // WBS ボディ（wbsBodyRef）の scrollTop が更新されていること
    const wbsBody = container.querySelector('[data-testid="wbs-panel"] > div:last-child') as HTMLElement;
    expect(wbsBody?.scrollTop).toBe(200);
  });
});
