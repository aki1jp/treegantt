// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, screen } from '@testing-library/react';
import { DeleteTaskDialog } from '../components/DeleteTaskDialog/DeleteTaskDialog';

afterEach(cleanup);

function renderDialog(overrides: Partial<Parameters<typeof DeleteTaskDialog>[0]> = {}) {
  const onDelete = vi.fn();
  const onCancel = vi.fn();
  render(
    <DeleteTaskDialog
      taskTitle="設計タスク"
      descendantCount={3}
      onDelete={onDelete}
      onCancel={onCancel}
      {...overrides}
    />
  );
  return { onDelete, onCancel };
}

describe('DeleteTaskDialog', () => {
  it('タスク名と子孫件数を表示する', () => {
    renderDialog();
    expect(screen.getByText(/設計タスク/)).toBeTruthy();
    expect(screen.getAllByText(/3/).length).toBeGreaterThanOrEqual(1);
  });

  it('「子孫ごと削除」クリックで onDelete("subtree") が呼ばれる', () => {
    const { onDelete } = renderDialog();
    fireEvent.click(screen.getByText('子孫ごと削除'));
    expect(onDelete).toHaveBeenCalledWith('subtree');
  });

  it('「このタスクのみ削除」クリックで onDelete("single") が呼ばれる', () => {
    const { onDelete } = renderDialog();
    fireEvent.click(screen.getByText(/このタスクのみ削除/));
    expect(onDelete).toHaveBeenCalledWith('single');
  });

  it('「キャンセル」クリックで onCancel が呼ばれ onDelete は呼ばれない', () => {
    const { onDelete, onCancel } = renderDialog();
    fireEvent.click(screen.getByText('キャンセル'));
    expect(onCancel).toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
  });
});
