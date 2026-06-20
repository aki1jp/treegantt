// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRef } from 'react';
import { render, cleanup, screen, fireEvent } from '@testing-library/react';
import { GanttChart } from '../components/Gantt/GanttChart';
import { ResourceView } from '../components/Gantt/ResourceView';
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
    showLightningLine: false, showWeekend: false, showCriticalPath: false,
    showResourceView: true,
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
      onEditTask={NOOP} onDeleteTask={NOOP} onInlineUpdate={NOOP}
      onQuickAdd={NOOP} onAddSubTask={NOOP} onReorder={NOOP} onCopyInsert={NOOP}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
describe('ResourceView: 表示条件', () => {
  it('showResourceView=true でも担当者なしタスクのみなら workload-panel は表示されない', () => {
    renderChart([makeTask({ assignee: '' })]);
    expect(screen.queryByTestId('workload-panel')).toBeNull();
  });

  it('担当者あり・startDate ありのタスクがあれば workload-panel が表示される', () => {
    renderChart([makeTask({ assignee: 'Alice', startDate: '2026-06-10', endDate: '2026-06-15' })]);
    expect(screen.getByTestId('workload-panel')).toBeTruthy();
  });

  it('showResourceView=false のとき workload-panel は表示されない', () => {
    useTaskStore.setState({ showResourceView: false });
    renderChart([makeTask({ assignee: 'Alice', startDate: '2026-06-10', endDate: '2026-06-15' })]);
    expect(screen.queryByTestId('workload-panel')).toBeNull();
  });

  it('startDate=null のタスクは担当者があっても集計されない', () => {
    renderChart([makeTask({ assignee: 'Alice', startDate: null, endDate: null })]);
    expect(screen.queryByTestId('workload-panel')).toBeNull();
  });

  it('done タスクのみなら workload-panel は表示されない', () => {
    renderChart([makeTask({ assignee: 'Alice', status: 'done', startDate: '2026-06-10', endDate: '2026-06-15' })]);
    expect(screen.queryByTestId('workload-panel')).toBeNull();
  });

  it('endDate=null のタスクは担当者があっても集計されない', () => {
    renderChart([makeTask({ assignee: 'Alice', startDate: '2026-06-10', endDate: null })]);
    expect(screen.queryByTestId('workload-panel')).toBeNull();
  });
});

describe('ResourceView: 高さ上限と縦スクロール', () => {
  function manyAssignees(n: number) {
    return Array.from({ length: n }, (_, i) =>
      makeTask({ assignee: `User${String(i).padStart(2, '0')}`, startDate: '2026-06-10', endDate: '2026-06-12', estimateMinutes: 240 })
    );
  }

  it('担当者が多いと行領域の高さが上限でキャップされ縦スクロール可能', () => {
    renderChart(manyAssignees(20));
    const body = screen.getByTestId('workload-rows');
    // 上限（MAX_VISIBLE_ROWS 行）を超えない高さで、縦スクロール可
    expect(body.style.overflowY).toBe('auto');
    const h = parseInt(body.style.height || '0', 10);
    expect(h).toBeGreaterThan(0);
    expect(h).toBeLessThan(20 * 30); // 全20行ぶん(600px)より小さい＝キャップされている
  });

  it('担当者が少ないとキャップ未満（全行表示でスクロール不要な高さ）', () => {
    renderChart(manyAssignees(2));
    const body = screen.getByTestId('workload-rows');
    const h = parseInt(body.style.height || '0', 10);
    expect(h).toBe(2 * 30); // 2 行ぶん
  });
});

describe('ResourceView: 高さリサイズ（境界線ドラッグ）', () => {
  function makeTask2(overrides: Partial<Task> = {}): Task {
    return {
      id: 'rt1', projectId: 'p1', parentId: null, title: 'T', summary: '', description: '',
      status: 'todo', priority: 'medium', progress: 0, assignee: 'Alice',
      startDate: '2026-06-10', endDate: '2026-06-12', isMilestone: false, predecessors: [],
      seq: 1, order: 1, createdAt: '', updatedAt: '', titleColor: null, titleBgColor: null,
      estimateMinutes: 240, ...overrides,
    };
  }

  function renderView(height: number, onHeightChange = vi.fn()) {
    const scrollRef = createRef<HTMLDivElement>();
    render(
      <ResourceView
        tasks={[makeTask2()]} min={new Date('2026-06-01')} zoomLevel="week"
        totalWidth={400} labelWidth={200} scrollRef={scrollRef} onEditTask={NOOP}
        height={height} onHeightChange={onHeightChange}
        capacityMinutesPerDay={480} workingDays={[1, 2, 3, 4, 5]}
      />
    );
    return onHeightChange;
  }

  it('リサイズハンドルが存在し ns-resize カーソル', () => {
    renderView(220);
    const handle = screen.getByTestId('workload-resize');
    expect(handle).toBeTruthy();
    expect(handle.style.cursor).toBe('ns-resize');
  });

  it('上ドラッグで高さが増加して onHeightChange が呼ばれる', () => {
    const onHeightChange = renderView(220);
    const handle = screen.getByTestId('workload-resize');
    fireEvent.mouseDown(handle, { clientY: 200 });
    fireEvent.mouseMove(window, { clientY: 150 }); // 上へ 50px
    fireEvent.mouseUp(window);
    expect(onHeightChange).toHaveBeenCalled();
    const last = onHeightChange.mock.calls.at(-1)![0] as number;
    expect(last).toBeGreaterThan(220);
  });
});

