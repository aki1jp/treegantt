// @vitest-environment jsdom
/**
 * Toolbar — 2段レイアウト・折りたたみテスト
 */
import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { render, cleanup, fireEvent, screen } from '@testing-library/react';
import { Toolbar } from '../components/Toolbar/Toolbar';
import { useTaskStore } from '../store/taskStore';
import { FRONTEND_VERSION } from '../version';

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
    filterStatus: '', filterAssignee: '', filterPriority: '', filterColor: '', filterSearch: '',
    zoomLevel: 'week', ganttStartDate: '', ganttPeriod: '3m',
    showLightningLine: true, showWeekend: true, showCriticalPath: false, showResourceView: true,
    uiFontSize: 13, uiRowHeight: 36,
    ganttHeaderLevels: { year: true, month: true, week: true, day: true },
    theme: 'auto',
    ganttBarOpen: true,
    locale: 'ja',
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

// ─── クロスプロジェクト参照（§5.8）─────────────────────────────────────────
describe('Toolbar — 🔗 参照ボタン', () => {
  it('onOpenRefManager を渡すと「🔗 参照」ボタンが表示され、クリックで呼ばれる', () => {
    const onOpenRefManager = vi.fn();
    render(
      <Toolbar
        onAddTask={NOOP} onAddMilestone={NOOP} onImport={NOOP} onRestore={NOOP}
        onExportJson={NOOP} onExportCsv={NOOP} onOpenRefManager={onOpenRefManager}
      />
    );
    const btn = screen.getByRole('button', { name: /🔗 参照/ });
    fireEvent.click(btn);
    expect(onOpenRefManager).toHaveBeenCalled();
  });

  it('onOpenRefManager 未指定のときは「🔗 参照」ボタンを表示しない', () => {
    renderToolbar();
    expect(screen.queryByRole('button', { name: /🔗 参照/ })).toBeNull();
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

  it('行2（展開時）に担当者コンボボックス（input[list]）が直接表示される', () => {
    renderToolbar();
    const row2 = screen.getByTestId('toolbar-row2');
    const combobox = row2.querySelector('input[list="assignee-datalist"]');
    expect(combobox).toBeTruthy();
  });

  it('担当者コンボボックスに自由テキストを入力するとストアが更新される', () => {
    renderToolbar();
    const row2 = screen.getByTestId('toolbar-row2');
    const combobox = row2.querySelector('input[list="assignee-datalist"]') as HTMLInputElement;
    fireEvent.change(combobox, { target: { value: 'Alice' } });
    expect(useTaskStore.getState().filterAssignee).toBe('Alice');
  });

  it('担当者コンボボックスにdatalistが存在する', () => {
    renderToolbar();
    const datalist = document.getElementById('assignee-datalist');
    expect(datalist).toBeTruthy();
  });

  it('担当者コンボボックスのプレースホルダーは「すべて」', () => {
    renderToolbar();
    const row2 = screen.getByTestId('toolbar-row2');
    const combobox = row2.querySelector('input[list="assignee-datalist"]') as HTMLInputElement;
    expect(combobox.placeholder).toBe('すべて');
  });

  it('担当者が空のとき✕クリアボタンが表示されない', () => {
    renderToolbar();
    expect(screen.queryByTitle('担当者フィルターをクリア')).toBeNull();
  });

  it('担当者入力があるとき✕クリアボタンが表示される', () => {
    useTaskStore.setState({ filterAssignee: 'Alice' });
    renderToolbar();
    expect(screen.getByTitle('担当者フィルターをクリア')).toBeTruthy();
  });

  it('担当者✕クリアボタンをクリックするとfilterAssigneeが空になる', () => {
    useTaskStore.setState({ filterAssignee: 'Alice' });
    renderToolbar();
    fireEvent.click(screen.getByTitle('担当者フィルターをクリア'));
    expect(useTaskStore.getState().filterAssignee).toBe('');
  });

  it('担当者✕ボタンはdata-testid="assignee-combobox"ラッパー内にある（インライン配置）', () => {
    useTaskStore.setState({ filterAssignee: 'Alice' });
    renderToolbar();
    const wrapper = screen.getByTestId('assignee-combobox');
    const combobox = wrapper.querySelector('input[list="assignee-datalist"]');
    const clearBtn = wrapper.querySelector('[title="担当者フィルターをクリア"]');
    expect(combobox).toBeTruthy();
    expect(clearBtn).toBeTruthy();
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

describe('Toolbar 色フィルタ', () => {
  it('行2に色選択が直接表示される（aria-label="色で絞り込み"）', () => {
    renderToolbar();
    const row2 = screen.getByTestId('toolbar-row2');
    const colorSelect = row2.querySelector('select[aria-label="色で絞り込み"]');
    expect(colorSelect).toBeTruthy();
  });

  it('色選択のデフォルト値は空文字（すべて）', () => {
    renderToolbar();
    const select = screen.getByLabelText('色で絞り込み') as HTMLSelectElement;
    expect(select.value).toBe('');
  });

  it('色選択に「すべて」の選択肢がある', () => {
    renderToolbar();
    const select = screen.getByLabelText('色で絞り込み') as HTMLSelectElement;
    expect(Array.from(select.options).some(o => o.value === '' && o.text === 'すべて')).toBe(true);
  });

  it('色選択に「色付き」の選択肢がある（value="*"）', () => {
    renderToolbar();
    const select = screen.getByLabelText('色で絞り込み') as HTMLSelectElement;
    expect(Array.from(select.options).some(o => o.value === '*' && o.text === '色付き')).toBe(true);
  });

  it('タスクで使用中の色が選択肢として動的に追加される', () => {
    useTaskStore.setState({
      tasks: [
        {
          id: 't1', projectId: 'p1', parentId: null, title: 'A', summary: '', description: '',
          status: 'todo', priority: 'medium', progress: 0, assignee: '',
          startDate: null, endDate: null, isMilestone: false, predecessors: [],
          seq: 1, order: 1, titleColor: null, titleBgColor: '#ef4444', estimateMinutes: null,
          createdAt: '', updatedAt: '',
        },
      ],
    });
    renderToolbar();
    const select = screen.getByLabelText('色で絞り込み') as HTMLSelectElement;
    expect(Array.from(select.options).some(o => o.value === '#ef4444')).toBe(true);
  });

  it('色を選択していないタスクのみのときは色の選択肢が「すべて」「色付き」のみになる', () => {
    renderToolbar();
    const select = screen.getByLabelText('色で絞り込み') as HTMLSelectElement;
    expect(select.options.length).toBe(2);
  });

  it('色選択を変更するとストアの filterColor が更新される', () => {
    renderToolbar();
    const select = screen.getByLabelText('色で絞り込み') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: '*' } });
    expect(useTaskStore.getState().filterColor).toBe('*');
  });

  it('色フィルタ設定中は✕クリアボタンで filterColor もクリアされる', () => {
    useTaskStore.setState({ filterColor: '*' });
    renderToolbar();
    fireEvent.click(screen.getByTitle('フィルタをクリア'));
    expect(useTaskStore.getState().filterColor).toBe('');
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

  it('期間選択を「12ヶ月」に変更するとストアの ganttPeriod が "12m" になる', () => {
    renderToolbar();
    const row2 = screen.getByTestId('toolbar-row2');
    const periodSelect = Array.from(row2.querySelectorAll('select')).find(s =>
      Array.from(s.options).some(o => o.value === '12m')
    ) as HTMLSelectElement;
    expect(periodSelect).toBeTruthy();
    fireEvent.change(periodSelect, { target: { value: '12m' } });
    expect(useTaskStore.getState().ganttPeriod).toBe('12m');
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

  it('「マイル強調」トグルボタンは存在しない（常時表示のため）', () => {
    renderToolbar();
    expect(screen.queryByTitle('マイルストーンの列ハイライト・ヘッダー行を表示')).toBeNull();
  });

  it('カラーピッカーを変更すると milestoneHighlightColor が更新される', () => {
    renderToolbar();
    const picker = document.querySelector('input[type="color"]') as HTMLInputElement;
    expect(picker).toBeTruthy();
    fireEvent.change(picker, { target: { value: '#ff0000' } });
    expect(useTaskStore.getState().milestoneHighlightColor).toBe('#ff0000');
  });
});

describe('Toolbar マイルトグルボタン位置（v2.54）', () => {
  it('マイルボタンと日ボタンが同じ親コンテナに存在する', () => {
    renderToolbar();
    const dayBtn = screen.getByTitle('日ヘッダーを表示');
    const mileBtn = screen.getByTitle('マイルストーンをヘッダーに表示');
    expect(dayBtn.parentElement).toBe(mileBtn.parentElement);
  });

  it('マイルボタンはカラーピッカーより前の位置にある', () => {
    renderToolbar();
    const mileBtn = screen.getByTitle('マイルストーンをヘッダーに表示');
    const colorPicker = document.querySelector('input[type="color"]') as HTMLInputElement;
    expect(colorPicker).toBeTruthy();
    const parent = mileBtn.parentElement!;
    const children = Array.from(parent.children);
    const mileIdx = children.indexOf(mileBtn);
    const colorIdx = children.indexOf(colorPicker);
    expect(mileIdx).toBeGreaterThanOrEqual(0);
    expect(colorIdx).toBeGreaterThan(mileIdx);
  });

  it('マイルボタンは日ボタンの後の位置にある', () => {
    renderToolbar();
    const dayBtn = screen.getByTitle('日ヘッダーを表示');
    const mileBtn = screen.getByTitle('マイルストーンをヘッダーに表示');
    const parent = dayBtn.parentElement!;
    const children = Array.from(parent.children);
    const dayIdx = children.indexOf(dayBtn);
    const mileIdx = children.indexOf(mileBtn);
    expect(mileIdx).toBeGreaterThan(dayIdx);
  });

  it('マイルボタンをクリックすると showMilestones が切り替わる', () => {
    renderToolbar();
    const before = useTaskStore.getState().showMilestones;
    fireEvent.click(screen.getByTitle('マイルストーンをヘッダーに表示'));
    expect(useTaskStore.getState().showMilestones).toBe(!before);
  });
});

describe('バージョン表示（ハンバーガーメニュー）', () => {
  function renderWith(backendVersion?: string) {
    return render(
      <Toolbar
        onAddTask={NOOP} onAddMilestone={NOOP} onImport={NOOP} onRestore={NOOP}
        onExportJson={NOOP} onExportCsv={NOOP} backendVersion={backendVersion}
      />
    );
  }

  it('メニューを開くと Frontend 版と Backend 版が表示される', () => {
    renderWith('9.9.9');
    fireEvent.click(screen.getByTitle('メニュー'));
    const v = screen.getByTestId('app-version');
    expect(v.textContent).toContain(`v${FRONTEND_VERSION}`);
    expect(v.textContent).toContain('v9.9.9');
  });

  it('backendVersion 未指定時は Backend が「—」表示になる', () => {
    renderWith(undefined);
    fireEvent.click(screen.getByTitle('メニュー'));
    expect(screen.getByTestId('app-version').textContent).toContain('Backend v—');
  });
});

describe('API仕様書リンク（ハンバーガーメニュー）', () => {
  it('メニューを開くと Swagger UI への新規タブリンクが表示される', () => {
    renderToolbar();
    fireEvent.click(screen.getByTitle('メニュー'));
    const link = screen.getByRole('link', { name: /API仕様書/ }) as HTMLAnchorElement;
    expect(link.href).toBe('http://localhost:4000/docs');
    expect(link.target).toBe('_blank');
    expect(link.rel).toContain('noopener');
  });
});

// ─── i18n（locale='en'）─────────────────────────────────────────────
describe('Toolbar i18n（locale="en"）', () => {
  beforeEach(() => {
    useTaskStore.setState({ locale: 'en' });
  });

  it('主要ボタンが英語表示される（+ タスク追加 → Add Task 等）', () => {
    renderToolbar();
    expect(screen.getByRole('button', { name: /Add Task/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: '◇ Milestone' })).toBeTruthy();
  });

  it('検索ボックスの placeholder / aria-label が英語表示される', () => {
    renderToolbar();
    expect(screen.getByPlaceholderText('Search tasks...')).toBeTruthy();
  });

  it('ハンバーガーメニューの項目が英語表示される', () => {
    renderToolbar();
    fireEvent.click(screen.getByTitle('Menu'));
    expect(screen.getByText('Append (keep existing)')).toBeTruthy();
    expect(screen.getByText('Restore (delete existing)')).toBeTruthy();
    expect(screen.getByText('Export JSON')).toBeTruthy();
    expect(screen.getByText('Export CSV')).toBeTruthy();
    expect(screen.getByRole('link', { name: /API Docs/ })).toBeTruthy();
  });

  it('フィルタの aria-label が英語表示される', () => {
    renderToolbar();
    expect(screen.getByLabelText('Filter by status')).toBeTruthy();
    expect(screen.getByLabelText('Filter by priority')).toBeTruthy();
    expect(screen.getByLabelText('Filter by assignee')).toBeTruthy();
    expect(screen.getByLabelText('Filter by color')).toBeTruthy();
  });

  it('ステータス選択肢が英語表示される（DONE/保留以外 → Not DONE/Pending）', () => {
    renderToolbar();
    const row2 = screen.getByTestId('toolbar-row2');
    const selects = row2.querySelectorAll('select');
    const statusSelect = Array.from(selects).find(s =>
      Array.from(s.options).some(o => o.text === 'TODO')
    )!;
    const labels = Array.from(statusSelect.options).map(o => o.text);
    expect(labels).toContain('Not DONE/Pending');
    expect(labels).toContain('All');
  });
});
