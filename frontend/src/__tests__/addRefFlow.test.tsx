// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen, waitFor, act } from '@testing-library/react';
import { AddRefFlow } from '../components/RefManager/AddRefFlow';
import { useTaskStore } from '../store/taskStore';
import type { Project } from '../types/task';

function makeProject(id: string, name: string): Project {
  return { id, name, color: null, capacityMinutesPerDay: null, workingDays: null, createdAt: '2026-01-01' };
}

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as Response;
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('AddRefFlow', () => {
  it('参照できるプロジェクトがないときはメッセージを表示する', () => {
    render(<AddRefFlow projects={[]} onAdd={vi.fn()} />);
    expect(screen.getByText(/参照できる.*プロジェクトがありません/)).toBeTruthy();
  });

  it('プロジェクト選択時にそのプロジェクトのタスク一覧を取得して表示する', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({
      tasks: [
        { id: 'x1', projectId: 'p2', parentId: null, title: 'タスクX', summary: '', description: '',
          status: 'todo', priority: 'medium', progress: 0, assignee: '', startDate: null, endDate: null,
          isMilestone: false, predecessors: [], seq: 1, order: 1, createdAt: '', updatedAt: '',
          titleColor: null, titleBgColor: null, estimateMinutes: null },
      ],
      total: 1,
    }));

    render(<AddRefFlow projects={[makeProject('p2', 'プロジェクトB')]} onAdd={vi.fn()} />);

    await waitFor(() => expect(screen.getByText('#1 タスクX', { exact: false })).toBeTruthy());
  });

  it('タスクを選択して「追加」をクリックすると onAdd が呼ばれる', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({
      tasks: [
        { id: 'x1', projectId: 'p2', parentId: null, title: 'タスクX', summary: '', description: '',
          status: 'todo', priority: 'medium', progress: 0, assignee: '', startDate: null, endDate: null,
          isMilestone: false, predecessors: [], seq: 1, order: 1, createdAt: '', updatedAt: '',
          titleColor: null, titleBgColor: null, estimateMinutes: null },
      ],
      total: 1,
    }));
    const onAdd = vi.fn().mockResolvedValue(undefined);
    render(<AddRefFlow projects={[makeProject('p2', 'プロジェクトB')]} onAdd={onAdd} />);

    await waitFor(() => expect(screen.getByLabelText('参照するタスク')).toBeTruthy());
    fireEvent.change(screen.getByLabelText('参照するタスク'), { target: { value: 'x1' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '追加' }));
    });

    expect(onAdd).toHaveBeenCalledWith('x1');
  });

  it('追加ボタンはタスク未選択のとき disabled', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ tasks: [], total: 0 }));
    render(<AddRefFlow projects={[makeProject('p2', 'プロジェクトB')]} onAdd={vi.fn()} />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect((screen.getByRole('button', { name: '追加' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('プロジェクトを切り替えるとタスク一覧を再取得する', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ tasks: [], total: 0 }));
    render(<AddRefFlow projects={[makeProject('p2', 'B'), makeProject('p3', 'C')]} onAdd={vi.fn()} />);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText('参照先プロジェクト'), { target: { value: 'p3' } });
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 多言語対応（i18n）: locale: 'en' でのスモークテスト（既存の ja テストは変更しない）
describe('AddRefFlow の多言語対応（locale: en）', () => {
  afterEach(() => {
    useTaskStore.setState({ locale: 'ja' });
  });

  it('プロジェクト選択・タスク選択ステップの文言が英語表示になる', async () => {
    useTaskStore.setState({ locale: 'en' });
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ tasks: [], total: 0 }));
    render(<AddRefFlow projects={[makeProject('p2', 'Project B')]} onAdd={vi.fn()} />);

    expect(screen.getByText('Target Project')).toBeTruthy();
    await waitFor(() => expect(screen.getByLabelText('Task to Reference')).toBeTruthy());
    expect(screen.getByText('Please select')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add' })).toBeTruthy();
  });

  it('参照できる他のプロジェクトがない場合の案内が英語表示になる', () => {
    useTaskStore.setState({ locale: 'en' });
    render(<AddRefFlow projects={[]} onAdd={vi.fn()} />);
    expect(screen.getByText(/No other projects available/)).toBeTruthy();
  });
});
