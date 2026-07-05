import type { Task } from '../types/task';
import { makeCopyTitle } from './copyTitle';
import { computeInsertOrder } from './ganttCalc';

export type BatchInput = { parentRef: number | null; title: string; [key: string]: unknown };

export interface CopyBatchResult {
  batchInputs: BatchInput[];
  sourceTasksFlat: Task[];
  rootTitle: string;
}

// サブツリーコピー（App.tsx handleCopyInsert）の batch API 入力を構築する純粋関数。
// App.tsx から抽出（挙動不変）：コピー先の兄弟と重複するタイトルは makeCopyTitle で採番し、
// ルートタスクの挿入 order を事前計算したうえで、サブツリーを parentRef インデックス方式の
// フラット配列へ展開する。
export function buildCopyBatch(
  source: Task,
  parentId: string | null,
  afterTaskId: string | null,
  beforeTaskId: string | null | undefined,
  allTasks: Task[],
): CopyBatchResult {
  // コピー先の兄弟タスク名と衝突する場合のみ「(コピー)」「(コピーN)」を採番
  const siblingTitles = new Set(
    allTasks.filter(t => t.parentId === parentId).map(t => t.title)
  );
  const rootTitle = makeCopyTitle(source.title, siblingTitles);

  // ルートタスクの挿入 order を事前計算
  const rootSiblings = allTasks.filter(t => t.parentId === parentId);
  const targetOrder = computeInsertOrder(rootSiblings, afterTaskId, beforeTaskId);

  const batchInputs: BatchInput[] = [];
  const sourceTasksFlat: Task[] = [];

  function buildBatch(task: Task, parentRef: number | null, isRoot: boolean): void {
    const idx = batchInputs.length;
    batchInputs.push({
      parentRef,
      title:        isRoot ? rootTitle : task.title,
      summary:      task.summary,
      description:  task.description,
      status:       task.status,
      priority:     task.priority,
      progress:     task.progress,
      assignee:     task.assignee,
      startDate:    task.startDate,
      endDate:      task.endDate,
      isMilestone:  task.isMilestone,
      titleColor:   task.titleColor,
      titleBgColor: task.titleBgColor,
      estimateMinutes: task.estimateMinutes,
      order:        isRoot ? targetOrder : undefined,
    });
    sourceTasksFlat.push(task);
    const children = allTasks
      .filter(t => t.parentId === task.id)
      .sort((a, b) => a.order - b.order);
    for (const child of children) {
      buildBatch(child, idx, false);
    }
  }

  buildBatch(source, null, true);

  return { batchInputs, sourceTasksFlat, rootTitle };
}

// コピー完了後、新しいルートタスクを挿入した並び順（reorderTasks API 用の orders）を計算する。
// 挿入先（before/after）が指定されていない、または beforeTaskId が見つからない場合は
// null を返す（App.tsx 側は従来どおり何もしない）。
export function computeCopyInsertOrder(
  allTasks: Task[],
  parentId: string | null,
  newRootTask: Task,
  afterTaskId: string | null,
  beforeTaskId: string | null | undefined,
): { id: string; order: number; parentId: string | null }[] | null {
  const siblings = allTasks
    .filter(t => t.parentId === parentId && t.id !== newRootTask.id)
    .sort((a, b) => a.order - b.order);

  let ordered: Task[];
  if (beforeTaskId) {
    const idx = siblings.findIndex(t => t.id === beforeTaskId);
    if (idx === -1) return null;
    ordered = [...siblings.slice(0, idx), newRootTask, ...siblings.slice(idx)];
  } else if (afterTaskId) {
    const idx = siblings.findIndex(t => t.id === afterTaskId);
    ordered = idx === -1
      ? [...siblings, newRootTask]
      : [...siblings.slice(0, idx + 1), newRootTask, ...siblings.slice(idx + 1)];
  } else {
    return null;
  }

  return ordered.map((t, i) => ({ id: t.id, order: i + 1, parentId }));
}
