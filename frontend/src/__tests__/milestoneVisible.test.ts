import { describe, it, expect } from 'vitest';
import { isMilestoneXVisible } from '../utils/ganttCalc';

describe('isMilestoneXVisible（マイルストーンの描画範囲内判定）', () => {
  const dayWidth = 20;
  const totalWidth = 400;

  it('範囲内のマイルストーンは可視', () => {
    expect(isMilestoneXVisible(100, dayWidth, totalWidth)).toBe(true);
  });

  it('左端（x=0）は可視', () => {
    expect(isMilestoneXVisible(0, dayWidth, totalWidth)).toBe(true);
  });

  it('左に完全に見切れた（セルが範囲と重ならない）ものは不可視', () => {
    expect(isMilestoneXVisible(-dayWidth, dayWidth, totalWidth)).toBe(false);
    expect(isMilestoneXVisible(-100, dayWidth, totalWidth)).toBe(false);
  });

  it('左に一部見切れ（セルが範囲と重なる）なら可視', () => {
    expect(isMilestoneXVisible(-dayWidth / 2, dayWidth, totalWidth)).toBe(true);
  });

  it('右に外れた（x>=totalWidth）ものは不可視', () => {
    expect(isMilestoneXVisible(totalWidth, dayWidth, totalWidth)).toBe(false);
    expect(isMilestoneXVisible(totalWidth + 50, dayWidth, totalWidth)).toBe(false);
  });

  it('右端ぎりぎり（x<totalWidth）は可視', () => {
    expect(isMilestoneXVisible(totalWidth - 1, dayWidth, totalWidth)).toBe(true);
  });
});
