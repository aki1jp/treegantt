// @vitest-environment jsdom
/**
 * WBS 列レイアウトの相対座標化テスト（ec364c3 で追加された「行」列36pxに、
 * 固定 px で列幅を二重管理している箇所が追随していない不具合の回帰テスト）。
 *
 * QuickAddRow（クイック追加行）の先頭スペーサが1列ぶん（36px）しかなく本来必要な
 * 「行」+「#」の2列ぶん（72px）に満たないこと、末尾セルが wbsHiddenCols を無視した
 * 固定配列であること、WBS パネル閉時の LEFT_TOTAL が本体の描画幅（72px）と食い違う
 * ハードコード値（36px）のままであることを、GanttChart を実レンダーして DOM の
 * inline style から検証する。
 *
 * 実装（QuickAddRow.tsx への data-testid="wbs-quick-add-row" 付与、wbsHiddenCols 追従、
 * GanttChart.tsx の LEFT_TOTAL 修正、GanttLeftRow.tsx の borderLeft→boxShadow 変更）は
 * まだ行われていないため、本ファイルのテストは全て失敗するのが正しい（TDD 赤）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
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
    showResourceView: false,
    showMilestones: true,
    uiFontSize: 13,
    uiRowHeight: 36,
    ganttHeaderLevels: { year: true, month: true, week: true, day: true },
    theme: 'auto',
    ganttBarOpen: true,
    wbsPanelOpen: true,
    wbsHiddenCols: [],
  });
});

// GanttChart.tsx の colWidths 既定値（title:180）。QuickAddRow/GanttLeftRow の
// タイトルセルは常にこの幅で描画されるため、目印としてセル列から検出するのに使う。
const TITLE_WIDTH = 180;

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 't1', projectId: 'p1', parentId: null,
    title: 'タスク1', summary: '', description: '',
    status: 'todo', priority: 'medium', progress: 0, assignee: '',
    startDate: '2026-05-01', endDate: '2026-05-31',
    isMilestone: false, predecessors: [], seq: 1, order: 1,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    titleColor: null, titleBgColor: null, estimateMinutes: null,
    ...overrides,
  };
}

function renderChart() {
  return render(
    <GanttChart onEditTask={NOOP} onDeleteTask={NOOP} onInlineUpdate={NOOP}
      onQuickAdd={NOOP} onAddSubTask={NOOP} onReorder={NOOP} onCopyInsert={NOOP} />
  );
}

/** 行要素（GanttLeftRow / QuickAddRow のルート div）直下の各セル div の width(px) を数値配列にする。
 *  width が明示されていない要素（列設定ボタン等の絶対配置要素）は NaN になる。 */
function cellWidths(rowEl: HTMLElement): number[] {
  return Array.from(rowEl.children).map(c => parseFloat((c as HTMLElement).style.width));
}

/** 直下セルの width(px) 合計。width 未指定セル（NaN）は 0 として無視する。 */
function sumCellWidths(rowEl: HTMLElement): number {
  return cellWidths(rowEl).reduce((a, b) => a + (Number.isNaN(b) ? 0 : b), 0);
}

/** width===targetWidth の最初のセルより左にあるセル幅の合計（左オフセット＝タイトル開始X）。 */
function leadingWidthBefore(rowEl: HTMLElement, targetWidth: number): number {
  const widths = cellWidths(rowEl);
  const idx = widths.indexOf(targetWidth);
  if (idx === -1) throw new Error(`目的の幅(${targetWidth}px)を持つセルが見つからない: [${widths.join(',')}]`);
  return widths.slice(0, idx).reduce((a, b) => a + (Number.isNaN(b) ? 0 : b), 0);
}

/** タスク行（GanttLeftRow）のルート div。[draggable="true"] ラッパー配下の最初の子 div
 *  （ドラッグ中でなければ drop-line は出ないので、これが GanttLeftRow 自身のルート div になる）。 */
function taskRowRoot(wbsPanel: HTMLElement, nth = 0): HTMLElement {
  const wrappers = wbsPanel.querySelectorAll('[draggable="true"]');
  const wrapper = wrappers[nth] as HTMLElement | undefined;
  if (!wrapper) throw new Error('タスク行（[draggable="true"]）が見つからない');
  return wrapper.children[0] as HTMLElement;
}

/** QuickAddRow のルート div。実装側に data-testid="wbs-quick-add-row" が付く前提。 */
function quickAddRoot(container: HTMLElement): HTMLElement {
  const el = container.querySelector('[data-testid="wbs-quick-add-row"]');
  if (!el) throw new Error('data-testid="wbs-quick-add-row" が見つからない（QuickAddRow 未実装）');
  return el as HTMLElement;
}

describe('WBS列レイアウト — 既定状態', () => {
  beforeEach(() => {
    useTaskStore.setState({ tasks: [makeTask()], ganttStartDate: '2026-05-01' });
  });

  it('クイック追加行の title セル左オフセットがタスク行の title セル左オフセットと一致する', () => {
    const { container, getByTestId } = renderChart();
    const wbsPanel = getByTestId('wbs-panel');
    const taskOffset = leadingWidthBefore(taskRowRoot(wbsPanel), TITLE_WIDTH);
    const quickAddOffset = leadingWidthBefore(quickAddRoot(container), TITLE_WIDTH);
    // 「行」(36) + 「#」(36) = 72px が既定の左オフセット
    expect(taskOffset).toBe(72);
    expect(quickAddOffset).toBe(taskOffset);
  });

  it('クイック追加行のセル幅構成（配列）がタスク行と完全一致する', () => {
    const { container, getByTestId } = renderChart();
    const wbsPanel = getByTestId('wbs-panel');
    expect(cellWidths(quickAddRoot(container))).toEqual(cellWidths(taskRowRoot(wbsPanel)));
  });
});

