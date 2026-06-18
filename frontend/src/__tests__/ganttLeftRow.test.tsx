// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { GanttLeftRow } from '../components/Gantt/GanttLeftRow';
import type { Task } from '../types/task';

afterEach(() => { cleanup(); });

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 't1', projectId: 'p1', parentId: null,
    title: '元のタイトル', summary: '', description: '',
    status: 'todo', priority: 'medium', progress: 0, assignee: '山田',
    startDate: '2026-05-01', endDate: '2026-05-10',
    isMilestone: false, predecessors: [], seq: 1, order: 1,
    createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    titleColor: null, titleBgColor: null,
    ...overrides,
  };
}

function rowProps(task: Task, onInlineUpdate: (id: string, patch: Partial<Task>) => void) {
  return {
    task,
    depth: 0,
    hasChildren: false,
    isCollapsed: false,
    effectiveProgress: task.progress,
    fontSize: 12,
    rowHeight: 32,
    titleWidth: 200,
    assigneeWidth: 80,
    dateColWidth: 90,
    onToggleCollapse: vi.fn(),
    onInlineUpdate,
    onRowContextMenu: vi.fn(),
  };
}

function renderRow(task: Task, onInlineUpdate = vi.fn()) {
  return render(<GanttLeftRow {...rowProps(task, onInlineUpdate)} />);
}

// ─── 通常編集（コンフリクトなし）──────────────────────────────────────────────

describe('GanttLeftRow インライン編集 — 通常フロー', () => {
  it('タイトルをクリックして blur すると onInlineUpdate が呼ばれる', () => {
    const onInlineUpdate = vi.fn();
    renderRow(makeTask(), onInlineUpdate);
    fireEvent.click(screen.getByText('元のタイトル'));
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '新しいタイトル' } });
    fireEvent.blur(input);
    expect(onInlineUpdate).toHaveBeenCalledWith('t1', { title: '新しいタイトル' });
  });

  it('Enter キーでも onInlineUpdate が呼ばれる', () => {
    const onInlineUpdate = vi.fn();
    renderRow(makeTask(), onInlineUpdate);
    fireEvent.click(screen.getByText('元のタイトル'));
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '変更後' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onInlineUpdate).toHaveBeenCalledWith('t1', { title: '変更後' });
  });

  it('Escape キーでは onInlineUpdate が呼ばれない', () => {
    const onInlineUpdate = vi.fn();
    renderRow(makeTask(), onInlineUpdate);
    fireEvent.click(screen.getByText('元のタイトル'));
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '変更後' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onInlineUpdate).not.toHaveBeenCalled();
  });

  it('空文字で blur しても onInlineUpdate は呼ばれない', () => {
    const onInlineUpdate = vi.fn();
    renderRow(makeTask(), onInlineUpdate);
    fireEvent.click(screen.getByText('元のタイトル'));
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);
    expect(onInlineUpdate).not.toHaveBeenCalled();
  });

  it('ステータス変更時に onChange で即時コミットされる', () => {
    const onInlineUpdate = vi.fn();
    renderRow(makeTask(), onInlineUpdate);
    fireEvent.click(screen.getByText('TODO'));
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'wip' } });
    expect(onInlineUpdate).toHaveBeenCalledWith('t1', { status: 'wip' });
  });
});

// ─── コンフリクト検出 ──────────────────────────────────────────────────────────