describe('ResourceView: 色凡例', () => {
  it('負荷の色凡例がパネルに表示される', () => {
    renderChart([makeTask({ assignee: 'Alice', startDate: '2026-06-10', endDate: '2026-06-15' })]);
    expect(screen.getByTestId('workload-panel').textContent).toContain('凡例');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('ResourceView: 担当者表示', () => {
  it('担当者名が workload-panel 内に表示される', () => {
    renderChart([makeTask({ assignee: 'Alice', startDate: '2026-06-10', endDate: '2026-06-15' })]);
    const panel = screen.getByTestId('workload-panel');
    expect(panel.textContent).toContain('Alice');
  });

  it('複数担当者がアルファベット順でリスト表示される', () => {
    renderChart([
      makeTask({ assignee: 'Zara',  startDate: '2026-06-10', endDate: '2026-06-12' }),
      makeTask({ assignee: 'Alice', startDate: '2026-06-10', endDate: '2026-06-12' }),
      makeTask({ assignee: 'Bob',   startDate: '2026-06-10', endDate: '2026-06-12' }),
    ]);
    const panel = screen.getByTestId('workload-panel');
    const text = panel.textContent ?? '';
    expect(text.indexOf('Alice')).toBeLessThan(text.indexOf('Bob'));
    expect(text.indexOf('Bob')).toBeLessThan(text.indexOf('Zara'));
  });

  it('同じ担当者は1行だけ表示される（重複なし）', () => {
    renderChart([
      makeTask({ assignee: 'Alice', startDate: '2026-06-10', endDate: '2026-06-11' }),
      makeTask({ assignee: 'Alice', startDate: '2026-06-12', endDate: '2026-06-13' }),
    ]);
    const panel = screen.getByTestId('workload-panel');
    const matches = panel.querySelectorAll('div');
    const aliceCells = Array.from(matches).filter(d =>
      d.textContent?.trim() === 'Alice' && d.children.length === 0
    );
    expect(aliceCells.length).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('ResourceView: タイトルヘッダー', () => {
  it('"リソースビュー（担当者別 工数負荷）" のラベルが表示される', () => {
    renderChart([makeTask({ assignee: 'Alice', startDate: '2026-06-10', endDate: '2026-06-15' })]);
    expect(screen.getByTestId('workload-panel').textContent).toContain('リソースビュー（担当者別 工数負荷）');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('ResourceView: 稼働率セル tooltip', () => {
  it('稼働率・合計需要・1日キャパを title に含む', () => {
    // 2026-06-01(月) 平日。estimate=480=8:00 → 稼働率100%、需要8:00、キャパ8:00
    renderChart([makeTask({ assignee: 'Alice', title: '設計', startDate: '2026-06-01', endDate: '2026-06-01', estimateMinutes: 480 })]);
    const panel = screen.getByTestId('workload-panel');
    const cell = Array.from(panel.querySelectorAll('[title]'))
      .find(el => el.getAttribute('title')?.includes('Alice'));
    expect(cell).toBeTruthy();
    const title = cell!.getAttribute('title')!;
    expect(title).toContain('稼働率');
    expect(title).toContain('100%');
    expect(title).toContain('キャパ 8:00');
    expect(title).toContain('設計 8:00'); // 各タスクの按分時間
  });

  it('過負荷セルは各タスクの按分時間・合計・200% を列挙する', () => {
    renderChart([
      makeTask({ assignee: 'Alice', title: '実装', startDate: '2026-06-01', endDate: '2026-06-01', estimateMinutes: 480 }),
      makeTask({ assignee: 'Alice', title: 'レビュー', startDate: '2026-06-01', endDate: '2026-06-01', estimateMinutes: 240 }),
    ]);
    const panel = screen.getByTestId('workload-panel');
    const cell = Array.from(panel.querySelectorAll('[title]'))
      .find(el => el.getAttribute('title')?.includes('Alice') && el.getAttribute('title')?.includes('150%'));
    expect(cell).toBeTruthy();
    const title = cell!.getAttribute('title')!;
    expect(title).toContain('実装 8:00');
    expect(title).toContain('レビュー 4:00');
    expect(title).toContain('12:00'); // 合計需要 480+240=720=12:00
  });
});
