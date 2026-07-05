// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { useToastStore } from '../store/toastStore';
import { ToastContainer } from '../components/Toast/Toast';

beforeEach(() => {
  useToastStore.setState({ toasts: [] });
});
afterEach(() => { cleanup(); });

describe('ToastContainer', () => {
  it('トーストが無いときは何も描画しない', () => {
    const { container } = render(<ToastContainer />);
    expect(container.querySelectorAll('[data-testid="toast"]')).toHaveLength(0);
  });

  it('ストアのトーストを表示する', () => {
    render(<ToastContainer />);
    act(() => { useToastStore.getState().addToast('保存に失敗しました', 'error'); });
    expect(screen.getByText('保存に失敗しました')).toBeTruthy();
  });

  it('コンテナに role=status / aria-live=polite を持つ', () => {
    render(<ToastContainer />);
    act(() => { useToastStore.getState().addToast('情報', 'info'); });
    const region = screen.getByRole('status');
    expect(region.getAttribute('aria-live')).toBe('polite');
  });

  it('閉じるボタン（aria-label="閉じる"）でトーストが消える', () => {
    render(<ToastContainer />);
    act(() => { useToastStore.getState().addToast('通知', 'info'); });
    expect(screen.getByText('通知')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('閉じる'));
    expect(screen.queryByText('通知')).toBeNull();
  });

  it('複数のトーストを同時に表示できる', () => {
    render(<ToastContainer />);
    act(() => {
      useToastStore.getState().addToast('1件目', 'error');
      useToastStore.getState().addToast('2件目', 'success');
    });
    expect(screen.getByText('1件目')).toBeTruthy();
    expect(screen.getByText('2件目')).toBeTruthy();
  });
});
