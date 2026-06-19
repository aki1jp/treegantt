import { describe, it, expect } from 'vitest';
import {
  parseDuration,
  formatMinutes,
  resolveCapacityMinutes,
  resolveWorkingDays,
  HARDCODED_CAPACITY_MINUTES,
  HARDCODED_WORKING_DAYS,
} from '../utils/duration';

// 既定キャパ 8:00=480 / 稼働日5日/週
const OPTS = { capacityMinutes: 480, workingDaysPerWeek: 5 };

describe('parseDuration', () => {
  it('HH:MM を分へ', () => {
    expect(parseDuration('7:45', OPTS)).toBe(465);
    expect(parseDuration('0:30', OPTS)).toBe(30);
    expect(parseDuration('40:00', OPTS)).toBe(2400);
  });

  it('単位トークン h/m/d/w を分へ', () => {
    expect(parseDuration('4h', OPTS)).toBe(240);
    expect(parseDuration('30m', OPTS)).toBe(30);
    expect(parseDuration('1d', OPTS)).toBe(480);        // 1日 = キャパ
    expect(parseDuration('3d', OPTS)).toBe(1440);       // 3人日
    expect(parseDuration('1w', OPTS)).toBe(2400);       // 5日 × 480
  });

  it('複合トークン（空白区切り）を合算', () => {
    expect(parseDuration('1d 4h', OPTS)).toBe(720);     // 480 + 240
    expect(parseDuration('1d 4h 30m', OPTS)).toBe(750);
  });

  it('キャパが半端（7:45=465）でも 1d はその値', () => {
    expect(parseDuration('1d', { capacityMinutes: 465, workingDaysPerWeek: 5 })).toBe(465);
    expect(parseDuration('1w', { capacityMinutes: 465, workingDaysPerWeek: 5 })).toBe(2325);
  });

  it('小数も可', () => {
    expect(parseDuration('1.5h', OPTS)).toBe(90);
    expect(parseDuration('0.5d', OPTS)).toBe(240);
  });

  it('空文字・解釈不能は null', () => {
    expect(parseDuration('', OPTS)).toBeNull();
    expect(parseDuration('   ', OPTS)).toBeNull();
    expect(parseDuration('abc', OPTS)).toBeNull();
    expect(parseDuration('4x', OPTS)).toBeNull();
  });
});

describe('formatMinutes', () => {
  it('分を HH:MM へ', () => {
    expect(formatMinutes(465)).toBe('7:45');
    expect(formatMinutes(30)).toBe('0:30');
    expect(formatMinutes(2400)).toBe('40:00');
    expect(formatMinutes(0)).toBe('0:00');
  });
  it('null は空文字', () => {
    expect(formatMinutes(null)).toBe('');
  });
  it('parseDuration とラウンドトリップ', () => {
    expect(formatMinutes(parseDuration('7:45', OPTS))).toBe('7:45');
  });
});

describe('実効リソース設定の解決（カスケード）', () => {
  it('capacity: プロジェクト値 ?? アプリ既定 ?? ハードコード', () => {
    expect(resolveCapacityMinutes(465, 480)).toBe(465);   // プロジェクト優先
    expect(resolveCapacityMinutes(null, 480)).toBe(480);  // アプリ既定
    expect(resolveCapacityMinutes(null, null)).toBe(HARDCODED_CAPACITY_MINUTES); // 480
  });
  it('workingDays: プロジェクト値 ?? アプリ既定 ?? ハードコード', () => {
    expect(resolveWorkingDays([1, 2, 3], [1, 2, 3, 4, 5])).toEqual([1, 2, 3]);
    expect(resolveWorkingDays(null, [1, 2, 3, 4, 5])).toEqual([1, 2, 3, 4, 5]);
    expect(resolveWorkingDays(null, null)).toEqual(HARDCODED_WORKING_DAYS);
  });
});
