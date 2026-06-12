// 開発用シードスクリプト: パフォーマンス検証用の大量タスクを投入する。
// 使い方:
//   cd api && npx tsx scripts/seed.ts --count=1000 [--project=<既存プロジェクトID>]
// --project 省略時は「Perf Seed」プロジェクトを作成（既存なら一度削除して再作成＝冪等）。
import { v4 as uuidv4 } from 'uuid';
import { listProjects, getProject, createProject, deleteProject } from '../src/services/projectService.js';
import { createTask } from '../src/services/taskService.js';

const SEED_PROJECT_NAME = 'Perf Seed';
const ASSIGNEES = ['佐藤', '鈴木', '高橋', '田中', '伊藤', '渡辺', '山本', '中村'];
const STATUSES = ['todo', 'wip', 'done', 'wait', 'pending'];
const PRIORITIES = ['medium', 'high', 'low', 'critical'];

function parseArgs(): { count: number; projectId: string | null } {
  let count = 1000;
  let projectId: string | null = null;
  for (const arg of process.argv.slice(2)) {
    const m = arg.match(/^--(count|project)=(.+)$/);
    if (!m) continue;
    if (m[1] === 'count') count = Number(m[2]);
    if (m[1] === 'project') projectId = m[2];
  }
  if (!Number.isInteger(count) || count <= 0) {
    console.error(`不正な --count 指定です: ${count}`);
    process.exit(1);
  }
  return { count, projectId };
}

// Park–Miller LCG（再現性のため Math.random は使わない）
function makeRng(seed: number): () => number {
  let state = seed % 2147483647;
  if (state <= 0) state += 2147483646;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

function isoDate(base: Date, dayOffset: number): string {
  return new Date(base.getTime() + dayOffset * 86400000).toISOString().slice(0, 10);
}

function resolveProject(projectIdArg: string | null): string {
  if (projectIdArg) {
    const p = getProject(projectIdArg);
    if (!p) {
      console.error(`プロジェクトが見つかりません: ${projectIdArg}`);
      process.exit(1);
    }
    return p.id;
  }
  const existing = listProjects().find(p => p.name === SEED_PROJECT_NAME);
  if (existing) deleteProject(existing.id); // タスクごと削除して再シード（冪等）
  return createProject(SEED_PROJECT_NAME).id;
}

function seed(projectId: string, count: number): void {
  const rng = makeRng(20260612);
  const today = new Date();
  let created = 0;
  let order = 0;

  const make = (input: {
    parentId: string | null;
    title: string;
    isLeaf: boolean;
    isMilestone?: boolean;
    predecessors?: string[];
  }): string => {
    const id = uuidv4();
    const startOffset = Math.floor(rng() * 180) - 90; // 今日±90日
    const duration = 1 + Math.floor(rng() * 10);
    createTask({
      id,
      projectId,
      parentId: input.parentId,
      title: input.title,
      status: STATUSES[created % STATUSES.length],
      priority: PRIORITIES[created % PRIORITIES.length],
      progress: input.isLeaf ? Math.floor(rng() * 101) : 0,
      assignee: ASSIGNEES[created % ASSIGNEES.length],
      startDate: input.isLeaf ? isoDate(today, startOffset) : null,
      endDate: input.isLeaf
        ? isoDate(today, input.isMilestone ? startOffset : startOffset + duration)
        : null,
      isMilestone: input.isMilestone ?? false,
      predecessors: input.predecessors ?? [],
      order: ++order,
    });
    created++;
    return id;
  };

  let phase = 0;
  while (created < count) {
    phase++;
    const parentId = make({ parentId: null, title: `フェーズ${phase}`, isLeaf: false });
    for (let s = 1; s <= 10 && created < count; s++) {
      const subId = make({ parentId, title: `フェーズ${phase} サブ${s}`, isLeaf: false });
      let prevLeaf: string | null = null;
      for (let l = 1; l <= 9 && created < count; l++) {
        const isMilestone = created % 100 === 99;
        const predecessors = prevLeaf && !isMilestone && rng() < 0.15 ? [prevLeaf] : [];
        prevLeaf = make({
          parentId: subId,
          title: `作業${phase}-${s}-${l}`,
          isLeaf: true,
          isMilestone,
          predecessors,
        });
      }
    }
    if (created % 200 < 101) console.log(`  ... ${created}/${count} 件`);
  }
}

const { count, projectId: projectIdArg } = parseArgs();
const projectId = resolveProject(projectIdArg);
console.log(`プロジェクト ${projectId} に ${count} 件のタスクを投入します`);
const startedAt = Date.now();
seed(projectId, count);
console.log(`完了: ${count} 件投入（${Date.now() - startedAt}ms）`);
console.log(`ブラウザでプロジェクト「${SEED_PROJECT_NAME}」を開いて確認してください`);