describe('GanttLeftRow インライン編集 — コンフリクト検出', () => {
  it('編集開始後にタスクが外部更新されると onInlineUpdate を呼ばずコンフリクトを表示する', () => {
    const onInlineUpdate = vi.fn();
    const taskV1 = makeTask({ title: '元のタイトル' });
    const { rerender } = renderRow(taskV1, onInlineUpdate);

    // 編集開始
    fireEvent.click(screen.getByText('元のタイトル'));
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '自分の変更' } });

    // リモートがタスクを先に更新（WebSocket 経由）
    rerender(<GanttLeftRow {...rowProps(makeTask({ title: 'リモートの変更' }), onInlineUpdate)} />);

    // ユーザーが blur（コミット試行）
    fireEvent.blur(input);

    // コンフリクトのため onInlineUpdate は呼ばれない
    expect(onInlineUpdate).not.toHaveBeenCalled();
    // コンフリクトダイアログが表示される
    expect(screen.getByText('⚠️ 編集中に別のユーザーが変更しました')).toBeTruthy();
    // theirVal: タイトルスパンとダイアログの両方に現れるため getAllByText で確認
    expect(screen.getAllByText('リモートの変更').length).toBeGreaterThanOrEqual(1);
    // myVal: ダイアログにのみ現れる
    expect(screen.getByText('自分の変更')).toBeTruthy();
  });

  it('コンフリクト: 「別のユーザーの変更を使う」を選ぶと onInlineUpdate が呼ばれない', () => {
    const onInlineUpdate = vi.fn();
    const { rerender } = renderRow(makeTask({ title: '元のタイトル' }), onInlineUpdate);
    fireEvent.click(screen.getByText('元のタイトル'));
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '自分の変更' } });
    rerender(<GanttLeftRow {...rowProps(makeTask({ title: 'リモートの変更' }), onInlineUpdate)} />);
    fireEvent.blur(input);

    // コンフリクトを「相手の変更を使う」で解決
    fireEvent.click(screen.getByText('別のユーザーの変更を使う'));
    expect(onInlineUpdate).not.toHaveBeenCalled();
    expect(screen.queryByText('⚠️ 編集中に別のユーザーが変更しました')).toBeNull();
  });

  it('コンフリクト: 「自分の変更を適用する」を選ぶと onInlineUpdate が呼ばれる', () => {
    const onInlineUpdate = vi.fn();
    const { rerender } = renderRow(makeTask({ title: '元のタイトル' }), onInlineUpdate);
    fireEvent.click(screen.getByText('元のタイトル'));
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '自分の変更' } });
    rerender(<GanttLeftRow {...rowProps(makeTask({ title: 'リモートの変更' }), onInlineUpdate)} />);
    fireEvent.blur(input);

    fireEvent.click(screen.getByText('自分の変更を適用する'));
    expect(onInlineUpdate).toHaveBeenCalledWith('t1', { title: '自分の変更' });
    expect(screen.queryByText('⚠️ 編集中に別のユーザーが変更しました')).toBeNull();
  });

  it('外部更新が同じ値の場合はコンフリクトにならず正常コミットされる', () => {
    const onInlineUpdate = vi.fn();
    const { rerender } = renderRow(makeTask({ title: '元のタイトル' }), onInlineUpdate);
    fireEvent.click(screen.getByText('元のタイトル'));
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '変更後' } });

    // リモートも同じ editStartVal（元のタイトル）のまま→コンフリクトなし
    rerender(<GanttLeftRow {...rowProps(makeTask({ title: '元のタイトル' }), onInlineUpdate)} />);
    fireEvent.blur(input);

    expect(onInlineUpdate).toHaveBeenCalledWith('t1', { title: '変更後' });
    expect(screen.queryByText('⚠️ 編集中に別のユーザーが変更しました')).toBeNull();
  });
});

// ─── 日付バリデーション ────────────────────────────────────────────────────────

