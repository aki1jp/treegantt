import { describe, it, expect } from 'vitest';
import { genLargeTasks } from './fixtures/genLargeTasks';

// perf 系テスト共用フィクスチャの決定性・整合性を担保する
describe('genLargeTasks', () => {
  it('指定件数ちょうど生成する', () => {
    expect(genLargeTasks(1000)).toHaveLength(1000);
    expect(genLargeTasks(7)).toHaveLength(7);
    expect(genLargeTasks(0)).toHaveLength(0);
  });

  it('同じ (n, seed) からは完全に同一の配列を返す（決定性）', () => {
    expect(genLargeTasks(500, 42)).toEqual(genLargeTasks(500, 42));
  });

  it('seed が違えば異なるデータになる', () => {
    const a = genLargeTasks(100, 1);
    const b = genLargeTasks(100, 2);
    expect(a).not.toEqual(b);
  });

  it('parentId / predecessors は必ず生成済みタスクを参照する（整合性）', () => {
    const tasks = genLargeTasks(1000);
    const ids = new Set(tasks.map(t => t.id));
    for (const t of tasks) {
      if (t.parentId) expect(ids.has(t.parentId)).toBe(true);
      for (const p of t.predecessors) expect(ids.has(p)).toBe(true);
    }
  });

  it('id / seq / order が一意である', () => {
    const tasks = genLargeTasks(1000);
    expect(new Set(tasks.map(t => t.id)).size).toBe(1000);
    expect(new Set(tasks.map(t => t.seq)).size).toBe(1000);
    expect(new Set(tasks.map(t => t.order)).size).toBe(1000);
  });

  it('葉タスクは日付を持ち、親タスクは日付なし（フロント側で自動計算される仕様に合わせる）', () => {
    const tasks = genLargeTasks(1000);
    const parentIds = new Set(tasks.filter(t => t.parentId !== null).map(t => t.parentId));
    for (const t of tasks) {
      if (parentIds.has(t.id)) {
        expect(t.startDate).toBeNull();
        expect(t.endDate).toBeNull();
      } else {
        expect(t.startDate).not.toBeNull();
        expect(t.endDate).not.toBeNull();
      }
    }
  });

  it('マイルストーン・依存関係・複数担当者を含む（perf テストの現実性確保）', () => {
    const tasks = genLargeTasks(1000);
    expect(tasks.filter(t => t.isMilestone).length).toBeGreaterThan(0);
    expect(tasks.filter(t => t.predecessors.length > 0).length).toBeGreaterThan(0);
    expect(new Set(tasks.map(t => t.assignee)).size).toBe(8);
  });
});
