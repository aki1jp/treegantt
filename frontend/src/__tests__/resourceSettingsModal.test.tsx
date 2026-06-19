// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, screen } from '@testing-library/react';
import { ResourceSettingsModal } from '../components/ResourceSettingsModal/ResourceSettingsModal';

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

  it('プロジェクト: 継承ONのとき null/null を送る', () => {
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
    expect((screen.getByLabelText('アプリ既定を継承') as HTMLInputElement).checked).toBe(true);
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
