// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useToastStore, showToast } from '../store/toastStore';

beforeEach(() => {
  useToastStore.setState({ toasts: [] });
  vi.useRealTimers();
});

describe('toastStore', () => {
  it('addToast でトーストが追加される', () => {
    const id = useToastStore.getState().addToast('保存しました', 'success');
    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0]).toMatchObject({ id, message: '保存しました', type: 'success' });
  });

  it('type 省略時は既定で error になる', () => {
    useToastStore.getState().addToast('失敗しました');
    expect(useToastStore.getState().toasts[0].type).toBe('error');
  });

  it('複数追加すると末尾に積み上がる', () => {
    useToastStore.getState().addToast('1件目', 'info');
    useToastStore.getState().addToast('2件目', 'info');
    const toasts = useToastStore.getState().toasts;
    expect(toasts.map(t => t.message)).toEqual(['1件目', '2件目']);
  });

  it('removeToast で該当トーストのみ消える', () => {
    const id1 = useToastStore.getState().addToast('A', 'info');
    const id2 = useToastStore.getState().addToast('B', 'info');
    useToastStore.getState().removeToast(id1);
    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].id).toBe(id2);
  });

  it('error トーストは6秒後に自動で消える', () => {
    vi.useFakeTimers();
    useToastStore.getState().addToast('失敗', 'error');
    expect(useToastStore.getState().toasts).toHaveLength(1);
    vi.advanceTimersByTime(5999);
    expect(useToastStore.getState().toasts).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(useToastStore.getState().toasts).toHaveLength(0);
    vi.useRealTimers();
  });

  it('success トーストは3秒後に自動で消える', () => {
    vi.useFakeTimers();
    useToastStore.getState().addToast('成功', 'success');
    vi.advanceTimersByTime(2999);
    expect(useToastStore.getState().toasts).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(useToastStore.getState().toasts).toHaveLength(0);
    vi.useRealTimers();
  });

  it('info トーストは4秒後に自動で消える', () => {
    vi.useFakeTimers();
    useToastStore.getState().addToast('情報', 'info');
    vi.advanceTimersByTime(3999);
    expect(useToastStore.getState().toasts).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(useToastStore.getState().toasts).toHaveLength(0);
    vi.useRealTimers();
  });

  it('showToast ヘルパーでストアに追加される', () => {
    showToast('外部から', 'info');
    expect(useToastStore.getState().toasts[0]).toMatchObject({ message: '外部から', type: 'info' });
  });
});
