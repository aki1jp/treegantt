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
    predecessors: [], order: 1, createdAt: '', updatedAt: '',
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
