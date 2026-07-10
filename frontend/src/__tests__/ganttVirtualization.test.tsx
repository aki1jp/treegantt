// @vitest-environment jsdom
/**
 * ガント行仮想化テスト（v2.64）
 *
 * - calcVisibleRange: 可視範囲計算の純関数
 * - GanttChart: 1000件でも可視範囲＋overscan の行だけが DOM/SVG に存在すること
 *   （jsdom では ResizeObserver がないためビューポート高さはフォールバック 800px）
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { GanttChart } from '../components/Gantt/GanttChart';
import { useTaskStore } from '../store/taskStore';
import { calcVisibleRange } from '../utils/virtualRange';
import { genLargeTasks } from './fixtures/genLargeTasks';

const NOOP = vi.fn();

afterEach(() => { cleanup(); });

beforeEach(() => {
  localStorage.clear();
  useTaskStore.setState({
    tasks: genLargeTasks(1000),
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
    showResourceView: false,
    showTodayLine: true,
    showMilestones: true,
    uiFontSize: 13,
    uiRowHeight: 36,
    ganttHeaderLevels: { year: true, month: true, week: true, day: true },
    theme: 'auto',
    ganttBarOpen: true,
  });
});

function renderChart(projectId?: string) {
  return render(
    <GanttChart
      projectId={projectId}
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

describe('calcVisibleRange', () => {
  it('先頭表示時は 0 から可視行数+overscan まで', () => {
    const r = calcVisibleRange(0, 720, 36, 1000, 10);
    expect(r.start).toBe(0);
    expect(r.end).toBe(0 + Math.ceil(720 / 36) + 1 + 10); // 31
  });

  it('スクロール位置に応じて start が進み overscan 分上に広がる', () => {
    const r = calcVisibleRange(3600, 720, 36, 1000, 10);
    expect(r.start).toBe(100 - 10);
    expect(r.end).toBe(100 + Math.ceil(720 / 36) + 1 + 10);
  });

  it('末尾で rowCount にクランプされる', () => {
    const r = calcVisibleRange(36 * 990, 720, 36, 1000, 10);
    expect(r.end).toBe(1000);
    expect(r.start).toBeLessThanOrEqual(990 - 10);
  });

  it('rowCount=0 は空範囲を返す', () => {
    expect(calcVisibleRange(0, 720, 36, 0, 10)).toEqual({ start: 0, end: 0 });
  });

  it('負の scrollTop は 0 扱い', () => {
    expect(calcVisibleRange(-100, 720, 36, 1000, 10).start).toBe(0);
  });

  it('scrollTop がコンテンツ高さを超えても start ≤ end で末尾まで描画する（白画面対策）', () => {
    // 行20件・行高36px・ビューポート800px → 最大スクロールは 0。
    // 古い大きな scrollTop が残っても有効範囲にクランプされ、空範囲にならない。
    const r = calcVisibleRange(18000, 800, 36, 20, 10);
    expect(r.start).toBeLessThanOrEqual(r.end);
    expect(r.start).toBe(0);
    expect(r.end).toBe(20);
  });
});

describe('GanttChart 行仮想化（1000件）', () => {
  it('WBS行・SVGバーとも可視範囲分（<80）しか描画されない', () => {
    const { container } = renderChart();
    const wbsRows = container.querySelectorAll('[data-testid="wbs-panel"] [draggable="true"]');
    const svgBars = container.querySelectorAll('svg [data-task-id]');
    expect(wbsRows.length).toBeGreaterThan(0);
    expect(wbsRows.length).toBeLessThan(80);   // 仮想化なしだと 1000
    expect(svgBars.length).toBeLessThan(80);   // 仮想化なしだと 1000
  });

  it('スクロールするとウィンドウが移動し、上部スペーサが行高に整合する', async () => {
    const { container, getByTestId } = renderChart();
    const panel = getByTestId('gantt-panel');

    // 行300 付近へスクロール（36px × 300 = 10800）。反映は rAF スロットル経由
    fireEvent.scroll(panel, { target: { scrollTop: 10800 } });

    const tasks = useTaskStore.getState().tasks;
    const firstTaskId = tasks[0].id;
    // 先頭行は描画されず、スクロール先の行が描画されている
    await waitFor(() =>
      expect(container.querySelector(`svg [data-task-id="${firstTaskId}"]`)).toBeNull()
    );
    const svgBars = container.querySelectorAll('svg [data-task-id]');
    expect(svgBars.length).toBeGreaterThan(0);
    expect(svgBars.length).toBeLessThan(80);

    // 上部スペーサ（WBSボディの最初の div）の高さ = start × rowHeight
    const wbsBody = container.querySelector('[data-testid="wbs-panel"]')!
      .children[1] as HTMLElement; // [0]=ヘッダー, [1]=ボディ
    const spacer = wbsBody.firstElementChild as HTMLElement;
    const expected = calcVisibleRange(10800, 800, 36, 1000, 10).start * 36;
    expect(spacer.style.height).toBe(`${expected}px`);
  });

  it('QuickAddRow（タスク追加行）は仮想化後も常に表示される', () => {
    const { getByText } = renderChart();
    expect(getByText('＋ タスクを追加…')).toBeTruthy();
  });

  // ─── i18n（locale='en'）─────────────────────────────────────────────
  it('locale="en" のとき QuickAddRow の placeholder が英語表示される', () => {
    useTaskStore.setState({ locale: 'en' });
    const { getByText } = renderChart();
    expect(getByText('+ Add Task…')).toBeTruthy();
    useTaskStore.setState({ locale: 'ja' });
  });
});

describe('プロジェクト切り替え時の白画面対策', () => {
  it('下方スクロール後に行数が激減しても白画面にならない（行が描画される）', async () => {
    const { container, getByTestId } = renderChart();
    const panel = getByTestId('gantt-panel');

    // 行300 付近までスクロール（scrollTop state を大きくする）。
    // rAF スロットルが反映され先頭行が可視範囲外に出る＝state が確実に更新された状態を待つ。
    const firstTaskId = useTaskStore.getState().tasks[0].id;
    fireEvent.scroll(panel, { target: { scrollTop: 10800 } });
    await waitFor(() =>
      expect(container.querySelector(`svg [data-task-id="${firstTaskId}"]`)).toBeNull()
    );

    const rowSel = '[data-testid="wbs-panel"] [draggable="true"]';
    const rowsBefore = container.querySelectorAll(rowSel).length;

    // 行数の少ないプロジェクトに切り替わった状況を再現（tasks を 20 件へ置換）。
    // scrollTop state は過大（10800）なまま残る。
    useTaskStore.setState({ tasks: genLargeTasks(20) });

    // 置換後の再レンダリングが反映されるまで待つ（旧描画の行数から変化したら反映済み）。
    await waitFor(() =>
      expect(container.querySelectorAll(rowSel).length).not.toBe(rowsBefore)
    );

    // 反映後、可視範囲が空にならず行が描画されている＝白画面でないこと。
    expect(container.querySelectorAll(rowSel).length).toBeGreaterThan(0);
  });

  it('projectId が変わるとスクロールが先頭に戻る', async () => {
    const { container, getByTestId, rerender } = renderChart('p1');
    const panel = getByTestId('gantt-panel') as HTMLDivElement;

    fireEvent.scroll(panel, { target: { scrollTop: 10800 } });
    await waitFor(() =>
      expect(container.querySelector(`svg [data-task-id="${useTaskStore.getState().tasks[0].id}"]`)).toBeNull()
    );

    // 別プロジェクトへ切り替え
    rerender(
      <GanttChart
        projectId="p2"
        onEditTask={NOOP}
        onDeleteTask={NOOP}
        onInlineUpdate={NOOP}
        onQuickAdd={NOOP}
        onAddSubTask={NOOP}
        onReorder={NOOP}
        onCopyInsert={NOOP}
      />
    );

    // 先頭行が再び描画され、DOM スクロール位置も 0 に戻る
    await waitFor(() => {
      const firstId = useTaskStore.getState().tasks[0].id;
      expect(container.querySelector(`svg [data-task-id="${firstId}"]`)).not.toBeNull();
    });
    expect(panel.scrollTop).toBe(0);
  });
});
