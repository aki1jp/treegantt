// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useTaskStore } from '../../store/taskStore';
import { useDowLabels, DOW_LABELS_JA, DOW_LABELS_EN } from '../dow';

beforeEach(() => {
  useTaskStore.setState({ locale: 'ja' });
});

describe('useDowLabels', () => {
  it('locale=ja のとき日本語の曜日配列を返す', () => {
    useTaskStore.setState({ locale: 'ja' });
    const { result } = renderHook(() => useDowLabels());
    expect(result.current).toEqual(DOW_LABELS_JA);
    expect(result.current).toEqual(['日', '月', '火', '水', '木', '金', '土']);
  });

  it('locale=en のとき英語の曜日配列を返す', () => {
    useTaskStore.setState({ locale: 'en' });
    const { result } = renderHook(() => useDowLabels());
    expect(result.current).toEqual(DOW_LABELS_EN);
  });

  it('日英とも7要素', () => {
    expect(DOW_LABELS_JA).toHaveLength(7);
    expect(DOW_LABELS_EN).toHaveLength(7);
  });
});
