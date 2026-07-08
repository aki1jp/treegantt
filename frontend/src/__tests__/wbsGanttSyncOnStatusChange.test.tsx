// @vitest-environment jsdom
/**
 * バグ再現テスト: filterStatus="!done" 状態で WBS 上のタスクを「完了」に変更した直後、
 * WBS（左パネル）と ガント SVG（右パネル）の行が同期して消えること（ズレが生じないこと）を検証する。
 * ユーザー報告: WBS からは消えるが、ガント側のバーが残ってしまい行の対応がズレる。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, screen, act, fireEvent } from '@testing-library/react';
import { GanttChart } from '../components/Gantt/GanttChart';
import { useTaskStore } from '../store/taskStore';
import type { Task } from '../types/task';

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

// WBS 行（draggable な行）の件数。DOM に task.id 属性がないため件数比較のみに使う。
function getWbsRowCount(): number {
  const wbs = screen.getByTestId('wbs-panel');
  return wbs.querySelectorAll('[draggable]').length;
}

function getWbsTitles(): string[] {
  const wbs = screen.getByTestId('wbs-panel');
  return Array.from(wbs.querySelectorAll('[draggable]'))
    .map(row => {
      const spans = Array.from(row.querySelectorAll('span'));
      return spans.find(s => (s as HTMLElement).style.cursor === 'text')?.textContent ?? '';
    })
    .filter(Boolean);
}

function getSvgBarTaskIds(): string[] {
  const svg = document.querySelector('svg');
  if (!svg) return [];
  // GanttBar のルート <g data-task-id> を拾う。タイトル背景の縞 <rect key=task.id> ではなく
  // 実際のバー要素（GanttBar内の g）のみをカウントする。
  const ids = Array.from(svg.querySelectorAll('g[data-task-id]')).map(el => el.getAttribute('data-task-id') ?? '');
  return [...new Set(ids)];
}

describe('WBS/ガント同期: ステータス変更でのフィルタ除外', () => {
  it('filterStatus="!done" 中にタスクを完了へ変更すると、WBS・ガント両方から同時に消える', () => {
    const tasks = [
      makeTask({ title: 'TodoTask', status: 'todo' }),
      makeTask({ title: 'WipTask',  status: 'wip'  }),
      makeTask({ title: 'ToBeDone', status: 'todo' }),
    ];
    const target = tasks[2];

    useTaskStore.setState({ tasks, filterStatus: '!done' });
    render(
      <GanttChart
        onEditTask={NOOP} onDeleteTask={NOOP} onInlineUpdate={NOOP}
        onQuickAdd={NOOP} onAddSubTask={NOOP} onReorder={NOOP} onCopyInsert={NOOP}
      />
    );

    // 変更前: WBS・ガント双方に対象タスクが存在する
    expect(getWbsTitles()).toContain(target.title);
    expect(getSvgBarTaskIds()).toContain(target.id);
    expect(getWbsRowCount()).toBe(getSvgBarTaskIds().length);

    // 実アプリの更新経路を模倣: 楽観的更新は store.upsertTask で行われる（useTasks.updateTask 参照）
    act(() => {
      useTaskStore.getState().upsertTask({ ...target, status: 'done' });
    });

    const wbsTitles = getWbsTitles();
    const wbsRowCount = getWbsRowCount();
    const svgIds = getSvgBarTaskIds();

    // 対象タスクはどちらからも消えていること
    expect(wbsTitles).not.toContain(target.title);
    expect(svgIds).not.toContain(target.id);

    // WBS の行数とガントのバー数が一致していること（行の対応がズレていないこと）
    expect(svgIds.length).toBe(wbsRowCount);
  });

  it('実際のクリック→ステータス選択の操作経路でも WBS・ガントが同期して消える', () => {
    // App.tsx の実配線を模倣: onInlineUpdate は楽観的に store.upsertTask する
    const onInlineUpdate = (id: string, patch: Partial<Task>) => {
      const cur = useTaskStore.getState().tasks.find(t => t.id === id);
      if (cur) useTaskStore.getState().upsertTask({ ...cur, ...patch });
    };

    const tasks = [
      makeTask({ title: 'TodoTask', status: 'todo' }),
      makeTask({ title: 'WipTask',  status: 'wip'  }),
      makeTask({ title: 'ToBeDone', status: 'todo' }),
    ];
    const target = tasks[2];

    useTaskStore.setState({ tasks, filterStatus: '!done' });
    render(
      <GanttChart
        onEditTask={NOOP} onDeleteTask={NOOP} onInlineUpdate={onInlineUpdate}
        onQuickAdd={NOOP} onAddSubTask={NOOP} onReorder={NOOP} onCopyInsert={NOOP}
      />
    );

    expect(getWbsTitles()).toContain(target.title);
    expect(getSvgBarTaskIds()).toContain(target.id);

    // 対象行のステータスバッジをクリックして編集モードに入り、<select> で「完了」を選ぶ
    const wbs = screen.getByTestId('wbs-panel');
    const row = Array.from(wbs.querySelectorAll('[draggable]')).find(r =>
      Array.from(r.querySelectorAll('span')).some(s => s.textContent === target.title)
    )!;
    const statusBadge = Array.from(row.querySelectorAll('span')).find(s => s.textContent === 'TODO')!;
    fireEvent.click(statusBadge);
    const select = row.querySelector('select')!;
    fireEvent.change(select, { target: { value: 'done' } });

    const wbsTitles = getWbsTitles();
    const svgIds = getSvgBarTaskIds();
    expect(wbsTitles).not.toContain(target.title);
    expect(svgIds).not.toContain(target.id);
    expect(svgIds.length).toBe(getWbsRowCount());
  });
});
