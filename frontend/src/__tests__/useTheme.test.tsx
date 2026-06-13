// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { useTheme } from '../hooks/useTheme';
import { useTaskStore } from '../store/taskStore';

function Probe() {
  useTheme();
  return null;
}

afterEach(() => cleanup());

function stubMatchMedia(matches: boolean) {
  const add = vi.fn();
  const remove = vi.fn();
  window.matchMedia = vi.fn().mockReturnValue({
    matches,
    media: '(prefers-color-scheme: dark)',
    addEventListener: add,
    removeEventListener: remove,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
    onchange: null,
  }) as unknown as typeof window.matchMedia;
  return { add, remove };
}

describe('useTheme', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('style');
  });

  it('theme=dark で dark の CSS 変数を適用する', () => {
    stubMatchMedia(false);
    useTaskStore.setState({ theme: 'dark' });
    render(<Probe />);
    expect(document.documentElement.style.getPropertyValue('--th-bg')).toBe('#1f2937');
  });

  it('theme=auto は OS のダークに追従し、change を購読/解除する', () => {
    const { add, remove } = stubMatchMedia(true); // systemDark
    useTaskStore.setState({ theme: 'auto' });
    const { unmount } = render(<Probe />);
    expect(document.documentElement.style.getPropertyValue('--th-bg')).toBe('#1f2937'); // auto+dark
    expect(add).toHaveBeenCalledWith('change', expect.any(Function));
    unmount();
    expect(remove).toHaveBeenCalledWith('change', expect.any(Function));
  });
});
