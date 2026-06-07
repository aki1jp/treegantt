// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { GanttChart } from '../components/Gantt/GanttChart';
import { useTaskStore } from '../store/taskStore';
import type { Task } from '../types/task';

const NOOP = vi.fn();
let onInlineUpdate: ReturnType<typeof vi.fn>;

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
  onInlineUpdate = vi.fn();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-06-01T00:00:00.000Z'));
  localStorage.clear();
  useTaskStore.setState({
    tasks: [], needsReload: false,
    filterStatus: '', filterAssignee: '', filterPriority: '', filterSearch: '',
    zoomLevel: 'week',
    ganttStartDate: '2026-06-01',
    ganttPeriod: '3m',
    showLightningLine: false,
    showWeekend: false,
    showCriticalPath: false,
    showResourceView: false,
    uiFontSize: 13, uiRowHeight: 36,
    ganttHeaderLevels: { year: false, month: false, week: false, day: false },
    theme: 'auto', ganttBarOpen: true,
    depArrowStyle: 'bezier',
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
      onEditTask={NOOP}
      onDeleteTask={NOOP}
      onInlineUpdate={onInlineUpdate}
      onQuickAdd={NOOP}
      onAddSubTask={NOOP}
      onReorder={NOOP}
    />
  );
}

const ROW_H = 36;

// SVG の onMouseMove でホバー行を設定（JSDOM では getBoundingClientRect が {top:0} を返すので clientY がそのまま svgY になる）
function hoverRow(container: HTMLElement, rowIndex: number) {
  const svg = container.querySelector('svg');
  if (svg) fireEvent.mouseMove(svg, { clientY: rowIndex * ROW_H + Math.floor(ROW_H / 2) });
}

// ホバー後に出現するコネクタドット (data-connector-dot 属性付き circle)
function getConnectorDot(container: HTMLElement): SVGCircleElement | null {
  return container.querySelector<SVGCircleElement>('circle[data-connector-dot]');
}

// 依存矢印のヒットパスを探す (data-dep-from 属性を持つ path)
function getDepHitPaths(container: HTMLElement): SVGPathElement[] {
  return Array.from(container.querySelectorAll<SVGPathElement>('path[data-dep-from]'));
}

// リンクドラッグ中のターゲットドット (data-link-target-dot 属性付き circle)
function getLinkTargetDot(container: HTMLElement): SVGCircleElement | null {
  return container.querySelector<SVGCircleElement>('circle[data-link-target-dot]');
}

