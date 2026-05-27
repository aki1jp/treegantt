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

describe('WBS 行D&D — ドロップ位置インジケーター', () => {
  function makeTwoTasks(): Task[] {
    return [
      {
        id: 'di-t1', projectId: 'p1', parentId: null,
        title: 'タスク1', summary: '', description: '',
        status: 'todo', priority: 'medium', progress: 0, assignee: '',
        startDate: '2026-05-01', endDate: '2026-05-31',
        isMilestone: false, predecessors: [], seq: 1, order: 1,
        createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'di-t2', projectId: 'p1', parentId: null,
        title: 'タスク2', summary: '', description: '',
        status: 'todo', priority: 'medium', progress: 0, assignee: '',
        startDate: '2026-05-01', endDate: '2026-05-31',
        isMilestone: false, predecessors: [], seq: 2, order: 2,
        createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];
  }

  function renderWithTwoTasks() {
    useTaskStore.setState({ tasks: makeTwoTasks(), ganttStartDate: '2026-05-01', showResourceView: false });
    return render(
      <GanttChart onEditTask={NOOP} onDeleteTask={NOOP} onInlineUpdate={NOOP}
        onQuickAdd={NOOP} onAddSubTask={NOOP} onReorder={NOOP} />
    );
  }

  it('別の行に dragOver すると [data-drop-line] が表示される', () => {
    const { getByTestId } = renderWithTwoTasks();
    const wbsPanel = getByTestId('wbs-panel');
    const rows = wbsPanel.querySelectorAll('[draggable="true"]');
    // row[1] をドラッグ → row[0] の前に移動（有効な移動）
    fireEvent.dragStart(rows[1]);
    fireEvent.dragOver(rows[0]);
    expect(wbsPanel.querySelector('[data-drop-line]')).toBeTruthy();
  });

  it('ドラッグ中の行自身に dragOver しても [data-drop-line] は表示されない', () => {
    const { getByTestId } = renderWithTwoTasks();
    const wbsPanel = getByTestId('wbs-panel');
    const rows = wbsPanel.querySelectorAll('[draggable="true"]');
    fireEvent.dragStart(rows[0]);
    fireEvent.dragOver(rows[0]);
    expect(wbsPanel.querySelector('[data-drop-line]')).toBeNull();
  });

  it('no-op 位置（dragIdx+1 = 直下行）に dragOver しても [data-drop-line] は表示されない', () => {
    const { getByTestId } = renderWithTwoTasks();
    const wbsPanel = getByTestId('wbs-panel');
    const rows = wbsPanel.querySelectorAll('[draggable="true"]');
    // row[0] のドラッグ → row[1]（idx=1 = dragIdx+1）は no-op
    fireEvent.dragStart(rows[0]);
    fireEvent.dragOver(rows[1]);
    // row[1] のドラッグ → row[0] に移動する場合は有効なはず
    // ここでは row[0](dragIdx=0) を row[1](idx=1) へ → no-op なのでなし
    expect(wbsPanel.querySelector('[data-drop-line]')).toBeNull();
  });

  it('dragEnd 後は [data-drop-line] が消える', () => {
    const { getByTestId } = renderWithTwoTasks();
    const wbsPanel = getByTestId('wbs-panel');
    const rows = wbsPanel.querySelectorAll('[draggable="true"]');
    // row[1] をドラッグして row[0] に向かわせる（有効な移動）
    fireEvent.dragStart(rows[1]);
    fireEvent.dragOver(rows[0]);
    expect(wbsPanel.querySelector('[data-drop-line]')).toBeTruthy();
    fireEvent.dragEnd(rows[1]);
    expect(wbsPanel.querySelector('[data-drop-line]')).toBeNull();
  });
});

describe('WBS 行D&D — マウス位置によるインデント深さ選択', () => {
  // flatRows の構成: root-a(depth=0), parent-p(depth=0), child-c(parentId=parent-p, depth=1)
  function makeThreeTasks(): Task[] {
    return [
      {
        id: 'root-a', projectId: 'p1', parentId: null,
        title: 'ルートA', summary: '', description: '',
        status: 'todo', priority: 'medium', progress: 0, assignee: '',
        startDate: '2026-05-01', endDate: '2026-05-31',
        isMilestone: false, predecessors: [], seq: 1, order: 1,
        createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'parent-p', projectId: 'p1', parentId: null,
        title: '親P', summary: '', description: '',
        status: 'todo', priority: 'medium', progress: 0, assignee: '',
        startDate: '2026-05-01', endDate: '2026-05-31',
        isMilestone: false, predecessors: [], seq: 2, order: 2,
        createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'child-c', projectId: 'p1', parentId: 'parent-p',
        title: '子C', summary: '', description: '',
        status: 'todo', priority: 'medium', progress: 0, assignee: '',
        startDate: '2026-05-01', endDate: '2026-05-31',
        isMilestone: false, predecessors: [], seq: 3, order: 3,
        createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];
  }

  function renderWith3Tasks(onReorder = vi.fn()) {
    useTaskStore.setState({ tasks: makeThreeTasks(), ganttStartDate: '2026-05-01', showResourceView: false });
    return render(
      <GanttChart onEditTask={NOOP} onDeleteTask={NOOP} onInlineUpdate={NOOP}
        onQuickAdd={NOOP} onAddSubTask={NOOP} onReorder={onReorder} />
    );
  }

  it('clientX=58（depth=1）→ child-c の前にドロップすると parentId: parent-p が渡る', () => {
    const onReorder = vi.fn();
    const { getByTestId } = renderWith3Tasks(onReorder);
    const rows = getByTestId('wbs-panel').querySelectorAll('[draggable="true"]');
    // rows[0]=root-a, rows[1]=parent-p, rows[2]=child-c
    // ▼マーク基点(42px) + depth=1 → clientX=58
    fireEvent.dragStart(rows[0]);
    fireEvent(rows[2], new MouseEvent('dragover', { bubbles: true, cancelable: true, clientX: 58 }));
    fireEvent(rows[2], new MouseEvent('drop',     { bubbles: true, cancelable: true, clientX: 58 }));
    expect(onReorder).toHaveBeenCalledOnce();
    const orders: { id: string; parentId?: string | null }[] = onReorder.mock.calls[0][0];
    expect(orders.find(o => o.id === 'root-a')?.parentId).toBe('parent-p');
  });

  it('clientX=42（depth=0）→ child-c の前にドロップすると parentId: null（root）が渡る', () => {
    const onReorder = vi.fn();
    const { getByTestId } = renderWith3Tasks(onReorder);
    const rows = getByTestId('wbs-panel').querySelectorAll('[draggable="true"]');
    // ▼マーク基点(42px) → depth=0
    fireEvent.dragStart(rows[0]);
    fireEvent(rows[2], new MouseEvent('dragover', { bubbles: true, cancelable: true, clientX: 42 }));
    fireEvent(rows[2], new MouseEvent('drop',     { bubbles: true, cancelable: true, clientX: 42 }));
    expect(onReorder).toHaveBeenCalledOnce();
    const orders: { id: string; parentId?: string | null }[] = onReorder.mock.calls[0][0];
    // root-a はもともと root なので parentId フィールド自体が存在しないか undefined
    expect(orders.find(o => o.id === 'root-a')?.parentId).toBeUndefined();
  });

  it('dragOver 時のインジケーター left が clientX に連動した depth を反映する', () => {
    const { getByTestId } = renderWith3Tasks();
    const wbsPanel = getByTestId('wbs-panel');
    const rows = wbsPanel.querySelectorAll('[draggable="true"]');
    // ▼マーク基点(42px) + depth=1(16px) → left=58px
    fireEvent.dragStart(rows[0]);
    fireEvent(rows[2], new MouseEvent('dragover', { bubbles: true, cancelable: true, clientX: 58 }));
    const line = wbsPanel.querySelector('[data-drop-line]') as HTMLElement;
    expect(line).toBeTruthy();
    expect(line.style.left).toBe('58px');
  });

  it('depth=0 のとき left=42px（▼マーク基点・フルバー）', () => {
    const { getByTestId } = renderWith3Tasks();
    const wbsPanel = getByTestId('wbs-panel');
    const rows = wbsPanel.querySelectorAll('[draggable="true"]');
    // ▼マーク基点(42px) → depth=0 → left=42px
    fireEvent.dragStart(rows[0]);
    fireEvent(rows[2], new MouseEvent('dragover', { bubbles: true, cancelable: true, clientX: 42 }));
    const line = wbsPanel.querySelector('[data-drop-line]') as HTMLElement;
    expect(line).toBeTruthy();
    expect(line.style.left).toBe('42px');
  });
});

describe('WBS 日付インライン編集 — onChange で即時コミット', () => {
  const TODAY = '2026-05-26';
  const onInlineUpdate = vi.fn();

  function makeEditTask(): Task {
    return {
      id: 'e1', projectId: 'p1', parentId: null,
      title: '編集タスク', summary: '', description: '',
      status: 'todo', priority: 'medium', progress: 0, assignee: '',
      startDate: '2026-05-01', endDate: '2026-05-31',
      isMilestone: false, predecessors: [], seq: 1, order: 1,
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    };
  }

  beforeEach(() => {
    onInlineUpdate.mockClear();
    useTaskStore.setState({ tasks: [makeEditTask()], ganttStartDate: '2026-05-01', showResourceView: false });
  });

  function renderEditChart() {
    return render(
      <GanttChart onEditTask={NOOP} onDeleteTask={NOOP} onInlineUpdate={onInlineUpdate}
        onQuickAdd={NOOP} onAddSubTask={NOOP} onReorder={NOOP} />
    );
  }

  it('開始日セルをクリックすると date input が表示される', () => {
    const { container } = renderEditChart();
    const wbsPanel = container.querySelector('[data-testid="wbs-panel"]') as HTMLElement;
    const spans = wbsPanel.querySelectorAll('span');
    const startSpan = Array.from(spans).find(s => s.textContent === '2026-05-01');
    expect(startSpan).toBeTruthy();
    fireEvent.click(startSpan!);
    const input = wbsPanel.querySelector('input[type="date"]');
    expect(input).toBeTruthy();
  });

  it('date input の onChange（ピッカー選択相当）で即時コミットされ編集モードが閉じる', () => {
    const { container } = renderEditChart();
    const wbsPanel = container.querySelector('[data-testid="wbs-panel"]') as HTMLElement;
    const startSpan = Array.from(wbsPanel.querySelectorAll('span')).find(s => s.textContent === '2026-05-01');
    fireEvent.click(startSpan!);

    const input = wbsPanel.querySelector('input[type="date"]') as HTMLInputElement;
    expect(input).toBeTruthy();

    // ピッカーの「今日」ボタン押下と同等: onChange が発火し blur は発火しない
    fireEvent.change(input, { target: { value: TODAY } });

    // onInlineUpdate が即座に呼ばれるべき
    expect(onInlineUpdate).toHaveBeenCalledWith('e1', { startDate: TODAY });

    // 編集モードが閉じて input が消えているべき
    expect(wbsPanel.querySelector('input[type="date"]')).toBeNull();
  });

  it('終了日セルの onChange でも即時コミットされる', () => {
    const { container } = renderEditChart();
    const wbsPanel = container.querySelector('[data-testid="wbs-panel"]') as HTMLElement;
    const endSpan = Array.from(wbsPanel.querySelectorAll('span')).find(s => s.textContent === '2026-05-31');
    fireEvent.click(endSpan!);

    const input = wbsPanel.querySelector('input[type="date"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: TODAY } });

    expect(onInlineUpdate).toHaveBeenCalledWith('e1', { endDate: TODAY });
    expect(wbsPanel.querySelector('input[type="date"]')).toBeNull();
  });
});

describe('WBS 日付バリデーション — 開始日・終了日の前後矛盾防止', () => {
  const onInlineUpdate = vi.fn();

  function makeTask2(): Task {
    return {
      id: 'v1', projectId: 'p1', parentId: null,
      title: 'バリデーションタスク', summary: '', description: '',
      status: 'todo', priority: 'medium', progress: 0, assignee: '',
      startDate: '2026-05-10', endDate: '2026-05-20',
      isMilestone: false, predecessors: [], seq: 1, order: 1,
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    };
  }

  beforeEach(() => {
    onInlineUpdate.mockClear();
    useTaskStore.setState({ tasks: [makeTask2()], ganttStartDate: '2026-05-01', showResourceView: false });
  });

  function renderValidationChart() {
    return render(
      <GanttChart onEditTask={NOOP} onDeleteTask={NOOP} onInlineUpdate={onInlineUpdate}
        onQuickAdd={NOOP} onAddSubTask={NOOP} onReorder={NOOP} />
    );
  }

  it('開始日を終了日より後に設定すると両方が新開始日にクランプされる', () => {
    const { container } = renderValidationChart();
    const wbsPanel = container.querySelector('[data-testid="wbs-panel"]') as HTMLElement;
    const startSpan = Array.from(wbsPanel.querySelectorAll('span')).find(s => s.textContent === '2026-05-10');
    fireEvent.click(startSpan!);
    const input = wbsPanel.querySelector('input[type="date"]') as HTMLInputElement;
    // 終了日(2026-05-20)より後の日付を設定
    fireEvent.change(input, { target: { value: '2026-05-25' } });
    expect(onInlineUpdate).toHaveBeenCalledWith('v1', { startDate: '2026-05-25', endDate: '2026-05-25' });
  });

  it('終了日を開始日より前に設定すると両方が新終了日にクランプされる', () => {
    const { container } = renderValidationChart();
    const wbsPanel = container.querySelector('[data-testid="wbs-panel"]') as HTMLElement;
    const endSpan = Array.from(wbsPanel.querySelectorAll('span')).find(s => s.textContent === '2026-05-20');
    fireEvent.click(endSpan!);
    const input = wbsPanel.querySelector('input[type="date"]') as HTMLInputElement;
    // 開始日(2026-05-10)より前の日付を設定
    fireEvent.change(input, { target: { value: '2026-05-05' } });
    expect(onInlineUpdate).toHaveBeenCalledWith('v1', { startDate: '2026-05-05', endDate: '2026-05-05' });
  });

  it('有効な開始日（終了日以前）は通常通りコミットされる', () => {
    const { container } = renderValidationChart();
    const wbsPanel = container.querySelector('[data-testid="wbs-panel"]') as HTMLElement;
    const startSpan = Array.from(wbsPanel.querySelectorAll('span')).find(s => s.textContent === '2026-05-10');
    fireEvent.click(startSpan!);
    const input = wbsPanel.querySelector('input[type="date"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '2026-05-15' } });
    expect(onInlineUpdate).toHaveBeenCalledWith('v1', { startDate: '2026-05-15' });
  });

  it('有効な終了日（開始日以降）は通常通りコミットされる', () => {
    const { container } = renderValidationChart();
    const wbsPanel = container.querySelector('[data-testid="wbs-panel"]') as HTMLElement;
    const endSpan = Array.from(wbsPanel.querySelectorAll('span')).find(s => s.textContent === '2026-05-20');
    fireEvent.click(endSpan!);
    const input = wbsPanel.querySelector('input[type="date"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '2026-05-15' } });
    expect(onInlineUpdate).toHaveBeenCalledWith('v1', { endDate: '2026-05-15' });
  });
});
