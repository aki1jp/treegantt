import { describe, it, expect, vi, beforeEach } from 'vitest';

const apiFetchMock = vi.fn();
vi.mock('../client.js', () => ({ apiFetch: apiFetchMock }));

const { TOOL_DEFINITIONS } = await import('../tools.js');

function findTool(name: string) {
  const tool = TOOL_DEFINITIONS.find((t) => t.name === name);
  if (!tool) throw new Error(`tool not found: ${name}`);
  return tool;
}

describe('TOOL_DEFINITIONS', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  it('読み取り専用ツールをちょうど5件公開する（書き込み系ツールを含まない）', () => {
    expect(TOOL_DEFINITIONS.map((t) => t.name).sort()).toEqual([
      'export_project',
      'get_settings',
      'get_task',
      'list_projects',
      'list_tasks',
    ]);
  });

  it('list_projects は GET /projects を呼び、結果をテキストとして返す', async () => {
    apiFetchMock.mockResolvedValue({ projects: [{ id: 'p1', name: 'Proj' }] });

    const result = await findTool('list_projects').handler({});

    expect(apiFetchMock).toHaveBeenCalledWith('/projects');
    expect(result.content[0].text).toContain('Proj');
  });

  it('list_tasks はフィルタ引数をクエリ文字列にして GET /projects/:id/tasks を呼ぶ', async () => {
    apiFetchMock.mockResolvedValue({ tasks: [], total: 0 });

    await findTool('list_tasks').handler({ projectId: 'p1', status: 'wip', assignee: '山田' });

    const calledPath = apiFetchMock.mock.calls[0][0] as string;
    expect(calledPath.startsWith('/projects/p1/tasks?')).toBe(true);
    expect(calledPath).toContain('status=wip');
    expect(calledPath).toContain(`assignee=${encodeURIComponent('山田')}`);
  });

  it('list_tasks はフィルタなしなら projectId のみで GET する', async () => {
    apiFetchMock.mockResolvedValue({ tasks: [], total: 0 });

    await findTool('list_tasks').handler({ projectId: 'p1' });

    expect(apiFetchMock).toHaveBeenCalledWith('/projects/p1/tasks');
  });

  it('get_task は GET /tasks/:id を呼ぶ', async () => {
    apiFetchMock.mockResolvedValue({ id: 't1', title: 'タスクA' });

    const result = await findTool('get_task').handler({ taskId: 't1' });

    expect(apiFetchMock).toHaveBeenCalledWith('/tasks/t1');
    expect(result.content[0].text).toContain('タスクA');
  });

  it('export_project は GET /projects/:id/export/json を呼ぶ', async () => {
    apiFetchMock.mockResolvedValue({ tasks: [] });

    await findTool('export_project').handler({ projectId: 'p1' });

    expect(apiFetchMock).toHaveBeenCalledWith('/projects/p1/export/json');
  });

  it('get_settings は GET /settings を呼ぶ', async () => {
    apiFetchMock.mockResolvedValue({ capacityMinutesPerDay: 480, workingDays: [1, 2, 3, 4, 5] });

    const result = await findTool('get_settings').handler({});

    expect(apiFetchMock).toHaveBeenCalledWith('/settings');
    expect(result.content[0].text).toContain('480');
  });
});
