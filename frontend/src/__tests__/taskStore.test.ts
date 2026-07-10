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
    predecessors: [], seq: 1, order: 1, createdAt: '', updatedAt: '',
    titleColor: null, titleBgColor: null, estimateMinutes: null,
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
  useTaskStore.setState({
    tasks: [],
    needsReload: false,
    filterStatus: '',
    filterAssignee: '',
    filterPriority: '',
    filterColor: '',
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
    locale: 'ja',
    ganttBarOpen: true,
  });
});

describe('setTasks', () => {
  it('タスクリストを更新する', () => {
    const t = makeTask({ id: 'abc' });
    useTaskStore.getState().setTasks([t]);
    expect(useTaskStore.getState().tasks).toEqual([t]);
  });

  it('空配列をセットできる', () => {
    useTaskStore.getState().setTasks([makeTask()]);
    useTaskStore.getState().setTasks([]);
    expect(useTaskStore.getState().tasks).toEqual([]);
  });
});

describe('setNeedsReload', () => {
  it('needsReload を true にする', () => {
    useTaskStore.getState().setNeedsReload(true);
    expect(useTaskStore.getState().needsReload).toBe(true);
  });

  it('needsReload を false に戻す', () => {
    useTaskStore.getState().setNeedsReload(true);
    useTaskStore.getState().setNeedsReload(false);
    expect(useTaskStore.getState().needsReload).toBe(false);
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

  it('指定していないフィルタは変更されない', () => {
    useTaskStore.getState().setFilter({ filterStatus: 'wip' });
    useTaskStore.getState().setFilter({ filterAssignee: 'Bob' });
    expect(useTaskStore.getState().filterStatus).toBe('wip');
    expect(useTaskStore.getState().filterAssignee).toBe('Bob');
  });

  it('filterColor を更新する', () => {
    useTaskStore.getState().setFilter({ filterColor: '#ef4444' });
    expect(useTaskStore.getState().filterColor).toBe('#ef4444');
  });

  it('filterColor に "*"（色付き）を設定できる', () => {
    useTaskStore.getState().setFilter({ filterColor: '*' });
    expect(useTaskStore.getState().filterColor).toBe('*');
  });

  it('filterColor の初期値は空文字（すべて）', () => {
    expect(useTaskStore.getState().filterColor).toBe('');
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
    useTaskStore.getState().setGanttRange('2026-06-01', '6m');
    expect(useTaskStore.getState().ganttStartDate).toBe('2026-06-01');
    expect(useTaskStore.getState().ganttPeriod).toBe('6m');
  });
});

describe('setShowLightningLine', () => {
  it('イナズマライン表示をOFFにする', () => {
    useTaskStore.getState().setShowLightningLine(false);
    expect(useTaskStore.getState().showLightningLine).toBe(false);
  });
});

describe('setShowWeekend', () => {
  it('土日表示をOFFにする', () => {
    useTaskStore.getState().setShowWeekend(false);
    expect(useTaskStore.getState().showWeekend).toBe(false);
  });

  it('土日表示をONに戻す', () => {
    useTaskStore.getState().setShowWeekend(false);
    useTaskStore.getState().setShowWeekend(true);
    expect(useTaskStore.getState().showWeekend).toBe(true);
  });
});

describe('setShowCriticalPath', () => {
  it('クリティカルパス表示をONにする', () => {
    useTaskStore.getState().setShowCriticalPath(true);
    expect(useTaskStore.getState().showCriticalPath).toBe(true);
  });

  it('クリティカルパス表示をOFFに戻す', () => {
    useTaskStore.getState().setShowCriticalPath(true);
    useTaskStore.getState().setShowCriticalPath(false);
    expect(useTaskStore.getState().showCriticalPath).toBe(false);
  });
});

describe('setGanttHeaderLevels', () => {
  it('個別レベルを更新できる', () => {
    useTaskStore.getState().setGanttHeaderLevels({ week: false });
    const levels = useTaskStore.getState().ganttHeaderLevels;
    expect(levels.week).toBe(false);
    expect(levels.year).toBe(true);
    expect(levels.month).toBe(true);
    expect(levels.day).toBe(true);
  });

  it('複数レベルを同時に更新できる', () => {
    useTaskStore.getState().setGanttHeaderLevels({ year: false, day: false });
    const levels = useTaskStore.getState().ganttHeaderLevels;
    expect(levels.year).toBe(false);
    expect(levels.day).toBe(false);
    expect(levels.month).toBe(true);
    expect(levels.week).toBe(true);
  });

  it('全レベルをfalseにできる', () => {
    useTaskStore.getState().setGanttHeaderLevels({ year: false, month: false, week: false, day: false });
    const levels = useTaskStore.getState().ganttHeaderLevels;
    expect(Object.values(levels).every(v => v === false)).toBe(true);
  });

  it('既存の状態を上書きせず部分更新できる（2回更新）', () => {
    useTaskStore.getState().setGanttHeaderLevels({ year: false });
    useTaskStore.getState().setGanttHeaderLevels({ month: false });
    const levels = useTaskStore.getState().ganttHeaderLevels;
    expect(levels.year).toBe(false);
    expect(levels.month).toBe(false);
    expect(levels.week).toBe(true);
  });
});

describe('UI設定の永続化', () => {
  function getSaved() {
    const raw = localStorage.getItem('treegantt-ui');
    return raw ? JSON.parse(raw).state : {};
  }

  it('zoomLevel が localStorage に保存される', () => {
    useTaskStore.getState().setZoomLevel('day');
    expect(getSaved().zoomLevel).toBe('day');
  });

  it('ganttStartDate が localStorage に保存される', () => {
    useTaskStore.getState().setGanttRange('2026-06-01', '3m');
    expect(getSaved().ganttStartDate).toBe('2026-06-01');
  });

  it('showLightningLine が localStorage に保存される', () => {
    useTaskStore.getState().setShowLightningLine(false);
    expect(getSaved().showLightningLine).toBe(false);
  });

  it('showWeekend が localStorage に保存される', () => {
    useTaskStore.getState().setShowWeekend(false);
    expect(getSaved().showWeekend).toBe(false);
  });

  it('showCriticalPath が localStorage に保存される', () => {
    useTaskStore.getState().setShowCriticalPath(true);
    expect(getSaved().showCriticalPath).toBe(true);
  });

  it('uiFontSize が localStorage に保存される', () => {
    useTaskStore.getState().setUiFontSize(15);
    expect(getSaved().uiFontSize).toBe(15);
  });

  it('ganttHeaderLevels が localStorage に保存される', () => {
    useTaskStore.getState().setGanttHeaderLevels({ week: false });
    const levels = getSaved().ganttHeaderLevels;
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

  it('フィルタ・検索は localStorage に保存されない', () => {
    useTaskStore.getState().setFilter({ filterStatus: 'wip', filterAssignee: 'Alice', filterColor: '*', filterSearch: 'foo' });
    const saved = getSaved();
    expect(saved).not.toHaveProperty('filterStatus');
    expect(saved).not.toHaveProperty('filterAssignee');
    expect(saved).not.toHaveProperty('filterColor');
    expect(saved).not.toHaveProperty('filterSearch');
  });
});

describe('setTheme', () => {
  it('テーマを変更できる', () => {
    useTaskStore.getState().setTheme('dark');
    expect(useTaskStore.getState().theme).toBe('dark');
    useTaskStore.getState().setTheme('light');
    expect(useTaskStore.getState().theme).toBe('light');
  });
});

describe('setLocale', () => {
  it('既定値は "ja"', () => {
    expect(useTaskStore.getState().locale).toBe('ja');
  });

  it('言語を変更できる', () => {
    useTaskStore.getState().setLocale('en');
    expect(useTaskStore.getState().locale).toBe('en');
    useTaskStore.getState().setLocale('ja');
    expect(useTaskStore.getState().locale).toBe('ja');
  });

  it('localStorage に永続化される', () => {
    useTaskStore.getState().setLocale('en');
    const raw = localStorage.getItem('treegantt-ui');
    const saved = raw ? JSON.parse(raw).state : {};
    expect(saved.locale).toBe('en');
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
    expect(s.zoomLevel).toBe('day');
    expect(s.ganttStartDate).toBe('');
    expect(s.ganttPeriod).toBe('3m');
    expect(s.uiFontSize).toBe(13);
    expect(s.uiRowHeight).toBe(36);
    expect(s.ganttHeaderLevels).toEqual({ year: false, month: true, week: false, day: true });
    expect(s.showLightningLine).toBe(true);
    expect(s.showWeekend).toBe(true);
    expect(s.showCriticalPath).toBe(false);
    expect(s.showResourceView).toBe(false);
  });
});

// ─── 差分適用アクション（v2.63）─────────────────────────────
describe('upsertTask', () => {
  it('未知の id なら末尾に追加する', () => {
    useTaskStore.getState().setTasks([makeTask({ id: 'a' })]);
    useTaskStore.getState().upsertTask(makeTask({ id: 'b', title: '追加' }));
    const tasks = useTaskStore.getState().tasks;
    expect(tasks).toHaveLength(2);
    expect(tasks[1].id).toBe('b');
  });

  it('既存の id なら置換し、他タスクの参照は維持する', () => {
    const a = makeTask({ id: 'a' });
    const b = makeTask({ id: 'b', title: '旧' });
    useTaskStore.getState().setTasks([a, b]);
    useTaskStore.getState().upsertTask(makeTask({ id: 'b', title: '新' }));
    const tasks = useTaskStore.getState().tasks;
    expect(tasks).toHaveLength(2);
    expect(tasks[1].title).toBe('新');
    expect(tasks[0]).toBe(a); // 参照維持（React.memo が効く前提）
  });
});

describe('removeTasks', () => {
  it('複数 id を一括削除する', () => {
    useTaskStore.getState().setTasks([makeTask({ id: 'a' }), makeTask({ id: 'b' }), makeTask({ id: 'c' })]);
    useTaskStore.getState().removeTasks(['a', 'c']);
    expect(useTaskStore.getState().tasks.map(t => t.id)).toEqual(['b']);
  });

  it('残存タスクの predecessors から削除 id を除去する', () => {
    useTaskStore.getState().setTasks([
      makeTask({ id: 'a' }),
      makeTask({ id: 'b', predecessors: ['a', 'x'] }),
      makeTask({ id: 'c', predecessors: ['b'] }),
    ]);
    useTaskStore.getState().removeTasks(['a']);
    const tasks = useTaskStore.getState().tasks;
    expect(tasks.map(t => t.id)).toEqual(['b', 'c']);
    expect(tasks[0].predecessors).toEqual(['x']);
    expect(tasks[1].predecessors).toEqual(['b']);
  });

  it('依存に変化のないタスクは参照を維持する', () => {
    const c = makeTask({ id: 'c', predecessors: ['b'] });
    useTaskStore.getState().setTasks([makeTask({ id: 'a' }), makeTask({ id: 'b' }), c]);
    useTaskStore.getState().removeTasks(['a']);
    expect(useTaskStore.getState().tasks[1]).toBe(c);
  });
});

// ─── クロスプロジェクト参照の非永続スロット（単位4）─────────────────
describe('refTasks / refProjects', () => {
  it('setRefData で refTasks・refProjects を一括更新する', () => {
    const t = makeTask({ id: 'r1', projectId: 'p2' });
    useTaskStore.getState().setRefData([t], [{ id: 'p2', name: 'B', color: null }]);
    expect(useTaskStore.getState().refTasks).toEqual([t]);
    expect(useTaskStore.getState().refProjects).toEqual([{ id: 'p2', name: 'B', color: null }]);
  });

  it('upsertRefTask は未知の id なら追加する', () => {
    useTaskStore.getState().setRefData([], []);
    useTaskStore.getState().upsertRefTask(makeTask({ id: 'r1', projectId: 'p2' }));
    expect(useTaskStore.getState().refTasks).toHaveLength(1);
  });

  it('upsertRefTask は既存の id なら置換する', () => {
    const r1 = makeTask({ id: 'r1', projectId: 'p2', title: '旧' });
    useTaskStore.getState().setRefData([r1], []);
    useTaskStore.getState().upsertRefTask(makeTask({ id: 'r1', projectId: 'p2', title: '新' }));
    const refTasks = useTaskStore.getState().refTasks;
    expect(refTasks).toHaveLength(1);
    expect(refTasks[0].title).toBe('新');
  });

  it('refTasks/refProjects は localStorage に保存されない（非永続）', () => {
    useTaskStore.getState().setRefData([makeTask({ id: 'r1', projectId: 'p2' })], [{ id: 'p2', name: 'B', color: null }]);
    const raw = localStorage.getItem('treegantt-ui');
    const saved = raw ? JSON.parse(raw).state : {};
    expect(saved).not.toHaveProperty('refTasks');
    expect(saved).not.toHaveProperty('refProjects');
  });
});

describe('applyOrders', () => {
  it('order を一括反映する（parentId 指定なしは据え置き）', () => {
    useTaskStore.getState().setTasks([
      makeTask({ id: 'a', order: 1 }),
      makeTask({ id: 'b', order: 2, parentId: 'a' }),
    ]);
    useTaskStore.getState().applyOrders([
      { id: 'a', order: 5 },
      { id: 'b', order: 6 },
    ]);
    const tasks = useTaskStore.getState().tasks;
    expect(tasks[0].order).toBe(5);
    expect(tasks[1].order).toBe(6);
    expect(tasks[1].parentId).toBe('a');
  });

  it('parentId 指定があれば付け替える（null でルート化）', () => {
    useTaskStore.getState().setTasks([
      makeTask({ id: 'a', order: 1 }),
      makeTask({ id: 'b', order: 2, parentId: 'a' }),
    ]);
    useTaskStore.getState().applyOrders([{ id: 'b', order: 3, parentId: null }]);
    expect(useTaskStore.getState().tasks[1].parentId).toBeNull();
  });

  it('orders に含まれないタスクは参照を維持する', () => {
    const a = makeTask({ id: 'a', order: 1 });
    useTaskStore.getState().setTasks([a, makeTask({ id: 'b', order: 2 })]);
    useTaskStore.getState().applyOrders([{ id: 'b', order: 9 }]);
    expect(useTaskStore.getState().tasks[0]).toBe(a);
  });
});
