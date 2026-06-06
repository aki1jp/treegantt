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

// コネクタドットを探す (GanttBarの右端ドット: data-connector-dot 属性付き circle)
function getConnectorDots(container: HTMLElement): SVGCircleElement[] {
  return Array.from(container.querySelectorAll<SVGCircleElement>('circle[data-connector-dot]'));
}

// 依存矢印のヒットパスを探す (data-dep-from 属性を持つ path)
function getDepHitPaths(container: HTMLElement): SVGPathElement[] {
  return Array.from(container.querySelectorAll<SVGPathElement>('path[data-dep-from]'));
}

const ROW_H = 36;

describe('ガントチャート — 先行・後続タスク設定', () => {

  describe('コネクタドット', () => {
    it('通常バーにコネクタドットが描画される', () => {
      const task = makeTask();
      const { container } = renderChart([task]);
      const dots = getConnectorDots(container);
      expect(dots.length).toBeGreaterThan(0);
    });

    it('コネクタドットはデフォルトで opacity=0（非表示）', () => {
      const task = makeTask();
      const { container } = renderChart([task]);
      const dot = getConnectorDots(container)[0];
      expect(Number(dot.getAttribute('opacity'))).toBe(0);
    });

    it('マイルストーンにはコネクタドットが描画されない', () => {
      const ms = makeTask({ isMilestone: true });
      const { container } = renderChart([ms]);
      const dots = getConnectorDots(container);
      expect(dots.length).toBe(0);
    });
  });

  describe('ドラッグ・ツー・リンク（依存追加）', () => {
    it('コネクタドットをドラッグして別のバーにドロップすると predecessors が更新される', () => {
      const taskA = makeTask({ id: 'tA', startDate: '2026-06-10', endDate: '2026-06-15' });
      const taskB = makeTask({ id: 'tB', startDate: '2026-06-10', endDate: '2026-06-15' });
      const { container } = renderChart([taskA, taskB]);

      // tAのコネクタドット（row 0・右端）をドラッグ → tBの行（row 1）にドロップ → tAがtBの先行に
      const dots = getConnectorDots(container);
      const dotA = dots[0]; // tA (row 0)
      expect(dotA).toBeTruthy();

      fireEvent.mouseDown(dotA, { button: 0, clientX: 200, clientY: 18 }); // row 0
      fireEvent.mouseMove(window, { clientX: 200, clientY: 50 }); // row 1 (tB)
      fireEvent.mouseUp(window);

      expect(onInlineUpdate).toHaveBeenCalledWith('tB', { predecessors: ['tA'] });
    });

    it('同じタスクへのドロップでは onInlineUpdate が呼ばれない（自己参照防止）', () => {
      const taskA = makeTask({ id: 'tA' });
      const { container } = renderChart([taskA]);

      const dot = getConnectorDots(container)[0]; // tA の右端ドット (row 0)
      // row 0 の中心(y=18)に MouseMove → 同じタスクA（自己参照）
      fireEvent.mouseDown(dot, { button: 0, clientX: 200, clientY: 18 });
      fireEvent.mouseMove(window, { clientX: 200, clientY: 18 });
      fireEvent.mouseUp(window);

      expect(onInlineUpdate).not.toHaveBeenCalled();
    });

    it('循環依存が発生する場合は onInlineUpdate が呼ばれない', () => {
      // tA → tB (tB.predecessors = ['tA'])
      const taskA = makeTask({ id: 'tA' });
      const taskB = makeTask({ id: 'tB', predecessors: ['tA'] });
      const { container } = renderChart([taskA, taskB]);

      // tBの右端ドット（row 1）をtAの行（row 0）にドロップ → tBがtAの先行になると循環
      const dots = getConnectorDots(container);
      // 2つのドット (taskA row 0, taskB row 1)
      const dotB = dots[1];
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

      const dot = getConnectorDots(container)[0];
      fireEvent.mouseDown(dot, { button: 0, clientX: 200, clientY: 18 });
      fireEvent.mouseMove(window, { clientX: 200, clientY: 50 }); // row 1 (taskB)
      // ESCでキャンセル
      fireEvent.keyDown(window, { key: 'Escape' });
      fireEvent.mouseUp(window);

      expect(onInlineUpdate).not.toHaveBeenCalled();
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
      // dep path に直接 contextmenu を発火 → バブリングで SVG のネイティブリスナーが受け取る
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
});
