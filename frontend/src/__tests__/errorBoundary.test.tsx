// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { ErrorBoundary } from '../components/ErrorBoundary/ErrorBoundary';
import { useTaskStore } from '../store/taskStore';

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

// ─────────────────────────────────────────────────────────────────────────────
// 多言語対応（i18n）: locale: 'en' でのスモークテスト（既存の ja テストは変更しない）
describe('ErrorBoundary の多言語対応（locale: en）', () => {
  afterEach(() => {
    useTaskStore.setState({ locale: 'ja' });
  });

  it('フォールバックUIが英語表示になる', () => {
    useTaskStore.setState({ locale: 'en' });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { container } = render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );
    expect(screen.getByText('An unexpected error occurred')).toBeTruthy();
    expect(screen.getByText('Please reload the page.')).toBeTruthy();
    expect(screen.getByText('Reload')).toBeTruthy();
    expect(container.textContent).not.toMatch(/再読み込み/);
    spy.mockRestore();
  });
});
