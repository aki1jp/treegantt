// @vitest-environment jsdom
/**
 * TodayLine（今日ライン）i18n テスト
 * - ラベル「今日」の固定日本語を t() 経由に置き換え（locale='en' では 'Today'）
 * - 時刻表示の toLocaleTimeString がロケール固定('ja-JP')ではなく、
 *   locale に応じて切り替わること（en → 'en-US'）
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { TodayLine } from '../components/Gantt/LightningLine';
import { useTaskStore } from '../store/taskStore';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function renderTodayLine() {
  return render(
    <svg>
      <TodayLine min={new Date('2026-07-01T00:00:00Z')} zoomLevel="week" height={100} />
    </svg>
  );
}

describe('TodayLine 既定（locale="ja"）', () => {
  it('ラベルが「今日」と表示される', () => {
    const { container } = renderTodayLine();
    expect(container.textContent).toContain('今日');
  });

  it('時刻表示に ja-JP ロケールを使う', () => {
    const spy = vi.spyOn(Date.prototype, 'toLocaleTimeString');
    renderTodayLine();
    expect(spy).toHaveBeenCalledWith('ja-JP', expect.anything());
  });
});

describe('TodayLine i18n（locale="en"）', () => {
  beforeEach(() => { useTaskStore.setState({ locale: 'en' }); });
  afterEach(() => { useTaskStore.setState({ locale: 'ja' }); });

  it('ラベルが「Today」と表示される（「今日」は表示されない）', () => {
    const { container } = renderTodayLine();
    expect(container.textContent).toContain('Today');
    expect(container.textContent).not.toContain('今日');
  });

  it('時刻表示に en-US ロケールを使う', () => {
    const spy = vi.spyOn(Date.prototype, 'toLocaleTimeString');
    renderTodayLine();
    expect(spy).toHaveBeenCalledWith('en-US', expect.anything());
  });
});
