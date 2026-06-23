import type { Mock } from 'vitest';
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { GanttChart, CREATE_DRAG_THRESHOLD_PX } from '../components/Gantt/GanttChart';
import { useTaskStore } from '../store/taskStore';
import type { Task } from '../types/task';

const NOOP = vi.fn();
let onInlineUpdate: Mock;

let seq = 0;
function makeTask(overrides: Partial<Task> = {}): Task {
  seq++;
  return {
    id: `t${seq}`, projectId: 'p1', parentId: null,
    title: 'T', summary: '', description: '',
    status: 'todo', priority: 'medium', progress: 0, assignee: '',
    startDate: '2026-06-10', endDate: '2026-06-15',
    isMilestone: false, predecessors: [], seq, order: seq,
    createdAt: '', updatedAt: '', titleColor: null, titleBgColor: null, estimateMinutes: null,
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
      onReorder={NOOP} onCopyInsert={NOOP}
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

  it('マイルストーンはガント上で移動できない（菱形に移動ドラッグ入口がない）', () => {
    const task = makeTask({ isMilestone: true, startDate: '2026-06-10', endDate: '2026-06-10' });
    const { container } = renderChart([task]);

    const poly = container.querySelector(`g[data-task-id="${task.id}"] polygon`);
    expect(poly).toBeTruthy();

    // 菱形をドラッグしようとしても日付は変更されない（移動入口を持たない）
    fireEvent.mouseDown(poly!, { button: 0, clientX: 100 });
    fireEvent.mouseMove(window, { clientX: 100 + 2 * DAY_W });
    fireEvent.mouseUp(window);

    expect(onInlineUpdate).not.toHaveBeenCalled();
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

  it('アンカーセル内（同一日）のドラッグで1日タスクが作成される', () => {
    const task = makeTask({ startDate: null, endDate: null });
    const { container } = renderChart([task]);

    const createRow = getCreateRow(container)!;
    // clientX=0(day0左端) → 閾値+1 px だけ同一セル内(day0: relX 0〜7)で右へ動かす。
    // THRESHOLD+1 < DAY_W(8) なので day0 内に収まり、1日タスクが作成される。
    fireEvent.mouseDown(createRow, { button: 0, clientX: 0 });
    fireEvent.mouseMove(window, { clientX: CREATE_DRAG_THRESHOLD_PX + 1 });
    fireEvent.mouseUp(window);

    expect(onInlineUpdate).toHaveBeenCalledTimes(1);
    const patch = onInlineUpdate.mock.calls[0][1] as { startDate: string; endDate: string };
    expect(patch.startDate).toBe(patch.endDate); // 1日タスク
    expect(onInlineUpdate.mock.calls[0][0]).toBe(task.id);
  });

  it('3セル分ドラッグするとカーソル下のセルを含む4日スパンが作成される', () => {
    const task = makeTask({ startDate: null, endDate: null });
    const { container } = renderChart([task]);

    const createRow = getCreateRow(container)!;
    // clientX=0(day0) → clientX=3*DAY_W=24(day3の左端) → cursorDate=day3
    // スパン: day0〜day3 → endDate - startDate = 3日
    fireEvent.mouseDown(createRow, { button: 0, clientX: 0 });
    fireEvent.mouseMove(window, { clientX: 3 * DAY_W });
    fireEvent.mouseUp(window);

    const patch = onInlineUpdate.mock.calls[0][1] as { startDate: string; endDate: string };
    const start = new Date(patch.startDate).getTime();
    const end   = new Date(patch.endDate).getTime();
    expect((end - start) / 86400000).toBe(3); // カーソル下のセル(day3)まで含む
  });

  it('左方向に1セル分ドラッグするとカーソル下のセルを含む2日スパンが作成される', () => {
    const task = makeTask({ startDate: null, endDate: null });
    const { container } = renderChart([task]);

    const createRow = getCreateRow(container)!;
    // clientX=5*DAY_W=40 → anchorDate=day5(2026-06-06)
    // clientX=4*DAY_W=32 → cursorRelX=32 → Math.floor(32/8)=4 → day4(2026-06-05)
    // スパン: day4〜day5 → endDate - startDate = 1日
    fireEvent.mouseDown(createRow, { button: 0, clientX: 5 * DAY_W });
    fireEvent.mouseMove(window, { clientX: 4 * DAY_W });
    fireEvent.mouseUp(window);

    const patch = onInlineUpdate.mock.calls[0][1] as { startDate: string; endDate: string };
    const start = new Date(patch.startDate).getTime();
    const end   = new Date(patch.endDate).getTime();
    expect((end - start) / 86400000).toBe(1); // カーソル下(day4)〜アンカー(day5) = 2日スパン
  });

  it('左方向アンカーセル内のドラッグで1日タスクが作成される', () => {
    const task = makeTask({ startDate: null, endDate: null });
    const { container } = renderChart([task]);

    const createRow = getCreateRow(container)!;
    // clientX=5*DAY_W+7=47(day5右端, Math.floor(47/8)=5) → 閾値+1 px だけ左へ。
    // THRESHOLD+1 < DAY_W(8) なので day5 内に収まり、左方向ドラッグでも 1日タスク。
    fireEvent.mouseDown(createRow, { button: 0, clientX: 5 * DAY_W + 7 });
    fireEvent.mouseMove(window, { clientX: 5 * DAY_W + 7 - (CREATE_DRAG_THRESHOLD_PX + 1) });
    fireEvent.mouseUp(window);

    const patch = onInlineUpdate.mock.calls[0][1] as { startDate: string; endDate: string };
    expect(patch.startDate).toBe(patch.endDate); // アンカーセル内 → 1日タスク
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

  it('閾値未満（手ぶれ程度）のドラッグではタスクが作成されない（クリック誤作成防止）', () => {
    const task = makeTask({ startDate: null, endDate: null });
    const { container } = renderChart([task]);

    const createRow = getCreateRow(container)!;
    // mousedown 位置から閾値未満しか動かさない（クリック時の手ぶれ相当）
    fireEvent.mouseDown(createRow, { button: 0, clientX: 20 });
    fireEvent.mouseMove(window, { clientX: 20 + (CREATE_DRAG_THRESHOLD_PX - 1) });
    fireEvent.mouseUp(window);

    expect(onInlineUpdate).not.toHaveBeenCalled();
  });

  it('閾値以上ドラッグするとタスクが作成される', () => {
    const task = makeTask({ startDate: null, endDate: null });
    const { container } = renderChart([task]);

    const createRow = getCreateRow(container)!;
    fireEvent.mouseDown(createRow, { button: 0, clientX: 20 });
    fireEvent.mouseMove(window, { clientX: 20 + CREATE_DRAG_THRESHOLD_PX });
    fireEvent.mouseUp(window);

    expect(onInlineUpdate).toHaveBeenCalledTimes(1);
  });

  it('閾値を一度超えたら、その後閾値内に戻ってもドラッグは継続する（スティッキー）', () => {
    const task = makeTask({ startDate: null, endDate: null });
    const { container } = renderChart([task]);

    const createRow = getCreateRow(container)!;
    fireEvent.mouseDown(createRow, { button: 0, clientX: 20 });
    fireEvent.mouseMove(window, { clientX: 20 + CREATE_DRAG_THRESHOLD_PX + 5 }); // 閾値超で armed
    fireEvent.mouseMove(window, { clientX: 20 + 1 });                            // 閾値内へ戻る
    fireEvent.mouseUp(window);

    expect(onInlineUpdate).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('土日背景: pointer-events（作成ドラッグ妨害防止）', () => {
  it('showWeekend=true のとき土日背景 rect は pointer-events="none" を持つ', () => {
    useTaskStore.setState({ showWeekend: true });
    const task = makeTask({ startDate: null, endDate: null });
    const { container } = renderChart([task]);

    const weekendRects = Array.from(container.querySelectorAll<SVGRectElement>('rect'))
      .filter(r => r.getAttribute('fill') === 'rgba(148,163,184,0.18)');
    expect(weekendRects.length).toBeGreaterThan(0);
    weekendRects.forEach(r => {
      expect(r.getAttribute('pointer-events')).toBe('none');
    });
  });
});
