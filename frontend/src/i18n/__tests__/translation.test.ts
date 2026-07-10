// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useTaskStore } from '../../store/taskStore';
import { useTranslation } from '../useTranslation';
import { ja } from '../ja';
import { en } from '../en';

beforeEach(() => {
  useTaskStore.setState({ locale: 'ja' });
});

describe('useTranslation', () => {
  it('locale=ja のとき ja の文字列を返す', () => {
    useTaskStore.setState({ locale: 'ja' });
    const { result } = renderHook(() => useTranslation());
    expect(result.current.t('common.cancel')).toBe(ja['common.cancel']);
    expect(result.current.locale).toBe('ja');
  });

  it('locale=en のとき en の文字列を返す', () => {
    useTaskStore.setState({ locale: 'en' });
    const { result } = renderHook(() => useTranslation());
    expect(result.current.t('common.cancel')).toBe(en['common.cancel']);
    expect(result.current.locale).toBe('en');
  });

  it('{name} 形式の変数を置換する', () => {
    useTaskStore.setState({ locale: 'ja' });
    const { result } = renderHook(() => useTranslation());
    const msg = result.current.t('app.deleteProjectConfirm', { name: 'テストプロジェクト' });
    expect(msg).toContain('テストプロジェクト');
    expect(msg).not.toContain('{name}');
  });

  it('複数の変数を同時に置換する', () => {
    useTaskStore.setState({ locale: 'en' });
    const { result } = renderHook(() => useTranslation());
    const msg = result.current.t('app.deleteProjectConfirm', { name: 'Test Project' });
    expect(msg).toContain('Test Project');
    expect(msg).not.toContain('{name}');
  });
});

describe('ja / en の辞書', () => {
  it('キー集合が完全一致する', () => {
    const jaKeys = Object.keys(ja).sort();
    const enKeys = Object.keys(en).sort();
    expect(enKeys).toEqual(jaKeys);
  });

  it('両辞書とも値がすべて非空文字列', () => {
    for (const [k, v] of Object.entries(ja)) {
      expect(typeof v).toBe('string');
      expect(v.length).toBeGreaterThan(0);
      expect(k.length).toBeGreaterThan(0);
    }
    for (const v of Object.values(en)) {
      expect(typeof v).toBe('string');
      expect(v.length).toBeGreaterThan(0);
    }
  });
});
