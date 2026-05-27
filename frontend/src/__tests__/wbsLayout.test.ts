import { describe, it, expect } from 'vitest';
import {
  SEQ_W, TITLE_PAD, INDENT, TOGGLE_W, TOGGLE_GAP,
  titlePaddingLeft, textStartX,
} from '../utils/wbsLayout';

describe('wbsLayout — 定数', () => {
  it('SEQ_W=36 / TITLE_PAD=6 / INDENT=16 / TOGGLE_W=16 / TOGGLE_GAP=3', () => {
    expect(SEQ_W).toBe(36);
    expect(TITLE_PAD).toBe(6);
    expect(INDENT).toBe(16);
    expect(TOGGLE_W).toBe(16);
    expect(TOGGLE_GAP).toBe(3);
  });
});

describe('titlePaddingLeft(depth)', () => {
  it('depth=0 → 6', () => expect(titlePaddingLeft(0)).toBe(6));
  it('depth=1 → 22', () => expect(titlePaddingLeft(1)).toBe(22));
  it('depth=2 → 38', () => expect(titlePaddingLeft(2)).toBe(38));
});

describe('textStartX(depth)', () => {
  // SEQ_W(36) + TITLE_PAD(6) + TOGGLE_W(16) + TOGGLE_GAP(3) = 61
  it('depth=0 → 61', () => expect(textStartX(0)).toBe(61));
  it('depth=1 → 77', () => expect(textStartX(1)).toBe(77));
  it('depth=2 → 93', () => expect(textStartX(2)).toBe(93));
});