describe('GanttLeftRow インライン編集 — 日付前後矛盾クランプ', () => {
  it('開始日が終了日より後になる場合、両方が新しい開始日にクランプされる', () => {
    const onInlineUpdate = vi.fn();
    const task = makeTask({ startDate: '2026-05-01', endDate: '2026-05-10' });
    renderRow(task, onInlineUpdate);

    // 開始日セルをクリックして date input を表示
    fireEvent.click(screen.getByText('2026-05-01'));
    const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement;
    expect(dateInput).toBeTruthy();

    // 終了日より後の日付を入力し blur で確定 → 両方がクランプされる
    fireEvent.change(dateInput, { target: { value: '2026-05-15' } });
    fireEvent.blur(dateInput);
    expect(onInlineUpdate).toHaveBeenCalledWith('t1', {
      startDate: '2026-05-15',
      endDate: '2026-05-15',
    });
  });

  it('終了日が開始日より前になる場合、両方が新しい終了日にクランプされる', () => {
    const onInlineUpdate = vi.fn();
    // startDate と endDate が異なる値で endDate テキストが一意になるよう設定
    const task = makeTask({ startDate: '2026-06-01', endDate: '2026-06-10' });
    renderRow(task, onInlineUpdate);

    fireEvent.click(screen.getByText('2026-06-10'));
    const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement;
    expect(dateInput).toBeTruthy();

    // 開始日より前の日付を入力し blur で確定 → 両方がクランプされる
    fireEvent.change(dateInput, { target: { value: '2026-05-20' } });
    fireEvent.blur(dateInput);
    expect(onInlineUpdate).toHaveBeenCalledWith('t1', {
      startDate: '2026-05-20',
      endDate: '2026-05-20',
    });
  });
});

// ─── マイルストーン（終了日ロック・開始日追従）────────────────────────────────

describe('GanttLeftRow インライン編集 — マイルストーン', () => {
  it('マイルストーン行の終了日は編集不可（クリックしても入力欄が出ず onInlineUpdate も呼ばれない）', () => {
    const onInlineUpdate = vi.fn();
    const task = makeTask({ isMilestone: true, startDate: '2026-06-01', endDate: '2026-06-01' });
    renderRow(task, onInlineUpdate);

    // 終了日セルは読み取り専用（date-readonly）として描画される
    const endCell = screen.getByTestId('date-readonly');
    expect(endCell.textContent).toContain('2026-06-01');

    fireEvent.click(endCell);
    expect(document.querySelector('input[type="date"]')).toBeNull();
    expect(onInlineUpdate).not.toHaveBeenCalled();
  });

  it('マイルストーンの開始日を過去方向へ編集しても終了日が同じ日付に追従する', () => {
    const onInlineUpdate = vi.fn();
    const task = makeTask({ isMilestone: true, startDate: '2026-06-01', endDate: '2026-06-01' });
    renderRow(task, onInlineUpdate);

    // 開始日セルは編集可能（DOM 上、終了日の読み取り専用スパンより前に来る）
    fireEvent.click(screen.getAllByText('2026-06-01')[0]);
    const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement;
    expect(dateInput).toBeTruthy();

    // 既存の前後クランプが効かない「より前の日付」でも終了日が取り残されないこと
    fireEvent.change(dateInput, { target: { value: '2026-05-01' } });
    fireEvent.blur(dateInput);
    expect(onInlineUpdate).toHaveBeenCalledWith('t1', {
      startDate: '2026-05-01',
      endDate: '2026-05-01',
    });
  });
});

// ─── タイトルホバーツールチップ ────────────────────────────────────────────────

