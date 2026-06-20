import type { Task, TaskStatus, TaskPriority } from '../../types/task';

// 大量タスクの決定的ジェネレータ（perf 系テスト共用）。
// 同じ (n, seed) からは常に同一の配列を返すこと（Math.random / Date.now 禁止）。
// 構造: フェーズ親1 + (サブ親 × 各9葉) のブロックを n 件に達するまで繰り返す。

const ASSIGNEES = ['佐藤', '鈴木', '高橋', '田中', '伊藤', '渡辺', '山本', '中村'];
const STATUSES: TaskStatus[] = ['todo', 'wip', 'done', 'wait', 'pending'];
const PRIORITIES: TaskPriority[] = ['medium', 'high', 'low', 'critical'];
const BASE_DATE_UTC = Date.UTC(2026, 0, 1); // 固定基準日（決定性のため Date.now は使わない）

function makeRng(seed: number): () => number {
  // Park–Miller LCG。テスト用途に十分な決定的擬似乱数
  let state = seed % 2147483647;
  if (state <= 0) state += 2147483646;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

function isoDate(dayOffset: number): string {
  return new Date(BASE_DATE_UTC + dayOffset * 86400000).toISOString().slice(0, 10);
}

export function genLargeTasks(n: number, seed = 1): Task[] {
  const rng = makeRng(seed);
  const tasks: Task[] = [];

  const push = (partial: {
    parentId: string | null;
    title: string;
    isLeaf: boolean;
    isMilestone?: boolean;
    predecessors?: string[];
  }): Task => {
    const i = tasks.length;
    const startOffset = Math.floor(rng() * 180) - 90; // 基準日±90日
    const duration = 1 + Math.floor(rng() * 10);
    const task: Task = {
      id: `task-${seed}-${i}`,
      projectId: 'proj-perf',
      parentId: partial.parentId,
      title: partial.title,
      summary: '',
      description: '',
      status: STATUSES[i % STATUSES.length],
      priority: PRIORITIES[i % PRIORITIES.length],
      progress: partial.isLeaf ? Math.floor(rng() * 101) : 0,
      assignee: ASSIGNEES[i % ASSIGNEES.length],
      startDate: partial.isLeaf ? isoDate(startOffset) : null,
      endDate: partial.isLeaf
        ? isoDate(partial.isMilestone ? startOffset : startOffset + duration)
        : null,
      isMilestone: partial.isMilestone ?? false,
      predecessors: partial.predecessors ?? [],
      seq: i + 1,
      order: i + 1,
      titleColor: null,
      titleBgColor: null, estimateMinutes: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    tasks.push(task);
    return task;
  };

  let phase = 0;
  while (tasks.length < n) {
    phase++;
    const parent = push({ parentId: null, title: `フェーズ${phase}`, isLeaf: false });
    for (let s = 1; s <= 10 && tasks.length < n; s++) {
      const sub = push({
        parentId: parent.id,
        title: `フェーズ${phase} サブ${s}`,
        isLeaf: false,
      });
      let prevLeaf: Task | null = null;
      for (let l = 1; l <= 9 && tasks.length < n; l++) {
        const isMilestone = tasks.length % 100 === 99; // 約1%をマイルストーンに
        const deps =
          prevLeaf && !isMilestone && rng() < 0.15 ? [prevLeaf.id] : []; // 兄弟葉への依存 約15%
        prevLeaf = push({
          parentId: sub.id,
          title: `作業${phase}-${s}-${l}`,
          isLeaf: true,
          isMilestone,
          predecessors: deps,
        });
      }
    }
  }
  return tasks;
}
