// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { useTaskStore } from '../store/taskStore';
import { sanitizeWbsColWidths, clampWbsColWidth, DEFAULT_WBS_COL_WIDTHS, COL_MIN_WIDTHS } from '../utils/wbsLayout';

const DEF = { title: 180, assignee: 76 };

beforeEach(() => {
  localStorage.clear();
  useTaskStore.setState({ wbsColWidths: { ...DEF } });
});

describe('sanitizeWbsColWidths', () => {
  it('定数は仕様どおり', () => {
    expect(DEFAULT_WBS_COL_WIDTHS).toEqual(DEF);
    expect(COL_MIN_WIDTHS).toEqual({ title: 80, assignee: 50 });
  });
  it('正常値はそのまま', () => {
    expect(sanitizeWbsColWidths({ title: 300, assignee: 120 })).toEqual({ title: 300, assignee: 120 });
  });
  it('最小ちょうどは許容', () => {
    expect(sanitizeWbsColWidths({ title: 80, assignee: 50 })).toEqual({ title: 80, assignee: 50 });
  });
  it.each([
    ['文字列', 'x'], ['NaN', NaN], ['Infinity', Infinity], ['-Infinity', -Infinity],
    ['負数', -5], ['最小未満', 10], ['null', null], ['undefined', undefined],
  ])('不正値(%s)の列だけ既定値になる', (_n, bad) => {
    expect(sanitizeWbsColWidths({ title: bad, assignee: 100 })).toEqual({ title: 180, assignee: 100 });
    expect(sanitizeWbsColWidths({ title: 300, assignee: bad })).toEqual({ title: 300, assignee: 76 });
  });
  it('最小未満の境界（title 79 / assignee 49）は既定値', () => {
    expect(sanitizeWbsColWidths({ title: 79, assignee: 49 })).toEqual(DEF);
  });
  it('欠損キーはその列だけ既定値', () => {
    expect(sanitizeWbsColWidths({ title: 300 })).toEqual({ title: 300, assignee: 76 });
    expect(sanitizeWbsColWidths({ assignee: 90 })).toEqual({ title: 180, assignee: 90 });
  });
  it.each([[null], [undefined], ['str'], [42], [[]]])('非オブジェクト(%s)は全列既定値', (raw) => {
    expect(sanitizeWbsColWidths(raw)).toEqual(DEF);
  });
});

describe('clampWbsColWidth', () => {
  it('範囲内はそのまま', () => { expect(clampWbsColWidth('title', 300, 1000)).toBe(300); });
  it('上限超は上限', () => { expect(clampWbsColWidth('title', 1500, 1000)).toBe(1000); });
  it('最小未満は最小', () => {
    expect(clampWbsColWidth('title', 10, 1000)).toBe(80);
    expect(clampWbsColWidth('assignee', 10, 1000)).toBe(50);
  });
  it('上限が最小より小さければ最小を優先', () => { expect(clampWbsColWidth('title', 200, 60)).toBe(80); });
});

describe('sanitizeWbsColWidths の上限（表示領域の幅）', () => {
  it('上限超は上限まで縮める（既定値には戻さない）', () => {
    expect(sanitizeWbsColWidths({ title: 1500, assignee: 999 }, 1000)).toEqual({ title: 1000, assignee: 999 });
  });
  it('上限ちょうどは許容', () => {
    expect(sanitizeWbsColWidths({ title: 1000, assignee: 1000 }, 1000)).toEqual({ title: 1000, assignee: 1000 });
  });
  it('上限が最小幅より小さければ最小幅', () => {
    expect(sanitizeWbsColWidths({ title: 200, assignee: 100 }, 60).title).toBe(80);
  });
  it('不正値は上限に関わらず既定値', () => {
    expect(sanitizeWbsColWidths({ title: 'x', assignee: 10 }, 1000)).toEqual(DEF);
  });
});

describe('wbsColWidths の永続化・リセット・復元', () => {
  it('localStorage の state に wbsColWidths が保存される', () => {
    useTaskStore.getState().setWbsColWidths(() => ({ title: 250, assignee: 90 }));
    expect(JSON.parse(localStorage.getItem('treegantt-ui')!).state.wbsColWidths).toEqual({ title: 250, assignee: 90 });
  });
  it('resetUi で既定値に戻る', () => {
    useTaskStore.getState().setWbsColWidths(() => ({ title: 250, assignee: 90 }));
    useTaskStore.getState().resetUi();
    expect(useTaskStore.getState().wbsColWidths).toEqual(DEF);
  });
  it('復元: 不正な列だけ既定値、他の永続項目は従来どおり復元', async () => {
    localStorage.setItem('treegantt-ui', JSON.stringify({
      state: { wbsColWidths: { title: 300, assignee: 'x' }, zoomLevel: 'week' }, version: 0,
    }));
    await useTaskStore.persist.rehydrate();
    const s = useTaskStore.getState();
    expect(s.wbsColWidths).toEqual({ title: 300, assignee: 76 });
    expect(s.zoomLevel).toBe('week');
  });
  it('復元: wbsColWidths が無い旧データでも既定値で落ちない', async () => {
    localStorage.setItem('treegantt-ui', JSON.stringify({ state: { zoomLevel: 'month' }, version: 0 }));
    await useTaskStore.persist.rehydrate();
    expect(useTaskStore.getState().wbsColWidths).toEqual(DEF);
    expect(useTaskStore.getState().zoomLevel).toBe('month');
  });
  it('復元: wbsColWidths が非オブジェクトでも既定値', async () => {
    localStorage.setItem('treegantt-ui', JSON.stringify({ state: { wbsColWidths: 'bad' }, version: 0 }));
    await useTaskStore.persist.rehydrate();
    expect(useTaskStore.getState().wbsColWidths).toEqual(DEF);
  });
  it('復元: 最小未満は既定値、最小ちょうどは許容', async () => {
    localStorage.setItem('treegantt-ui', JSON.stringify({ state: { wbsColWidths: { title: 79, assignee: 50 } }, version: 0 }));
    await useTaskStore.persist.rehydrate();
    expect(useTaskStore.getState().wbsColWidths).toEqual({ title: 180, assignee: 50 });
  });
});
