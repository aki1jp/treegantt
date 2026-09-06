// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, screen } from '@testing-library/react';
import { ResourceSettingsModal } from '../components/ResourceSettingsModal/ResourceSettingsModal';
import { useTaskStore } from '../store/taskStore';

afterEach(() => { cleanup(); });
const NOOP = vi.fn();

describe('ResourceSettingsModal', () => {
  it('アプリ既定: 初期 HH:MM 表示、変更を分へパースして保存', () => {
    const onSave = vi.fn();
    render(
      <ResourceSettingsModal
        title="リソース設定"
        initialCapacityMinutes={480}
        initialWorkingDays={[1, 2, 3, 4, 5]}
        fallbackCapacityMinutes={480}
        fallbackWorkingDays={[1, 2, 3, 4, 5]}
        onSave={onSave}
        onClose={NOOP}
      />
    );
    expect(screen.getByDisplayValue('8:00')).toBeTruthy();
    fireEvent.change(screen.getByDisplayValue('8:00'), { target: { value: '7:45' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(onSave).toHaveBeenCalledWith({ capacityMinutesPerDay: 465, workingDays: [1, 2, 3, 4, 5] });
  });

  it('稼働日チェックを変更して保存（土を稼働日に追加）', () => {
    const onSave = vi.fn();
    render(
      <ResourceSettingsModal
        title="リソース設定"
        initialCapacityMinutes={480}
        initialWorkingDays={[1, 2, 3, 4, 5]}
        fallbackCapacityMinutes={480}
        fallbackWorkingDays={[1, 2, 3, 4, 5]}
        onSave={onSave}
        onClose={NOOP}
      />
    );
    fireEvent.click(screen.getByLabelText('土'));
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(onSave).toHaveBeenCalledWith({ capacityMinutesPerDay: 480, workingDays: [1, 2, 3, 4, 5, 6] });
  });

  it('プロジェクト: 明示値から継承ONに切り替えて保存すると null/null を送る', () => {
    const onSave = vi.fn();
    render(
      <ResourceSettingsModal
        title="プロジェクト設定"
        inheritable
        initialCapacityMinutes={400}
        initialWorkingDays={[1, 2, 3]}
        fallbackCapacityMinutes={480}
        fallbackWorkingDays={[1, 2, 3, 4, 5]}
        onSave={onSave}
        onClose={NOOP}
      />
    );
    expect((screen.getByLabelText('アプリ既定を継承') as HTMLInputElement).checked).toBe(false);
    fireEvent.click(screen.getByLabelText('アプリ既定を継承')); // ON へ切り替え（実質変更あり）
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(onSave).toHaveBeenCalledWith({ capacityMinutesPerDay: null, workingDays: null });
  });

  it('プロジェクト: 継承OFFで個別値を送る', () => {
    const onSave = vi.fn();
    render(
      <ResourceSettingsModal
        title="プロジェクト設定"
        inheritable
        initialCapacityMinutes={null}
        initialWorkingDays={null}
        fallbackCapacityMinutes={480}
        fallbackWorkingDays={[1, 2, 3, 4, 5]}
        onSave={onSave}
        onClose={NOOP}
      />
    );
    fireEvent.click(screen.getByLabelText('アプリ既定を継承')); // OFF
    fireEvent.change(screen.getByDisplayValue('8:00'), { target: { value: '6:00' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ capacityMinutesPerDay: 360 }));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// no-op ガード（Stage 5-a）: 実質変更がなければ onSave を呼ばず onClose のみ呼ぶ
describe('ResourceSettingsModal — no-op ガード', () => {
  it('アプリ既定: 何も変えずに保存すると onSave は呼ばれず onClose のみ呼ばれる', () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    render(
      <ResourceSettingsModal
        title="リソース設定"
        initialCapacityMinutes={480}
        initialWorkingDays={[1, 2, 3, 4, 5]}
        fallbackCapacityMinutes={480}
        fallbackWorkingDays={[1, 2, 3, 4, 5]}
        onSave={onSave}
        onClose={onClose}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('プロジェクト（継承ONのまま）: 何も変えずに保存すると onSave は呼ばれず onClose のみ呼ばれる', () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    render(
      <ResourceSettingsModal
        title="プロジェクト設定"
        inheritable
        initialCapacityMinutes={null}
        initialWorkingDays={null}
        fallbackCapacityMinutes={480}
        fallbackWorkingDays={[1, 2, 3, 4, 5]}
        onSave={onSave}
        onClose={onClose}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('プロジェクト（個別値のまま）: 何も変えずに保存すると onSave は呼ばれず onClose のみ呼ばれる', () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    render(
      <ResourceSettingsModal
        title="プロジェクト設定"
        inheritable
        initialCapacityMinutes={360}
        initialWorkingDays={[1, 2, 3, 4, 5, 6]}
        fallbackCapacityMinutes={480}
        fallbackWorkingDays={[1, 2, 3, 4, 5]}
        onSave={onSave}
        onClose={onClose}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('キャパだけ変えると onSave が呼ばれる', () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    render(
      <ResourceSettingsModal
        title="リソース設定"
        initialCapacityMinutes={480}
        initialWorkingDays={[1, 2, 3, 4, 5]}
        fallbackCapacityMinutes={480}
        fallbackWorkingDays={[1, 2, 3, 4, 5]}
        onSave={onSave}
        onClose={onClose}
      />
    );
    fireEvent.change(screen.getByDisplayValue('8:00'), { target: { value: '7:45' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(onSave).toHaveBeenCalledWith({ capacityMinutesPerDay: 465, workingDays: [1, 2, 3, 4, 5] });
  });

  it('稼働日チェックを1つ変えると onSave が呼ばれる', () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    render(
      <ResourceSettingsModal
        title="リソース設定"
        initialCapacityMinutes={480}
        initialWorkingDays={[1, 2, 3, 4, 5]}
        fallbackCapacityMinutes={480}
        fallbackWorkingDays={[1, 2, 3, 4, 5]}
        onSave={onSave}
        onClose={onClose}
      />
    );
    fireEvent.click(screen.getByLabelText('土'));
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(onSave).toHaveBeenCalledWith({ capacityMinutesPerDay: 480, workingDays: [1, 2, 3, 4, 5, 6] });
  });

  it('継承ONのまま保存すると onSave は呼ばれない（重複だが仕様として明記）', () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    render(
      <ResourceSettingsModal
        title="プロジェクト設定"
        inheritable
        initialCapacityMinutes={null}
        initialWorkingDays={null}
        fallbackCapacityMinutes={480}
        fallbackWorkingDays={[1, 2, 3, 4, 5]}
        onSave={onSave}
        onClose={onClose}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('継承 → 明示（値は fallback と同じ）に切り替えて保存すると、変更ありとして onSave が呼ばれる', () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    render(
      <ResourceSettingsModal
        title="プロジェクト設定"
        inheritable
        initialCapacityMinutes={null}
        initialWorkingDays={null}
        fallbackCapacityMinutes={480}
        fallbackWorkingDays={[1, 2, 3, 4, 5]}
        onSave={onSave}
        onClose={onClose}
      />
    );
    fireEvent.click(screen.getByLabelText('アプリ既定を継承')); // OFF（値は fallback のまま）
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(onSave).toHaveBeenCalledWith({ capacityMinutesPerDay: 480, workingDays: [1, 2, 3, 4, 5] });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 多言語対応（i18n）: locale: 'en' でのスモークテスト（既存の ja テストは変更しない）
describe('ResourceSettingsModal の多言語対応（locale: en）', () => {
  afterEach(() => {
    useTaskStore.setState({ locale: 'ja' });
  });

  it('継承チェックボックス・ラベル・placeholder・ボタンが英語表示になる（曜日は既存対応済のため対象外）', () => {
    useTaskStore.setState({ locale: 'en' });
    render(
      <ResourceSettingsModal
        title="Project Settings"
        inheritable
        initialCapacityMinutes={null}
        initialWorkingDays={null}
        fallbackCapacityMinutes={480}
        fallbackWorkingDays={[1, 2, 3, 4, 5]}
        onSave={vi.fn()}
        onClose={NOOP}
      />
    );
    expect(screen.getByLabelText('Inherit App Defaults')).toBeTruthy();
    expect(screen.getByText('Daily Capacity (h:mm)')).toBeTruthy();
    expect(screen.getByPlaceholderText('e.g., 8:00, 7:45')).toBeTruthy();
    expect(screen.getByText('Working Days')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
  });
});
