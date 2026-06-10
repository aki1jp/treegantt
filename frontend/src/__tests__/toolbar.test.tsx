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
      onRestore={NOOP}
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

  it('行2（展開時）に担当者セレクトが直接表示される', () => {
    renderToolbar();
    const row2 = screen.getByTestId('toolbar-row2');
    const select = row2.querySelector('select');
    expect(select).toBeTruthy();
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

  it('ステータスフィルタに「保留」選択肢が存在する', () => {
    renderToolbar();
    const row2 = screen.getByTestId('toolbar-row2');
    const selects = row2.querySelectorAll('select');
    const statusSelect = Array.from(selects).find(s =>
      Array.from(s.options).some(o => o.text === 'TODO')
    )!;
    const optionValues = Array.from(statusSelect.options).map(o => o.value);
    expect(optionValues).toContain('pending');
  });

  it('「DONE/保留以外」フィルタ選択肢が存在する', () => {
    renderToolbar();
    const row2 = screen.getByTestId('toolbar-row2');
    const selects = row2.querySelectorAll('select');
    const statusSelect = Array.from(selects).find(s =>
      Array.from(s.options).some(o => o.text === 'TODO')
    )!;
    const labels = Array.from(statusSelect.options).map(o => o.text);
    expect(labels).toContain('DONE/保留以外');
  });
});

describe('Toolbar ズーム・期間・開始日', () => {
  it('ズーム選択を「日」に変更するとストアの zoomLevel が "day" になる', () => {
    renderToolbar();
    const zoomSelect = screen.getByTitle('ズームレベルを選択') as HTMLSelectElement;
    fireEvent.change(zoomSelect, { target: { value: 'day' } });
    expect(useTaskStore.getState().zoomLevel).toBe('day');
  });

  it('ズーム選択を「月」に変更するとストアの zoomLevel が "month" になる', () => {
    renderToolbar();
    const zoomSelect = screen.getByTitle('ズームレベルを選択') as HTMLSelectElement;
    fireEvent.change(zoomSelect, { target: { value: 'month' } });
    expect(useTaskStore.getState().zoomLevel).toBe('month');
  });

  it('期間選択を「1ヶ月」に変更するとストアの ganttPeriod が "1m" になる', () => {
    renderToolbar();
    const row2 = screen.getByTestId('toolbar-row2');
    const periodSelect = Array.from(row2.querySelectorAll('select')).find(s =>
      Array.from(s.options).some(o => o.value === '1m')
    ) as HTMLSelectElement;
    expect(periodSelect).toBeTruthy();
    fireEvent.change(periodSelect, { target: { value: '1m' } });
    expect(useTaskStore.getState().ganttPeriod).toBe('1m');
  });

  it('「今日」ボタンを押すと ganttStartDate が今日の日付になる', () => {
    renderToolbar();
    fireEvent.click(screen.getByTitle('今日から表示'));
    const { ganttStartDate } = useTaskStore.getState();
    expect(ganttStartDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('開始日入力に日付を設定するとストアの ganttStartDate が更新される', () => {
    renderToolbar();
    const dateInput = screen.getByTestId('toolbar-row2').querySelector('input[type="date"]') as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: '2026-07-01' } });
    expect(useTaskStore.getState().ganttStartDate).toBe('2026-07-01');
  });

  it('開始日が設定済みのとき ✕ ボタンを押すと ganttStartDate が空になる', () => {
    useTaskStore.setState({ ganttStartDate: '2026-07-01' });
    renderToolbar();
    fireEvent.click(screen.getByTitle('開始日をリセット（自動）'));
    expect(useTaskStore.getState().ganttStartDate).toBe('');
  });
});

describe('Toolbar 表示トグル', () => {
  it('「⚡ イナズマ」ボタンをクリックすると showLightningLine が切り替わる', () => {
    renderToolbar();
    const before = useTaskStore.getState().showLightningLine;
    fireEvent.click(screen.getByTitle('イナズマライン（実績/計画の境界）を表示'));
    expect(useTaskStore.getState().showLightningLine).toBe(!before);
  });

  it('「土日」ボタンをクリックすると showWeekend が切り替わる', () => {
    renderToolbar();
    const before = useTaskStore.getState().showWeekend;
    fireEvent.click(screen.getByTitle('土日（週末）の背景を強調表示'));
    expect(useTaskStore.getState().showWeekend).toBe(!before);
  });

  it('「クリティカルパス」ボタンをクリックすると showCriticalPath が切り替わる', () => {
    renderToolbar();
    const before = useTaskStore.getState().showCriticalPath;
    fireEvent.click(screen.getByTitle('クリティカルパスをハイライト表示'));
    expect(useTaskStore.getState().showCriticalPath).toBe(!before);
  });

  it('「リソースビュー」ボタンをクリックすると showResourceView が切り替わる', () => {
    renderToolbar();
    const before = useTaskStore.getState().showResourceView;
    fireEvent.click(screen.getByTitle('担当者別スイムレーンを表示'));
    expect(useTaskStore.getState().showResourceView).toBe(!before);
  });

  it('「年」ヘッダートグルをクリックすると ganttHeaderLevels.year が切り替わる', () => {
    renderToolbar();
    const before = useTaskStore.getState().ganttHeaderLevels.year;
    fireEvent.click(screen.getByTitle('年ヘッダーを表示'));
    expect(useTaskStore.getState().ganttHeaderLevels.year).toBe(!before);
  });

  it('「月」ヘッダートグルをクリックすると ganttHeaderLevels.month が切り替わる', () => {
    renderToolbar();
    const before = useTaskStore.getState().ganttHeaderLevels.month;
    fireEvent.click(screen.getByTitle('月ヘッダーを表示'));
    expect(useTaskStore.getState().ganttHeaderLevels.month).toBe(!before);
  });

  it('「週」ヘッダートグルをクリックすると ganttHeaderLevels.week が切り替わる', () => {
    renderToolbar();
    const before = useTaskStore.getState().ganttHeaderLevels.week;
    fireEvent.click(screen.getByTitle('週ヘッダーを表示'));
    expect(useTaskStore.getState().ganttHeaderLevels.week).toBe(!before);
  });

  it('「日」ヘッダートグルをクリックすると ganttHeaderLevels.day が切り替わる', () => {
    renderToolbar();
    const before = useTaskStore.getState().ganttHeaderLevels.day;
    fireEvent.click(screen.getByTitle('日ヘッダーを表示'));
    expect(useTaskStore.getState().ganttHeaderLevels.day).toBe(!before);
  });

  it('「今日バー」ボタンをクリックすると showTodayLine が切り替わる', () => {
    renderToolbar();
    const before = useTaskStore.getState().showTodayLine;
    fireEvent.click(screen.getByTitle('今日の日付ラインを表示'));
    expect(useTaskStore.getState().showTodayLine).toBe(!before);
  });

  it('「マイル強調」ボタンをクリックすると showMilestoneLines が切り替わる', () => {
    renderToolbar();
    const before = useTaskStore.getState().showMilestoneLines;
    fireEvent.click(screen.getByTitle('マイルストーンの列ハイライト・ヘッダー行を表示'));
    expect(useTaskStore.getState().showMilestoneLines).toBe(!before);
  });

  it('カラーピッカーを変更すると milestoneHighlightColor が更新される', () => {
    renderToolbar();
    const picker = document.querySelector('input[type="color"]') as HTMLInputElement;
    expect(picker).toBeTruthy();
    fireEvent.change(picker, { target: { value: '#ff0000' } });
    expect(useTaskStore.getState().milestoneHighlightColor).toBe('#ff0000');
  });
});
