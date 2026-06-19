import { describe, it, expect } from 'vitest';
import { assignMilestoneLanes } from '../utils/ganttCalc';

describe('assignMilestoneLanes（マイルストーンヘッダー多段レーン割り当て）', () => {
  it('重ならないマイルストーンはすべてlane 0に割り当てられる', () => {
    // x=0にタイトル短め（幅<50px）、x=200は十分離れている
    const items = [
      { x: 0,   title: 'A' },
      { x: 200, title: 'B' },
    ];
    const result = assignMilestoneLanes(items, 13);
    expect(result[0].lane).toBe(0);
    expect(result[1].lane).toBe(0);
  });

  it('重なる2つは異なるレーンに割り当てられる', () => {
    // x=0, x=20 → どちらもタイトル「Test」で幅が20pxを超えるため重なる
    const items = [
      { x: 0,  title: 'Test' },
      { x: 20, title: 'Test' },
    ];
    const result = assignMilestoneLanes(items, 13);
    expect(result[0].lane).toBe(0);
    expect(result[1].lane).toBe(1);
  });

  it('3つが全部重なる場合はlane 0/1/2に分かれる', () => {
    const items = [
      { x: 0,  title: 'Milestone' },
      { x: 5,  title: 'Milestone' },
      { x: 10, title: 'Milestone' },
    ];
    const result = assignMilestoneLanes(items, 13);
    expect(result[0].lane).toBe(0);
    expect(result[1].lane).toBe(1);
    expect(result[2].lane).toBe(2);
  });

  it('2つ目が1つ目と重なるが3つ目は十分離れていれば3つ目はlane 0に戻る', () => {
    // x=0のタイトル'Alpha'の推定幅: iconW(17) + 5*13*0.65(42.25) + 4 ≈ 63px
    // x=50は重なる → lane 1
    // x=200は1つ目の末尾(≈63)より十分先 → lane 0に戻れる
    const items = [
      { x: 0,   title: 'Alpha' },
      { x: 50,  title: 'B' },
      { x: 200, title: 'C' },
    ];
    const result = assignMilestoneLanes(items, 13);
    expect(result[0].lane).toBe(0);
    expect(result[1].lane).toBe(1);
    expect(result[2].lane).toBe(0);
  });

  it('空配列は空配列を返す', () => {
    expect(assignMilestoneLanes([], 13)).toEqual([]);
  });

  it('x/title 以外の追加フィールド（color）も保持して通す', () => {
    const items = [
      { x: 0,   title: 'A', color: '#ff0000' },
      { x: 200, title: 'B', color: '#00ff00' },
    ];
    const result = assignMilestoneLanes(items, 13);
    expect(result[0].color).toBe('#ff0000');
    expect(result[1].color).toBe('#00ff00');
    expect(result[0].lane).toBe(0);
  });
});
