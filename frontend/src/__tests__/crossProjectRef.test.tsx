import type { Mock } from 'vitest';
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { GanttChart } from '../components/Gantt/GanttChart';
import { useTaskStore } from '../store/taskStore';
import type { Task, RefProject } from '../types/task';

let onEditTask: Mock;
let onDeleteTask: Mock;
let onInlineUpdate: Mock;
let onReorder: Mock;
let onCopyInsert: Mock;
let onUpdateExternalDeps: Mock;
let onOpenRefProject: Mock;
let onRemoveRef: Mock;
let onRefreshRefs: Mock;
const NOOP = vi.fn();

let seq = 0;
function makeTask(overrides: Partial<Task> = {}): Task {
  seq++;
  return {
    id: `t${seq}`, projectId: 'p1', parentId: null,
    title: `Task${seq}`, summary: '', description: '',
    status: 'todo', priority: 'medium', progress: 0, assignee: '',
    startDate: '2026-06-10', endDate: '2026-06-15',
    isMilestone: false, predecessors: [], seq, order: seq,
    createdAt: '', updatedAt: '', titleColor: null, titleBgColor: null, estimateMinutes: null,
    ...overrides,
  };
}

beforeEach(() => {
  seq = 0;
  onEditTask    = vi.fn();
  onDeleteTask  = vi.fn();
  onInlineUpdate = vi.fn();
  onReorder = vi.fn();
  onCopyInsert = vi.fn();
  onUpdateExternalDeps = vi.fn();
  onOpenRefProject = vi.fn();
  onRemoveRef = vi.fn();
  onRefreshRefs = vi.fn();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-06-01T00:00:00.000Z'));
  localStorage.clear();
  useTaskStore.setState({
    tasks: [], refTasks: [], refProjects: [], needsReload: false,
    filterStatus: '', filterAssignee: '', filterPriority: '', filterSearch: '',
    zoomLevel: 'week', ganttStartDate: '2026-06-01', ganttPeriod: '3m',
    showLightningLine: false, showWeekend: false, showCriticalPath: false, showResourceView: false,
    uiFontSize: 13, uiRowHeight: 36,
    ganttHeaderLevels: { year: false, month: false, week: false, day: false },
    theme: 'auto', ganttBarOpen: true, depArrowStyle: 'bezier',
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function renderChart(
  tasks: Task[],
  refTasks: Task[] = [],
  refProjects: RefProject[] = [],
) {
  useTaskStore.setState({ tasks, refTasks, refProjects });
  return render(
    <GanttChart
      projectId="p1"
      onEditTask={onEditTask}
      onDeleteTask={onDeleteTask}
      onInlineUpdate={onInlineUpdate}
      onQuickAdd={NOOP}
      onAddSubTask={NOOP}
      onAddSubMilestone={NOOP}
      onReorder={onReorder}
      onCopyInsert={onCopyInsert}
      onUpdateExternalDeps={onUpdateExternalDeps}
      onOpenRefProject={onOpenRefProject}
      onRemoveRef={onRemoveRef}
      onRefreshRefs={onRefreshRefs}
    />
  );
}

// WBSパネル内で、指定テキストと完全一致する末端要素を返す（SVGテキストと区別するため）
function getWbsTitleEl(title: string): Element {
  const wbs = screen.getByTestId('wbs-panel');
  const el = Array.from(wbs.querySelectorAll('*'))
    .find(e => e.textContent?.trim() === title && e.children.length === 0);
  if (!el) throw new Error(`WBS title "${title}" not found`);
  return el;
}

function getWbsRowWrapper(title: string): HTMLElement {
  const titleEl = getWbsTitleEl(title);
  const wrapper = titleEl.closest('[draggable]');
  if (!wrapper) throw new Error(`draggable row wrapper for "${title}" not found`);
  return wrapper as HTMLElement;
}

const refProjects: RefProject[] = [{ id: 'p2', name: 'プロジェクトB', color: '#3b82f6' }];

describe('クロスプロジェクト参照 — 描画統合', () => {
  it('参照先プロジェクトの合成グループ行と参照タスク行が末尾に描画される', () => {
    const own = makeTask({ id: 'own1', projectId: 'p1' });
    const ref = makeTask({ id: 'ref1', projectId: 'p2', parentId: null });
    renderChart([own], [ref], refProjects);

    const wbs = within(screen.getByTestId('wbs-panel'));
    expect(wbs.getByText('🔗 プロジェクトB')).toBeTruthy();
    expect(wbs.getByText('🔗 Task2')).toBeTruthy(); // ref1 のタイトル（seq=2, readOnly のため 🔗 接頭辞つき）
  });

  it('参照タスクが現プロジェクトのタスクへ依存すると跨ぎ依存矢印が描画される', () => {
    const own = makeTask({ id: 'own1', projectId: 'p1' });
    const ref = makeTask({ id: 'ref1', projectId: 'p2', parentId: null, predecessors: ['own1'] });
    const { container } = renderChart([own], [ref], refProjects);

    const arrow = container.querySelector('path[data-dep-from="own1"][data-dep-to="ref1"]');
    expect(arrow).toBeTruthy();
  });

  it('参照が空のときは合成グループ行を描画しない（既存動作に影響なし）', () => {
    const own = makeTask({ id: 'own1', projectId: 'p1' });
    renderChart([own], [], []);
    expect(screen.queryByText('🔗', { exact: false })).toBeNull();
  });
});

describe('クロスプロジェクト参照 — readonly ガード', () => {
  it('参照タスクのバーには移動ゾーン・リサイズハンドルが描画されない', () => {
    const own = makeTask({ id: 'own1', projectId: 'p1' });
    const ref = makeTask({ id: 'ref1', projectId: 'p2', parentId: null, startDate: '2026-06-10', endDate: '2026-06-12' });
    const { container } = renderChart([own], [ref], refProjects);

    const barG = container.querySelector('[data-task-id="ref1"]')!;
    const rects = barG.querySelectorAll('rect');
    // 通常バーは 移動ゾーン＋左右ハンドルの計3矩形を持つ（バー背景を除く）。
    // readonly はハンドル非表示のため、cursor: ew-resize / move を持つ rect が無い。
    const interactiveRects = Array.from(rects).filter(r => {
      const style = r.getAttribute('style') ?? '';
      return style.includes('cursor: move') || style.includes('cursor: ew-resize') || style.includes('grabbing');
    });
    expect(interactiveRects).toHaveLength(0);
  });

  it('通常タスクのバーには移動ゾーン・リサイズハンドルが描画される（比較対象）', () => {
    const own = makeTask({ id: 'own1', projectId: 'p1', startDate: '2026-06-10', endDate: '2026-06-12' });
    const { container } = renderChart([own], [], []);

    const barG = container.querySelector('[data-task-id="own1"]')!;
    const rects = barG.querySelectorAll('rect');
    const interactiveRects = Array.from(rects).filter(r => {
      const style = r.getAttribute('style') ?? '';
      return style.includes('cursor: move') || style.includes('cursor: ew-resize');
    });
    expect(interactiveRects.length).toBeGreaterThan(0);
  });

  it('WBS行D&D: 参照タスク行・合成グループ行は draggable でない', () => {
    const own = makeTask({ id: 'own1', projectId: 'p1' });
    const ref = makeTask({ id: 'ref1', projectId: 'p2', parentId: null });
    renderChart([own], [ref], refProjects);

    const refRow = getWbsRowWrapper('🔗 Task2'); // ref1
    const groupRow = getWbsRowWrapper('🔗 プロジェクトB');
    const ownRow = getWbsRowWrapper('Task1'); // own1

    expect(refRow.getAttribute('draggable')).toBe('false');
    expect(groupRow.getAttribute('draggable')).toBe('false');
    expect(ownRow.getAttribute('draggable')).toBe('true');
  });

  it('WBS行D&D: 参照タスク行へドロップしても並び替え/コピーは発生しない（アダプトゾーン除外）', () => {
    const own = makeTask({ id: 'own1', projectId: 'p1' });
    const ref = makeTask({ id: 'ref1', projectId: 'p2', parentId: null });
    renderChart([own, makeTask({ id: 'own2', projectId: 'p1' })], [ref], refProjects);

    const ownRow = getWbsRowWrapper('Task1');
    const refRow = getWbsRowWrapper('🔗 Task2'); // own1=Task1, ref1=Task2, own2=Task3 (seq順、ref1はreadOnlyのため🔗接頭辞)
    const dataTransfer = { effectAllowed: '', dropEffect: '' };

    fireEvent.dragStart(ownRow, { dataTransfer });
    // 下端寄り(アダプトゾーン)でドラッグオーバーさせる
    fireEvent.dragOver(refRow, {
      dataTransfer,
      clientY: 30, // rowHeight=36 の下70%相当
    });
    fireEvent.drop(refRow, { dataTransfer });

    expect(onReorder).not.toHaveBeenCalled();
    expect(onCopyInsert).not.toHaveBeenCalled();
  });

  it('コンテキストメニュー: 参照タスク行は専用メニュー（参照先プロジェクトを開く/参照を解除/再読み込み）が出る', () => {
    const own = makeTask({ id: 'own1', projectId: 'p1' });
    const ref = makeTask({ id: 'ref1', projectId: 'p2', parentId: null });
    renderChart([own], [ref], refProjects);

    fireEvent.contextMenu(getWbsTitleEl('🔗 Task2')); // ref1

    expect(screen.getByText('参照先プロジェクトを開く')).toBeTruthy();
    expect(screen.getByText('参照を解除')).toBeTruthy();
    expect(screen.getByText('参照を再読み込み')).toBeTruthy();
    expect(screen.queryByText('編集（詳細）')).toBeNull();
    expect(screen.queryByText('削除')).toBeNull();
  });

  it('コンテキストメニュー: 「参照先プロジェクトを開く」クリックで onOpenRefProject が呼ばれる', () => {
    const own = makeTask({ id: 'own1', projectId: 'p1' });
    const ref = makeTask({ id: 'ref1', projectId: 'p2', parentId: null });
    renderChart([own], [ref], refProjects);

    fireEvent.contextMenu(getWbsTitleEl('🔗 Task2'));
    fireEvent.click(screen.getByText('参照先プロジェクトを開く'));
    expect(onOpenRefProject).toHaveBeenCalledWith('p2');
  });

  it('コンテキストメニュー: 「参照を解除」クリックで onRemoveRef が呼ばれる', () => {
    const own = makeTask({ id: 'own1', projectId: 'p1' });
    const ref = makeTask({ id: 'ref1', projectId: 'p2', parentId: null });
    renderChart([own], [ref], refProjects);

    fireEvent.contextMenu(getWbsTitleEl('🔗 Task2'));
    fireEvent.click(screen.getByText('参照を解除'));
    expect(onRemoveRef).toHaveBeenCalledWith('ref1');
  });

  it('コンテキストメニュー: 合成グループ行は「参照先プロジェクトを開く」「参照を再読み込み」を出す（解除はなし）', () => {
    const own = makeTask({ id: 'own1', projectId: 'p1' });
    const ref = makeTask({ id: 'ref1', projectId: 'p2', parentId: null });
    renderChart([own], [ref], refProjects);

    fireEvent.contextMenu(getWbsTitleEl('🔗 プロジェクトB'));

    expect(screen.getByText('参照先プロジェクトを開く')).toBeTruthy();
    expect(screen.getByText('参照を再読み込み')).toBeTruthy();
    expect(screen.queryByText('参照を解除')).toBeNull();
  });

  it('コンテキストメニュー: 合成グループ行の「参照先プロジェクトを開く」で onOpenRefProject が呼ばれる', () => {
    const own = makeTask({ id: 'own1', projectId: 'p1' });
    const ref = makeTask({ id: 'ref1', projectId: 'p2', parentId: null });
    renderChart([own], [ref], refProjects);

    fireEvent.contextMenu(getWbsTitleEl('🔗 プロジェクトB'));
    fireEvent.click(screen.getByText('参照先プロジェクトを開く'));
    expect(onOpenRefProject).toHaveBeenCalledWith('p2');
  });
});
