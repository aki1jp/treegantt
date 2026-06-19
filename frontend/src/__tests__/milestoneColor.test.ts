import { describe, it, expect } from 'vitest';
import { milestoneColorOf } from '../utils/taskColors';

describe('milestoneColorOf（マイルストーン色解決：個別 > 統一）', () => {
  const unified = '#8b5cf6';

  it('個別の titleColor が指定されていればそれを優先して返す', () => {
    expect(milestoneColorOf('#ff0000', unified)).toBe('#ff0000');
  });

  it('titleColor が null のときは統一色にフォールバックする', () => {
    expect(milestoneColorOf(null, unified)).toBe(unified);
  });

  it('titleColor が undefined のときは統一色にフォールバックする', () => {
    expect(milestoneColorOf(undefined, unified)).toBe(unified);
  });
});
