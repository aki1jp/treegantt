// @vitest-environment jsdom
/**
 * MilestoneModal — backdrop クリックの閉じる/閉じない挙動
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent, screen, act } from '@testing-library/react';
import { MilestoneModal } from '../components/MilestoneModal/MilestoneModal';
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
    titleColor: null, titleBgColor: null,
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
