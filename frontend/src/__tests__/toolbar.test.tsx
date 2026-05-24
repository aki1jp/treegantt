// @vitest-environment jsdom
/**
 * Toolbar — 2段レイアウト・折りたたみテスト
 */
import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { render, cleanup, fireEvent, screen } from '@testing-library/react';
import { Toolbar } from '../components/Toolbar/Toolbar';
import { useTaskStore } from '../store/taskStore';

afterEach(() => { cleanup(); });

const NOOP = vi.fn();

function renderToolbar() {
  return render(
    <Toolbar
      onAddTask={NOOP}
      onAddMilestone={NOOP}
      onImport={NOOP}
      onExportJson={NOOP}
      onExportCsv={NOOP}
    />
  );
}

beforeEach(() => {
  localStorage.clear();
  useTaskStore.setState({
    tasks: [], needsReload: false,
    filterStatus: '', filterAssignee: '', filterPriority: '', filterSearch: '',
    zoomLevel: 'week', ganttStartDate: '', ganttPeriod: '3m',
    showLightningLine: true, showWeekend: true, showCriticalPath: false, showResourceView: true,
    uiFontSize: 13, uiRowHeight: 36,
    ganttHeaderLevels: { year: true, month: true, week: true, day: true },
    theme: 'auto',
    ganttBarOpen: true,
  });
});

describe('Toolbar 2段レイアウト', () => {
  it('行1に検索ボックスが存在する', () => {
    renderToolbar();
    expect(screen.getByPlaceholderText('タスク検索...')).toBeTruthy();
  });

  it('行1にタスク追加ボタンが存在する', () => {
    renderToolbar();
    expect(screen.getByRole('button', { name: /タスク追加/ })).toBeTruthy();
  });

  it('初期状態で行2（data-testid="toolbar-row2"）が表示されている', () => {
    renderToolbar();
    expect(screen.getByTestId('toolbar-row2')).toBeTruthy();
  });

  it('∧ボタン（aria-label="ガント設定を閉じる"）をクリックすると行2が非表示になる', () => {
    renderToolbar();
    fireEvent.click(screen.getByRole('button', { name: 'ガント設定を閉じる' }));
    expect(screen.queryByTestId('toolbar-row2')).toBeNull();
  });

  it('折りたたんだ後に∨ボタンをクリックすると行2が再表示される', () => {
    renderToolbar();
    fireEvent.click(screen.getByRole('button', { name: 'ガント設定を閉じる' }));
    fireEvent.click(screen.getByRole('button', { name: 'ガント設定を開く' }));
    expect(screen.getByTestId('toolbar-row2')).toBeTruthy();
  });

  it('行2にズーム選択が存在する', () => {
    renderToolbar();
    expect(screen.getByTitle('ズームレベルを選択')).toBeTruthy();
  });

  it('フィルタドロップダウンボタンが存在しない（インライン表示に変更）', () => {
    renderToolbar();
    expect(screen.queryByText('フィルタ')).toBeNull();
  });
});

describe('Toolbar フィルタインライン表示', () => {
  it('行2（展開時）にステータス選択が直接表示される', () => {
    renderToolbar();
    const row2 = screen.getByTestId('toolbar-row2');
    const selects = row2.querySelectorAll('select');
    const statusSelect = Array.from(selects).find(s =>
      Array.from(s.options).some(o => o.text === 'TODO')
    );
    expect(statusSelect).toBeTruthy();
  });

  it('行2（展開時）に優先度選択が直接表示される', () => {
    renderToolbar();
    const row2 = screen.getByTestId('toolbar-row2');
    const selects = row2.querySelectorAll('select');
    const prioritySelect = Array.from(selects).find(s =>
      Array.from(s.options).some(o => o.text === '最高')
    );
    expect(prioritySelect).toBeTruthy();
  });

  it('行2（展開時）に担当者入力が直接表示される', () => {
    renderToolbar();
    const row2 = screen.getByTestId('toolbar-row2');
    const input = row2.querySelector('input[placeholder="部分一致"]');
    expect(input).toBeTruthy();
  });

  it('行2を折りたたむとフィルタコントロールが非表示になる', () => {
    renderToolbar();
    fireEvent.click(screen.getByRole('button', { name: 'ガント設定を閉じる' }));
    expect(screen.queryByTestId('toolbar-row2')).toBeNull();
    expect(screen.queryByPlaceholderText('部分一致')).toBeNull();
  });

  it('ステータス選択を変更するとストアが更新される', () => {
    renderToolbar();
    const row2 = screen.getByTestId('toolbar-row2');
    const selects = row2.querySelectorAll('select');
    const statusSelect = Array.from(selects).find(s =>
      Array.from(s.options).some(o => o.text === 'TODO')
    )!;
    fireEvent.change(statusSelect, { target: { value: 'wip' } });
    expect(useTaskStore.getState().filterStatus).toBe('wip');
  });
});
