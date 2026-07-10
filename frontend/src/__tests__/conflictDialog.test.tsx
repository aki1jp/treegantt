// @vitest-environment jsdom
/**
 * ConflictDialog — テーマ CSS 変数でスタイルが設定されているかの検証
 * ハードコード色を残すとダークテーマで文字色と背景色が同化するため、
 * 各ブロック・ラベルが CSS 変数を参照していることを確認する。
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { ConflictDialog } from '../components/ConflictDialog/ConflictDialog';
import { useTaskStore } from '../store/taskStore';

afterEach(() => { cleanup(); });

const NOOP = vi.fn();

function renderDialog(overrides: Partial<Parameters<typeof ConflictDialog>[0]> = {}) {
  return render(
    <ConflictDialog
      field="title"
      theirVal="リモートの変更"
      myVal="自分の変更"
      onResolve={NOOP}
      {...overrides}
    />,
  );
}

// ── CSS 変数の使用検証 ─────────────────────────────────────────────────────────

// jsdom では CSS 変数付きショートハンド（background: var(...)）が style プロパティに
// 反映されないため、getAttribute('style') で生の style 文字列を検査する
function styleOf(el: HTMLElement | null): string {
  return el?.getAttribute('style') ?? '';
}

describe('ConflictDialog テーマ変数の使用', () => {
  it('「別のユーザーの変更」ブロックの背景が --th-conflict-their-bg を使用している', () => {
    renderDialog();
    // ラベル div 自身にも style があるため parentElement でブロック div を取得する
    const block = screen.getByText('別のユーザーの変更').parentElement as HTMLElement;
    expect(styleOf(block)).toContain('--th-conflict-their-bg');
  });

  it('「別のユーザーの変更」ラベルの文字色が --th-conflict-their-label を使用している', () => {
    renderDialog();
    const label = screen.getByText('別のユーザーの変更') as HTMLElement;
    expect(label.style.color).toContain('--th-conflict-their-label');
  });

  it('「あなたの変更」ブロックの背景が --th-conflict-mine-bg を使用している', () => {
    renderDialog();
    const block = screen.getByText('あなたの変更').parentElement as HTMLElement;
    expect(styleOf(block)).toContain('--th-conflict-mine-bg');
  });

  it('「あなたの変更」ラベルの文字色が --th-conflict-mine-label を使用している', () => {
    renderDialog();
    const label = screen.getByText('あなたの変更') as HTMLElement;
    expect(label.style.color).toContain('--th-conflict-mine-label');
  });

  it('ボーダーが --th-conflict-their-border を使用している', () => {
    renderDialog();
    const block = screen.getByText('別のユーザーの変更').parentElement as HTMLElement;
    expect(styleOf(block)).toContain('--th-conflict-their-border');
  });

  it('ボーダーが --th-conflict-mine-border を使用している', () => {
    renderDialog();
    const block = screen.getByText('あなたの変更').parentElement as HTMLElement;
    expect(styleOf(block)).toContain('--th-conflict-mine-border');
  });
});

// ── テーマ変数がハードコード色を含まない ──────────────────────────────────────

describe('ConflictDialog ハードコード色の排除', () => {
  it('ブロック背景にライト専用色 #fef3c7 が含まれない', () => {
    renderDialog();
    const block = screen.getByText('別のユーザーの変更').closest('div[style]') as HTMLElement;
    expect(block?.style.background).not.toContain('#fef3c7');
  });

  it('ブロック背景にライト専用色 #eff6ff が含まれない', () => {
    renderDialog();
    const block = screen.getByText('あなたの変更').closest('div[style]') as HTMLElement;
    expect(block?.style.background).not.toContain('#eff6ff');
  });

  it('ラベル文字色にライト専用色 #92400e が含まれない', () => {
    renderDialog();
    const label = screen.getByText('別のユーザーの変更') as HTMLElement;
    expect(label.style.color).not.toContain('#92400e');
  });

  it('ラベル文字色にライト専用色 #1e40af が含まれない', () => {
    renderDialog();
    const label = screen.getByText('あなたの変更') as HTMLElement;
    expect(label.style.color).not.toContain('#1e40af');
  });
});

// ── 既存動作の保持 ─────────────────────────────────────────────────────────────

describe('ConflictDialog 既存動作', () => {
  it('theirVal と myVal が表示される', () => {
    renderDialog();
    expect(screen.getByText('リモートの変更')).toBeTruthy();
    expect(screen.getByText('自分の変更')).toBeTruthy();
  });

  it('「別のユーザーの変更を使う」で onResolve(true) が呼ばれる', () => {
    const onResolve = vi.fn();
    renderDialog({ onResolve });
    fireEvent.click(screen.getByText('別のユーザーの変更を使う'));
    expect(onResolve).toHaveBeenCalledWith(true);
  });

  it('「自分の変更を適用する」で onResolve(false) が呼ばれる', () => {
    const onResolve = vi.fn();
    renderDialog({ onResolve });
    fireEvent.click(screen.getByText('自分の変更を適用する'));
    expect(onResolve).toHaveBeenCalledWith(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 多言語対応（i18n）: locale: 'en' でのスモークテスト（既存の ja テストは変更しない）
describe('ConflictDialog の多言語対応（locale: en）', () => {
  afterEach(() => {
    useTaskStore.setState({ locale: 'ja' });
  });

  it('見出し・ラベル・ボタンが英語表示になる', () => {
    useTaskStore.setState({ locale: 'en' });
    renderDialog({ field: 'status' });

    expect(screen.getByText(/Another user made changes/)).toBeTruthy();
    expect(screen.getByText('Status')).toBeTruthy();
    expect(screen.getByText('Their Change')).toBeTruthy();
    expect(screen.getByText('Your Change')).toBeTruthy();
    expect(screen.getByText('Use Their Change')).toBeTruthy();
    expect(screen.getByText('Apply My Change')).toBeTruthy();
  });

  it('フィールド名変換テーブルが英語化される（title/priority/parentId）', () => {
    useTaskStore.setState({ locale: 'en' });
    const { rerender } = renderDialog({ field: 'title' });
    expect(screen.getByText('Title')).toBeTruthy();

    cleanup();
    renderDialog({ field: 'priority' });
    expect(screen.getByText('Priority')).toBeTruthy();

    cleanup();
    renderDialog({ field: 'parentId' });
    expect(screen.getByText('Parent Task')).toBeTruthy();
    void rerender;
  });

  it('値が空のときの表示が英語になる', () => {
    useTaskStore.setState({ locale: 'en' });
    renderDialog({ theirVal: '', myVal: '' });
    expect(screen.getAllByText('(empty)').length).toBe(2);
  });

  it('「Use Their Change」で onResolve(true) が呼ばれる', () => {
    useTaskStore.setState({ locale: 'en' });
    const onResolve = vi.fn();
    renderDialog({ onResolve });
    fireEvent.click(screen.getByText('Use Their Change'));
    expect(onResolve).toHaveBeenCalledWith(true);
  });
});