describe('WBS列レイアウト — 列の表示ON/OFFに追従する', () => {
  beforeEach(() => {
    useTaskStore.setState({
      tasks: [makeTask()],
      ganttStartDate: '2026-05-01',
      wbsHiddenCols: ['status', 'priority', 'assignee'],
    });
  });

  it('列を隠した状態でも title セル左オフセットが一致する', () => {
    const { container, getByTestId } = renderChart();
    const wbsPanel = getByTestId('wbs-panel');
    const taskOffset = leadingWidthBefore(taskRowRoot(wbsPanel), TITLE_WIDTH);
    const quickAddOffset = leadingWidthBefore(quickAddRoot(container), TITLE_WIDTH);
    expect(quickAddOffset).toBe(taskOffset);
  });

  it('列を隠した状態でクイック追加行のセル数・幅構成がタスク行と一致する（隠した列は現れない）', () => {
    const { container, getByTestId } = renderChart();
    const wbsPanel = getByTestId('wbs-panel');
    const taskWidths = cellWidths(taskRowRoot(wbsPanel));
    const quickAddWidths = cellWidths(quickAddRoot(container));
    // rowNumber, order, title, progress, startDate, endDate, duration の7列のみ
    expect(taskWidths.length).toBe(7);
    expect(quickAddWidths).toEqual(taskWidths);
  });
});

describe('WBS列レイアウト — 総幅の一致（クイック追加行・タスク行・ヘッダー・パネル幅）', () => {
  function expectAllTotalsMatch() {
    const { container, getByTestId } = renderChart();
    const wbsPanel = getByTestId('wbs-panel');
    const wbsHeader = getByTestId('wbs-header');
    const panelWidth = parseFloat(wbsPanel.style.width);
    const taskTotal = sumCellWidths(taskRowRoot(wbsPanel));
    const quickAddTotal = sumCellWidths(quickAddRoot(container));
    const headerTotal = sumCellWidths(wbsHeader);
    expect(taskTotal).toBe(panelWidth);
    expect(headerTotal).toBe(panelWidth);
    expect(quickAddTotal).toBe(panelWidth);
  }

  it('既定状態: 4箇所の総幅が一致する', () => {
    useTaskStore.setState({ tasks: [makeTask()], ganttStartDate: '2026-05-01' });
    expectAllTotalsMatch();
  });

  it('列を隠した状態: 4箇所の総幅が一致する', () => {
    useTaskStore.setState({
      tasks: [makeTask()],
      ganttStartDate: '2026-05-01',
      wbsHiddenCols: ['status', 'priority', 'assignee'],
    });
    expectAllTotalsMatch();
  });
});

describe('WBS列レイアウト — フォントサイズ連動（日付列幅の変化に追従する）', () => {
  function expectAllTotalsMatch() {
    const { container, getByTestId } = renderChart();
    const wbsPanel = getByTestId('wbs-panel');
    const panelWidth = parseFloat(wbsPanel.style.width);
    expect(sumCellWidths(taskRowRoot(wbsPanel))).toBe(panelWidth);
    expect(sumCellWidths(quickAddRoot(container))).toBe(panelWidth);
  }

  it('uiFontSize=11（dateColWidth=80）でも総幅が一致する', () => {
    useTaskStore.setState({ tasks: [makeTask()], ganttStartDate: '2026-05-01', uiFontSize: 11 });
    expectAllTotalsMatch();
  });

  it('uiFontSize=15（dateColWidth=100）でも総幅が一致する', () => {
    useTaskStore.setState({ tasks: [makeTask()], ganttStartDate: '2026-05-01', uiFontSize: 15 });
    expectAllTotalsMatch();
  });
});

describe('WBS列レイアウト — WBSパネル閉状態', () => {
  it('パネルが閉じているときタスク行の全セル幅合計がパネル幅と一致する（列が欠けない）', () => {
    useTaskStore.setState({ tasks: [makeTask()], ganttStartDate: '2026-05-01', wbsPanelOpen: false });
    const { getByTestId } = renderChart();
    const wbsPanel = getByTestId('wbs-panel');
    const panelWidth = parseFloat(wbsPanel.style.width);
    // 「行」(36) + 「#」(36) = 72px（タイトル以降は wbsPanelOpen=false で非表示）
    expect(sumCellWidths(taskRowRoot(wbsPanel))).toBe(72);
    expect(panelWidth).toBe(72);
  });
});

describe('WBS列レイアウト — ルート親行の左帯（borderLeft→boxShadow inset化）', () => {
  it('子を持つ depth=0 の行は borderLeft で幅を増やさず boxShadow の inset で帯を描く', () => {
    useTaskStore.setState({
      tasks: [
        makeTask({ id: 'parent', title: '親タスク', order: 1 }),
        makeTask({ id: 'child', title: '子タスク', parentId: 'parent', order: 2, seq: 2 }),
      ],
      ganttStartDate: '2026-05-01',
    });
    const { getByTestId } = renderChart();
    const wbsPanel = getByTestId('wbs-panel');
    const row = taskRowRoot(wbsPanel, 0); // 親タスク（depth=0, hasChildren=true）が先頭行のはず
    expect(row.style.borderLeft === '' || row.style.borderLeft === 'none').toBe(true);
    expect(row.style.boxShadow).toContain('inset');
  });
});
