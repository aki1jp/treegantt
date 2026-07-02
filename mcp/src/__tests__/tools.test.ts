import { describe, it, expect, vi, beforeEach } from 'vitest';

const apiFetchMock = vi.fn();
const apiMutateMock = vi.fn();
vi.mock('../client.js', () => ({ apiFetch: apiFetchMock, apiMutate: apiMutateMock }));

const { TOOL_DEFINITIONS } = await import('../tools.js');

function findTool(name: string) {
  const tool = TOOL_DEFINITIONS.find((t) => t.name === name);
  if (!tool) throw new Error(`tool not found: ${name}`);
  return tool;
}

describe('TOOL_DEFINITIONS', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    apiMutateMock.mockReset();
  });

  it('読み取り専用5件＋書き込み(段階1)3件のちょうど8件を公開する', () => {
    expect(TOOL_DEFINITIONS.map((t) => t.name).sort()).toEqual([
      'create_task',
      'delete_task',
      'export_project',
      'get_settings',
      'get_task',
      'list_projects',
      'list_tasks',
      'update_task',
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

  describe('意地悪テスト: IDに特殊文字が含まれる場合のパスエンコード', () => {
    it('get_task: taskId に "/" が含まれても余分なパスセグメントを作らない', async () => {
      apiFetchMock.mockResolvedValue({ id: 'weird' });

      await findTool('get_task').handler({ taskId: 'a/b' });

      expect(apiFetchMock).toHaveBeenCalledWith(`/tasks/${encodeURIComponent('a/b')}`);
    });

    it('get_task: taskId に "?" や "&" が含まれてもクエリ文字列として解釈されない', async () => {
      apiFetchMock.mockResolvedValue({ id: 'weird' });

      await findTool('get_task').handler({ taskId: 'x?y=1&z=2' });

      const calledPath = apiFetchMock.mock.calls[0][0] as string;
      expect(calledPath).toBe(`/tasks/${encodeURIComponent('x?y=1&z=2')}`);
      expect(calledPath).not.toContain('?y=1');
    });

    it('export_project: projectId に "/" や空白が含まれてもエンコードされる', async () => {
      apiFetchMock.mockResolvedValue({ tasks: [] });

      await findTool('export_project').handler({ projectId: '../secret dir' });

      expect(apiFetchMock).toHaveBeenCalledWith(
        `/projects/${encodeURIComponent('../secret dir')}/export/json`,
      );
    });

    it('list_tasks: projectId に特殊文字が含まれてもエンコードされる', async () => {
      apiFetchMock.mockResolvedValue({ tasks: [], total: 0 });

      await findTool('list_tasks').handler({ projectId: 'a b/c' });

      expect(apiFetchMock).toHaveBeenCalledWith(`/projects/${encodeURIComponent('a b/c')}/tasks`);
    });

    it('list_tasks: フィルタ値に "&" や "=" が含まれても追加のクエリパラメータを注入できない', async () => {
      apiFetchMock.mockResolvedValue({ tasks: [], total: 0 });

      await findTool('list_tasks').handler({ projectId: 'p1', assignee: 'x&status=done&foo=bar' });

      const calledPath = apiFetchMock.mock.calls[0][0] as string;
      const query = new URLSearchParams(calledPath.split('?')[1]);
      // 注入を試みても、assignee 以外のキーは増えていないこと
      expect([...query.keys()]).toEqual(['assignee']);
      expect(query.get('assignee')).toBe('x&status=done&foo=bar');
    });
  });

  it('apiFetch が失敗したら、ツールは黙って握りつぶさずエラーを伝播する', async () => {
    apiFetchMock.mockRejectedValue(new Error('backend down'));

    await expect(findTool('list_projects').handler({})).rejects.toThrow('backend down');
  });

  it('引用符・改行・絵文字を含むデータもテキストとして壊れずに往復する', async () => {
    const tricky = { title: '"quoted"\nline2 🎉 日本語', note: 'back\\slash' };
    apiFetchMock.mockResolvedValue(tricky);

    const result = await findTool('get_task').handler({ taskId: 't1' });

    expect(JSON.parse(result.content[0].text)).toEqual(tricky);
  });

  describe('書き込みツール（段階1）', () => {
    it('create_task は POST /projects/:id/tasks を呼び、projectIdをボディに含めない', async () => {
      apiMutateMock.mockResolvedValue({ task: { id: 't1', title: '新規タスク' } });

      const result = await findTool('create_task').handler({
        projectId: 'p1',
        title: '新規タスク',
        status: 'todo',
      });

      expect(apiMutateMock).toHaveBeenCalledWith('POST', '/projects/p1/tasks', {
        title: '新規タスク',
        status: 'todo',
      });
      expect(result.content[0].text).toContain('新規タスク');
    });

    it('create_task: projectId に特殊文字が含まれてもエンコードされる', async () => {
      apiMutateMock.mockResolvedValue({ task: {} });

      await findTool('create_task').handler({ projectId: 'a/b', title: 'x' });

      expect(apiMutateMock).toHaveBeenCalledWith('POST', `/projects/${encodeURIComponent('a/b')}/tasks`, {
        title: 'x',
      });
    });

    it('update_task は PATCH /tasks/:id を呼び、taskIdをボディに含めない', async () => {
      apiMutateMock.mockResolvedValue({ task: { id: 't1', progress: 50 } });

      const result = await findTool('update_task').handler({ taskId: 't1', progress: 50 });

      expect(apiMutateMock).toHaveBeenCalledWith('PATCH', '/tasks/t1', { progress: 50 });
      expect(result.content[0].text).toContain('50');
    });

    it('update_task: taskId に "/" が含まれてもエンコードされる', async () => {
      apiMutateMock.mockResolvedValue({ task: {} });

      await findTool('update_task').handler({ taskId: 'a/b', progress: 10 });

      expect(apiMutateMock).toHaveBeenCalledWith('PATCH', `/tasks/${encodeURIComponent('a/b')}`, {
        progress: 10,
      });
    });

    it('delete_task はmode省略時 DELETE /tasks/:id をクエリ無しで呼ぶ', async () => {
      apiMutateMock.mockResolvedValue(null);

      const result = await findTool('delete_task').handler({ taskId: 't1' });

      expect(apiMutateMock).toHaveBeenCalledWith('DELETE', '/tasks/t1');
      expect(JSON.parse(result.content[0].text)).toEqual({
        deleted: true,
        taskId: 't1',
        mode: 'subtree',
      });
    });

    it('delete_task はmode="single"指定時にクエリを付与する', async () => {
      apiMutateMock.mockResolvedValue(null);

      await findTool('delete_task').handler({ taskId: 't1', mode: 'single' });

      expect(apiMutateMock).toHaveBeenCalledWith('DELETE', '/tasks/t1?mode=single');
    });

    it('delete_task: taskId に特殊文字が含まれてもエンコードされる', async () => {
      apiMutateMock.mockResolvedValue(null);

      await findTool('delete_task').handler({ taskId: 'x?y=1' });

      expect(apiMutateMock).toHaveBeenCalledWith('DELETE', `/tasks/${encodeURIComponent('x?y=1')}`);
    });

    it('apiMutateが失敗したら、書き込みツールも黙って握りつぶさずエラーを伝播する', async () => {
      apiMutateMock.mockRejectedValue(new Error('write failed'));

      await expect(findTool('create_task').handler({ projectId: 'p1', title: 'x' })).rejects.toThrow(
        'write failed',
      );
    });

    it('書き込みツールは apiFetch を一切呼ばない（読み取り経路と混同しない）', async () => {
      apiMutateMock.mockResolvedValue({ task: {} });

      await findTool('create_task').handler({ projectId: 'p1', title: 'x' });
      await findTool('update_task').handler({ taskId: 't1' });
      apiMutateMock.mockResolvedValue(null);
      await findTool('delete_task').handler({ taskId: 't1' });

      expect(apiFetchMock).not.toHaveBeenCalled();
    });
  });

  describe('書き込みツールのスキーマがドメインルールを守らせる', () => {
    it('create_task: title は1〜200文字（空文字は拒否）', () => {
      const schema = findTool('create_task').inputSchema.title;
      expect(schema.safeParse('').success).toBe(false);
      expect(schema.safeParse('a'.repeat(201)).success).toBe(false);
      expect(schema.safeParse('OK').success).toBe(true);
    });

    it('update_task: title は省略可能（部分更新のため必須にしない）', () => {
      const schema = findTool('update_task').inputSchema.title;
      expect(schema.safeParse(undefined).success).toBe(true);
    });

    it('create_task: status は既定の5値以外を拒否する', () => {
      const schema = findTool('create_task').inputSchema.status;
      expect(schema.safeParse('bogus').success).toBe(false);
      expect(schema.safeParse('wip').success).toBe(true);
    });

    it('create_task: progress は0〜100の範囲外を拒否する', () => {
      const schema = findTool('create_task').inputSchema.progress;
      expect(schema.safeParse(-1).success).toBe(false);
      expect(schema.safeParse(101).success).toBe(false);
      expect(schema.safeParse(50).success).toBe(true);
    });

    it('delete_task: mode は "subtree"/"single" 以外を拒否する', () => {
      const schema = findTool('delete_task').inputSchema.mode;
      expect(schema.safeParse('bogus').success).toBe(false);
      expect(schema.safeParse('single').success).toBe(true);
    });

    it('create_task/update_task の入力スキーマに titleColor・titleBgColor・order を含まない（スコープ外）', () => {
      expect(findTool('create_task').inputSchema.titleColor).toBeUndefined();
      expect(findTool('create_task').inputSchema.titleBgColor).toBeUndefined();
      expect(findTool('create_task').inputSchema.order).toBeUndefined();
      expect(findTool('update_task').inputSchema.titleColor).toBeUndefined();
      expect(findTool('update_task').inputSchema.order).toBeUndefined();
    });
  });
});
