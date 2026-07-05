import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTestDb } from './helpers.js';
import type Database from 'better-sqlite3';

// インメモリDBをセットアップしてdbモジュールをモック
let testDb: Database.Database;

vi.mock('../db/client.js', () => ({
  get db() { return testDb; },
}));

const { createTask, deleteTaskSubtree, listTasks } =
  await import('../services/taskService.js');

const PROJECT_ID = 'proj-perf-1';
const OTHER_PROJECT_ID = 'proj-perf-2';

function seed() {
  testDb.prepare('INSERT INTO projects (id, name) VALUES (?, ?)').run(PROJECT_ID, 'Perf Project');
  testDb.prepare('INSERT INTO projects (id, name) VALUES (?, ?)').run(OTHER_PROJECT_ID, 'Other Project');
}

// ── ステートメント実行回数スパイ ──────────────────────────────
// better-sqlite3 の Statement.prototype.run / get をラップして実行回数を数える。
// バッチ化（v2.65）の検証はこの回数で行う（時間計測は環境依存のため使わない）。
type Counters = { run: number; get: number };
let counters: Counters;
let restoreSpy: (() => void) | null = null;

function spyStatements(): void {
  const proto = Object.getPrototypeOf(testDb.prepare('SELECT 1'));
  const origRun = proto.run;
  const origGet = proto.get;
  counters = { run: 0, get: 0 };
  proto.run = function (...args: unknown[]) { counters.run++; return origRun.apply(this, args); };
  proto.get = function (...args: unknown[]) { counters.get++; return origGet.apply(this, args); };
  restoreSpy = () => { proto.run = origRun; proto.get = origGet; restoreSpy = null; };
}

afterEach(() => { restoreSpy?.(); });

describe('taskService バッチ化（v2.65）', () => {
  beforeEach(() => {
    testDb = createTestDb();
    seed();
  });

  describe('deleteTaskSubtree', () => {
    function buildLargeTree(count: number): string[] {
      // ルート1 + サブ親10 × 葉(count-11)/10 ≈ count 件
      const ids: string[] = ['root'];
      createTask({ id: 'root', projectId: PROJECT_ID, title: 'root' });
      let created = 1;
      let sub = 0;
      while (created < count) {
        sub++;
        const subId = `sub-${sub}`;
        createTask({ id: subId, projectId: PROJECT_ID, parentId: 'root', title: subId });
        ids.push(subId);
        created++;
        for (let l = 1; l <= 99 && created < count; l++) {
          const leafId = `leaf-${sub}-${l}`;
          createTask({ id: leafId, projectId: PROJECT_ID, parentId: subId, title: leafId });
          ids.push(leafId);
          created++;
        }
      }
      return ids;
    }

    it('1000件のサブツリーを定数回のクエリ実行で削除する（バッチ化）', () => {
      const ids = buildLargeTree(1000);
      createTask({ id: 'survivor', projectId: OTHER_PROJECT_ID, title: '他プロジェクト' });

      spyStatements();
      const deleted = deleteTaskSubtree('root');
      restoreSpy?.();

      // 旧実装は子孫ごとに DELETE 1回（1000回）。バッチ化後は 500件チャンクで高々 2〜3回
      expect(counters.run).toBeLessThanOrEqual(5);

      expect(deleted).toHaveLength(1000);
      expect(new Set(deleted)).toEqual(new Set(ids));
      // 全削除済み・FK残骸なし・他プロジェクト無影響
      expect(listTasks(PROJECT_ID, { limit: 10000 }).total).toBe(0);
      expect((testDb.prepare('SELECT COUNT(*) c FROM task_deps').get() as { c: number }).c).toBe(0);
      expect(listTasks(OTHER_PROJECT_ID, { limit: 10 }).total).toBe(1);
    });

    it('600段の深い一本鎖サブツリーも削除できる（再帰CTEの深さ耐性）', () => {
      createTask({ id: 'd0', projectId: PROJECT_ID, title: 'd0' });
      for (let i = 1; i < 600; i++) {
        createTask({ id: `d${i}`, projectId: PROJECT_ID, parentId: `d${i - 1}`, title: `d${i}` });
      }
      const deleted = deleteTaskSubtree('d0');
      expect(deleted).toHaveLength(600);
      expect(listTasks(PROJECT_ID, { limit: 10000 }).total).toBe(0);
    });

    it('存在しないIDは空配列を返す', () => {
      expect(deleteTaskSubtree('ghost')).toEqual([]);
    });
  });

  describe('insertPredecessors（createTask 経由）', () => {
    it('多数の先行タスクを一括INSERTする（ループ内クエリなし）', () => {
      for (let i = 1; i <= 50; i++) {
        createTask({ id: `pred-${i}`, projectId: PROJECT_ID, title: `pred-${i}` });
      }
      const preds = Array.from({ length: 50 }, (_, i) => `pred-${i + 1}`);

      spyStatements();
      createTask({ id: 'succ', projectId: PROJECT_ID, title: 'succ', predecessors: preds });
      restoreSpy?.();

      // 旧実装は先行タスク数ぶん INSERT（50回）。一括化後は task INSERT + seq UPDATE + deps INSERT の3回程度
      expect(counters.run).toBeLessThanOrEqual(5);

      const succ = listTasks(PROJECT_ID, { limit: 100 }).tasks.find(t => t.id === 'succ')!;
      expect(new Set(succ.predecessors)).toEqual(new Set(preds));
    });

    it('存在しない先行ID（幽霊参照）はスキップされる', () => {
      createTask({ id: 'p1', projectId: PROJECT_ID, title: 'p1' });
      createTask({ id: 's1', projectId: PROJECT_ID, title: 's1', predecessors: ['p1', 'ghost-x', 'ghost-y'] });
      const s1 = listTasks(PROJECT_ID, { limit: 100 }).tasks.find(t => t.id === 's1')!;
      expect(s1.predecessors).toEqual(['p1']);
    });
  });
});
