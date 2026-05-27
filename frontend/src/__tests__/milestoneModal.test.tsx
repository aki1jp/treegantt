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
    fireEvent.change(screen.getAllByRole('textbox')[1], { target: { value: '担当者A' } });
    fireEvent.click(container.firstChild as HTMLElement);
    expect(onClose).not.toHaveBeenCalled();
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
