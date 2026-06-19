// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWebSocket, applyMessage } from '../hooks/useWebSocket';
import { useTaskStore } from '../store/taskStore';
import type { Task } from '../types/task';

// ─── WebSocket モック ────────────────────────────────────────
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN       = 1;
  static CLOSING    = 2;
  static CLOSED     = 3;
  static instances: MockWebSocket[] = [];
  onopen:    ((e: Event) => void)        | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onclose:   ((e: CloseEvent) => void)   | null = null;
  onerror:   ((e: Event) => void)        | null = null;
  readyState = 0; // CONNECTING
  sentMessages: string[] = [];

  constructor(public url: string) {
    MockWebSocket.instances.push(this);
  }

  send(data: string) { this.sentMessages.push(data); }

  close() {
    this.readyState = 3; // CLOSED
    this.onclose?.({} as CloseEvent);
  }

  simulateOpen() {
    this.readyState = 1; // OPEN
    this.onopen?.(new Event('open'));
  }

  simulateMessage(data: object) {
    this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(data) }));
  }

  simulateClose() {
    this.readyState = 3;
    this.onclose?.({} as CloseEvent);
  }
}

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

// ─── セットアップ ────────────────────────────────────────────
beforeEach(() => {
  MockWebSocket.instances = [];
  useTaskStore.setState({ tasks: [], needsReload: false });
  vi.useFakeTimers();
  vi.stubGlobal('WebSocket', MockWebSocket);
});

