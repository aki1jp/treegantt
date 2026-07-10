import { describe, it, expect } from 'vitest';
import { makeCopyTitle } from '../utils/copyTitle';

describe('makeCopyTitle（Windows風コピー命名規則）', () => {
  it('コピー先に同名がなければ元タイトルをそのまま返す（別階層へのコピー）', () => {
    expect(makeCopyTitle('TaskA', new Set(['TaskB', 'TaskC']))).toBe('TaskA');
  });

  it('コピー先に同名があれば「(コピー)」を付与する（同一階層へのコピー）', () => {
    expect(makeCopyTitle('TaskA', new Set(['TaskA']))).toBe('TaskA (コピー)');
  });

  it('「(コピー)」も既に存在する場合は「(コピー2)」を採番する', () => {
    expect(makeCopyTitle('TaskA', new Set(['TaskA', 'TaskA (コピー)']))).toBe('TaskA (コピー2)');
  });

  it('「(コピー2)」も存在する場合は「(コピー3)」を採番する', () => {
    expect(
      makeCopyTitle('TaskA', new Set(['TaskA', 'TaskA (コピー)', 'TaskA (コピー2)']))
    ).toBe('TaskA (コピー3)');
  });

  it('コピー元タイトルが「(コピー)」付きでも接尾辞を積み重ねない', () => {
    // "TaskA (コピー)" を同階層にコピー → "TaskA (コピー) (コピー)" ではなく "TaskA (コピー2)"
    expect(
      makeCopyTitle('TaskA (コピー)', new Set(['TaskA', 'TaskA (コピー)']))
    ).toBe('TaskA (コピー2)');
  });

  it('コピー元タイトルが「(コピーN)」付きでも空き番号を採番する', () => {
    expect(
      makeCopyTitle('TaskA (コピー2)', new Set(['TaskA (コピー2)', 'TaskA (コピー)']))
    ).toBe('TaskA (コピー3)');
  });

  it('「(コピーN)」付きタイトルを別階層（衝突なし）へコピーした場合は改名しない', () => {
    expect(makeCopyTitle('TaskA (コピー)', new Set(['TaskB']))).toBe('TaskA (コピー)');
  });

  it('採番に歯抜けがあれば最小の空き番号を使う', () => {
    expect(
      makeCopyTitle('TaskA', new Set(['TaskA', 'TaskA (コピー)', 'TaskA (コピー3)']))
    ).toBe('TaskA (コピー2)');
  });
});

// ─── i18n（locale='en'）─────────────────────────────────────────────
describe('makeCopyTitle — i18n（locale="en"）', () => {
  it('コピー先に同名がなければ元タイトルをそのまま返す', () => {
    expect(makeCopyTitle('TaskA', new Set(['TaskB', 'TaskC']), 'en')).toBe('TaskA');
  });

  it('コピー先に同名があれば「(Copy)」を付与する', () => {
    expect(makeCopyTitle('TaskA', new Set(['TaskA']), 'en')).toBe('TaskA (Copy)');
  });

  it('「(Copy)」も既に存在する場合は「(Copy2)」を採番する', () => {
    expect(makeCopyTitle('TaskA', new Set(['TaskA', 'TaskA (Copy)']), 'en')).toBe('TaskA (Copy2)');
  });

  it('コピー元タイトルが「(Copy)」付きでも接尾辞を積み重ねない', () => {
    expect(
      makeCopyTitle('TaskA (Copy)', new Set(['TaskA', 'TaskA (Copy)']), 'en')
    ).toBe('TaskA (Copy2)');
  });

  it('locale 省略時は既定で日本語（後方互換）', () => {
    expect(makeCopyTitle('TaskA', new Set(['TaskA']))).toBe('TaskA (コピー)');
  });
});
