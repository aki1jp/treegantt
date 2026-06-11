// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MarkdownBody } from '../components/MarkdownBody/MarkdownBody';

describe('MarkdownBody', () => {
  it('* 箇条書きが ul > li にレンダリングされる', () => {
    const { container } = render(<MarkdownBody>{'* アイテムA\n* アイテムB'}</MarkdownBody>);
    expect(container.querySelector('ul')).toBeTruthy();
    expect(container.querySelectorAll('li')).toHaveLength(2);
  });

  it('- 箇条書きも ul > li にレンダリングされる', () => {
    const { container } = render(<MarkdownBody>{'- アイテム1\n- アイテム2'}</MarkdownBody>);
    expect(container.querySelector('ul')).toBeTruthy();
    expect(container.querySelectorAll('li')).toHaveLength(2);
  });

  it('- [ ] が未チェックの input[type=checkbox] にレンダリングされる（remark-gfm）', () => {
    const { container } = render(<MarkdownBody>{'- [ ] 未完了\n- [x] 完了'}</MarkdownBody>);
    const checkboxes = container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    expect(checkboxes).toHaveLength(2);
    expect(checkboxes[0].checked).toBe(false);
    expect(checkboxes[1].checked).toBe(true);
  });

  it('ラッパー div に md-body クラスが付与される（CSS スコープ用）', () => {
    const { container } = render(<MarkdownBody>{'テスト'}</MarkdownBody>);
    expect(container.firstElementChild?.classList.contains('md-body')).toBe(true);
  });
});
