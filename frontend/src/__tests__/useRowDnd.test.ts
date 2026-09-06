// @vitest-environment jsdom
/**
 * useRowDnd の並び替え後 order 採番テスト。
 * バグ: バー挿入モード・子採用モードとも、可視行（flatRows＝フィルタ・折りたたみ後）だけを
 * 対象に order を再採番しており、フィルタ等で非表示になっている兄弟タスクの order が
 * 古いまま取り残される。これにより「行」列の通し番号が矛盾する・トップレベルタスクの
 * 表示順が勝手に入れ替わる不具合につながる（設計書 §9.2 関連）。
 * 修正後は allTasks（表示状態に関わらない全タスク）を基準に、非表示タスクも含めた
 * 真の兄弟集合で order の相対順序を計算する。
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRowDnd } from '../components/Gantt/useRowDnd';
import type { Task } from '../types/task';
import { WBS_COL_DEFS, leadingWidth } from '../utils/wbsLayout';

// 既定の列構成での title 列までの左オフセット（rowNumber 36 + order 36）。
// 本ファイルのケースは clientY のみで分岐するため X 依存はないが、
// 固定 px を直書きしないため wbsLayout の導出関数から算出する（§9.2）。
const LEADING = leadingWidth(WBS_COL_DEFS, { colWidths: { title: 180, assignee: 76 }, dateColWidth: 90 });

function makeTask(partial: Partial<Task> & { id: string }): Task {
  return {
    projectId: 'p1',
    parentId: null,
    title: partial.id,
    summary: '',
    description: '',
    status: 'todo',
    priority: 'medium',
    progress: 0,
    assignee: '',
    startDate: null,
    endDate: null,
    isMilestone: false,
    predecessors: [],
    seq: 0,
    order: 0,
    titleColor: null,
    titleBgColor: null,
    estimateMinutes: null,
    createdAt: '',
    updatedAt: '',
    ...partial,
  };
}

function fakeEvent(opts: { clientX?: number; clientY?: number } = {}) {
  return {
    preventDefault: () => {},
    dataTransfer: {},
    clientX: opts.clientX ?? 0,
    clientY: opts.clientY ?? 0,
    ctrlKey: false,
    metaKey: false,
    currentTarget: {
      getBoundingClientRect: () => ({ top: 0, left: 0, height: 100, width: 200 }),
    },
  } as unknown as React.DragEvent;
}

describe('useRowDnd', () => {
  it('バー挿入: フィルタで非表示の兄弟がいても order を取り残さず、相対順序を保って振り直す', () => {
    // A(order0), B(order1, フィルタで非表示), C(order2) は全て root の兄弟。
    // 画面上は A, C のみ可視（B は flatRows に含まれない）。
    // C を A の直前へドラッグする → 可視上は C, A の順になる。
    const A = makeTask({ id: 'A', order: 0 });
    const B = makeTask({ id: 'B', order: 1 });
    const C = makeTask({ id: 'C', order: 2 });
    const flatRows = [{ task: A, depth: 0 }, { task: C, depth: 0 }];
    const allTasks = [A, B, C];
    const onReorder = vi.fn().mockResolvedValue(undefined);
    const onCopyInsert = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useRowDnd({ flatRows, allTasks, onReorder, onCopyInsert, titleLeadingWidth: LEADING })
    );

    act(() => { result.current.handleRowDragStart(fakeEvent(), 'C'); });
    act(() => { result.current.handleRowDragOver(fakeEvent({ clientY: 0 }), 0); });
    act(() => { result.current.handleRowDrop(fakeEvent(), 0); });

    expect(onReorder).toHaveBeenCalledTimes(1);
    const orders = onReorder.mock.calls[0][0] as { id: string; order: number }[];
    const orderMap = new Map(orders.map(o => [o.id, o.order]));

    // 非表示だった B も含めて全タスクが採番対象になること
    expect(orderMap.size).toBe(3);
    // 相対順序: C が A の前へ。非表示だった B は元々 A の直後だった位置を保つ
    expect(orderMap.get('C')!).toBeLessThan(orderMap.get('A')!);
    expect(orderMap.get('A')!).toBeLessThan(orderMap.get('B')!);
  });

  it('子として採用: 対象親の非表示の子の order が可視の子より大きくても、それより後ろに採番する', () => {
    const P  = makeTask({ id: 'P', order: 0 });
    const c1 = makeTask({ id: 'c1', parentId: 'P', order: 0 });
    const c2 = makeTask({ id: 'c2', parentId: 'P', order: 5 }); // 非表示（flatRows に含まれない）
    const D  = makeTask({ id: 'D', order: 10 });
    const flatRows = [{ task: P, depth: 0 }, { task: c1, depth: 1 }, { task: D, depth: 0 }];
    const allTasks = [P, c1, c2, D];
    const onReorder = vi.fn().mockResolvedValue(undefined);
    const onCopyInsert = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useRowDnd({ flatRows, allTasks, onReorder, onCopyInsert, titleLeadingWidth: LEADING })
    );

    act(() => { result.current.handleRowDragStart(fakeEvent(), 'D'); });
    // idx=0 (P の行) に対して下寄り（70%超）へドロップ＝子採用ゾーン
    act(() => { result.current.handleRowDragOver(fakeEvent({ clientY: 80 }), 0); });
    act(() => { result.current.handleRowDrop(fakeEvent(), 0); });

    expect(onReorder).toHaveBeenCalledTimes(1);
    const orders = onReorder.mock.calls[0][0] as { id: string; order: number; parentId?: string | null }[];
    expect(orders).toHaveLength(1);
    expect(orders[0].parentId).toBe('P');
    // 非表示の c2 (order=5) より後ろに来ること
    expect(orders[0].order).toBeGreaterThan(5);
  });
});

// ── Stage 4-a: reorder ペイロード最小化 ──────────────────────────────
describe('useRowDnd — reorder ペイロードの最小化（order/parentId が変わらない行は送らない）', () => {
  it('末尾付近の行を1つ上へ移動 → onReorder のペイロードは全件ではなく移動に関係する行だけになる', () => {
    // A(1),B(2),C(3),D(4),E(5) は全て root の兄弟。E を D の直前へドラッグする
    // → 最終順序は A,B,C,E,D。A/B/C は order が変わらないため送られない。
    const A = makeTask({ id: 'A', order: 1 });
    const B = makeTask({ id: 'B', order: 2 });
    const C = makeTask({ id: 'C', order: 3 });
    const D = makeTask({ id: 'D', order: 4 });
    const E = makeTask({ id: 'E', order: 5 });
    const flatRows = [
      { task: A, depth: 0 }, { task: B, depth: 0 }, { task: C, depth: 0 },
      { task: D, depth: 0 }, { task: E, depth: 0 },
    ];
    const allTasks = [A, B, C, D, E];
    const onReorder = vi.fn().mockResolvedValue(undefined);
    const onCopyInsert = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useRowDnd({ flatRows, allTasks, onReorder, onCopyInsert, titleLeadingWidth: LEADING })
    );

    act(() => { result.current.handleRowDragStart(fakeEvent(), 'E'); });
    // idx=3 (D の行) の上寄り（30%未満）へドロップ＝バー挿入モード、D の直前に挿入
    act(() => { result.current.handleRowDragOver(fakeEvent({ clientY: 0 }), 3); });
    act(() => { result.current.handleRowDrop(fakeEvent(), 3); });

    expect(onReorder).toHaveBeenCalledTimes(1);
    const orders = onReorder.mock.calls[0][0] as { id: string; order: number; parentId?: string | null }[];
    // A/B/C は order 不変のため含まれない。D・E のみが対象。
    expect(orders.map(o => o.id).sort()).toEqual(['D', 'E']);
    const byId = new Map(orders.map(o => [o.id, o]));
    expect(byId.get('E')!.order).toBe(4);
    expect(byId.get('D')!.order).toBe(5);
  });

  it('親を変える移動では、order が同じ値になっても当該行が parentId 付きで含まれる', () => {
    // P(1)-X(child, order=3 ※現在値は移動後の計算結果と一致させてある)
    // B(2)-b1(child, order=4)、A(5) は独立した root。
    // X を P の子から B の最初の子へ付け替える。計算後の X の order は 3 のままだが、
    // parentId が変わるため落としてはならない。
    const P  = makeTask({ id: 'P', order: 1 });
    const B  = makeTask({ id: 'B', order: 2 });
    const X  = makeTask({ id: 'X', parentId: 'P', order: 3 });
    const b1 = makeTask({ id: 'b1', parentId: 'B', order: 4 });
    const A  = makeTask({ id: 'A', order: 5 });
    const flatRows = [
      { task: P, depth: 0 }, { task: X, depth: 1 },
      { task: B, depth: 0 }, { task: b1, depth: 1 },
      { task: A, depth: 0 },
    ];
    const allTasks = [P, X, B, b1, A];
    const onReorder = vi.fn().mockResolvedValue(undefined);
    const onCopyInsert = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useRowDnd({ flatRows, allTasks, onReorder, onCopyInsert, titleLeadingWidth: LEADING })
    );

    act(() => { result.current.handleRowDragStart(fakeEvent(), 'X'); });
    // idx=3 (b1 の行、B の子=depth1 との境目) へ大きな clientX でドロップ
    // → X-axis 上限クランプで depth=1（B の子）として解決される
    act(() => { result.current.handleRowDragOver(fakeEvent({ clientY: 0, clientX: 10000 }), 3); });
    act(() => { result.current.handleRowDrop(fakeEvent({ clientX: 10000 }), 3); });

    expect(onReorder).toHaveBeenCalledTimes(1);
    const orders = onReorder.mock.calls[0][0] as { id: string; order: number; parentId?: string | null }[];
    expect(orders).toHaveLength(1);
    expect(orders[0].id).toBe('X');
    expect(orders[0].order).toBe(3); // order 自体は変わらない
    expect(orders[0].parentId).toBe('B'); // それでも parentId 付きで送られる
  });

  it('不変条件: フィルタ後のペイロードを現在の order に適用した結果が、全件送った場合の並び順と一致する', () => {
    const A = makeTask({ id: 'A', order: 1 });
    const B = makeTask({ id: 'B', order: 2 });
    const C = makeTask({ id: 'C', order: 3 });
    const D = makeTask({ id: 'D', order: 4 });
    const E = makeTask({ id: 'E', order: 5 });
    const flatRows = [
      { task: A, depth: 0 }, { task: B, depth: 0 }, { task: C, depth: 0 },
      { task: D, depth: 0 }, { task: E, depth: 0 },
    ];
    const allTasks = [A, B, C, D, E];
    const onReorder = vi.fn().mockResolvedValue(undefined);
    const onCopyInsert = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useRowDnd({ flatRows, allTasks, onReorder, onCopyInsert, titleLeadingWidth: LEADING })
    );

    act(() => { result.current.handleRowDragStart(fakeEvent(), 'E'); });
    act(() => { result.current.handleRowDragOver(fakeEvent({ clientY: 0 }), 3); });
    act(() => { result.current.handleRowDrop(fakeEvent(), 3); });

    const filteredOrders = onReorder.mock.calls[0][0] as { id: string; order: number; parentId?: string | null }[];

    // 「全件送った場合」の期待される最終並び（バー挿入の結果、A,B,C,E,D の順になるはず）
    const expectedFinalIds = ['A', 'B', 'C', 'E', 'D'];

    function applyOrders(
      tasks: Task[],
      orders: { id: string; order: number; parentId?: string | null }[]
    ): string[] {
      const byId = new Map(tasks.map(t => [t.id, { ...t }]));
      for (const o of orders) {
        const t = byId.get(o.id)!;
        t.order = o.order;
        if ('parentId' in o) t.parentId = o.parentId ?? null;
      }
      return [...byId.values()].sort((a, b) => a.order - b.order).map(t => t.id);
    }

    expect(applyOrders(allTasks, filteredOrders)).toEqual(expectedFinalIds);
  });
});