describe('GanttLeftRow タイトルホバーツールチップ', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('summary がある場合、タイトルにマウスオーバーすると 250ms 後にツールチップが表示される', () => {
    vi.useFakeTimers();
    renderRow(makeTask({ summary: 'ホバーサマリ' }));
    fireEvent.mouseEnter(screen.getByText('元のタイトル'), { clientX: 100, clientY: 100 });
    // 遅延前は非表示
    expect(screen.queryByText('ホバーサマリ')).toBeNull();
    act(() => { vi.advanceTimersByTime(250); });
    expect(screen.getByText('ホバーサマリ')).toBeTruthy();
  });

  it('summary も description もない場合はツールチップが表示されない', () => {
    vi.useFakeTimers();
    renderRow(makeTask({ summary: '', description: '' }));
    fireEvent.mouseEnter(screen.getByText('元のタイトル'), { clientX: 100, clientY: 100 });
    act(() => { vi.advanceTimersByTime(250); });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('マウスが離れるとツールチップが消える', () => {
    vi.useFakeTimers();
    renderRow(makeTask({ summary: 'ホバーサマリ' }));
    const titleSpan = screen.getByText('元のタイトル');
    fireEvent.mouseEnter(titleSpan, { clientX: 100, clientY: 100 });
    act(() => { vi.advanceTimersByTime(250); });
    expect(screen.getByText('ホバーサマリ')).toBeTruthy();
    fireEvent.mouseLeave(titleSpan);
    expect(screen.queryByText('ホバーサマリ')).toBeNull();
  });

  it('isDragging=true のときはマウスオーバーしてもツールチップが表示されない', () => {
    vi.useFakeTimers();
    render(<GanttLeftRow {...rowProps(makeTask({ summary: 'ホバーサマリ' }), vi.fn())} isDragging={true} />);
    fireEvent.mouseEnter(screen.getByText('元のタイトル'), { clientX: 100, clientY: 100 });
    act(() => { vi.advanceTimersByTime(250); });
    expect(screen.queryByText('ホバーサマリ')).toBeNull();
  });

  it('description の markdown がツールチップ内でレンダリングされる', () => {
    vi.useFakeTimers();
    renderRow(makeTask({ description: '**強調テスト**' }));
    fireEvent.mouseEnter(screen.getByText('元のタイトル'), { clientX: 100, clientY: 100 });
    act(() => { vi.advanceTimersByTime(250); });
    expect(document.querySelector('strong')?.textContent).toBe('強調テスト');
  });

  it('ツールチップ表示中にタイトルをクリックすると即座に消える', () => {
    vi.useFakeTimers();
    renderRow(makeTask({ summary: 'クリックで消えるか確認' }));
    const titleSpan = screen.getByText('元のタイトル');
    fireEvent.mouseEnter(titleSpan, { clientX: 100, clientY: 100 });
    act(() => { vi.advanceTimersByTime(250); });
    expect(screen.getByRole('tooltip')).toBeTruthy();

    fireEvent.click(titleSpan);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('ツールチップ表示中に右クリックすると即座に消える', () => {
    vi.useFakeTimers();
    renderRow(makeTask({ summary: '右クリックで消えるか確認' }));
    const titleSpan = screen.getByText('元のタイトル');
    fireEvent.mouseEnter(titleSpan, { clientX: 100, clientY: 100 });
    act(() => { vi.advanceTimersByTime(250); });
    expect(screen.getByRole('tooltip')).toBeTruthy();

    fireEvent.contextMenu(document.querySelector('div[style]')!);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
}); // end describe GanttLeftRow タイトルホバーツールチップ

// ─── 担当者インライン編集 ──────────────────────────────────────────────────────

describe('GanttLeftRow 担当者インライン編集', () => {
  it('担当者スパンをクリックするとテキスト入力が表示される', () => {
    renderRow(makeTask({ assignee: '山田' }));
    fireEvent.click(screen.getByText('山田'));
    expect(screen.getByRole('textbox')).toBeTruthy();
  });

  it('担当者が空のとき「—」スパンをクリックすると入力が表示される', () => {
    renderRow(makeTask({ assignee: '' }));
    fireEvent.click(screen.getByText('—'));
    expect(screen.getByRole('textbox')).toBeTruthy();
  });

  it('担当者 blur で onInlineUpdate が呼ばれる', () => {
    const onInlineUpdate = vi.fn();
    renderRow(makeTask({ assignee: '山田' }), onInlineUpdate);
    fireEvent.click(screen.getByText('山田'));
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '佐藤' } });
    fireEvent.blur(input);
    expect(onInlineUpdate).toHaveBeenCalledWith('t1', { assignee: '佐藤' });
  });

  it('担当者 Enter キーで onInlineUpdate が呼ばれる', () => {
    const onInlineUpdate = vi.fn();
    renderRow(makeTask({ assignee: '山田' }), onInlineUpdate);
    fireEvent.click(screen.getByText('山田'));
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '鈴木' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onInlineUpdate).toHaveBeenCalledWith('t1', { assignee: '鈴木' });
  });

  it('担当者 ESC キーでは onInlineUpdate が呼ばれない', () => {
    const onInlineUpdate = vi.fn();
    renderRow(makeTask({ assignee: '山田' }), onInlineUpdate);
    fireEvent.click(screen.getByText('山田'));
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '鈴木' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onInlineUpdate).not.toHaveBeenCalled();
  });

  it('担当者を空文字にして blur すると空で onInlineUpdate が呼ばれる', () => {
    const onInlineUpdate = vi.fn();
    renderRow(makeTask({ assignee: '山田' }), onInlineUpdate);
    fireEvent.click(screen.getByText('山田'));
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);
    expect(onInlineUpdate).toHaveBeenCalledWith('t1', { assignee: '' });
  });

  it('assigneeOptions を渡すと datalist が描画される', () => {
    const { container } = render(
      <GanttLeftRow
        {...rowProps(makeTask({ assignee: '山田' }), vi.fn())}
        assigneeOptions={['山田', '佐藤', '鈴木']}
      />
    );
    fireEvent.click(screen.getByText('山田'));
    const datalist = container.querySelector('datalist');
    expect(datalist).toBeTruthy();
    const options = Array.from(datalist!.querySelectorAll('option')).map(o => o.getAttribute('value'));
    expect(options).toEqual(['山田', '佐藤', '鈴木']);
  });

  it('assigneeOptions を渡さないとき datalist は描画されない', () => {
    const { container } = renderRow(makeTask({ assignee: '山田' }));
    fireEvent.click(screen.getByText('山田'));
    expect(container.querySelector('datalist')).toBeFalsy();
  });
});

