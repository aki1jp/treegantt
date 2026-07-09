import { describe, it, expect } from 'vitest';
import type { Task } from '../types/task';
import { buildRowNumberMap } from '../utils/taskTree';

// 表示専用の通し番号列「行」（設計書 §9.2, doc 0.2.162）のロジックテスト。
// buildRowNumberMap(tasks) は「全展開（折りたたみなし）・フィルタなし」の displayTasks を
// order 昇順に揃えた上で buildTree → flattenTree(roots, 空の Set) でツリー順にフラット化した
// 順序で 1 から採番し、タスク id → 通し番号 の Map を返す。

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

describe('buildRowNumberMap', () => {
  it('親子ツリーを全展開順にフラット化し 1,2,3... と振る', () => {
    // root
    //   child1
    //     grandchild1
    //   child2
    // root2
    const tasks = [
      makeTask({ id: 'root', order: 0 }),
      makeTask({ id: 'child1', parentId: 'root', order: 0 }),
      makeTask({ id: 'grandchild1', parentId: 'child1', order: 0 }),
      makeTask({ id: 'child2', parentId: 'root', order: 1 }),
      makeTask({ id: 'root2', order: 1 }),
    ];
    const map = buildRowNumberMap(tasks);
    expect(map.get('root')).toBe(1);
    expect(map.get('child1')).toBe(2);
    expect(map.get('grandchild1')).toBe(3);
    expect(map.get('child2')).toBe(4);
    expect(map.get('root2')).toBe(5);
  });

  it('フラットな兄弟のみのリストでは配列順に採番する', () => {
    const tasks = [
      makeTask({ id: 'a' }),
      makeTask({ id: 'b' }),
      makeTask({ id: 'c' }),
    ];
    const map = buildRowNumberMap(tasks);
    expect(map.get('a')).toBe(1);
    expect(map.get('b')).toBe(2);
    expect(map.get('c')).toBe(3);
  });

  it('全タスク分のエントリを持つ（size がタスク数と一致）', () => {
    const tasks = [
      makeTask({ id: 'a' }),
      makeTask({ id: 'b', parentId: 'a' }),
      makeTask({ id: 'c', parentId: 'a' }),
      makeTask({ id: 'd' }),
    ];
    const map = buildRowNumberMap(tasks);
    expect(map.size).toBe(4);
  });

  it('同じ入力に対して常に同じ番号を振る（安定性）', () => {
    const tasks = [
      makeTask({ id: 'x' }),
      makeTask({ id: 'y', parentId: 'x' }),
      makeTask({ id: 'z' }),
    ];
    const map1 = buildRowNumberMap(tasks);
    const map2 = buildRowNumberMap(tasks);
    expect(Array.from(map1.entries())).toEqual(Array.from(map2.entries()));
  });

  it('配列の格納順ではなく order 値の昇順で採番する（ドラッグ&ドロップで order のみ更新された場合）', () => {
    // 格納順は a, b, c だが order は c=0, a=1, b=2 → 表示順（order 昇順）は c, a, b
    const tasks = [
      makeTask({ id: 'a', order: 1 }),
      makeTask({ id: 'b', order: 2 }),
      makeTask({ id: 'c', order: 0 }),
    ];
    const map = buildRowNumberMap(tasks);
    expect(map.get('c')).toBe(1);
    expect(map.get('a')).toBe(2);
    expect(map.get('b')).toBe(3);
  });

  it('親子ツリーで子タスクの order が逆順に格納されていても order 昇順で採番する', () => {
    // root の子は格納順 child2, child1 だが order は child1=0, child2=1
    const tasks = [
      makeTask({ id: 'root', order: 0 }),
      makeTask({ id: 'child2', parentId: 'root', order: 1 }),
      makeTask({ id: 'child1', parentId: 'root', order: 0 }),
      makeTask({ id: 'root2', order: 1 }),
    ];
    const map = buildRowNumberMap(tasks);
    expect(map.get('root')).toBe(1);
    expect(map.get('child1')).toBe(2);
    expect(map.get('child2')).toBe(3);
    expect(map.get('root2')).toBe(4);
  });

  it('クロスプロジェクト参照の合成グループ行・参照タスク本体も他タスクと同様に対象になる', () => {
    // ref:<projectId> 合成グループ行や参照タスク本体は displayTasks に含まれる通常の
    // Task 形状のオブジェクトとして渡される想定（mergeRefTasks の出力）。
    // buildRowNumberMap 自身は「参照行かどうか」を特別扱いせず、渡された全タスクを対象に採番する。
    const tasks = [
      makeTask({ id: 'local1' }),
      makeTask({ id: 'ref:p2' }), // 合成グループ行（isRefGroupId 対象の id 形式）
      makeTask({ id: 'refTaskA', parentId: 'ref:p2' }),
      makeTask({ id: 'local2' }),
    ];
    const map = buildRowNumberMap(tasks);
    expect(map.get('local1')).toBe(1);
    expect(map.get('ref:p2')).toBe(2);
    expect(map.get('refTaskA')).toBe(3);
    expect(map.get('local2')).toBe(4);
  });
});
