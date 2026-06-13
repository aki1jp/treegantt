// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { resolveTheme, applyThemeVars } from '../utils/theme';

describe('resolveTheme', () => {
  it('auto は systemDark に従う', () => {
    expect(resolveTheme('auto', true)).toBe('dark');
    expect(resolveTheme('auto', false)).toBe('light');
  });
  it('明示指定はそのまま返す', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
});

describe('applyThemeVars', () => {
  it('dark/light で CSS 変数を documentElement に設定する', () => {
    applyThemeVars('dark');
    expect(document.documentElement.style.getPropertyValue('--th-bg')).toBe('#1f2937');
    applyThemeVars('light');
    expect(document.documentElement.style.getPropertyValue('--th-bg')).toBe('#ffffff');
  });
});
