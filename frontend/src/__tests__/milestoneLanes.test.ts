import { describe, it, expect } from 'vitest';
import { assignMilestoneLanes } from '../utils/ganttCalc';

// テスト用ラベル幅計算: fontSize=13 の ASCII 推定値（従来式と同一）
const lw13 = (title: string) => (13 + 4) + title.length * (13 * 0.65) + 4;

// 全角文字（CJK/Hiragana/Katakana）を fontSize px, 半角を fontSize*0.6 px で計算する関数
function wideAwareLW(title: string, fontSize: number): number {
  const iconW = fontSize + 4;
  const pad = 4;
  let textW = 0;
  for (const ch of title) {
    const c = ch.codePointAt(0) ?? 0;
    const wide = (c >= 0x3040 && c <= 0x33BF) || (c >= 0x4E00 && c <= 0x9FFF) || (c >= 0xFF01 && c <= 0xFF60);
    textW += wide ? fontSize : fontSize * 0.6;
  }
  return iconW + textW + pad;
}

describe('assignMilestoneLanes（マイルストーンヘッダー多段レーン割り当て）', () => {
  it('重ならないマイルストーンはすべてlane 0に割り当てられる', () => {
    // x=0にタイトル短め（幅<50px）、x=200は十分離れている
    const items = [
      { x: 0,   title: 'A' },
      { x: 200, title: 'B' },
    ];
    const result = assignMilestoneLanes(items, lw13);
    expect(result[0].lane).toBe(0);
    expect(result[1].lane).toBe(0);
  });

  it('重なる2つは異なるレーンに割り当てられる', () => {
    // x=0, x=20 → どちらもタイトル「Test」で幅が20pxを超えるため重なる
    const items = [
      { x: 0,  title: 'Test' },
      { x: 20, title: 'Test' },
    ];
    const result = assignMilestoneLanes(items, lw13);
    expect(result[0].lane).toBe(0);
    expect(result[1].lane).toBe(1);
  });

  it('3つが全部重なる場合はlane 0/1/2に分かれる', () => {
    const items = [
      { x: 0,  title: 'Milestone' },
      { x: 5,  title: 'Milestone' },
      { x: 10, title: 'Milestone' },
    ];
    const result = assignMilestoneLanes(items, lw13);
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
    const result = assignMilestoneLanes(items, lw13);
    expect(result[0].lane).toBe(0);
    expect(result[1].lane).toBe(1);
    expect(result[2].lane).toBe(0);
  });

  it('空配列は空配列を返す', () => {
    expect(assignMilestoneLanes([], lw13)).toEqual([]);
  });

  it('x/title 以外の追加フィールド（color）も保持して通す', () => {
    const items = [
      { x: 0,   title: 'A', color: '#ff0000' },
      { x: 200, title: 'B', color: '#00ff00' },
    ];
    const result = assignMilestoneLanes(items, lw13);
    expect(result[0].color).toBe('#ff0000');
    expect(result[1].color).toBe('#00ff00');
    expect(result[0].lane).toBe(0);
  });

  it('x 非昇順（WBS 並び）で渡されても重ならなければ最小段（全lane 0）に詰める', () => {
    // 横では一切重ならない位置（間隔100、各幅は十分小さい）だが、入力順は x 昇順でない。
    // 入力順のまま詰めると不要に段が増えるため、x 昇順 first-fit でまとめる必要がある。
    const items = [
      { x: 200, title: 'A' },
      { x: 0,   title: 'B' },
      { x: 100, title: 'C' },
    ];
    const result = assignMilestoneLanes(items, lw13);
    // 元の入力順を保ったまま、全件 lane 0 に詰まること
    expect(result.find(r => r.title === 'A')!.lane).toBe(0);
    expect(result.find(r => r.title === 'B')!.lane).toBe(0);
    expect(result.find(r => r.title === 'C')!.lane).toBe(0);
  });

  it('x 非昇順でも実際に重なる分はちゃんと別段へ分かれる', () => {
    // 同じ x 近傍に重なる3つ（タイトル長め）。入力順はバラバラ。
    const items = [
      { x: 10, title: 'Milestone' },
      { x: 0,  title: 'Milestone' },
      { x: 5,  title: 'Milestone' },
    ];
    const result = assignMilestoneLanes(items, lw13);
    const lanes = result.map(r => r.lane).sort();
    expect(lanes).toEqual([0, 1, 2]);
  });

  // ── 日本語タイトルの実幅テスト ──────────────────────────────────────────
  it('[再現] 長い日本語タイトルは全角幅で計算すると重なり、別レーンに分かれる', () => {
    // 「クロスセル-エアコンアプローチデータ提出」= 22文字（大半が全角）
    // 全角幅(11px)で: (11+4) + 21*11 + 1*6.6 + 4 ≈ 256px → x=0 から 256px を占有
    // 「キャンペーン開始」= 8文字（全角）: (11+4) + 8*11 + 4 = 107px → x=200 は重ならない
    // ASCII推定(0.65)だと「クロスセル...」幅 ≈ 176px → x=200 との境界が 176 < 200 なので同一 lane に誤配置
    const lw11wide = (title: string) => wideAwareLW(title, 11);
    const items = [
      { x: 0,   title: 'クロスセル-エアコンアプローチデータ提出' },
      { x: 200, title: 'キャンペーン開始' },
    ];
    const result = assignMilestoneLanes(items, lw11wide);
    // 全角幅で計算すると x=0 のラベルが x=256 まで伸びるので x=200 と重なる → 別 lane
    expect(result[0].lane).toBe(0);
    expect(result[1].lane).toBe(1);
  });

  it('[再現] ASCII推定では同一 lane になってしまう（幅過小評価の再現）', () => {
    // 上と同じ配置だが、ASCII推定(lw11)では幅≈176px < 200px なので重ならないと判定される
    const lw11ascii = (title: string) => (11 + 4) + title.length * (11 * 0.65) + 4;
    const items = [
      { x: 0,   title: 'クロスセル-エアコンアプローチデータ提出' },
      { x: 200, title: 'キャンペーン開始' },
    ];
    const result = assignMilestoneLanes(items, lw11ascii);
    // ASCII推定だと幅不足で重ならないと誤判定 → 両方 lane 0（バグ状態）
    expect(result[0].lane).toBe(0);
    expect(result[1].lane).toBe(0);
  });
});
