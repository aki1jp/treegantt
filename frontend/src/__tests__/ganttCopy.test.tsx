// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, screen, act, createEvent } from '@testing-library/react';
import { GanttChart } from '../components/Gantt/GanttChart';
import { useTaskStore } from '../store/taskStore';
import type { Task } from '../types/task';

const NOOP = vi.fn().mockResolvedValue(undefined);

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
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-06-01T00:00:00.000Z'));
  localStorage.clear();
  useTaskStore.setState({
    tasks: [], needsReload: false,
    filterStatus: '', filterAssignee: '', filterPriority: '', filterSearch: '',
    zoomLevel: 'week', ganttStartDate: '2026-06-01', ganttPeriod: '3m',
    showLightningLine: false, showWeekend: false, showCriticalPath: false, showResourceView: false,
    uiFontSize: 13, uiRowHeight: 36,
    ganttHeaderLevels: { year: false, month: false, week: false, day: false },
    theme: 'auto', ganttBarOpen: true,
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

interface RenderOpts {
  onReorder?: ReturnType<typeof vi.fn>;
  onCopyInsert?: ReturnType<typeof vi.fn>;
}

function renderChart(tasks: Task[], opts: RenderOpts = {}) {
  useTaskStore.setState({ tasks });
  const onReorder    = opts.onReorder    ?? NOOP;
  const onCopyInsert = opts.onCopyInsert ?? NOOP;
  return render(
    <GanttChart
      onEditTask={NOOP}
      onDeleteTask={NOOP}
      onInlineUpdate={NOOP}
      onQuickAdd={NOOP}
      onAddSubTask={NOOP}
      onReorder={onReorder}
      onCopyInsert={onCopyInsert}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
describe('右クリックメニュー コピー機能', () => {
  it('WBS行を右クリックすると「コピー」ボタンが表示される', () => {
    const task = makeTask({ title: 'TaskA' });
    renderChart([task]);
    fireEvent.contextMenu(screen.getAllByText('TaskA')[0]);
    expect(screen.getByText('コピー')).toBeTruthy();
  });

  it('コピーしていない状態では「上に挿入」が表示されない', () => {
    const task = makeTask({ title: 'TaskA' });
    renderChart([task]);
    fireEvent.contextMenu(screen.getAllByText('TaskA')[0]);
    expect(screen.queryByText('上に挿入')).toBeNull();
  });

  it('「コピー」クリック後に別タスクを右クリックすると「上に挿入」が表示される', () => {
    const t1 = makeTask({ title: 'TaskA' });
    const t2 = makeTask({ title: 'TaskB' });
    renderChart([t1, t2]);

    // TaskA をコピー
    fireEvent.contextMenu(screen.getAllByText('TaskA')[0]);
    fireEvent.click(screen.getByText('コピー'));

    // TaskB を右クリック → 「上に挿入」が出る
    fireEvent.contextMenu(screen.getAllByText('TaskB')[0]);
    expect(screen.getByText('上に挿入')).toBeTruthy();
  });

  it('「上に挿入」クリックでonCopyInsertがbeforeTaskId付きで呼ばれる', () => {
    const onCopyInsert = vi.fn().mockResolvedValue(undefined);
    const t1 = makeTask({ title: 'TaskA' });
    const t2 = makeTask({ title: 'TaskB' });
    renderChart([t1, t2], { onCopyInsert });

    // TaskA をコピー
    fireEvent.contextMenu(screen.getAllByText('TaskA')[0]);
    fireEvent.click(screen.getByText('コピー'));

    // TaskB の上に挿入
    fireEvent.contextMenu(screen.getAllByText('TaskB')[0]);
    fireEvent.click(screen.getByText('上に挿入'));

    expect(onCopyInsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: t1.id }),
      t1.parentId,  // parentId
      null,         // afterTaskId（右クリック時はnull）
      t2.id,        // beforeTaskId
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Ctrl+ドラッグ コピー機能', () => {
  it('Ctrl+dragStartのdropでonCopyInsertが呼ばれonReorderは呼ばれない', async () => {
    const onReorder    = vi.fn().mockResolvedValue(undefined);
    const onCopyInsert = vi.fn().mockResolvedValue(undefined);
    const t1 = makeTask({ title: 'TaskA', order: 1 });
    const t2 = makeTask({ title: 'TaskB', order: 2 });
    const t3 = makeTask({ title: 'TaskC', order: 3 });
    const { container } = renderChart([t1, t2, t3], { onReorder, onCopyInsert });

    const draggables = container.querySelectorAll('[draggable]');
    expect(draggables.length).toBeGreaterThanOrEqual(3);

    // t1(index=0) を t3(index=2) の上にドロップ → insertAt=1 ≠ dragIdx=0 なので no-op にならない
    // jsdom の DragEvent は ctrlKey を正しく継承しないため MouseEvent で代替
    const ctrlDragStart = createEvent.dragStart(draggables[0]);
    Object.defineProperty(ctrlDragStart, 'ctrlKey', { value: true, configurable: true });
    await act(async () => { fireEvent(draggables[0], ctrlDragStart); });
    const ctrlDragOver = createEvent.dragOver(draggables[2]);
    Object.defineProperty(ctrlDragOver, 'ctrlKey', { value: true, configurable: true });
    await act(async () => { fireEvent(draggables[2], ctrlDragOver); });
    await act(async () => { fireEvent.drop(draggables[2]); });

    expect(onCopyInsert).toHaveBeenCalled();
    expect(onReorder).not.toHaveBeenCalled();
  });

  it('通常drag（Ctrlなし）のdropでonReorderが呼ばれonCopyInsertは呼ばれない', async () => {
    const onReorder    = vi.fn().mockResolvedValue(undefined);
    const onCopyInsert = vi.fn().mockResolvedValue(undefined);
    const t1 = makeTask({ title: 'TaskA', order: 1 });
    const t2 = makeTask({ title: 'TaskB', order: 2 });
    const t3 = makeTask({ title: 'TaskC', order: 3 });
    const { container } = renderChart([t1, t2, t3], { onReorder, onCopyInsert });

    const draggables = container.querySelectorAll('[draggable]');
    await act(async () => { fireEvent.dragStart(draggables[0]); });  // ctrlKey なし
    await act(async () => { fireEvent.dragOver(draggables[2]); });
    await act(async () => { fireEvent.drop(draggables[2]); });

    expect(onReorder).toHaveBeenCalled();
    expect(onCopyInsert).not.toHaveBeenCalled();
  });

  it('Ctrl+dragのonCopyInsertにはコピー元タスクのIDが渡される', async () => {
    const onCopyInsert = vi.fn().mockResolvedValue(undefined);
    const t1 = makeTask({ title: 'TaskA', order: 1 });
    const t2 = makeTask({ title: 'TaskB', order: 2 });
    const t3 = makeTask({ title: 'TaskC', order: 3 });
    const { container } = renderChart([t1, t2, t3], { onCopyInsert });

    const draggables = container.querySelectorAll('[draggable]');
    const ctrlDragStart2 = createEvent.dragStart(draggables[0]);
    Object.defineProperty(ctrlDragStart2, 'ctrlKey', { value: true, configurable: true });
    await act(async () => { fireEvent(draggables[0], ctrlDragStart2); });
    const ctrlDragOver2 = createEvent.dragOver(draggables[2]);
    Object.defineProperty(ctrlDragOver2, 'ctrlKey', { value: true, configurable: true });
    await act(async () => { fireEvent(draggables[2], ctrlDragOver2); });
    await act(async () => { fireEvent.drop(draggables[2]); });

    // コピー元タスク・parentId(null)・afterTaskId を確認
    expect(onCopyInsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: t1.id }),
      null,
      expect.anything(),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('ドラッグフリーズ修正', () => {
  it('dragStartでeffectAllowedが"all"に設定される（Chrome早期dragEnd防止）', async () => {
    const t1 = makeTask({ title: 'TaskA' });
    const { container } = renderChart([t1]);
    const draggables = container.querySelectorAll('[draggable]');

    // dataTransfer をモックして React ハンドラが effectAllowed を設定するか確認
    const mockDT = { effectAllowed: 'uninitialized', dropEffect: 'none', setData: vi.fn(), getData: vi.fn() };
    const evt = createEvent.dragStart(draggables[0]);
    Object.defineProperty(evt, 'dataTransfer', { value: mockDT, configurable: true });

    await act(async () => { fireEvent(draggables[0], evt); });

    expect(mockDT.effectAllowed).toBe('all');
  });

  it('早期dragEnd後にdropが来てもonReorderは呼ばれない（フリーズ時の安全動作）', async () => {
    const onReorder = vi.fn().mockResolvedValue(undefined);
    const t1 = makeTask({ title: 'TaskA', order: 1 });
    const t2 = makeTask({ title: 'TaskB', order: 2 });
    const t3 = makeTask({ title: 'TaskC', order: 3 });
    const { container } = renderChart([t1, t2, t3], { onReorder });
    const draggables = container.querySelectorAll('[draggable]');

    // フリーズシナリオ: dragEnd が drop より先に発火（ブラウザが早期キャンセル）
    await act(async () => { fireEvent.dragStart(draggables[0]); });
    await act(async () => { fireEvent.dragOver(draggables[2]); });
    await act(async () => { fireEvent.dragEnd(draggables[0]); }); // 早期終了
    await act(async () => { fireEvent.drop(draggables[2]); });   // 遅延drop → no-op
    expect(onReorder).not.toHaveBeenCalled();
  });

  it('ドラッグキャンセル後に再ドラッグするとonReorderが正常に呼ばれる（フリーズからのリカバリ）', async () => {
    const onReorder = vi.fn().mockResolvedValue(undefined);
    const t1 = makeTask({ title: 'TaskA', order: 1 });
    const t2 = makeTask({ title: 'TaskB', order: 2 });
    const t3 = makeTask({ title: 'TaskC', order: 3 });
    const { container } = renderChart([t1, t2, t3], { onReorder });
    const draggables = container.querySelectorAll('[draggable]');

    // 1回目: キャンセル
    await act(async () => { fireEvent.dragStart(draggables[0]); });
    await act(async () => { fireEvent.dragEnd(draggables[0]); });
    expect(onReorder).not.toHaveBeenCalled();

    // 2回目: 正常完了（キャンセル後でも動作すること）
    await act(async () => { fireEvent.dragStart(draggables[0]); });
    await act(async () => { fireEvent.dragOver(draggables[2]); });
    await act(async () => { fireEvent.drop(draggables[2]); });
    expect(onReorder).toHaveBeenCalledTimes(1);
  });
});
