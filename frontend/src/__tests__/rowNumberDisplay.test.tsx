// @vitest-environment jsdom
/**
 * No. 列（表示専用の通し番号）統合テスト — 設計書 §9.2（doc 0.2.161）。
 * GanttChart が displayTasks を全展開・フィルタなし基準で採番した番号を、
 * フィルタ適用後・折りたたみ適用後も「詰め直さず」元の番号のまま表示することを検証する。
 *
 * 行の No. セルは新設想定の data-testid="row-number"（GanttLeftRow.tsx の
 * 既存「#」列セル、176-178行目のすぐ隣に追加される想定）から取得する。
 * 実装前のため、この data-testid を持つ要素は存在せず本テストは失敗する。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, screen, fireEvent } from '@testing-library/react';
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

function renderChart(tasks: Task[], filterOverrides: Partial<ReturnType<typeof useTaskStore.getState>> = {}) {
  useTaskStore.setState({ tasks, ...filterOverrides });
  return render(
    <GanttChart
      onEditTask={NOOP} onDeleteTask={NOOP} onInlineUpdate={NOOP}
      onQuickAdd={NOOP} onAddSubTask={NOOP} onReorder={NOOP} onCopyInsert={NOOP}
    />
  );
}

/** wbs-panel 内の各タスク行から、タイトルと No. セルのテキストを表示順に取得する。 */
function getWbsRowNumbers(): { title: string; rowNumber: string }[] {
  const wbs = screen.getByTestId('wbs-panel');
  return Array.from(wbs.querySelectorAll('[draggable="true"]'))
    .map(row => {
      const spans = Array.from(row.querySelectorAll('span'));
      const title = spans.find(s => (s as HTMLElement).style.cursor === 'text')?.textContent ?? '';
      const numberEl = row.querySelector('[data-testid="row-number"]');
      return { title, rowNumber: numberEl?.textContent ?? '' };
    })
    .filter(r => r.title);
}

describe('No. 列: 全展開・フィルタなし基準の採番', () => {
  it('フィルタなし・折りたたみなしのとき、表示順に 1,2,3... と振られる', () => {
    const tasks = [
      makeTask({ title: 'Task1' }),
      makeTask({ title: 'Task2' }),
      makeTask({ title: 'Task3' }),
    ];
    renderChart(tasks);
    const rows = getWbsRowNumbers();
    expect(rows.map(r => r.rowNumber)).toEqual(['1', '2', '3']);
  });

  it('親子ツリーでも全展開順（ツリー順）に採番される', () => {
    const parent = makeTask({ title: 'Parent' });
    const child = makeTask({ title: 'Child', parentId: parent.id });
    const sibling = makeTask({ title: 'Sibling' });
    renderChart([parent, child, sibling]);
    const rows = getWbsRowNumbers();
    const byTitle = Object.fromEntries(rows.map(r => [r.title, r.rowNumber]));
    expect(byTitle['Parent']).toBe('1');
    expect(byTitle['Child']).toBe('2');
    expect(byTitle['Sibling']).toBe('3');
  });
});

describe('No. 列: フィルタ適用時に番号を詰め直さない', () => {
  it('中間のタスクがフィルタで非表示になっても、残りの行は元の番号のまま表示される', () => {
    // 全展開・フィルタなし基準では Task1=1, Task2=2, Task3=3, Task4=4, Task5=5
    const tasks = [
      makeTask({ title: 'Task1', status: 'todo' }),
      makeTask({ title: 'Task2', status: 'done' }), // フィルタで非表示になる
      makeTask({ title: 'Task3', status: 'todo' }),
      makeTask({ title: 'Task4', status: 'todo' }),
      makeTask({ title: 'Task5', status: 'todo' }),
    ];
    renderChart(tasks, { filterStatus: '!done' });
    const rows = getWbsRowNumbers();
    const byTitle = Object.fromEntries(rows.map(r => [r.title, r.rowNumber]));
    expect(byTitle['Task2']).toBeUndefined(); // 非表示
    // 詰め直さない: 1,3,4,5 のまま（2 は欠番）
    expect(byTitle['Task1']).toBe('1');
    expect(byTitle['Task3']).toBe('3');
    expect(byTitle['Task4']).toBe('4');
    expect(byTitle['Task5']).toBe('5');
  });
});

describe('No. 列: 折りたたみ適用時も番号が変わらない', () => {
  it('親を折りたたんで子行が隠れても、表示されている行の番号は変わらない', () => {
    const parent = makeTask({ title: 'Parent' });
    const child = makeTask({ title: 'Child', parentId: parent.id });
    const after = makeTask({ title: 'After' });
    renderChart([parent, child, after]);

    // 展開時: Parent=1, Child=2, After=3
    let rows = getWbsRowNumbers();
    let byTitle = Object.fromEntries(rows.map(r => [r.title, r.rowNumber]));
    expect(byTitle['Parent']).toBe('1');
    expect(byTitle['Child']).toBe('2');
    expect(byTitle['After']).toBe('3');

    // 折りたたみボタンをクリック
    const wbs = screen.getByTestId('wbs-panel');
    const collapseBtn = Array.from(wbs.querySelectorAll('button'))
      .find(b => b.getAttribute('aria-label') === '折りたたむ');
    expect(collapseBtn).toBeTruthy();
    fireEvent.click(collapseBtn!);

    // 折りたたみ後: Child は非表示、Parent=1・After=3 のまま（詰め直さない）
    rows = getWbsRowNumbers();
    byTitle = Object.fromEntries(rows.map(r => [r.title, r.rowNumber]));
    expect(byTitle['Child']).toBeUndefined();
    expect(byTitle['Parent']).toBe('1');
    expect(byTitle['After']).toBe('3');
  });
});
