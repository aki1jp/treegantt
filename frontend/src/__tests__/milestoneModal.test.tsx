// @vitest-environment jsdom
/**
 * MilestoneModal — backdrop クリックの閉じる/閉じない挙動
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent, screen, act } from '@testing-library/react';
import { MilestoneModal } from '../components/MilestoneModal/MilestoneModal';
import { useTaskStore } from '../store/taskStore';
import { useToastStore } from '../store/toastStore';
import type { Task } from '../types/task';

afterEach(() => { cleanup(); });

function makeMilestone(overrides: Partial<Task> = {}): Task {
  return {
    id: 'm1', projectId: 'p1', parentId: null,
    title: 'マイルストーン', summary: '', description: '',
    status: 'todo', priority: 'medium', progress: 0,
    assignee: '', startDate: '2026-06-01', endDate: '2026-06-01',
    isMilestone: true, predecessors: [], seq: 1, order: 1,
    createdAt: '', updatedAt: '',
    titleColor: null, titleBgColor: null, estimateMinutes: null,
    ...overrides,
  };
}

const NOOP = vi.fn();

describe('MilestoneModal — backdrop クリックの閉じる/閉じない挙動', () => {
  it('既存マイルストーン・変更なし: backdrop クリックで onClose が呼ばれる', () => {
    const onClose = vi.fn();
    const { container } = render(
      <MilestoneModal task={makeMilestone()} allTasks={[]} onSave={NOOP} onClose={onClose} />
    );
    fireEvent.click(container.firstChild as HTMLElement);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('新規マイルストーン・変更なし: backdrop クリックで onClose が呼ばれる', () => {
    const onClose = vi.fn();
    const { container } = render(
      <MilestoneModal task={null} allTasks={[]} onSave={NOOP} onClose={onClose} />
    );
    fireEvent.click(container.firstChild as HTMLElement);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('タイトル変更後: backdrop クリックで onClose が呼ばれない', () => {
    const onClose = vi.fn();
    const { container } = render(
      <MilestoneModal task={makeMilestone({ title: '元タイトル' })} allTasks={[]} onSave={NOOP} onClose={onClose} />
    );
    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: '変更後タイトル' } });
    fireEvent.click(container.firstChild as HTMLElement);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('新規マイルストーン: タイトル入力後 backdrop クリックで onClose が呼ばれない', () => {
    const onClose = vi.fn();
    const { container } = render(
      <MilestoneModal task={null} allTasks={[]} onSave={NOOP} onClose={onClose} />
    );
    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: '新しいマイルストーン' } });
    fireEvent.click(container.firstChild as HTMLElement);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('担当者変更後: backdrop クリックで onClose が呼ばれない', () => {
    const onClose = vi.fn();
    const { container } = render(
      <MilestoneModal task={makeMilestone({ assignee: '' })} allTasks={[]} onSave={NOOP} onClose={onClose} />
    );
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '担当者A' } });
    fireEvent.click(container.firstChild as HTMLElement);
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('MilestoneModal — 差分保存（Stage 3）', () => {
  it('既存マイルストーンを開いて何も変えずに保存 → onSave が呼ばれず onClose が呼ばれる', () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    render(<MilestoneModal task={makeMilestone()} allTasks={[]} onSave={onSave} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('1フィールド（担当者）だけ変えて保存 → onSave の引数はそのフィールドと title のみ', () => {
    const onSave = vi.fn();
    render(<MilestoneModal task={makeMilestone()} allTasks={[]} onSave={onSave} onClose={NOOP} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '担当者A' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(onSave).toHaveBeenCalledOnce();
    const saved = onSave.mock.calls[0][0] as Partial<Task>;
    expect(Object.keys(saved).sort()).toEqual(['assignee', 'title'].sort());
    expect(saved.assignee).toBe('担当者A');
  });

  it('日付だけ変えて保存 → startDate・endDate の両方が patch に含まれる（マイルストーンは1点）', () => {
    const onSave = vi.fn();
    render(<MilestoneModal task={makeMilestone()} allTasks={[]} onSave={onSave} onClose={NOOP} />);
    fireEvent.change(screen.getByLabelText('日付'), { target: { value: '2026-07-01' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    const saved = onSave.mock.calls[0][0] as Partial<Task>;
    expect(Object.keys(saved).sort()).toEqual(['endDate', 'startDate', 'title'].sort());
    expect(saved.startDate).toBe('2026-07-01');
    expect(saved.endDate).toBe('2026-07-01');
  });

  it('lost-update 回帰: status=wip・progress=50 のマイルストーンを開きタイトルだけ変更 → patch に status も progress も含まれない', () => {
    const onSave = vi.fn();
    render(
      <MilestoneModal
        task={makeMilestone({ status: 'wip', progress: 50 })}
        allTasks={[]}
        onSave={onSave}
        onClose={NOOP}
      />
    );
    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: '変更後タイトル' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    const saved = onSave.mock.calls[0][0] as Partial<Task>;
    expect(saved).not.toHaveProperty('status');
    expect(saved).not.toHaveProperty('progress');
    expect(saved.title).toBe('変更後タイトル');
  });

  it('新規作成（task なし）は従来どおり全フィールドが送られる', () => {
    const onSave = vi.fn();
    render(<MilestoneModal task={null} allTasks={[]} onSave={onSave} onClose={NOOP} />);
    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: '新規マイルストーン' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    const saved = onSave.mock.calls[0][0] as Partial<Task>;
    expect(Object.keys(saved).sort()).toEqual(
      [
        'title', 'assignee', 'startDate', 'endDate', 'isMilestone', 'predecessors',
        'summary', 'description', 'status', 'priority', 'progress', 'parentId',
      ].sort()
    );
  });
});

describe('MilestoneModal — 先行タスク候補のガード（v0.2.90）', () => {
  const normal = (o: Partial<Task> = {}) => makeMilestone({ isMilestone: false, ...o });

  it('先行候補に他のマイルストーンは含まれない（通常タスクのみ候補）', () => {
    const target = makeMilestone({ id: 'm1', order: 3 });
    const normalTask = normal({ id: 'tA', title: '通常タスクA', order: 1 });
    const otherMs = makeMilestone({ id: 'm2', title: '別マイルストーン', order: 2 });
    render(<MilestoneModal task={target} allTasks={[normalTask, otherMs, target]} onSave={NOOP} onClose={NOOP} />);
    expect(screen.queryByText('通常タスクA')).toBeTruthy();
    expect(screen.queryByText('別マイルストーン')).toBeNull();
  });

  it('祖先（親）タスクは先行候補から除外される', () => {
    const parent = normal({ id: 'tA', title: '親タスク', order: 1 });
    const target = makeMilestone({ id: 'm1', parentId: 'tA', order: 2 });
    render(<MilestoneModal task={target} allTasks={[parent, target]} onSave={NOOP} onClose={NOOP} />);
    expect(screen.queryByText('親タスク')).toBeNull();
  });

  it('新規マイルストーン（task=null）でも先行候補にマイルストーンは含まれない', () => {
    const normalTask = normal({ id: 'tA', title: '通常タスクA', order: 1 });
    const ms = makeMilestone({ id: 'm2', title: '別マイルストーン', order: 2 });
    render(<MilestoneModal task={null} allTasks={[normalTask, ms]} onSave={NOOP} onClose={NOOP} />);
    expect(screen.queryByText('通常タスクA')).toBeTruthy();
    expect(screen.queryByText('別マイルストーン')).toBeNull();
  });
});

describe('MilestoneModal — initialParentId（子マイルストーン作成）', () => {
  it('新規マイルストーン: initialParentId を渡すと保存ペイロードの parentId に反映される', () => {
    const onSave = vi.fn();
    render(
      <MilestoneModal task={null} allTasks={[]} initialParentId="tP" onSave={onSave} onClose={NOOP} />
    );
    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: '子マイル' } });
    fireEvent.submit(screen.getByText('保存').closest('form')!);
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ parentId: 'tP', isMilestone: true }));
  });
});

describe('MilestoneModal — backdrop クリック時の shake アニメーション', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('変更なしで backdrop クリック → shake なし・onClose が呼ばれる', () => {
    const onClose = vi.fn();
    const { container } = render(
      <MilestoneModal task={makeMilestone()} allTasks={[]} onSave={NOOP} onClose={onClose} />
    );
    fireEvent.click(container.firstChild as HTMLElement);
    expect(onClose).toHaveBeenCalledOnce();
    expect(container.querySelector('[data-field="title"][data-shaking]')).toBeNull();
  });

  it('タイトル変更後 backdrop クリック → タイトルフィールドが shake する', () => {
    const onClose = vi.fn();
    const { container } = render(
      <MilestoneModal task={makeMilestone()} allTasks={[]} onSave={NOOP} onClose={onClose} />
    );
    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: '変更後' } });
    fireEvent.click(container.firstChild as HTMLElement);
    expect(onClose).not.toHaveBeenCalled();
    expect(container.querySelector('[data-field="title"][data-shaking]')).toBeTruthy();
  });

  it('タイトルのみ変更 → 未変更フィールド（担当者）は shake しない', () => {
    const { container } = render(
      <MilestoneModal task={makeMilestone()} allTasks={[]} onSave={NOOP} onClose={vi.fn()} />
    );
    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: '変更後' } });
    fireEvent.click(container.firstChild as HTMLElement);
    expect(container.querySelector('[data-field="assignee"][data-shaking]')).toBeNull();
  });

  it('shake は 500ms 後にリセットされる', () => {
    const { container } = render(
      <MilestoneModal task={makeMilestone()} allTasks={[]} onSave={NOOP} onClose={vi.fn()} />
    );
    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: '変更後' } });
    fireEvent.click(container.firstChild as HTMLElement);
    expect(container.querySelector('[data-field="title"][data-shaking]')).toBeTruthy();
    act(() => { vi.advanceTimersByTime(500); });
    expect(container.querySelector('[data-field="title"][data-shaking]')).toBeNull();
  });
});

// ─── i18n（locale='en'）─────────────────────────────────────────────
describe('MilestoneModal i18n（locale="en"）', () => {
  beforeEach(() => {
    useTaskStore.setState({ locale: 'en' });
  });

  afterEach(() => {
    useTaskStore.setState({ locale: 'ja' });
  });

  it('新規作成時のモーダル見出しが英語表示される（Create Milestone）', () => {
    render(<MilestoneModal task={null} allTasks={[]} onSave={NOOP} onClose={NOOP} />);
    expect(screen.getByText('Create Milestone')).toBeTruthy();
  });

  it('編集時のモーダル見出しが英語表示される（Edit Milestone）', () => {
    render(<MilestoneModal task={makeMilestone()} allTasks={[]} onSave={NOOP} onClose={NOOP} />);
    expect(screen.getByText('Edit Milestone')).toBeTruthy();
  });

  it('主要フィールドの aria-label が英語表示される', () => {
    render(<MilestoneModal task={makeMilestone()} allTasks={[]} onSave={NOOP} onClose={NOOP} />);
    expect(screen.getByLabelText('Title')).toBeTruthy();
    expect(screen.getByLabelText('Date')).toBeTruthy();
    expect(screen.getByLabelText('Assignee')).toBeTruthy();
  });

  it('先行タスクラベルが英語表示される', () => {
    const normalTask: Task = { ...makeMilestone(), id: 'tA', title: '通常タスクA', isMilestone: false, order: 2 };
    render(<MilestoneModal task={makeMilestone({ order: 1 })} allTasks={[normalTask, makeMilestone({ order: 1 })]} onSave={NOOP} onClose={NOOP} />);
    expect(screen.getByText('Predecessors (multiple allowed)')).toBeTruthy();
  });

  it('Cancel/Save ボタンが英語表示される', () => {
    render(<MilestoneModal task={makeMilestone()} allTasks={[]} onSave={NOOP} onClose={NOOP} />);
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
  });
});

describe('MilestoneModal — 日付形式の検証', () => {
  beforeEach(() => { useToastStore.setState({ toasts: [] }); });

  it('年6桁の不正な日付で保存 → onSave が呼ばれずエラートーストを表示', () => {
    const onSave = vi.fn();
    render(<MilestoneModal task={makeMilestone()} allTasks={[]} onSave={onSave} onClose={NOOP} />);
    fireEvent.change(screen.getByLabelText('日付'), { target: { value: '202610-10-21' } });
    // min/max 属性によりブラウザ標準の制約検証が submit を止めるため、form を直接 submit して handleSubmit の検証を確認する
    fireEvent.submit(screen.getByRole('button', { name: '保存' }).closest('form') as HTMLFormElement);
    expect(onSave).not.toHaveBeenCalled();
    expect(useToastStore.getState().toasts[0]?.type).toBe('error');
  });

  it('日付入力に min/max 属性が付く', () => {
    render(<MilestoneModal task={null} allTasks={[]} onSave={NOOP} onClose={NOOP} />);
    const el = screen.getByLabelText('日付') as HTMLInputElement;
    expect(el.min).toBe('1000-01-01');
    expect(el.max).toBe('9999-12-31');
  });
});
