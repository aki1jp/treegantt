// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useProjects } from '../hooks/useProjects';

function makeProject(id: string, name: string) {
  return { id, name, color: null, capacityMinutesPerDay: null, workingDays: null, createdAt: '2026-01-01' };
}

beforeEach(() => {
  localStorage.clear();
  window.history.pushState({}, '', '/'); // URL をトップにリセット
  vi.stubGlobal('fetch', vi.fn());
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useProjects', () => {
  it('初期ロードでプロジェクト一覧を取得する', async () => {
    const projects = [makeProject('p1', 'Alpha'), makeProject('p2', 'Beta')];
    vi.mocked(fetch).mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ projects }),
    } as Response);

    const { result } = renderHook(() => useProjects());
    expect(result.current.loading).toBe(true);

    await act(async () => {});
    expect(result.current.loading).toBe(false);
    expect(result.current.projects).toHaveLength(2);
    expect(result.current.currentProject?.id).toBe('p1');
  });

  it('プロジェクトが0件の場合 currentProject は null', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ projects: [] }),
    } as Response);

    const { result } = renderHook(() => useProjects());
    await act(async () => {});
    expect(result.current.currentProject).toBeNull();
  });

  it('createProject で新プロジェクトを先頭に追加し currentProject を切り替える', async () => {
    const existing = makeProject('p1', 'Existing');
    const created  = makeProject('p2', 'Created');
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({ projects: [existing] }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true, status: 201,
        json: async () => ({ project: created }),
      } as Response);

    const { result } = renderHook(() => useProjects());
    await act(async () => {});
    expect(result.current.projects).toHaveLength(1);

    await act(async () => { await result.current.createProject('Created'); });
    expect(result.current.projects).toHaveLength(2);
    expect(result.current.projects[0].id).toBe('p2');
    expect(result.current.currentProject?.id).toBe('p2');
  });

  it('deleteProject で削除後に残りプロジェクトを設定する', async () => {
    const p1 = makeProject('p1', 'Keep');
    const p2 = makeProject('p2', 'Delete');
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({ projects: [p2, p1] }),
      } as Response)
      .mockResolvedValueOnce({ ok: true, status: 204, json: async () => ({}) } as Response);

    const { result } = renderHook(() => useProjects());
    await act(async () => {});
    expect(result.current.currentProject?.id).toBe('p2');

    await act(async () => { await result.current.deleteProject(p2); });
    expect(result.current.projects).toHaveLength(1);
    expect(result.current.currentProject?.id).toBe('p1');
  });

  it('プロジェクトを全削除すると currentProject が null になる', async () => {
    const p1 = makeProject('p1', 'Only');
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({ projects: [p1] }),
      } as Response)
      .mockResolvedValueOnce({ ok: true, status: 204, json: async () => ({}) } as Response);

    const { result } = renderHook(() => useProjects());
    await act(async () => {});
    await act(async () => { await result.current.deleteProject(p1); });
    expect(result.current.currentProject).toBeNull();
  });
});

describe('useProjects — renameProject', () => {
  it('renameProject でプロジェクト名が更新される', async () => {
    const p1 = makeProject('p1', 'Old Name');
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({ projects: [p1] }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({ project: { ...p1, name: 'New Name' } }),
      } as Response);

    const { result } = renderHook(() => useProjects());
    await act(async () => {});
    expect(result.current.projects[0].name).toBe('Old Name');

    await act(async () => { await result.current.renameProject(p1, 'New Name'); });
    expect(result.current.projects[0].name).toBe('New Name');
  });

  it('renameProject で currentProject の名前も更新される', async () => {
    const p1 = makeProject('p1', 'Old');
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({ projects: [p1] }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({ project: { ...p1, name: 'New' } }),
      } as Response);

    const { result } = renderHook(() => useProjects());
    await act(async () => {});
    await act(async () => { await result.current.renameProject(p1, 'New'); });
    expect(result.current.currentProject?.name).toBe('New');
  });
});

