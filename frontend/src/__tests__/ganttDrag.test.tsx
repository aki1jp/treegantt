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
    title: 'T', summary: '', description: '',
    status: 'todo', priority: 'medium', progress: 0, assignee: '',
    startDate: '2026-06-10', endDate: '2026-06-15',
    isMilestone: false, predecessors: [], seq, order: seq,
    createdAt: '', updatedAt: '', titleColor: null, titleBgColor: null,
    ...overrides,
  };
}

// zoom='week' → dayWidth=8px
const DAY_W = 8;

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

function getMoveZone(container: HTMLElement): SVGRectElement | undefined {
  return Array.from(container.querySelectorAll<SVGRectElement>('rect'))
    .find(r => r.style.cursor === 'move');
}

function getResizeHandles(container: HTMLElement): SVGRectElement[] {
  return Array.from(container.querySelectorAll<SVGRectElement>('rect'))
    .filter(r => r.style.cursor === 'ew-resize');
}

function getCreateRow(container: HTMLElement): SVGRectElement | undefined {
  return Array.from(container.querySelectorAll<SVGRectElement>('rect'))
    .find(r => r.style.cursor === 'crosshair');
}

// ─────────────────────────────────────────────────────────────────────────────
describe('ガントバードラッグ: move（バー移動）', () => {
  it('右に1日ドラッグすると startDate/endDate が1日後にシフトする', () => {
    const task = makeTask({ startDate: '2026-06-10', endDate: '2026-06-15' });
    const { container } = renderChart([task]);

    const moveZone = getMoveZone(container);
    expect(moveZone).toBeTruthy();

    fireEvent.mouseDown(moveZone!, { button: 0, clientX: 100 });
    fireEvent.mouseMove(window, { clientX: 100 + DAY_W });
    fireEvent.mouseUp(window);

    expect(onInlineUpdate).toHaveBeenCalledWith(task.id, {
      startDate: '2026-06-11',
      endDate: '2026-06-16',
    });
  });

  it('左に2日ドラッグすると startDate/endDate が2日前にシフトする', () => {
    const task = makeTask({ startDate: '2026-06-10', endDate: '2026-06-15' });
    const { container } = renderChart([task]);

    const moveZone = getMoveZone(container)!;
    fireEvent.mouseDown(moveZone, { button: 0, clientX: 200 });
    fireEvent.mouseMove(window, { clientX: 200 - 2 * DAY_W });
    fireEvent.mouseUp(window);

    expect(onInlineUpdate).toHaveBeenCalledWith(task.id, {
      startDate: '2026-06-08',
      endDate: '2026-06-13',
    });
  });

  it('delta=0 では onInlineUpdate を呼ばない（変化なし）', () => {
    const task = makeTask();
    const { container } = renderChart([task]);

    const moveZone = getMoveZone(container)!;
    fireEvent.mouseDown(moveZone, { button: 0, clientX: 100 });
    fireEvent.mouseMove(window, { clientX: 103 }); // Math.round(3/8) = 0
    fireEvent.mouseUp(window);

    expect(onInlineUpdate).not.toHaveBeenCalled();
  });

  it('マイルストーン移動では endDate が startDate と同じになる', () => {
    const task = makeTask({ isMilestone: true, startDate: '2026-06-10', endDate: '2026-06-10' });
    const { container } = renderChart([task]);

    const poly = container.querySelector(`g[data-task-id="${task.id}"] polygon`);
    expect(poly).toBeTruthy();

    fireEvent.mouseDown(poly!, { button: 0, clientX: 100 });
    fireEvent.mouseMove(window, { clientX: 100 + 2 * DAY_W });
    fireEvent.mouseUp(window);

    expect(onInlineUpdate).toHaveBeenCalledTimes(1);
    const patch = onInlineUpdate.mock.calls[0][1] as { startDate: string; endDate: string };
    expect(patch.startDate).toBe('2026-06-12');
    expect(patch.endDate).toBe(patch.startDate);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('ガントバードラッグ: resize-right（右端リサイズ）', () => {
  it('右に1日ドラッグすると endDate が1日後になる', () => {
    const task = makeTask({ startDate: '2026-06-10', endDate: '2026-06-15' });
    const { container } = renderChart([task]);

    const rightHandle = getResizeHandles(container)[1]; // 右ハンドルは2番目
    expect(rightHandle).toBeTruthy();

    fireEvent.mouseDown(rightHandle, { button: 0, clientX: 100 });
    fireEvent.mouseMove(window, { clientX: 100 + DAY_W });
    fireEvent.mouseUp(window);

    expect(onInlineUpdate).toHaveBeenCalledWith(task.id, {
      startDate: '2026-06-10',
      endDate: '2026-06-16',
    });
  });

  it('左に縮小して endDate < startDate になる場合は endDate = startDate にクランプする', () => {
    // endDate=6/15 を10日縮めると6/05になりstartDate=6/10を下回る → clamp to 6/10
    const task = makeTask({ startDate: '2026-06-10', endDate: '2026-06-15' });
    const { container } = renderChart([task]);

    const rightHandle = getResizeHandles(container)[1];
    fireEvent.mouseDown(rightHandle, { button: 0, clientX: 100 });
    fireEvent.mouseMove(window, { clientX: 100 - 10 * DAY_W }); // endDate が startDate より前
    fireEvent.mouseUp(window);

    expect(onInlineUpdate).toHaveBeenCalledWith(task.id, {
      startDate: '2026-06-10',
      endDate: '2026-06-10',
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('ガントバードラッグ: resize-left（左端リサイズ）', () => {
  it('左に1日ドラッグすると startDate が1日前になる', () => {
    const task = makeTask({ startDate: '2026-06-10', endDate: '2026-06-15' });
    const { container } = renderChart([task]);

    const leftHandle = getResizeHandles(container)[0]; // 左ハンドルは1番目
    expect(leftHandle).toBeTruthy();

    fireEvent.mouseDown(leftHandle, { button: 0, clientX: 100 });
    fireEvent.mouseMove(window, { clientX: 100 - DAY_W });
    fireEvent.mouseUp(window);

    expect(onInlineUpdate).toHaveBeenCalledWith(task.id, {
      startDate: '2026-06-09',
      endDate: '2026-06-15',
    });
  });

  it('startDate が endDate を超える場合は startDate を endDate にクランプする', () => {
    const task = makeTask({ startDate: '2026-06-10', endDate: '2026-06-12' });
    const { container } = renderChart([task]);

    const leftHandle = getResizeHandles(container)[0];
    fireEvent.mouseDown(leftHandle, { button: 0, clientX: 100 });
    fireEvent.mouseMove(window, { clientX: 100 + 10 * DAY_W }); // startDate が endDate を超える
    fireEvent.mouseUp(window);

    expect(onInlineUpdate).toHaveBeenCalledWith(task.id, {
      startDate: '2026-06-12',
      endDate: '2026-06-12',
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('ガントバードラッグ: ESC キャンセル', () => {
  it('ドラッグ中に ESC を押すと onInlineUpdate が呼ばれない', () => {
    const task = makeTask();
    const { container } = renderChart([task]);

    const moveZone = getMoveZone(container)!;
    fireEvent.mouseDown(moveZone, { button: 0, clientX: 100 });
    fireEvent.mouseMove(window, { clientX: 100 + DAY_W });
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.mouseUp(window);

    expect(onInlineUpdate).not.toHaveBeenCalled();
  });

  it('ESC 後に再ドラッグすると正常に動作する', () => {
    const task = makeTask();
    const { container } = renderChart([task]);

    const moveZone = getMoveZone(container)!;
    // 1回目: ESCキャンセル
    fireEvent.mouseDown(moveZone, { button: 0, clientX: 100 });
    fireEvent.mouseMove(window, { clientX: 100 + DAY_W });
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.mouseUp(window);

    expect(onInlineUpdate).not.toHaveBeenCalled();

    // 2回目: 正常ドラッグ
    fireEvent.mouseDown(moveZone, { button: 0, clientX: 100 });
    fireEvent.mouseMove(window, { clientX: 100 + DAY_W });
    fireEvent.mouseUp(window);

    expect(onInlineUpdate).toHaveBeenCalledWith(task.id, {
      startDate: '2026-06-11',
      endDate: '2026-06-16',
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('ガントバードラッグ: create（日付未設定タスクのドラッグ）', () => {
  it('日付未設定タスクの行に crosshair カーソルが付く', () => {
    const task = makeTask({ startDate: null, endDate: null });
    const { container } = renderChart([task]);
    expect(getCreateRow(container)).toBeTruthy();
  });

  it('日付あり・親・マイルストーンタスクには crosshair カーソルが付かない', () => {
    const parent = makeTask({ id: 'p', startDate: '2026-06-10', endDate: '2026-06-15' });
    const child  = makeTask({ id: 'c', parentId: 'p', startDate: null, endDate: null });
    const { container } = renderChart([parent, child]);
    // child は parentId あり → isParent ではなく child。ただし parent に子がいるので parent が isParent
    // 日付あり(parent) → canCreate=false, crosshairなし
    // 子タスク(日付なし、parentId=p) → canCreate=true, crosshairあり
    const crosshairRects = Array.from(container.querySelectorAll<SVGRectElement>('rect'))
      .filter(r => r.style.cursor === 'crosshair');
    // childはparentIdがあるがisParentではないのでcanCreate=true
    expect(crosshairRects.length).toBe(1);
  });

  it('1日分ドラッグすると start=end の1日タスクが作成される', () => {
    const task = makeTask({ startDate: null, endDate: null });
    const { container } = renderChart([task]);

    const createRow = getCreateRow(container)!;
    // clientX=0 → relX=0 → days=0 → anchorDate=min(2026-06-01)
    fireEvent.mouseDown(createRow, { button: 0, clientX: 0 });
    fireEvent.mouseMove(window, { clientX: DAY_W }); // delta=1 → newEnd=addDays(anchor,0)=anchor
    fireEvent.mouseUp(window);

    expect(onInlineUpdate).toHaveBeenCalledTimes(1);
    const patch = onInlineUpdate.mock.calls[0][1] as { startDate: string; endDate: string };
    expect(patch.startDate).toBe(patch.endDate); // 1日タスク
    expect(onInlineUpdate.mock.calls[0][0]).toBe(task.id);
  });

  it('3日分ドラッグすると start と end が2日差（3日間）のタスクが作成される', () => {
    const task = makeTask({ startDate: null, endDate: null });
    const { container } = renderChart([task]);

    const createRow = getCreateRow(container)!;
    fireEvent.mouseDown(createRow, { button: 0, clientX: 0 });
    fireEvent.mouseMove(window, { clientX: 3 * DAY_W }); // delta=3 → newEnd=addDays(anchor,2)
    fireEvent.mouseUp(window);

    const patch = onInlineUpdate.mock.calls[0][1] as { startDate: string; endDate: string };
    // endDate は startDate より2日後
    const start = new Date(patch.startDate).getTime();
    const end   = new Date(patch.endDate).getTime();
    expect((end - start) / 86400000).toBe(2);
  });

  it('左方向ドラッグ（delta=-1）でも1日タスクが作成される', () => {
    const task = makeTask({ startDate: null, endDate: null });
    const { container } = renderChart([task]);

    const createRow = getCreateRow(container)!;
    // clientX=8*5=40 → anchorDate=min+5日
    fireEvent.mouseDown(createRow, { button: 0, clientX: 5 * DAY_W });
    fireEvent.mouseMove(window, { clientX: 5 * DAY_W - DAY_W }); // delta=-1
    fireEvent.mouseUp(window);

    const patch = onInlineUpdate.mock.calls[0][1] as { startDate: string; endDate: string };
    expect(patch.startDate).toBe(patch.endDate); // delta=-1 → newStart=addDays(anchor,0)=anchor → 1日
  });

  it('delta=0 のままマウスアップしてもタスクは作成されない', () => {
    const task = makeTask({ startDate: null, endDate: null });
    const { container } = renderChart([task]);

    const createRow = getCreateRow(container)!;
    fireEvent.mouseDown(createRow, { button: 0, clientX: 0 });
    // mousemove なし → preview セットされない
    fireEvent.mouseUp(window);

    expect(onInlineUpdate).not.toHaveBeenCalled();
  });
});
