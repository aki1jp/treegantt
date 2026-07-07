// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen } from '@testing-library/react';
import { RefManagerModal } from '../components/RefManager/RefManagerModal';
import type { Project, Task, TaskRef, RefProject } from '../types/task';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ tasks: [], total: 0 }) })));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function makeProject(id: string, name: string): Project {
  return { id, name, color: null, capacityMinutesPerDay: null, workingDays: null, createdAt: '2026-01-01' };
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'r1', projectId: 'p2', parentId: null,
    title: '外部タスク', summary: '', description: '',
    status: 'todo', priority: 'medium', progress: 0, assignee: '',
    startDate: null, endDate: null, isMilestone: false,
    predecessors: [], seq: 3, order: 1, createdAt: '', updatedAt: '',
    titleColor: null, titleBgColor: null, estimateMinutes: null,
    ...overrides,
  };
}

const REF: TaskRef = { projectId: 'p1', refTaskId: 'r1', createdAt: '2026-01-01' };
const REF_PROJECT: RefProject = { id: 'p2', name: 'プロジェクトB', color: null };

function baseProps(overrides: Partial<React.ComponentProps<typeof RefManagerModal>> = {}) {
  return {
    projects: [makeProject('p1', 'プロジェクトA'), makeProject('p2', 'プロジェクトB')],
    currentProjectId: 'p1',
    refs: [REF],
    refTasks: [makeTask()],
    refProjects: [REF_PROJECT],
    onAdd: vi.fn().mockResolvedValue(undefined),
    onRemove: vi.fn().mockResolvedValue(undefined),
    onRefresh: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
}

describe('RefManagerModal', () => {
  it('参照一覧を「🔗 プロジェクト名 #seq タイトル」形式で表示する', () => {
    render(<RefManagerModal {...baseProps()} />);
    expect(screen.getByText('🔗 プロジェクトB #3 外部タスク', { exact: false })).toBeTruthy();
  });

  it('参照が空のときは案内メッセージを表示する', () => {
    render(<RefManagerModal {...baseProps({ refs: [], refTasks: [], refProjects: [] })} />);
    expect(screen.getByText(/参照はまだありません/)).toBeTruthy();
  });

  it('「解除」クリックで onRemove が呼ばれる', () => {
    const onRemove = vi.fn().mockResolvedValue(undefined);
    render(<RefManagerModal {...baseProps({ onRemove })} />);
    fireEvent.click(screen.getByText('解除'));
    expect(onRemove).toHaveBeenCalledWith('r1');
  });

  it('参照解除の注意文言（跨ぎ依存は残る）を表示する', () => {
    render(<RefManagerModal {...baseProps()} />);
    expect(screen.getByText(/依存関係.*残ります|残ります.*依存関係/)).toBeTruthy();
  });

  it('「再読み込み」クリックで onRefresh が呼ばれる', () => {
    const onRefresh = vi.fn();
    render(<RefManagerModal {...baseProps({ onRefresh })} />);
    fireEvent.click(screen.getByLabelText('参照を再読み込み'));
    expect(onRefresh).toHaveBeenCalled();
  });

  it('閉じるボタンで onClose が呼ばれる', () => {
    const onClose = vi.fn();
    render(<RefManagerModal {...baseProps({ onClose })} />);
    fireEvent.click(screen.getByText('閉じる'));
    expect(onClose).toHaveBeenCalled();
  });

  it('他に参照できるプロジェクトがなければ追加フローの代わりに案内を出す', () => {
    render(<RefManagerModal {...baseProps({ projects: [makeProject('p1', 'プロジェクトA')] })} />);
    expect(screen.getByText(/参照できる.*プロジェクトがありません/)).toBeTruthy();
  });

  it('追加フローに現プロジェクトを含めない（自プロジェクトは選択肢から除外）', () => {
    render(<RefManagerModal {...baseProps()} />);
    const projectSelect = screen.getByLabelText('参照先プロジェクト') as HTMLSelectElement;
    const optionValues = Array.from(projectSelect.options).map(o => o.value);
    expect(optionValues).not.toContain('p1');
    expect(optionValues).toContain('p2');
  });
});