afterEach(() => {
  // モジュールシングルトンを null 渡しでリセット
  const { unmount } = renderHook(() => useWebSocket(null));
  unmount();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// ─── applyMessage（メッセージ処理ロジック）───────────────────
describe('applyMessage', () => {
  it('task_created: 新タスクをストアに追加する', () => {
    const task = makeTask({ id: 'new-1', title: '新規' });
    applyMessage({ type: 'task_created', task, projectId: 'p1' });
    expect(useTaskStore.getState().tasks).toHaveLength(1);
    expect(useTaskStore.getState().tasks[0].id).toBe('new-1');
  });

  it('task_created: 既存 id があれば重複追加しない', () => {
    const task = makeTask({ id: 'dup-1' });
    useTaskStore.setState({ tasks: [task] });
    applyMessage({ type: 'task_created', task, projectId: 'p1' });
    expect(useTaskStore.getState().tasks).toHaveLength(1);
  });

  it('task_updated: 対象タスクを更新する', () => {
    const task = makeTask({ id: 't1', title: '旧' });
    const other = makeTask({ id: 't2', title: '別タスク' });
    useTaskStore.setState({ tasks: [task, other] });
    applyMessage({ type: 'task_updated', task: { ...task, title: '新' }, projectId: 'p1' });
    // t1 は更新、t2 は変化なし（false 分岐を通す）
    expect(useTaskStore.getState().tasks[0].title).toBe('新');
    expect(useTaskStore.getState().tasks[1].title).toBe('別タスク');
  });

  it('task_deleted: 対象タスクを削除する', () => {
    useTaskStore.setState({ tasks: [makeTask({ id: 't1' }), makeTask({ id: 't2' })] });
    applyMessage({ type: 'task_deleted', id: 't1', projectId: 'p1' });
    expect(useTaskStore.getState().tasks).toHaveLength(1);
    expect(useTaskStore.getState().tasks[0].id).toBe('t2');
  });

  it('task_deleted: 残存タスクの predecessors から削除IDを除去する', () => {
    useTaskStore.setState({ tasks: [
      makeTask({ id: 't1' }),
      makeTask({ id: 't2', predecessors: ['t1', 't3'] }),
      makeTask({ id: 't3', predecessors: ['t1'] }),
    ] });
    applyMessage({ type: 'task_deleted', id: 't1', projectId: 'p1' });
    const tasks = useTaskStore.getState().tasks;
    expect(tasks.find(t => t.id === 't2')?.predecessors).toEqual(['t3']); // 生存依存は残る
    expect(tasks.find(t => t.id === 't3')?.predecessors).toEqual([]);
  });

  it('tasks_reordered: order を更新する', () => {
    useTaskStore.setState({ tasks: [makeTask({ id: 't1', order: 1 }), makeTask({ id: 't2', order: 2 }), makeTask({ id: 't3', order: 3 })] });
    applyMessage({
      type: 'tasks_reordered',
      orders: [{ id: 't1', order: 5 }, { id: 't2', order: 3 }],
      projectId: 'p1',
    });
    // t1, t2 は更新、t3 は orders に含まれないので変化なし（false 分岐を通す）
    expect(useTaskStore.getState().tasks.find(t => t.id === 't1')?.order).toBe(5);
    expect(useTaskStore.getState().tasks.find(t => t.id === 't2')?.order).toBe(3);
    expect(useTaskStore.getState().tasks.find(t => t.id === 't3')?.order).toBe(3);
  });

  it('reload: needsReload を true にする', () => {
    applyMessage({ type: 'reload', projectId: 'p1' });
    expect(useTaskStore.getState().needsReload).toBe(true);
  });

  it('未知の type は何もしない', () => {
    useTaskStore.setState({ tasks: [makeTask()] });
    applyMessage({ type: 'unknown', projectId: 'p1' });
    expect(useTaskStore.getState().tasks).toHaveLength(1);
  });
});

// ─── useWebSocket（接続管理）─────────────────────────────────
describe('useWebSocket', () => {
  it('projectId を渡すと WebSocket 接続を開始し subscribe を送信する', () => {
    const { unmount } = renderHook(() => useWebSocket('proj-1'));
    const ws = MockWebSocket.instances[0];

    act(() => { ws.simulateOpen(); });

    expect(ws.sentMessages).toHaveLength(1);
    expect(JSON.parse(ws.sentMessages[0])).toEqual({ type: 'subscribe', projectId: 'proj-1' });
    unmount();
  });

  it('onmessage でタスクが作成される', () => {
    const task = makeTask({ id: 'ws-1', title: 'WSタスク' });
    const { unmount } = renderHook(() => useWebSocket('proj-1'));
    const ws = MockWebSocket.instances[0];

    act(() => {
      ws.simulateOpen();
      ws.simulateMessage({ type: 'task_created', task, projectId: 'proj-1' });
    });

    expect(useTaskStore.getState().tasks[0].id).toBe('ws-1');
    unmount();
  });

  it('projectId が異なるメッセージは無視する', () => {
    const task = makeTask({ id: 'other-1' });
    const { unmount } = renderHook(() => useWebSocket('proj-1'));
    const ws = MockWebSocket.instances[0];

    act(() => {
      ws.simulateOpen();
      ws.simulateMessage({ type: 'task_created', task, projectId: 'other-project' });
    });

    expect(useTaskStore.getState().tasks).toHaveLength(0);
    unmount();
  });

  it('不正な JSON メッセージは無視する', () => {
    const { unmount } = renderHook(() => useWebSocket('proj-1'));
    const ws = MockWebSocket.instances[0];

    act(() => {
      ws.simulateOpen();
      ws.onmessage?.(new MessageEvent('message', { data: 'invalid json {{{' }));
    });

    expect(useTaskStore.getState().tasks).toHaveLength(0);
    unmount();
  });

  it('切断後に再接続タイマーが設定される', () => {
    const { unmount } = renderHook(() => useWebSocket('proj-1'));
    const ws = MockWebSocket.instances[0];
    act(() => { ws.simulateOpen(); });

    // onclose を null にせず close → reconnect タイマーが設定される
    ws.onclose?.({} as CloseEvent);
    act(() => { vi.advanceTimersByTime(3000); });

    expect(MockWebSocket.instances).toHaveLength(2);
    unmount();
  });

  it('projectId が null のとき接続をクリーンアップする', () => {
    const { rerender, unmount } = renderHook(
      ({ id }: { id: string | null }) => useWebSocket(id),
      { initialProps: { id: 'proj-1' as string | null } },
    );
    const ws = MockWebSocket.instances[0];
    act(() => { ws.simulateOpen(); });

    rerender({ id: null });

    expect(ws.readyState).toBe(3); // CLOSED
    unmount();
  });

  it('失効 open: WS 生成後に projectId が変わり onopen が遅れて発火しても自己クローズする（L57）', () => {
    const { rerender, unmount } = renderHook(
      ({ id }: { id: string | null }) => useWebSocket(id),
      { initialProps: { id: 'proj-1' as string | null } },
    );
    const ws1 = MockWebSocket.instances[0];

    // proj-2 に切り替え → _projectId が 'proj-2' になる
    rerender({ id: 'proj-2' });

    // ws1 の onopen が遅れて発火（失効 open）→ L57 で ws1.close() される
    act(() => { ws1.simulateOpen(); });

    // ws1 は閉じられているはず
    expect(ws1.readyState).toBe(3);
    unmount();
  });

  it('失効 close: onclose 保存後に projectId が変わり、古い onclose が発火しても再接続しない（L70）', () => {
    const { rerender, unmount } = renderHook(
      ({ id }: { id: string | null }) => useWebSocket(id),
      { initialProps: { id: 'proj-1' as string | null } },
    );
    const ws1 = MockWebSocket.instances[0];
    act(() => { ws1.simulateOpen(); });

    // onclose ハンドラを保存してから proj-2 に切り替え
    const savedOnClose = ws1.onclose;
    rerender({ id: 'proj-2' });

    // 古い onclose を手動発火（_projectId は既に 'proj-2'）→ L70 で return
    act(() => { savedOnClose?.({} as CloseEvent); });

    // 再接続されていない（WS は proj-2 の分だけ）
    vi.advanceTimersByTime(3000);
    expect(MockWebSocket.instances).toHaveLength(2); // proj-1 と proj-2 のみ
    unmount();
  });

  it('同じ projectId で再マウントしても既存の OPEN な WS を使い回す（L86）', () => {
    // 1回目のマウント → WS 作成・オープン
    const { unmount: unmount1 } = renderHook(() => useWebSocket('proj-1'));
    const ws = MockWebSocket.instances[0];
    act(() => { ws.simulateOpen(); });
    expect(MockWebSocket.instances).toHaveLength(1);

    // アンマウント（_ws はモジュール変数として残る）
    unmount1();

    // 2回目のマウント: _projectId='proj-1' かつ readyState=OPEN → L86 で早期 return
    const { unmount: unmount2 } = renderHook(() => useWebSocket('proj-1'));
    expect(MockWebSocket.instances).toHaveLength(1); // 新規 WS は作られない
    unmount2();
  });

  it('再接続タイマー中に null を渡すとタイマーがキャンセルされ再接続しない（L81）', () => {
    const { rerender, unmount } = renderHook(
      ({ id }: { id: string | null }) => useWebSocket(id),
      { initialProps: { id: 'proj-1' as string | null } },
    );
    const ws = MockWebSocket.instances[0];
    act(() => { ws.simulateOpen(); });

    // 自然切断 → 再接続タイマーが設定される
    ws.onclose?.({} as CloseEvent);

    // タイマーが生きている間に null を渡してキャンセル（L81 の if (_reconnectTimer) 真分岐）
    rerender({ id: null });

    act(() => { vi.advanceTimersByTime(3000); });
    expect(MockWebSocket.instances).toHaveLength(1); // 再接続されていない
    unmount();
  });
});

// ─── applyMessage の差分適用委譲（v2.63）────────────────────
describe('applyMessage 差分適用（v2.63）', () => {
  it('task_updated: 未知 id のタスクは追加される（upsert: 作成通知より先着しても自己回復）', () => {
    useTaskStore.setState({ tasks: [makeTask({ id: 't1' })] });
    applyMessage({ type: 'task_updated', task: makeTask({ id: 'ghost', title: '先着更新' }), projectId: 'p1' });
    const tasks = useTaskStore.getState().tasks;
    expect(tasks).toHaveLength(2);
    expect(tasks[1].id).toBe('ghost');
  });

  it('連続した複数メッセージがすべて反映される', () => {
    useTaskStore.setState({ tasks: [makeTask({ id: 't1', title: '旧1' }), makeTask({ id: 't2', title: '旧2' })] });
    applyMessage({ type: 'task_updated', task: makeTask({ id: 't1', title: '新1' }), projectId: 'p1' });
    applyMessage({ type: 'task_updated', task: makeTask({ id: 't2', title: '新2' }), projectId: 'p1' });
    applyMessage({ type: 'task_deleted', id: 't1', projectId: 'p1' });
    const tasks = useTaskStore.getState().tasks;
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe('新2');
  });

  it('task_updated: 更新されないタスクは参照を維持する（React.memo 前提）', () => {
    const other = makeTask({ id: 'keep' });
    useTaskStore.setState({ tasks: [other, makeTask({ id: 'chg', title: '旧' })] });
    applyMessage({ type: 'task_updated', task: makeTask({ id: 'chg', title: '新' }), projectId: 'p1' });
    expect(useTaskStore.getState().tasks[0]).toBe(other);
  });
});

// ─── tasks_deleted 一括削除メッセージ（v2.66）────────────────
describe('applyMessage tasks_deleted（v2.66）', () => {
  it('ids 配列のタスクを一括削除する', () => {
    useTaskStore.setState({ tasks: [makeTask({ id: 'a' }), makeTask({ id: 'b' }), makeTask({ id: 'c' })] });
    applyMessage({ type: 'tasks_deleted', ids: ['a', 'c'], projectId: 'p1' });
    expect(useTaskStore.getState().tasks.map(t => t.id)).toEqual(['b']);
  });

  it('残存タスクの predecessors から削除IDを除去する', () => {
    useTaskStore.setState({ tasks: [
      makeTask({ id: 'a' }),
      makeTask({ id: 'b', predecessors: ['a'] }),
    ] });
    applyMessage({ type: 'tasks_deleted', ids: ['a'], projectId: 'p1' });
    expect(useTaskStore.getState().tasks[0].predecessors).toEqual([]);
  });

  it('旧形式 task_deleted も引き続き処理できる（互換）', () => {
    useTaskStore.setState({ tasks: [makeTask({ id: 'a' }), makeTask({ id: 'b' })] });
    applyMessage({ type: 'task_deleted', id: 'a', projectId: 'p1' });
    expect(useTaskStore.getState().tasks.map(t => t.id)).toEqual(['b']);
  });

  it('tasks_created: バッチのタスクをすべてストアに追加する', () => {
    const tasks = [
      makeTask({ id: 'b1', title: '一括1' }),
      makeTask({ id: 'b2', title: '一括2' }),
      makeTask({ id: 'b3', title: '一括3' }),
    ];
    applyMessage({ type: 'tasks_created', tasks, projectId: 'p1' });
    const stored = useTaskStore.getState().tasks;
    expect(stored).toHaveLength(3);
    expect(stored.map(t => t.id)).toEqual(['b1', 'b2', 'b3']);
  });

  it('tasks_created: 既存タスクと重複するIDはupsert（上書き）される', () => {
    useTaskStore.setState({ tasks: [makeTask({ id: 'b1', title: '旧' })] });
    applyMessage({ type: 'tasks_created', tasks: [makeTask({ id: 'b1', title: '新' })], projectId: 'p1' });
    expect(useTaskStore.getState().tasks).toHaveLength(1);
    expect(useTaskStore.getState().tasks[0].title).toBe('新');
  });
});
