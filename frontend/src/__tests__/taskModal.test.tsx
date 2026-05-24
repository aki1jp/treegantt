// @vitest-environment jsdom
/**
 * TaskModal — 説明フィールドの Markdown プレビュータブ切り替えテスト
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, screen } from '@testing-library/react';
import { TaskModal } from '../components/TaskModal/TaskModal';
import type { Task } from '../types/task';

afterEach(() => { cleanup(); });

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 't1', projectId: 'p1', parentId: null,
    title: 'テストタスク', summary: '', description: '',
    status: 'todo', priority: 'medium', progress: 0,
    assignee: '', startDate: null, endDate: null,
    isMilestone: false, predecessors: [], order: 1,
    createdAt: '', updatedAt: '',
    ...overrides,
  };
}

const NOOP = vi.fn();

function renderModal(task: Task | null = null, description = '') {
  const t = task ?? (description ? makeTask({ description }) : null);
  return render(
    <TaskModal
      task={t}
      allTasks={[]}
      onSave={NOOP}
      onClose={NOOP}
    />
  );
}

describe('TaskModal — 説明フィールドのタブ切り替え', () => {
  it('デフォルトでは「編集」タブがアクティブで textarea が表示される', () => {
    renderModal(makeTask({ description: '## 見出し' }));
    expect(screen.getByRole('tab', { name: '編集' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'プレビュー' })).toBeTruthy();
    // textarea が表示されている
    expect(screen.getByRole('textbox', { name: /説明/ })).toBeTruthy();
  });

  it('「プレビュー」タブをクリックすると textarea が消え Markdown がレンダリングされる', () => {
    renderModal(makeTask({ description: '## 見出し\n\nテスト本文' }));
    fireEvent.click(screen.getByRole('tab', { name: 'プレビュー' }));
    // textarea は非表示
    expect(screen.queryByRole('textbox', { name: /説明/ })).toBeNull();
    // Markdown がレンダリングされた h2（"見出し"テキスト）が存在する
    expect(screen.getByText('見出し', { selector: 'h2' })).toBeTruthy();
  });

  it('「プレビュー」→「編集」に戻ると textarea が再表示される', () => {
    renderModal(makeTask({ description: '本文' }));
    fireEvent.click(screen.getByRole('tab', { name: 'プレビュー' }));
    fireEvent.click(screen.getByRole('tab', { name: '編集' }));
    expect(screen.getByRole('textbox', { name: /説明/ })).toBeTruthy();
  });

  it('description が空のときプレビューにプレースホルダーが表示される', () => {
    renderModal(makeTask({ description: '' }));
    fireEvent.click(screen.getByRole('tab', { name: 'プレビュー' }));
    expect(screen.getByText('説明がありません')).toBeTruthy();
  });

  it('プレビューで箇条書きがレンダリングされる', () => {
    renderModal(makeTask({ description: '- 項目A\n- 項目B' }));
    fireEvent.click(screen.getByRole('tab', { name: 'プレビュー' }));
    expect(screen.getByRole('list')).toBeTruthy();
    expect(screen.getByText('項目A')).toBeTruthy();
  });
});

describe('TaskModal — 開始日・終了日バリデーション', () => {
  it('終了日 < 開始日のとき保存すると日付が自動スワップされる', () => {
    const onSave = vi.fn();
    render(
      <TaskModal
        task={makeTask({ startDate: '2026-06-10', endDate: '2026-06-01' })}
        allTasks={[]}
        onSave={onSave}
        onClose={NOOP}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /保存/ }));
    expect(onSave).toHaveBeenCalledOnce();
    const saved = onSave.mock.calls[0][0] as Partial<Task>;
    expect(saved.startDate).toBe('2026-06-01');
    expect(saved.endDate).toBe('2026-06-10');
  });

  it('終了日 >= 開始日のとき日付はそのまま保存される', () => {
    const onSave = vi.fn();
    render(
      <TaskModal
        task={makeTask({ startDate: '2026-06-01', endDate: '2026-06-10' })}
        allTasks={[]}
        onSave={onSave}
        onClose={NOOP}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /保存/ }));
    const saved = onSave.mock.calls[0][0] as Partial<Task>;
    expect(saved.startDate).toBe('2026-06-01');
    expect(saved.endDate).toBe('2026-06-10');
  });

  it('開始日のみ設定のとき終了日は null のまま', () => {
    const onSave = vi.fn();
    render(
      <TaskModal
        task={makeTask({ startDate: '2026-06-01', endDate: null })}
        allTasks={[]}
        onSave={onSave}
        onClose={NOOP}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /保存/ }));
    const saved = onSave.mock.calls[0][0] as Partial<Task>;
    expect(saved.startDate).toBe('2026-06-01');
    expect(saved.endDate).toBeNull();
  });
});