describe('ガントチャート — 先行・後続タスク設定', () => {

  describe('コネクタドット', () => {
    it('通常バーをホバーするとコネクタドットが描画される', () => {
      const task = makeTask();
      const { container } = renderChart([task]);
      expect(getConnectorDot(container)).toBeNull(); // ホバー前は存在しない
      hoverRow(container, 0);
      expect(getConnectorDot(container)).toBeTruthy(); // ホバー後に出現
    });

    it('マイルストーンをホバーしてもコネクタドットが描画されない', () => {
      const ms = makeTask({ isMilestone: true });
      const { container } = renderChart([ms]);
      hoverRow(container, 0);
      expect(getConnectorDot(container)).toBeNull();
    });
  });

  describe('ドラッグ・ツー・リンク（依存追加）', () => {
    it('コネクタドットをドラッグして別のバーにドロップすると predecessors が更新される', () => {
      const taskA = makeTask({ id: 'tA', startDate: '2026-06-10', endDate: '2026-06-15' });
      const taskB = makeTask({ id: 'tB', startDate: '2026-06-10', endDate: '2026-06-15' });
      const { container } = renderChart([taskA, taskB]);

      // tAの行（row 0）をホバー → 右端コネクタドット出現 → ドラッグ → tBの行（row 1）にドロップ
      hoverRow(container, 0);
      const dot = getConnectorDot(container)!;
      expect(dot).toBeTruthy();

      fireEvent.mouseDown(dot, { button: 0, clientX: 200, clientY: 18 }); // row 0
      fireEvent.mouseMove(window, { clientX: 200, clientY: 50 }); // row 1 (tB)
      fireEvent.mouseUp(window);

      expect(onInlineUpdate).toHaveBeenCalledWith('tB', { predecessors: ['tA'] });
    });

    it('同じタスクへのドロップでは onInlineUpdate が呼ばれない（自己参照防止）', () => {
      const taskA = makeTask({ id: 'tA' });
      const { container } = renderChart([taskA]);

      hoverRow(container, 0);
      const dot = getConnectorDot(container)!;
      fireEvent.mouseDown(dot, { button: 0, clientX: 200, clientY: 18 });
      fireEvent.mouseMove(window, { clientX: 200, clientY: 18 }); // 同じ row 0（自己参照）
      fireEvent.mouseUp(window);

      expect(onInlineUpdate).not.toHaveBeenCalled();
    });

    it('循環依存が発生する場合は onInlineUpdate が呼ばれない', () => {
      // tA → tB (tB.predecessors = ['tA'])
      const taskA = makeTask({ id: 'tA' });
      const taskB = makeTask({ id: 'tB', predecessors: ['tA'] });
      const { container } = renderChart([taskA, taskB]);

      // tBの右端ドット（row 1）をtAの行（row 0）にドロップ → tBがtAの先行になると循環
      hoverRow(container, 1);
      const dotB = getConnectorDot(container)!;
      expect(dotB).toBeTruthy();

      fireEvent.mouseDown(dotB, { button: 0, clientX: 200, clientY: 50 });
      fireEvent.mouseMove(window, { clientX: 200, clientY: 18 }); // row 0 (taskA)
      fireEvent.mouseUp(window);

      expect(onInlineUpdate).not.toHaveBeenCalled();
    });

    it('ESCキーでリンクドラッグをキャンセルできる', () => {
      const taskA = makeTask({ id: 'tA' });
      const taskB = makeTask({ id: 'tB' });
      const { container } = renderChart([taskA, taskB]);

      hoverRow(container, 0);
      const dot = getConnectorDot(container)!;
      fireEvent.mouseDown(dot, { button: 0, clientX: 200, clientY: 18 });
      fireEvent.mouseMove(window, { clientX: 200, clientY: 50 }); // row 1 (taskB)
      fireEvent.keyDown(window, { key: 'Escape' });
      fireEvent.mouseUp(window);

      expect(onInlineUpdate).not.toHaveBeenCalled();
    });
  });

  describe('親子間の依存追加禁止（v2.33）', () => {
    it('子タスクを親タスクの後続にドロップしても onInlineUpdate が呼ばれない', () => {
      // tP（親）→ tC（子）の構造、tC から tP へのリンクを試みる
      const taskP = makeTask({ id: 'tP', startDate: '2026-06-10', endDate: '2026-06-20' });
      const taskC = makeTask({ id: 'tC', parentId: 'tP', startDate: '2026-06-10', endDate: '2026-06-15' });
      const { container } = renderChart([taskP, taskC]);

      // tC（row 1）をホバーしてコネクタドットを出現させ、tP（row 0）へドロップ
      hoverRow(container, 1);
      const dot = getConnectorDot(container)!;
      expect(dot).toBeTruthy();
      fireEvent.mouseDown(dot, { button: 0, clientX: 200, clientY: 50 });
      fireEvent.mouseMove(window, { clientX: 200, clientY: 18 }); // row 0 (tP)
      fireEvent.mouseUp(window);

      expect(onInlineUpdate).not.toHaveBeenCalled();
    });

    it('親タスクを子タスクの後続にドロップしても onInlineUpdate が呼ばれない（v2.35: ドットは出るが drop が禁止）', () => {
      const taskP = makeTask({ id: 'tP', startDate: '2026-06-10', endDate: '2026-06-20' });
      const taskC = makeTask({ id: 'tC', parentId: 'tP', startDate: '2026-06-10', endDate: '2026-06-15' });
      const { container } = renderChart([taskP, taskC]);

      // tP（row 0）をホバー → 親タスクにもコネクタドットが表示される（v2.35）
      hoverRow(container, 0);
      const dot = getConnectorDot(container)!;
      expect(dot).toBeTruthy();

      // tP から tC（子）へドロップ → 祖先-子孫関係なので禁止
      fireEvent.mouseDown(dot, { button: 0, clientX: 200, clientY: 18 });
      fireEvent.mouseMove(window, { clientX: 200, clientY: 50 }); // row 1 (tC)
      fireEvent.mouseUp(window);
      expect(onInlineUpdate).not.toHaveBeenCalled();
    });
  });

  describe('親タスクと無関係タスク間の依存接続（v2.35）', () => {
    it('親タスクから無関係なタスクへは接続できる', () => {
      const taskP = makeTask({ id: 'tP', startDate: '2026-06-10', endDate: '2026-06-20' });
      const taskC = makeTask({ id: 'tC', parentId: 'tP', startDate: '2026-06-10', endDate: '2026-06-15' });
      const taskX = makeTask({ id: 'tX', startDate: '2026-06-21', endDate: '2026-06-25' });
      const { container } = renderChart([taskP, taskC, taskX]);

      // tP（row 0）から tX（row 2）へドラッグ → 無関係なので接続可
      hoverRow(container, 0);
      const dot = getConnectorDot(container)!;
      expect(dot).toBeTruthy();
      fireEvent.mouseDown(dot, { button: 0, clientX: 200, clientY: 18 });
      fireEvent.mouseMove(window, { clientX: 200, clientY: 90 }); // row 2 (tX)
      fireEvent.mouseUp(window);

      expect(onInlineUpdate).toHaveBeenCalledWith('tX', { predecessors: ['tP'] });
    });

    it('無関係なタスクから親タスクへも接続できる', () => {
      const taskP = makeTask({ id: 'tP', startDate: '2026-06-10', endDate: '2026-06-20' });
      const taskC = makeTask({ id: 'tC', parentId: 'tP', startDate: '2026-06-10', endDate: '2026-06-15' });
      const taskX = makeTask({ id: 'tX', startDate: '2026-06-01', endDate: '2026-06-08' });
      const { container } = renderChart([taskP, taskC, taskX]);

      // tX（row 2）から tP（row 0）へドラッグ → 無関係なので接続可
      hoverRow(container, 2);
      const dot = getConnectorDot(container)!;
      expect(dot).toBeTruthy();
      fireEvent.mouseDown(dot, { button: 0, clientX: 200, clientY: 90 });
      fireEvent.mouseMove(window, { clientX: 200, clientY: 18 }); // row 0 (tP)
      fireEvent.mouseUp(window);

      expect(onInlineUpdate).toHaveBeenCalledWith('tP', { predecessors: ['tX'] });
    });
  });

  describe('ドラッグ中の無効ターゲットドット非表示（v2.34）', () => {
    it('有効なターゲット行にドラッグするとターゲットドットが表示される', () => {
      const taskA = makeTask({ id: 'tA', startDate: '2026-06-10', endDate: '2026-06-15' });
      const taskB = makeTask({ id: 'tB', startDate: '2026-06-16', endDate: '2026-06-20' });
      const { container } = renderChart([taskA, taskB]);

      hoverRow(container, 0);
      const dot = getConnectorDot(container)!;
      fireEvent.mouseDown(dot, { button: 0, clientX: 200, clientY: 18 });
      fireEvent.mouseMove(window, { clientX: 200, clientY: 50 }); // row 1 (tB) — 有効
      expect(getLinkTargetDot(container)).toBeTruthy();
    });

    it('親子関係のタスクへドラッグしてもターゲットドットが表示されない', () => {
      const taskP = makeTask({ id: 'tP', startDate: '2026-06-10', endDate: '2026-06-20' });
      const taskC = makeTask({ id: 'tC', parentId: 'tP', startDate: '2026-06-10', endDate: '2026-06-15' });
      const { container } = renderChart([taskP, taskC]);

      // tC（row 1）からドラッグ → tP（row 0）は親 → ターゲットドット出ない
      hoverRow(container, 1);
      const dot = getConnectorDot(container)!;
      fireEvent.mouseDown(dot, { button: 0, clientX: 200, clientY: 50 });
      fireEvent.mouseMove(window, { clientX: 200, clientY: 18 }); // row 0 (tP)
      expect(getLinkTargetDot(container)).toBeNull();
    });

    it('循環依存になるタスクへドラッグしてもターゲットドットが表示されない', () => {
      // tA → tB の依存がある。tB の右端から tA へドラッグすると循環
      const taskA = makeTask({ id: 'tA', startDate: '2026-06-10', endDate: '2026-06-15' });
      const taskB = makeTask({ id: 'tB', startDate: '2026-06-16', endDate: '2026-06-20', predecessors: ['tA'] });
      const { container } = renderChart([taskA, taskB]);

      hoverRow(container, 1);
      const dot = getConnectorDot(container)!;
      fireEvent.mouseDown(dot, { button: 0, clientX: 200, clientY: 50 });
      fireEvent.mouseMove(window, { clientX: 200, clientY: 18 }); // row 0 (tA) — 循環
      expect(getLinkTargetDot(container)).toBeNull();
    });

    it('既に先行タスクとして登録済みのタスクへドラッグしてもターゲットドットが表示されない', () => {
      const taskA = makeTask({ id: 'tA', startDate: '2026-06-10', endDate: '2026-06-15' });
      const taskB = makeTask({ id: 'tB', startDate: '2026-06-16', endDate: '2026-06-20', predecessors: ['tA'] });
      const { container } = renderChart([taskA, taskB]);

      // tA（row 0）から tB（row 1）へ — 既に tA が tB の先行なので重複
      hoverRow(container, 0);
      const dot = getConnectorDot(container)!;
      fireEvent.mouseDown(dot, { button: 0, clientX: 200, clientY: 18 });
      fireEvent.mouseMove(window, { clientX: 200, clientY: 50 }); // row 1 (tB) — 既接続
      expect(getLinkTargetDot(container)).toBeNull();
    });
  });

  describe('クリティカルパス矢印（v2.31）', () => {
    it('showCriticalPath=false のとき矢印は通常色（#378ADD）', () => {
      const taskA = makeTask({ id: 'tA', startDate: '2026-06-10', endDate: '2026-06-15' });
      const taskB = makeTask({ id: 'tB', startDate: '2026-06-16', endDate: '2026-06-20', predecessors: ['tA'] });
      useTaskStore.setState({ showCriticalPath: false });
      const { container } = renderChart([taskA, taskB]);
      const arrowPaths = Array.from(container.querySelectorAll<SVGPathElement>('path[marker-end]'));
      expect(arrowPaths.length).toBeGreaterThan(0);
      expect(arrowPaths[0].getAttribute('stroke')).toBe('#378ADD');
    });

    it('showCriticalPath=true かつ両端タスクがクリティカルのとき矢印はインジゴ（#6366f1）', () => {
      // A→B の1本のみ: 両方クリティカルになる
      const taskA = makeTask({ id: 'tA', startDate: '2026-06-10', endDate: '2026-06-15' });
      const taskB = makeTask({ id: 'tB', startDate: '2026-06-16', endDate: '2026-06-20', predecessors: ['tA'] });
      useTaskStore.setState({ showCriticalPath: true });
      const { container } = renderChart([taskA, taskB]);
      const arrowPaths = Array.from(container.querySelectorAll<SVGPathElement>('path[marker-end]'));
      expect(arrowPaths.length).toBeGreaterThan(0);
      expect(arrowPaths[0].getAttribute('stroke')).toBe('#6366f1');
    });

    it('クリティカル矢印は strokeWidth が 2.5', () => {
      const taskA = makeTask({ id: 'tA', startDate: '2026-06-10', endDate: '2026-06-15' });
      const taskB = makeTask({ id: 'tB', startDate: '2026-06-16', endDate: '2026-06-20', predecessors: ['tA'] });
      useTaskStore.setState({ showCriticalPath: true });
      const { container } = renderChart([taskA, taskB]);
      const arrowPaths = Array.from(container.querySelectorAll<SVGPathElement>('path[marker-end]'));
      expect(arrowPaths[0].getAttribute('stroke-width')).toBe('2.5');
    });
  });

  describe('依存矢印の右クリック削除', () => {
    it('依存関係があるとき data-dep-from / data-dep-to 属性を持つパスが描画される', () => {
      const taskA = makeTask({ id: 'tA', startDate: '2026-06-10', endDate: '2026-06-15' });
      const taskB = makeTask({ id: 'tB', startDate: '2026-06-17', endDate: '2026-06-20', predecessors: ['tA'] });
      const { container } = renderChart([taskA, taskB]);

      const hitPaths = getDepHitPaths(container);
      expect(hitPaths.length).toBe(1);
      expect(hitPaths[0].getAttribute('data-dep-from')).toBe('tA');
      expect(hitPaths[0].getAttribute('data-dep-to')).toBe('tB');
    });

    it('依存矢印を右クリックすると「依存を解除」メニューが表示される', () => {
      const taskA = makeTask({ id: 'tA', startDate: '2026-06-10', endDate: '2026-06-15' });
      const taskB = makeTask({ id: 'tB', startDate: '2026-06-17', endDate: '2026-06-20', predecessors: ['tA'] });
      const { container, getByText } = renderChart([taskA, taskB]);

      const hitPath = getDepHitPaths(container)[0];
      fireEvent.contextMenu(hitPath, { clientX: 100, clientY: 50 });

      expect(getByText('依存を解除')).toBeTruthy();
    });

    it('「依存を解除」をクリックすると predecessors から削除される', () => {
      const taskA = makeTask({ id: 'tA', startDate: '2026-06-10', endDate: '2026-06-15' });
      const taskB = makeTask({ id: 'tB', startDate: '2026-06-17', endDate: '2026-06-20', predecessors: ['tA'] });
      const { container, getByText } = renderChart([taskA, taskB]);

      const hitPath = getDepHitPaths(container)[0];
      fireEvent.contextMenu(hitPath, { clientX: 100, clientY: 50 });

      fireEvent.click(getByText('依存を解除'));
      expect(onInlineUpdate).toHaveBeenCalledWith('tB', { predecessors: [] });
    });
  });

  describe('依存矢印スタイル（v2.36）', () => {
    const makeDepTasks = () => ({
      taskA: makeTask({ id: 'tA', startDate: '2026-06-10', endDate: '2026-06-15' }),
      taskB: makeTask({ id: 'tB', startDate: '2026-06-17', endDate: '2026-06-20', predecessors: ['tA'] }),
    });

    it('bezier スタイルのとき矢印パスの d 属性に C コマンドが含まれる', () => {
      useTaskStore.setState({ depArrowStyle: 'bezier' });
      const { taskA, taskB } = makeDepTasks();
      const { container } = renderChart([taskA, taskB]);
      const paths = Array.from(container.querySelectorAll<SVGPathElement>('path[marker-end]'));
      expect(paths.length).toBeGreaterThan(0);
      expect(paths[0].getAttribute('d')).toContain('C');
    });

    it('elbow スタイルのとき矢印パスの d 属性に C コマンドが含まれない', () => {
      useTaskStore.setState({ depArrowStyle: 'elbow' });
      const { taskA, taskB } = makeDepTasks();
      const { container } = renderChart([taskA, taskB]);
      const paths = Array.from(container.querySelectorAll<SVGPathElement>('path[marker-end]'));
      expect(paths.length).toBeGreaterThan(0);
      expect(paths[0].getAttribute('d')).not.toContain('C');
    });

    it('straight スタイルのとき矢印パスの d 属性が M...L...形式', () => {
      useTaskStore.setState({ depArrowStyle: 'straight' });
      const { taskA, taskB } = makeDepTasks();
      const { container } = renderChart([taskA, taskB]);
      const paths = Array.from(container.querySelectorAll<SVGPathElement>('path[marker-end]'));
      expect(paths.length).toBeGreaterThan(0);
      const d = paths[0].getAttribute('d')!;
      expect(d).toMatch(/^M[\d.,]+ L[\d.,]+$/);
    });
  });
});
