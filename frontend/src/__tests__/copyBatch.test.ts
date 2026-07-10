import { describe, it, expect } from 'vitest';
import { buildCopyBatch, computeCopyInsertOrder } from '../utils/copyBatch';
import type { Task } from '../types/task';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 't1', projectId: 'p1', parentId: null,
    title: 'タスク', summary: '', description: '',
    status: 'todo', priority: 'medium', progress: 0, assignee: '',
    startDate: null, endDate: null, isMilestone: false,
    predecessors: [], seq: 1, order: 1,
    createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    titleColor: null, titleBgColor: null, estimateMinutes: null,
    ...overrides,
  };
}

describe('buildCopyBatch', () => {
  it('葉タスク（子なし）は batchInputs に1件、parentRef=null で積む', () => {
    // コピー先（別の親配下）に同名の兄弟が無いのでタイトルは改名されない
    const source = makeTask({ id: 'a', title: 'A', parentId: 'src-parent', order: 1 });
    const { batchInputs, sourceTasksFlat, rootTitle } = buildCopyBatch(source, 'dest-parent', null, null, [source]);

    expect(batchInputs).toHaveLength(1);
    expect(batchInputs[0].parentRef).toBeNull();
    expect(batchInputs[0].title).toBe('A');
    expect(rootTitle).toBe('A');
    expect(sourceTasksFlat).toEqual([source]);
  });

  it('同じ親配下へのコピー（自分自身が兄弟に含まれる）は常に「(コピー)」が付く', () => {
    const source = makeTask({ id: 'a', title: 'A', parentId: 'root', order: 1 });
    const { rootTitle } = buildCopyBatch(source, 'root', 'a', null, [source]);
    expect(rootTitle).toBe('A (コピー)');
  });

  it('兄弟に同名があれば「(コピー)」が採番されルートタイトルに使われる', () => {
    const source = makeTask({ id: 'a', title: 'A', parentId: 'root', order: 1 });
    const sibling = makeTask({ id: 'b', title: 'A', parentId: 'root', order: 2 });
    const { batchInputs, rootTitle } = buildCopyBatch(source, 'root', 'b', null, [source, sibling]);

    expect(rootTitle).toBe('A (コピー)');
    expect(batchInputs[0].title).toBe('A (コピー)');
  });

  it('子孫は parentRef で親のインデックスを参照し、子の title は改名しない', () => {
    const parent = makeTask({ id: 'p', title: '親', parentId: null, order: 1 });
    const child1 = makeTask({ id: 'c1', title: '子1', parentId: 'p', order: 1 });
    const child2 = makeTask({ id: 'c2', title: '子2', parentId: 'p', order: 2 });
    const grandchild = makeTask({ id: 'g', title: '孫', parentId: 'c1', order: 1 });
    const all = [parent, child1, child2, grandchild];

    const { batchInputs, sourceTasksFlat } = buildCopyBatch(parent, null, null, null, all);

    expect(batchInputs).toHaveLength(4);
    expect(sourceTasksFlat.map(t => t.id)).toEqual(['p', 'c1', 'g', 'c2']);
    // ルート(0)の子は c1(1), c2(3)。c1 の子は g(2)。
    expect(batchInputs[0].parentRef).toBeNull();
    expect(batchInputs[1].parentRef).toBe(0); // c1 -> parent
    expect(batchInputs[2].parentRef).toBe(1); // g -> c1
    expect(batchInputs[3].parentRef).toBe(0); // c2 -> parent
    expect(batchInputs[1].title).toBe('子1');
    expect(batchInputs[2].title).toBe('孫');
  });

  it('タスクの色・見積など主要フィールドを引き継ぐ', () => {
    const source = makeTask({
      id: 'a', title: 'A', order: 1,
      titleColor: '#fff', titleBgColor: '#000', estimateMinutes: 120,
      assignee: '花子', priority: 'high', status: 'wip', progress: 40,
      startDate: '2026-01-01', endDate: '2026-01-05', isMilestone: false,
    });
    const { batchInputs } = buildCopyBatch(source, null, null, null, [source]);
    expect(batchInputs[0]).toMatchObject({
      titleColor: '#fff', titleBgColor: '#000', estimateMinutes: 120,
      assignee: '花子', priority: 'high', status: 'wip', progress: 40,
      startDate: '2026-01-01', endDate: '2026-01-05', isMilestone: false,
    });
  });

  it('locale="en" を渡すと「(Copy)」が付与される', () => {
    const source = makeTask({ id: 'a', title: 'A', parentId: 'root', order: 1 });
    const { rootTitle } = buildCopyBatch(source, 'root', 'a', null, [source], 'en');
    expect(rootTitle).toBe('A (Copy)');
  });

  it('locale 省略時は既定で「(コピー)」（後方互換）', () => {
    const source = makeTask({ id: 'a', title: 'A', parentId: 'root', order: 1 });
    const { rootTitle } = buildCopyBatch(source, 'root', 'a', null, [source]);
    expect(rootTitle).toBe('A (コピー)');
  });
});

describe('computeCopyInsertOrder', () => {
  const newRoot = makeTask({ id: 'new', title: 'New', order: 99 });

  it('beforeTaskId 指定時はその直前に挿入する', () => {
    const s1 = makeTask({ id: 's1', order: 1 });
    const s2 = makeTask({ id: 's2', order: 2 });
    const result = computeCopyInsertOrder([s1, s2], null, newRoot, null, 's2');
    expect(result).toEqual([
      { id: 's1', order: 1, parentId: null },
      { id: 'new', order: 2, parentId: null },
      { id: 's2', order: 3, parentId: null },
    ]);
  });

  it('beforeTaskId が見つからない場合は null', () => {
    const s1 = makeTask({ id: 's1', order: 1 });
    const result = computeCopyInsertOrder([s1], null, newRoot, null, 'not-exist');
    expect(result).toBeNull();
  });

  it('afterTaskId 指定時はその直後に挿入する', () => {
    const s1 = makeTask({ id: 's1', order: 1 });
    const s2 = makeTask({ id: 's2', order: 2 });
    const result = computeCopyInsertOrder([s1, s2], null, newRoot, 's1', null);
    expect(result).toEqual([
      { id: 's1', order: 1, parentId: null },
      { id: 'new', order: 2, parentId: null },
      { id: 's2', order: 3, parentId: null },
    ]);
  });

  it('afterTaskId が末尾一致 or 見つからない場合は末尾に追加', () => {
    const s1 = makeTask({ id: 's1', order: 1 });
    const result = computeCopyInsertOrder([s1], null, newRoot, 'not-exist', null);
    expect(result).toEqual([
      { id: 's1', order: 1, parentId: null },
      { id: 'new', order: 2, parentId: null },
    ]);
  });

  it('afterTaskId, beforeTaskId 両方 null なら null', () => {
    const s1 = makeTask({ id: 's1', order: 1 });
    expect(computeCopyInsertOrder([s1], null, newRoot, null, null)).toBeNull();
  });

  it('newRootTask 自身は siblings から除外される', () => {
    const s1 = makeTask({ id: 's1', order: 1 });
    const rootAsSibling = makeTask({ id: 'new', order: 2 });
    const result = computeCopyInsertOrder([s1, rootAsSibling], null, newRoot, 's1', null);
    expect(result?.map(o => o.id)).toEqual(['s1', 'new']);
  });
});
