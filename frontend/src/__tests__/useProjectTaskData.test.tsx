// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, render, screen, cleanup } from '@testing-library/react';
import { useProjectTaskData } from '../hooks/useProjectTaskData';
import { GanttChart } from '../components/Gantt/GanttChart';
import { useTaskStore } from '../store/taskStore';
import type { Task } from '../types/task';

function makeTask(id: string, projectId: string, title = id): Task {
  return {
    id, projectId, parentId: null,
    title, summary: '', description: '',
    status: 'todo', priority: 'medium', progress: 0, assignee: '',
    startDate: '2026-06-10', endDate: '2026-06-15', isMilestone: false,
    predecessors: [], seq: 1, order: 1,
    createdAt: '', updatedAt: '', titleColor: null, titleBgColor: null, estimateMinutes: null,
  };
}

beforeEach(() => {
  localStorage.clear();
  useTaskStore.setState({ tasks: [], tasksOwnerProjectId: null, refTasks: [], refProjects: [], refOwnerProjectId: null });
});
afterEach(() => cleanup());

describe('useProjectTaskData（tasks の持ち主照合）', () => {
  it('持ち主が現在プロジェクトと一致すれば実データと loaded:true を返す', () => {
    const tasks = [makeTask('a', 'p1')];
    useTaskStore.setState({ tasks, tasksOwnerProjectId: 'p1' });
    const { result } = renderHook(() => useProjectTaskData('p1'));
    expect(result.current.tasks).toBe(tasks);
    expect(result.current.loaded).toBe(true);
  });

  it('持ち主が不一致なら空配列と loaded:false を返し、空配列は参照同一', () => {
    useTaskStore.setState({ tasks: [makeTask('a', 'p1')], tasksOwnerProjectId: 'p1' });
    const { result, rerender } = renderHook(({ id }) => useProjectTaskData(id), { initialProps: { id: 'p2' as string | undefined } });
    expect(result.current.tasks).toEqual([]);
    expect(result.current.loaded).toBe(false);
    const first = result.current.tasks;
    rerender({ id: undefined });
    expect(result.current.tasks).toBe(first);
    expect(result.current.loaded).toBe(false);
  });

  it('setTasks は持ち主を省略すると変更せず、指定すると同時に更新する', () => {
    useTaskStore.getState().setTasks([makeTask('a', 'p1')], 'p1');
    expect(useTaskStore.getState().tasksOwnerProjectId).toBe('p1');
    useTaskStore.getState().setTasks([makeTask('b', 'p1')]);
    expect(useTaskStore.getState().tasksOwnerProjectId).toBe('p1');
    useTaskStore.getState().upsertTask(makeTask('c', 'p1'));
    expect(useTaskStore.getState().tasksOwnerProjectId).toBe('p1');
  });
});

describe('GanttChart: 切替中は旧プロジェクトのタスクを描画しない', () => {
  const NOOP = vi.fn();
  function renderChart(projectId: string) {
    return render(
      <GanttChart
        projectId={projectId}
        onEditTask={NOOP} onDeleteTask={NOOP} onInlineUpdate={NOOP} onQuickAdd={NOOP}
        onAddSubTask={NOOP} onAddSubMilestone={NOOP} onReorder={NOOP} onCopyInsert={NOOP}
      />,
    );
  }

  it('持ち主 p1 のタスクは projectId=p2 の描画に現れない（🔗 参照行にもならない）', () => {
    useTaskStore.setState({ tasks: [makeTask('a', 'p1', 'OldTask')], tasksOwnerProjectId: 'p1' });
    renderChart('p2');
    expect(screen.queryByText('OldTask', { exact: false })).toBeNull();
    expect(screen.queryByText('🔗', { exact: false })).toBeNull();
  });

  it('持ち主が一致していれば表示される', () => {
    useTaskStore.setState({ tasks: [makeTask('a', 'p2', 'NewTask')], tasksOwnerProjectId: 'p2' });
    renderChart('p2');
    expect(screen.queryAllByText('NewTask', { exact: false }).length).toBeGreaterThan(0);
  });
});
