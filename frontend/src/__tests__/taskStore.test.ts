// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { useTaskStore } from '../store/taskStore';
import type { Task } from '../types/task';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 't1', projectId: 'p1', parentId: null,
    title: 'タスク', summary: '', description: '',
    status: 'todo', priority: 'medium', progress: 0,
    assignee: '', startDate: null, endDate: null, isMilestone: false,
    predecessors: [], order: 1, createdAt: '', updatedAt: '',
    ...overrides,
  };
}

beforeEach(() => {
  useTaskStore.setState({
    tasks: [],
    needsReload: false,
    sortKey: '',
    sortDir: 'asc',
    filterStatus: '',
    filterAssignee: '',
    filterPriority: '',
    zoomLevel: 'week',
    ganttStartDate: '',
    ganttPeriod: '3m',
    showLightningLine: true,
    ganttHeaderLevels: { year: true, month: true, week: true, day: true },
  });
});

describe('setTasks', () => {
  it('タスク一覧を置き換える', () => {
    const tasks = [makeTask({ id: 't1' }), makeTask({ id: 't2' })];
    useTaskStore.getState().setTasks(tasks);
    expect(useTaskStore.getState().tasks).toHaveLength(2);
    expect(useTaskStore.getState().tasks[0].id).toBe('t1');
  });
});

describe('setNeedsReload', () => {
  it('true に設定できる', () => {
    useTaskStore.getState().setNeedsReload(true);
    expect(useTaskStore.getState().needsReload).toBe(true);
  });

  it('false に戻せる', () => {
    useTaskStore.setState({ needsReload: true });
    useTaskStore.getState().setNeedsReload(false);
    expect(useTaskStore.getState().needsReload).toBe(false);
  });
});

describe('setSortKey', () => {
  it('新しいキーを設定すると sortDir が asc になる', () => {
    useTaskStore.setState({ sortKey: 'title', sortDir: 'desc' });
    useTaskStore.getState().setSortKey('status');
    expect(useTaskStore.getState().sortKey).toBe('status');
    expect(useTaskStore.getState().sortDir).toBe('asc');
  });

  it('同じキーを設定すると sortDir が asc → desc に切り替わる', () => {
    useTaskStore.setState({ sortKey: 'status', sortDir: 'asc' });
    useTaskStore.getState().setSortKey('status');
    expect(useTaskStore.getState().sortDir).toBe('desc');
  });

  it('同じキーを desc のときに設定すると asc に戻る', () => {
    useTaskStore.setState({ sortKey: 'status', sortDir: 'desc' });
    useTaskStore.getState().setSortKey('status');
    expect(useTaskStore.getState().sortDir).toBe('asc');
  });
});

describe('toggleSortDir', () => {
  it('asc → desc に切り替わる', () => {
    useTaskStore.setState({ sortDir: 'asc' });
    useTaskStore.getState().toggleSortDir();
    expect(useTaskStore.getState().sortDir).toBe('desc');
  });

  it('desc → asc に切り替わる', () => {
    useTaskStore.setState({ sortDir: 'desc' });
    useTaskStore.getState().toggleSortDir();
    expect(useTaskStore.getState().sortDir).toBe('asc');
  });
});

describe('setFilter', () => {
  it('filterStatus を更新する', () => {
    useTaskStore.getState().setFilter({ filterStatus: 'wip' });
    expect(useTaskStore.getState().filterStatus).toBe('wip');
  });

  it('複数フィルタを同時に更新する', () => {
    useTaskStore.getState().setFilter({ filterStatus: 'done', filterAssignee: 'Alice' });
    expect(useTaskStore.getState().filterStatus).toBe('done');
    expect(useTaskStore.getState().filterAssignee).toBe('Alice');
  });

  it('指定しないフィルタは変化しない', () => {
    useTaskStore.setState({ filterPriority: 'high' });
    useTaskStore.getState().setFilter({ filterStatus: 'todo' });
    expect(useTaskStore.getState().filterPriority).toBe('high');
  });
});

describe('setZoomLevel', () => {
  it('ズームレベルを更新する', () => {
    useTaskStore.getState().setZoomLevel('day');
    expect(useTaskStore.getState().zoomLevel).toBe('day');
  });
});

describe('setGanttRange', () => {
  it('開始日と期間を更新する', () => {
    useTaskStore.getState().setGanttRange('2026-05-01', '6m');
    expect(useTaskStore.getState().ganttStartDate).toBe('2026-05-01');
    expect(useTaskStore.getState().ganttPeriod).toBe('6m');
  });
});

describe('setShowLightningLine', () => {
  it('false に設定できる', () => {
    useTaskStore.getState().setShowLightningLine(false);
    expect(useTaskStore.getState().showLightningLine).toBe(false);
  });
});

describe('setGanttHeaderLevels', () => {
  it('一部のレベルだけ更新できる', () => {
    useTaskStore.getState().setGanttHeaderLevels({ day: false });
    const levels = useTaskStore.getState().ganttHeaderLevels;
    expect(levels.day).toBe(false);
    expect(levels.year).toBe(true);
    expect(levels.month).toBe(true);
    expect(levels.week).toBe(true);
  });

  it('複数レベルを同時に更新できる', () => {
    useTaskStore.getState().setGanttHeaderLevels({ year: false, week: false });
    const levels = useTaskStore.getState().ganttHeaderLevels;
    expect(levels.year).toBe(false);
    expect(levels.week).toBe(false);
    expect(levels.month).toBe(true);
  });
});