// ─── 親タスク displayStart / displayEnd（v2.37）──────────────────────────────

describe('GanttLeftRow 親タスク displayStart/displayEnd（v2.37）', () => {
  function renderParentRow(
    taskOverrides: Partial<Task> = {},
    extra: { displayStart?: string | null; displayEnd?: string | null } = {},
  ) {
    const task = makeTask({ startDate: '2026-05-01', endDate: '2026-05-31', ...taskOverrides });
    return render(
      <GanttLeftRow
        {...rowProps(task, vi.fn())}
        hasChildren
        displayStart={extra.displayStart}
        displayEnd={extra.displayEnd}
      />,
    );
  }

  it('hasChildren=true のとき displayStart が開始日列に表示される', () => {
    renderParentRow({}, { displayStart: '2026-07-01', displayEnd: '2026-07-31' });
    expect(screen.getByText('2026-07-01')).toBeTruthy();
  });

  it('hasChildren=true のとき displayEnd が終了日列に表示される', () => {
    renderParentRow({}, { displayStart: '2026-07-01', displayEnd: '2026-07-31' });
    expect(screen.getByText('2026-07-31')).toBeTruthy();
  });

  it('displayStart が null のとき開始日列は — になる（task.startDate にフォールバックしない）', () => {
    renderParentRow({}, { displayStart: null, displayEnd: null });
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });

  it('hasChildren=false のとき task.startDate をそのまま表示する', () => {
    const task = makeTask({ startDate: '2026-05-01', endDate: '2026-05-31' });
    render(
      <GanttLeftRow
        {...rowProps(task, vi.fn())}
        hasChildren={false}
        displayStart="2026-07-01"
        displayEnd="2026-07-31"
      />,
    );
    expect(screen.getByText('2026-05-01')).toBeTruthy();
    expect(screen.getByText('2026-05-31')).toBeTruthy();
  });
});
