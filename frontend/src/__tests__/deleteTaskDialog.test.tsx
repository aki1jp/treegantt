// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, screen } from '@testing-library/react';
import { DeleteTaskDialog } from '../components/DeleteTaskDialog/DeleteTaskDialog';
import { useTaskStore } from '../store/taskStore';

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

// ─────────────────────────────────────────────────────────────────────────────
// 多言語対応（i18n）: locale: 'en' でのスモークテスト（既存の ja テストは変更しない）
describe('DeleteTaskDialog の多言語対応（locale: en）', () => {
  afterEach(() => {
    useTaskStore.setState({ locale: 'ja' });
  });

  it('タスクタイトルはそのまま・件数まわりの文言が英語表示になる', () => {
    useTaskStore.setState({ locale: 'en' });
    renderDialog({ taskTitle: '設計タスク', descendantCount: 3 });

    expect(screen.getByText('設計タスク')).toBeTruthy();
    expect(screen.getByText(/has/)).toBeTruthy();
    expect(screen.getByText(/descendant task\(s\)\. Choose how to delete\./)).toBeTruthy();
    expect(screen.getByText('Delete with Descendants')).toBeTruthy();
    expect(screen.getByText(/Deletes this task and all 3 descendant task\(s\)/)).toBeTruthy();
    expect(screen.getByText('Delete This Task Only')).toBeTruthy();
    expect(screen.getByText('Child tasks move up one level')).toBeTruthy();
    expect(screen.getByText('Cancel')).toBeTruthy();
  });

  it('「Delete with Descendants」クリックで onDelete("subtree") が呼ばれる', () => {
    useTaskStore.setState({ locale: 'en' });
    const { onDelete } = renderDialog();
    fireEvent.click(screen.getByText('Delete with Descendants'));
    expect(onDelete).toHaveBeenCalledWith('subtree');
  });

  it('「Cancel」クリックで onCancel が呼ばれる', () => {
    useTaskStore.setState({ locale: 'en' });
    const { onCancel } = renderDialog();
    fireEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalled();
  });
});
