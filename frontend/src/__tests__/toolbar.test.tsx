// @vitest-environment jsdom
/**
 * Toolbar — 2段レイアウト・折りたたみテスト
 */
import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { render, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { Toolbar } from '../components/Toolbar/Toolbar';
import { useTaskStore } from '../store/taskStore';
import { FRONTEND_VERSION } from '../version';
import type { Task } from '../types/task';

afterEach(() => { cleanup(); });

const NOOP = vi.fn();

function renderToolbar(currentProjectId?: string) {
  return render(
    <Toolbar
      onAddTask={NOOP}
      onAddMilestone={NOOP}
      onImport={NOOP}
      onRestore={NOOP}
      onExportJson={NOOP}
      onExportCsv={NOOP}
      currentProjectId={currentProjectId}
    />
  );
}

beforeEach(() => {
  localStorage.clear();
  useTaskStore.setState({
    tasks: [], needsReload: false,
    filterStatus: '', filterAssignee: '', filterPriority: '', filterColor: '', filterOverdue: '', filterSearch: '',
    zoomLevel: 'week', ganttStartDate: '', ganttPeriod: '3m',
    showLightningLine: true, showWeekend: true, showCriticalPath: false, showResourceView: true,
    uiFontSize: 13, uiRowHeight: 36,
    ganttHeaderLevels: { year: true, month: true, week: true, day: true },
    theme: 'auto',
    ganttBarOpen: true,
    locale: 'ja',
    pinnedAssignees: {},
  });
});

/** 担当者フィルタのピン留めテスト用: 担当者付きタスクを1件作る */
function makeAssigneeTask(id: string, assignee: string): Task {
  return {
    id, projectId: 'p1', parentId: null, title: id, summary: '', description: '',
    status: 'todo', priority: 'medium', progress: 0, assignee,
    startDate: null, endDate: null, isMilestone: false, predecessors: [],
    seq: 1, order: 1, titleColor: null, titleBgColor: null, estimateMinutes: null,
    createdAt: '', updatedAt: '',
  };
}

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

  it('行2（展開時）に担当者コンボボックス（role="combobox"）が直接表示される', () => {
    renderToolbar();
    const row2 = screen.getByTestId('toolbar-row2');
    const combobox = row2.querySelector('input[role="combobox"]');
    expect(combobox).toBeTruthy();
  });

  it('担当者コンボボックスに自由テキストを入力するとストアが更新される', () => {
    renderToolbar();
    const row2 = screen.getByTestId('toolbar-row2');
    const combobox = row2.querySelector('input[role="combobox"]') as HTMLInputElement;
    fireEvent.change(combobox, { target: { value: 'Alice' } });
    expect(useTaskStore.getState().filterAssignee).toBe('Alice');
  });

  it('担当者コンボボックスはネイティブdatalistを使わない（自前listbox、§9.3）', () => {
    renderToolbar();
    expect(document.getElementById('assignee-datalist')).toBeNull();
    expect(document.querySelector('datalist')).toBeNull();
  });

  it('担当者コンボボックスのプレースホルダーは「すべて」', () => {
    renderToolbar();
    const row2 = screen.getByTestId('toolbar-row2');
    const combobox = row2.querySelector('input[role="combobox"]') as HTMLInputElement;
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
    const combobox = wrapper.querySelector('input[role="combobox"]');
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

describe('Toolbar 期限フィルタ', () => {
  it('行2に期限選択が直接表示される（aria-label="期限で絞り込み"）', () => {
    renderToolbar();
    const row2 = screen.getByTestId('toolbar-row2');
    const dueSelect = row2.querySelector('select[aria-label="期限で絞り込み"]');
    expect(dueSelect).toBeTruthy();
  });

  it('期限選択のデフォルト値は空文字（すべて）', () => {
    renderToolbar();
    const select = screen.getByLabelText('期限で絞り込み') as HTMLSelectElement;
    expect(select.value).toBe('');
  });

  it('期限選択の選択肢は「すべて」「遅延中」の2件', () => {
    renderToolbar();
    const select = screen.getByLabelText('期限で絞り込み') as HTMLSelectElement;
    expect(select.options.length).toBe(2);
    expect(Array.from(select.options).some(o => o.value === '' && o.text === 'すべて')).toBe(true);
    expect(Array.from(select.options).some(o => o.value === 'overdue' && o.text === '遅延中')).toBe(true);
  });

  it('期限選択を変更するとストアの filterOverdue が更新される', () => {
    renderToolbar();
    const select = screen.getByLabelText('期限で絞り込み') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'overdue' } });
    expect(useTaskStore.getState().filterOverdue).toBe('overdue');
  });

  it('期限フィルタ設定中は✕クリアボタンで filterOverdue もクリアされる', () => {
    useTaskStore.setState({ filterOverdue: 'overdue' });
    renderToolbar();
    fireEvent.click(screen.getByTitle('フィルタをクリア'));
    expect(useTaskStore.getState().filterOverdue).toBe('');
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

// ─── 担当者フィルタ候補のピン留め（§9.3 pinnedAssignees）───────────────────
describe('Toolbar 担当者フィルタ ピン留め', () => {
  function setupTasks() {
    useTaskStore.setState({
      tasks: [
        makeAssigneeTask('t1', 'Alice'),
        makeAssigneeTask('t2', 'Bob'),
        makeAssigneeTask('t3', 'Zoe'),
      ],
    });
  }

  function openListbox() {
    const input = screen.getByLabelText('担当者で絞り込み');
    fireEvent.focus(input);
    return input as HTMLInputElement;
  }

  it('入力欄をクリック/フォーカスすると assignee-listbox が現れる', () => {
    setupTasks();
    renderToolbar('p1');
    expect(screen.queryByTestId('assignee-listbox')).toBeNull();
    openListbox();
    expect(screen.getByTestId('assignee-listbox')).toBeTruthy();
  });

  it('ピン留めした担当者が、名前昇順では最後になる場合でもリスト先頭に来る', () => {
    setupTasks();
    useTaskStore.getState().toggleAssigneePin('p1', 'Zoe');
    renderToolbar('p1');
    openListbox();
    const options = screen.queryAllByTestId('assignee-option');
    expect(options.length).toBeGreaterThan(0);
    expect(within(options[0]).getByText('Zoe')).toBeTruthy();
  });

  it('assignee-pin-toggle を押すとストアの pinnedAssignees が更新され、リストは開いたままで filterAssignee も変わらない', () => {
    setupTasks();
    renderToolbar('p1');
    openListbox();
    const options = screen.getAllByTestId('assignee-option');
    const zoeOption = options.find(o => within(o).queryByText('Zoe'))!;
    expect(zoeOption).toBeTruthy();
    fireEvent.click(within(zoeOption).getByTestId('assignee-pin-toggle'));
    expect(useTaskStore.getState().pinnedAssignees.p1).toContain('Zoe');
    expect(useTaskStore.getState().filterAssignee).toBe('');
    expect(screen.getByTestId('assignee-listbox')).toBeTruthy();
  });

  it('別の currentProjectId でレンダーするとピン留めセクションが出ない（プロジェクト独立）', () => {
    setupTasks();
    useTaskStore.getState().toggleAssigneePin('p1', 'Zoe');
    renderToolbar('p2');
    openListbox();
    expect(screen.queryByTestId('assignee-pinned-section')).toBeNull();
  });

  it('入力テキストで候補が絞り込まれる', () => {
    setupTasks();
    renderToolbar('p1');
    const input = openListbox();
    fireEvent.change(input, { target: { value: 'Al' } });
    const options = screen.getAllByTestId('assignee-option');
    expect(options.length).toBe(1);
    expect(within(options[0]).getByText('Alice')).toBeTruthy();
  });

  it('候補の名前ボタンをクリックすると filterAssignee が設定されリストが閉じる', () => {
    setupTasks();
    renderToolbar('p1');
    openListbox();
    const options = screen.getAllByTestId('assignee-option');
    const bobOption = options.find(o => within(o).queryByText('Bob'))!;
    expect(bobOption).toBeTruthy();
    fireEvent.click(within(bobOption).getByTestId('assignee-option-select'));
    expect(useTaskStore.getState().filterAssignee).toBe('Bob');
    expect(screen.queryByTestId('assignee-listbox')).toBeNull();
  });

  it('ピン留めされているが現プロジェクトのタスクに存在しない担当者は表示されない', () => {
    setupTasks();
    useTaskStore.getState().toggleAssigneePin('p1', 'Nobody');
    renderToolbar('p1');
    openListbox();
    const options = screen.getAllByTestId('assignee-option');
    expect(options.some(o => within(o).queryByText('Nobody'))).toBe(false);
  });

  it('currentProjectId 未指定でも落ちず、セクション見出しの無いフラットなリストになる', () => {
    setupTasks();
    renderToolbar();
    openListbox();
    expect(screen.queryByTestId('assignee-pinned-section')).toBeNull();
    expect(screen.queryByTestId('assignee-others-section')).toBeNull();
    expect(screen.getAllByTestId('assignee-option').length).toBe(3);
  });

  it('既存の✕クリアの挙動は引き続き通る', () => {
    useTaskStore.setState({ filterAssignee: 'Alice' });
    renderToolbar('p1');
    fireEvent.click(screen.getByTitle('担当者フィルターをクリア'));
    expect(useTaskStore.getState().filterAssignee).toBe('');
  });

  it('絞り込み結果でその他が0件のときは assignee-others-section を出さない（見出しだけの空セクション防止）', () => {
    // 候補が全員ピン留めされている（＝その他セクションに入る候補が無い）状況を再現する
    setupTasks();
    useTaskStore.getState().toggleAssigneePin('p1', 'Alice');
    useTaskStore.getState().toggleAssigneePin('p1', 'Bob');
    useTaskStore.getState().toggleAssigneePin('p1', 'Zoe');
    renderToolbar('p1');
    openListbox();
    expect(screen.getByTestId('assignee-pinned-section')).toBeTruthy();
    expect(screen.queryByTestId('assignee-others-section')).toBeNull();
    expect(screen.getAllByTestId('assignee-option').length).toBe(3);
  });

  it('担当者名に空白が含まれても候補行の id が空白を含まない有効な値になる（HTML の id 仕様）', () => {
    useTaskStore.setState({
      tasks: [makeAssigneeTask('t1', '山田 太郎'), makeAssigneeTask('t2', 'Bob')],
    });
    renderToolbar('p1');
    openListbox();
    const options = screen.getAllByTestId('assignee-option');
    const taroOption = options.find(o => within(o).queryByText('山田 太郎'))!;
    expect(taroOption).toBeTruthy();
    expect(taroOption.id).toBeTruthy();
    expect(taroOption.id).not.toMatch(/\s/);
  });

  it('↓キーでアクティブにした候補の id を aria-activedescendant が指し続ける（名前に空白があっても）', () => {
    useTaskStore.setState({
      tasks: [makeAssigneeTask('t1', '山田 太郎'), makeAssigneeTask('t2', 'Bob')],
    });
    renderToolbar('p1');
    const input = openListbox();
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    const options = screen.getAllByTestId('assignee-option');
    const activeId = input.getAttribute('aria-activedescendant');
    expect(activeId).toBeTruthy();
    const activeOption = options.find(o => o.id === activeId);
    expect(activeOption).toBeTruthy();
  });

  it('リストが閉じているとき aria-controls は付与されない（存在しない要素への参照防止）', () => {
    setupTasks();
    renderToolbar('p1');
    const input = screen.getByLabelText('担当者で絞り込み');
    expect(input.hasAttribute('aria-controls')).toBe(false);
    openListbox();
    expect(input.getAttribute('aria-controls')).toBe('assignee-listbox');
  });

  it('ピン留めトグルで並び替わった後も activeIndex は同じ候補を指し続ける（ハイライトのずれ防止）', () => {
    setupTasks();
    renderToolbar('p1');
    const input = openListbox();
    // Bob をアクティブにする（Alice, Bob, Zoe の昇順で2番目）
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    let options = screen.getAllByTestId('assignee-option');
    let activeId = input.getAttribute('aria-activedescendant');
    const activeBefore = options.find(o => o.id === activeId)!;
    expect(within(activeBefore).getByText('Bob')).toBeTruthy();

    // Zoe をピン留めして先頭セクションへ移動させても Bob がアクティブなまま
    const zoeOption = options.find(o => within(o).queryByText('Zoe'))!;
    fireEvent.click(within(zoeOption).getByTestId('assignee-pin-toggle'));

    options = screen.getAllByTestId('assignee-option');
    activeId = input.getAttribute('aria-activedescendant');
    const activeAfter = options.find(o => o.id === activeId)!;
    expect(within(activeAfter).getByText('Bob')).toBeTruthy();
  });

  it('ピン留め済みの行のピントグルは★を表示し、未ピンの行は☆を表示する', () => {
    setupTasks();
    useTaskStore.getState().toggleAssigneePin('p1', 'Zoe');
    renderToolbar('p1');
    openListbox();
    const options = screen.getAllByTestId('assignee-option');
    const zoeOption = options.find(o => within(o).queryByText('Zoe'))!;
    const aliceOption = options.find(o => within(o).queryByText('Alice'))!;
    expect(within(zoeOption).getByTestId('assignee-pin-toggle').textContent).toBe('★');
    expect(within(aliceOption).getByTestId('assignee-pin-toggle').textContent).toBe('☆');
  });

  it('ピントグルに絵文字（📌/📍）を使っていない', () => {
    setupTasks();
    useTaskStore.getState().toggleAssigneePin('p1', 'Zoe');
    renderToolbar('p1');
    openListbox();
    const listbox = screen.getByTestId('assignee-listbox');
    expect(listbox.textContent).not.toContain('📌');
    expect(listbox.textContent).not.toContain('📍');
  });

  it('ピン留め済みトグルのstyle.colorが未ピンのものと異なる（色が状態差として機能している回帰確認）', () => {
    setupTasks();
    useTaskStore.getState().toggleAssigneePin('p1', 'Zoe');
    renderToolbar('p1');
    openListbox();
    const options = screen.getAllByTestId('assignee-option');
    const zoeOption = options.find(o => within(o).queryByText('Zoe'))!;
    const aliceOption = options.find(o => within(o).queryByText('Alice'))!;
    const pinnedColor = within(zoeOption).getByTestId('assignee-pin-toggle').style.color;
    const unpinnedColor = within(aliceOption).getByTestId('assignee-pin-toggle').style.color;
    expect(pinnedColor).not.toBe('');
    expect(unpinnedColor).not.toBe('');
    expect(pinnedColor).not.toBe(unpinnedColor);
  });

  it('未ピンの行にもピントグルが常時表示される（hoverなしでもDOMに存在する）', () => {
    setupTasks();
    renderToolbar('p1');
    openListbox();
    const options = screen.getAllByTestId('assignee-option');
    // setupTasks の Alice/Bob/Zoe はいずれも未ピン
    for (const option of options) {
      expect(within(option).getByTestId('assignee-pin-toggle')).toBeTruthy();
    }
  });

  describe('listbox の高さ（ビューポート下端までの利用可能な高さ）', () => {
    let originalGetBoundingClientRect: typeof HTMLElement.prototype.getBoundingClientRect;

    beforeEach(() => {
      originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
    });

    afterEach(() => {
      HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    });

    it('maxHeightが固定の240pxではなく、window.innerHeightから算出された値になる', () => {
      // jsdom はレイアウトを持たないため getBoundingClientRect は常に0を返す。
      // 入力欄（コンボボックスのラッパー）の位置をスタブして与える。
      HTMLElement.prototype.getBoundingClientRect = vi.fn(function (this: HTMLElement) {
        return {
          top: 80, bottom: 100, left: 0, right: 100, width: 100, height: 20,
          x: 0, y: 80, toJSON() { return this; },
        } as DOMRect;
      });

      setupTasks();
      renderToolbar('p1');
      openListbox();
      const listbox = screen.getByTestId('assignee-listbox');
      const maxHeight = parseFloat(listbox.style.maxHeight);

      expect(listbox.style.maxHeight).not.toBe('240px');
      expect(maxHeight).not.toBe(240);
      // window.innerHeight(jsdom既定768) - (bottom(100)+4) - 8 ≒ 656 付近
      const expected = window.innerHeight - (100 + 4) - 8;
      expect(maxHeight).toBeGreaterThan(expected - 20);
      expect(maxHeight).toBeLessThan(expected + 20);
    });
  });
});
