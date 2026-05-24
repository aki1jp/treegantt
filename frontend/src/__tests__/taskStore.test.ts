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
  localStorage.clear();
  useTaskStore.setState({
    tasks: [],
    needsReload: false,
    sortKey: '',
    sortDir: 'asc',
    filterStatus: '',
    filterAssignee: '',
    filterPriority: '',
    filterSearch: '',
    zoomLevel: 'week',
    ganttStartDate: '',
    ganttPeriod: '3m',
    showLightningLine: true,
    showWeekend: true,
    showCriticalPath: false,
    uiFontSize: 13,
    uiRowHeight: 36,
    ganttHeaderLevels: { year: true, month: true, week: true, day: true },
    theme: 'auto',
    ganttBarOpen: true,
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

describe('setShowWeekend', () => {
  it('false に設定できる', () => {
    useTaskStore.getState().setShowWeekend(false);
    expect(useTaskStore.getState().showWeekend).toBe(false);
  });

  it('true に戻せる', () => {
    useTaskStore.setState({ showWeekend: false });
    useTaskStore.getState().setShowWeekend(true);
    expect(useTaskStore.getState().showWeekend).toBe(true);
  });
});

describe('setShowCriticalPath', () => {
  it('true に設定できる', () => {
    useTaskStore.getState().setShowCriticalPath(true);
    expect(useTaskStore.getState().showCriticalPath).toBe(true);
  });

  it('false に戻せる', () => {
    useTaskStore.setState({ showCriticalPath: true });
    useTaskStore.getState().setShowCriticalPath(false);
    expect(useTaskStore.getState().showCriticalPath).toBe(false);
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

// ── localStorage 永続化 ─────────────────────────────
// persist ミドルウェアにより、UI設定が localStorage('treegantt-ui') に自動保存される。
// キー 'treegantt-ui' の JSON: { state: { ...保存対象フィールド }, version: 0 }

function getSaved(): Record<string, unknown> {
  const raw = localStorage.getItem('treegantt-ui');
  if (!raw) return {};
  return (JSON.parse(raw) as { state: Record<string, unknown> }).state ?? {};
}

describe('UI設定の永続化', () => {
  it('テーマ設定が localStorage に保存される', () => {
    useTaskStore.getState().setTheme('dark');
    expect(getSaved().theme).toBe('dark');
  });

  it('ズームレベルが localStorage に保存される', () => {
    useTaskStore.getState().setZoomLevel('day');
    expect(getSaved().zoomLevel).toBe('day');
  });

  it('ガント期間が localStorage に保存される', () => {
    useTaskStore.getState().setGanttRange('2026-06-01', '6m');
    expect(getSaved().ganttPeriod).toBe('6m');
    expect(getSaved().ganttStartDate).toBe('2026-06-01');
  });

  it('イナズマライン設定が localStorage に保存される', () => {
    useTaskStore.getState().setShowLightningLine(false);
    expect(getSaved().showLightningLine).toBe(false);
  });

  it('土日強調設定が localStorage に保存される', () => {
    useTaskStore.getState().setShowWeekend(false);
    expect(getSaved().showWeekend).toBe(false);
  });

  it('クリティカルパス設定が localStorage に保存される', () => {
    useTaskStore.getState().setShowCriticalPath(true);
    expect(getSaved().showCriticalPath).toBe(true);
  });

  it('文字サイズが localStorage に保存される', () => {
    useTaskStore.getState().setUiFontSize(15);
    expect(getSaved().uiFontSize).toBe(15);
  });

  it('行高が localStorage に保存される', () => {
    useTaskStore.getState().setUiRowHeight(28);
    expect(getSaved().uiRowHeight).toBe(28);
  });

  it('ヘッダー表示レベルが localStorage に保存される', () => {
    useTaskStore.getState().setGanttHeaderLevels({ day: false, week: false });
    const levels = getSaved().ganttHeaderLevels as Record<string, boolean>;
    expect(levels.day).toBe(false);
    expect(levels.week).toBe(false);
    expect(levels.year).toBe(true);
  });

  it('ガントバー開閉状態が localStorage に保存される', () => {
    useTaskStore.getState().setGanttBarOpen(false);
    expect(getSaved().ganttBarOpen).toBe(false);
  });

  it('tasks は localStorage に保存されない（サーバーから取得するため）', () => {
    useTaskStore.getState().setTasks([makeTask({ id: 'server-task' })]);
    expect(getSaved()).not.toHaveProperty('tasks');
  });

  it('needsReload は localStorage に保存されない', () => {
    useTaskStore.getState().setNeedsReload(true);
    expect(getSaved()).not.toHaveProperty('needsReload');
  });

  it('sortKey/sortDir/フィルタ/検索は localStorage に保存されない', () => {
    useTaskStore.getState().setSortKey('title');
    useTaskStore.getState().setFilter({ filterStatus: 'wip', filterAssignee: 'Alice', filterSearch: 'foo' });
    const saved = getSaved();
    expect(saved).not.toHaveProperty('sortKey');
    expect(saved).not.toHaveProperty('sortDir');
    expect(saved).not.toHaveProperty('filterStatus');
    expect(saved).not.toHaveProperty('filterAssignee');
    expect(saved).not.toHaveProperty('filterSearch');
  });
});

describe('resetSort', () => {
  it('sortKey と sortDir を初期値に戻す', () => {
    useTaskStore.getState().setSortKey('title');
    useTaskStore.getState().resetSort();
    const s = useTaskStore.getState();
    expect(s.sortKey).toBe('');
    expect(s.sortDir).toBe('asc');
  });
});

describe('resetUi', () => {
  it('UI設定（ズーム・期間・フォント・行高・ヘッダー・トグル）を初期値に戻す', () => {
    const st = useTaskStore.getState();
    st.setZoomLevel('day');
    st.setGanttRange('2026-01-01', '6m');
    st.setUiFontSize(15);
    st.setUiRowHeight(44);
    st.setGanttHeaderLevels({ year: false });
    st.setShowLightningLine(false);
    st.setShowWeekend(false);
    st.setShowCriticalPath(true);
    st.setShowResourceView(false);

    useTaskStore.getState().resetUi();

    const s = useTaskStore.getState();
    expect(s.zoomLevel).toBe('week');
    expect(s.ganttStartDate).toBe('');
    expect(s.ganttPeriod).toBe('3m');
    expect(s.uiFontSize).toBe(13);
    expect(s.uiRowHeight).toBe(36);
    expect(s.ganttHeaderLevels).toEqual({ year: true, month: true, week: true, day: true });
    expect(s.showLightningLine).toBe(true);
    expect(s.showWeekend).toBe(true);
    expect(s.showCriticalPath).toBe(false);
    expect(s.showResourceView).toBe(true);
  });
});