describe('useProjects — localStorage 永続化', () => {
  const LS_KEY = 'treegantt-current-project';

  function mockLoad(projects: ReturnType<typeof makeProject>[]) {
    vi.mocked(fetch).mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ projects }),
    } as Response);
  }

  it('localStorage に保存された ID のプロジェクトをリロード時に復元する', async () => {
    localStorage.setItem(LS_KEY, 'p2');
    mockLoad([makeProject('p1', 'Alpha'), makeProject('p2', 'Beta')]);

    const { result } = renderHook(() => useProjects());
    await act(async () => {});
    expect(result.current.currentProject?.id).toBe('p2');
  });

  it('setCurrentProject を呼ぶと localStorage に ID が保存される', async () => {
    mockLoad([makeProject('p1', 'Alpha'), makeProject('p2', 'Beta')]);

    const { result } = renderHook(() => useProjects());
    await act(async () => {});
    act(() => { result.current.setCurrentProject(makeProject('p2', 'Beta')); });
    expect(localStorage.getItem(LS_KEY)).toBe('p2');
  });

  it('localStorage に存在しない ID が保存されている場合は projects[0] にフォールバック', async () => {
    localStorage.setItem(LS_KEY, 'deleted-project');
    mockLoad([makeProject('p1', 'Alpha'), makeProject('p2', 'Beta')]);

    const { result } = renderHook(() => useProjects());
    await act(async () => {});
    expect(result.current.currentProject?.id).toBe('p1');
  });

  it('createProject 後にリロードすると新プロジェクトが復元される', async () => {
    const existing = makeProject('p1', 'Existing');
    const created  = makeProject('p2', 'Created');
    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ projects: [existing] }) } as Response)
      .mockResolvedValueOnce({ ok: true, status: 201, json: async () => ({ project: created }) } as Response);

    const { result } = renderHook(() => useProjects());
    await act(async () => {});
    await act(async () => { await result.current.createProject('Created'); });
    expect(localStorage.getItem(LS_KEY)).toBe('p2');
  });
});

describe('useProjects — URL（アドレス）連携', () => {
  function mockLoad(projects: ReturnType<typeof makeProject>[]) {
    vi.mocked(fetch).mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ projects }),
    } as Response);
  }

  it('/p/<名前> で開くと localStorage より優先してそのプロジェクトを選択する', async () => {
    localStorage.setItem('treegantt-current-project', 'p1');
    window.history.pushState({}, '', '/p/Beta');
    mockLoad([makeProject('p1', 'Alpha'), makeProject('p2', 'Beta')]);

    const { result } = renderHook(() => useProjects());
    await act(async () => {});
    expect(result.current.currentProject?.id).toBe('p2');
  });

  it('/p/<ID> でも開ける', async () => {
    window.history.pushState({}, '', '/p/p2');
    mockLoad([makeProject('p1', 'Alpha'), makeProject('p2', 'Beta')]);

    const { result } = renderHook(() => useProjects());
    await act(async () => {});
    expect(result.current.currentProject?.id).toBe('p2');
  });

  it('setCurrentProject でアドレスが正準パスになる（ユニーク名→/p/<名前>）', async () => {
    mockLoad([makeProject('p1', 'Alpha'), makeProject('p2', 'Beta')]);

    const { result } = renderHook(() => useProjects());
    await act(async () => {});
    act(() => { result.current.setCurrentProject(makeProject('p2', 'Beta')); });
    expect(window.location.pathname).toBe('/p/Beta');
  });

  it('setCurrentProject で同名が複数あるプロジェクトはアドレスが /p/<id> になる', async () => {
    mockLoad([makeProject('p1', 'Same'), makeProject('p2', 'Same')]);

    const { result } = renderHook(() => useProjects());
    await act(async () => {});
    act(() => { result.current.setCurrentProject(makeProject('p2', 'Same')); });
    expect(window.location.pathname).toBe('/p/p2');
  });

  it('URL の key が無効なら先頭にフォールバックし、URL を / に戻す', async () => {
    window.history.pushState({}, '', '/p/does-not-exist');
    mockLoad([makeProject('p1', 'Alpha'), makeProject('p2', 'Beta')]);

    const { result } = renderHook(() => useProjects());
    await act(async () => {});
    expect(result.current.currentProject?.id).toBe('p1');
    expect(window.location.pathname).toBe('/');
  });
});
