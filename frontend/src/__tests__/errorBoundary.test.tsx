// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { ErrorBoundary } from '../components/ErrorBoundary/ErrorBoundary';

afterEach(() => cleanup());

function Boom(): never {
  throw new Error('boom');
}

describe('ErrorBoundary', () => {
  it('子が正常な場合はそのまま描画する', () => {
    render(
      <ErrorBoundary>
        <div>ok</div>
      </ErrorBoundary>
    );
    expect(screen.getByText('ok')).toBeTruthy();
  });

  it('子の描画中の例外を捕捉し、白画面にせずフォールバックUI（再読み込み案内）を表示する', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { container } = render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );
    expect(container.textContent).toMatch(/再読み込み/);
    expect(container.querySelector('button')).toBeTruthy();
    spy.mockRestore();
  });
});
