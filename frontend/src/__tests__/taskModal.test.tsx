// @vitest-environment jsdom
/**
 * TaskModal — Markdown プレビュータブ / 日付バリデーション / backdrop 閉じる挙動
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
    isMilestone: false, predecessors: [], seq: 1, order: 1,
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

describe('TaskModal — backdrop クリックの閉じる/閉じない挙動', () => {
  it('既存タスク・変更なし: backdrop クリックで onClose が呼ばれる', () => {
    const onClose = vi.fn();
    const { container } = render(
      <TaskModal task={makeTask()} allTasks={[]} onSave={NOOP} onClose={onClose} />
    );
    fireEvent.click(container.firstChild as HTMLElement);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('新規タスク・変更なし: backdrop クリックで onClose が呼ばれる', () => {
    const onClose = vi.fn();
    const { container } = render(
      <TaskModal task={null} allTasks={[]} onSave={NOOP} onClose={onClose} />
    );
    fireEvent.click(container.firstChild as HTMLElement);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('タイトル変更後: backdrop クリックで onClose が呼ばれない', () => {
    const onClose = vi.fn();
    const { container } = render(
      <TaskModal task={makeTask({ title: '元タイトル' })} allTasks={[]} onSave={NOOP} onClose={onClose} />
    );
    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: '変更後タイトル' } });
    fireEvent.click(container.firstChild as HTMLElement);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('新規タスク: タイトル入力後 backdrop クリックで onClose が呼ばれない', () => {
    const onClose = vi.fn();
    const { container } = render(
      <TaskModal task={null} allTasks={[]} onSave={NOOP} onClose={onClose} />
    );
    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: '新しいタスク' } });
    fireEvent.click(container.firstChild as HTMLElement);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('進捗変更後: backdrop クリックで onClose が呼ばれない', () => {
    const onClose = vi.fn();
    const { container } = render(
      <TaskModal task={makeTask({ progress: 0 })} allTasks={[]} onSave={NOOP} onClose={onClose} />
    );
    fireEvent.change(screen.getByRole('slider'), { target: { value: '50' } });
    fireEvent.click(container.firstChild as HTMLElement);
    expect(onClose).not.toHaveBeenCalled();
  });
});
