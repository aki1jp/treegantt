// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useTasks } from '../hooks/useTasks';
import { useTaskStore } from '../store/taskStore';
import type { Task } from '../types/task';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 't1', projectId: 'p1', parentId: null,
    title: 'タスク', summary: '', description: '',
    status: 'todo', priority: 'medium', progress: 0,
    assignee: '', startDate: null, endDate: null, isMilestone: false,
    predecessors: [], seq: 1, order: 1, createdAt: '', updatedAt: '',
    ...overrides,
  };
}

beforeEach(() => {
  useTaskStore.setState({ tasks: [] });
  vi.stubGlobal('fetch', vi.fn());
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createTask', () => {
  it('API を呼びストアにタスクを追加する', async () => {
    const newTask = makeTask({ id: 'new-1', title: '新タスク' });
    vi.mocked(fetch).mockResolvedValue({
      ok: true, status: 201,
      json: async () => ({ task: newTask }),
    } as Response);

    const { createTask } = useTasks('p1');
    const result = await createTask({ title: '新タスク' });

    expect(result.id).toBe('new-1');
    expect(useTaskStore.getState().tasks).toHaveLength(1);
    expect(useTaskStore.getState().tasks[0].title).toBe('新タスク');
  });

  it('parentId を指定するとリクエストボディに含まれる', async () => {
    const child = makeTask({ id: 'child-1', title: '小タスク', parentId: 'parent-1' });
    vi.mocked(fetch).mockResolvedValue({
      ok: true, status: 201,
      json: async () => ({ task: child }),
    } as Response);

    const { createTask } = useTasks('p1');
    await createTask({ title: '小タスク', parentId: 'parent-1' });

    const body = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string);
    expect(body.parentId).toBe('parent-1');
    expect(useTaskStore.getState().tasks[0].parentId).toBe('parent-1');
  });

  it('既にストアに同 id のタスクがある場合は重複追加しない', async () => {
    const task = makeTask({ id: 'dup-1' });
    useTaskStore.setState({ tasks: [task] });
    vi.mocked(fetch).mockResolvedValue({
      ok: true, status: 201,
      json: async () => ({ task }),
    } as Response);

    const { createTask } = useTasks('p1');
    await createTask({ title: 'タスク' });

    expect(useTaskStore.getState().tasks).toHaveLength(1);
  });
});

describe('updateTask', () => {
  it('ストアを楽観的に更新し API を呼ぶ', async () => {
    const task = makeTask({ id: 't1', title: '旧タイトル' });
    useTaskStore.setState({ tasks: [task] });
    vi.mocked(fetch).mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({}),
    } as Response);

    const { updateTask } = useTasks('p1');
    await updateTask('t1', { title: '新タイトル' });

    expect(useTaskStore.getState().tasks[0].title).toBe('新タイトル');
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/tasks/t1'),
      expect.objectContaining({ method: 'PATCH' }),
    );
  });

  it('対象外のタスクは変更しない', async () => {
    const t1 = makeTask({ id: 't1', title: 'A' });
    const t2 = makeTask({ id: 't2', title: 'B' });
    useTaskStore.setState({ tasks: [t1, t2] });
    vi.mocked(fetch).mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({}),
    } as Response);

    const { updateTask } = useTasks('p1');
    await updateTask('t1', { title: 'A更新' });

    expect(useTaskStore.getState().tasks[1].title).toBe('B');
  });
});

describe('deleteTask', () => {
  it('ストアからタスクを削除し API を呼ぶ', async () => {
    const task = makeTask({ id: 't1' });
    useTaskStore.setState({ tasks: [task] });
    vi.mocked(fetch).mockResolvedValue({
      ok: true, status: 204,
      json: async () => null,
    } as Response);

    const { deleteTask } = useTasks('p1');
    await deleteTask('t1');

    expect(useTaskStore.getState().tasks).toHaveLength(0);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/tasks/t1'),
      expect.objectContaining({ method: 'DELETE' }),
    );
  });
});

describe('reorderTasks', () => {
  it('ストアの order を更新し API を呼ぶ', async () => {
    const t1 = makeTask({ id: 't1', order: 1 });
    const t2 = makeTask({ id: 't2', order: 2 });
    useTaskStore.setState({ tasks: [t1, t2] });
    vi.mocked(fetch).mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({}),
    } as Response);

    const { reorderTasks } = useTasks('p1');
    await reorderTasks([{ id: 't1', order: 2 }, { id: 't2', order: 1 }]);

    const tasks = useTaskStore.getState().tasks;
    expect(tasks.find(t => t.id === 't1')?.order).toBe(2);
    expect(tasks.find(t => t.id === 't2')?.order).toBe(1);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/tasks/reorder'),
      expect.objectContaining({ method: 'PATCH' }),
    );
  });

  it('orders に含まれないタスクは order が変わらない', async () => {
    const t1 = makeTask({ id: 't1', order: 1 });
    const t2 = makeTask({ id: 't2', order: 2 });
    const t3 = makeTask({ id: 't3', order: 3 });
    useTaskStore.setState({ tasks: [t1, t2, t3] });
    vi.mocked(fetch).mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({}),
    } as Response);

    const { reorderTasks } = useTasks('p1');
    await reorderTasks([{ id: 't1', order: 5 }]);

    expect(useTaskStore.getState().tasks.find(t => t.id === 't3')?.order).toBe(3);
  });
});
