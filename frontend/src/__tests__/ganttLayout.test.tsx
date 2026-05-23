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
import { render, cleanup } from '@testing-library/react';
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
});
