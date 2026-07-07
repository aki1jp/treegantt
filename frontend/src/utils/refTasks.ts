import type { Task, RefProject } from '../types/task';

// 合成グループ行の order 起点。実タスクの order がここまで達することは想定しない
// （ガント末尾に固定表示するため十分大きい値）。
const GROUP_ORDER_BASE = 1e9;

/** 参照先プロジェクトの合成グループ行 ID（"ref:<projectId>"）。 */
export function refGroupId(projectId: string): string {
  return `ref:${projectId}`;
}

/** 合成グループ行の ID かどうか。 */
export function isRefGroupId(id: string): boolean {
  return id.startsWith('ref:');
}

/**
 * タスクが現在プロジェクトから見て読み取り専用（＝参照タスク or 合成グループ行）かどうか。
 * §5.8 フロントエンド仕様: 読み取り専用はフロントのみで担保する（8経路のガードに配布）。
 */
export function isReadonlyTask(task: Task, currentProjectId: string | undefined): boolean {
  if (isRefGroupId(task.id)) return true;
  if (currentProjectId === undefined) return false;
  return task.projectId !== currentProjectId;
}

/**
 * 作成ドラッグ（GanttSvgBody の背景クリック→ドラッグで新規タスクの日付を確定する操作）
 * を許可してよい行かどうか。日付未設定・非親・非マイルストーンに加え、読み取り専用
 * （参照タスク・合成グループ行）でないことを条件にする（§5.8 readonly ガード）。
 */
export function canCreateOnRow(task: Task, isParent: boolean, currentProjectId: string | undefined): boolean {
  return !task.startDate && !isParent && !task.isMilestone && !isReadonlyTask(task, currentProjectId);
}

function makeGroupTask(project: RefProject, order: number): Task {
  return {
    id: refGroupId(project.id),
    projectId: project.id,
    parentId: null,
    title: `🔗 ${project.name}`,
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
    order,
    titleColor: null,
    titleBgColor: project.color,
    estimateMinutes: null,
    createdAt: '',
    updatedAt: '',
  };
}

/**
 * 現在プロジェクトのタスク一覧に、参照タスク＋合成グループ行を合成する（§5.8）。
 * - 参照先プロジェクトごとに合成グループ行「🔗 <プロジェクト名>」をガント末尾（order=1e9+idx）に生成。
 * - 参照タスクの parentId が参照セット外を指す場合はグループ行の id に差し替える（セット内はそのまま＝サブツリー保持）。
 * - `tasks`/`refTasks` は変更しない（非破壊）。
 */
export function mergeRefTasks(tasks: Task[], refTasks: Task[], refProjects: RefProject[]): Task[] {
  if (refTasks.length === 0) return tasks;

  const refIds = new Set(refTasks.map(t => t.id));
  const byProject = new Map<string, Task[]>();
  for (const t of refTasks) {
    const list = byProject.get(t.projectId);
    if (list) list.push(t);
    else byProject.set(t.projectId, [t]);
  }

  const groupTasks: Task[] = [];
  const remapped: Task[] = [];

  refProjects.forEach((project, idx) => {
    const groupOrder = GROUP_ORDER_BASE + idx;
    groupTasks.push(makeGroupTask(project, groupOrder));

    const projectTasks = (byProject.get(project.id) ?? []).slice().sort((a, b) => a.order - b.order);
    const n = projectTasks.length;
    projectTasks.forEach((t, j) => {
      const parentInSet = t.parentId != null && refIds.has(t.parentId);
      remapped.push({
        ...t,
        parentId: parentInSet ? t.parentId : refGroupId(project.id),
        // グループ行の直後・次グループの前に収まる分数の order（相対順序のみ意味を持つ）
        order: groupOrder + (j + 1) / (n + 1),
      });
    });
  });

  return [...tasks, ...groupTasks, ...remapped];
}
