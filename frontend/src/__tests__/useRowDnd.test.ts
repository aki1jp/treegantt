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
      useRowDnd({ flatRows, allTasks, onReorder, onCopyInsert })
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
      useRowDnd({ flatRows, allTasks, onReorder, onCopyInsert })
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
