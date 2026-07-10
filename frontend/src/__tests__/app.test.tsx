// @vitest-environment jsdom
/**
 * App.tsx のオーケストレーション層のユニットテスト（D2）。
 * GanttChart は仮想化/canvas 等の重い描画を持つため、コールバック props を
 * ボタンから直接叩けるスタブに差し替え、App の配線（fetch/WS/store 更新/
 * トースト表示）に絞って検証する。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup, waitFor } from '@testing-library/react';
import App from '../App';
import { useTaskStore } from '../store/taskStore';
import { useToastStore } from '../store/toastStore';
import type { Task, Project } from '../types/task';

// ─── WebSocket モック（useWebSocket が実接続しないように） ─────────────────
class MockWebSocket {
  static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3;
  onopen: (() => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readyState = 0;
  constructor(public url: string) {}
  send() {}
  close() { this.readyState = 3; this.onclose?.(); }
}

// ─── GanttChart スタブ（App のオーケストレーションのみ検証） ────────────────
vi.mock('../components/Gantt/GanttChart', () => ({
  GanttChart: (props: {
    onDeleteTask: (id: string) => void;
    onInlineUpdate: (id: string, patch: Partial<Task>) => void;
    onQuickAdd: (title: string) => void;
    onCopyInsert: (source: Task, parentId: string | null, afterTaskId: string | null, beforeTaskId?: string | null) => void;
    onReorder: (orders: { id: string; order: number; parentId?: string | null }[]) => void;
  }) => (
    <div data-testid="gantt-chart-stub">
      <button onClick={() => props.onDeleteTask('t1')}>delete-t1</button>
      <button onClick={() => props.onDeleteTask('r1')}>delete-r1</button>
      <button onClick={() => props.onInlineUpdate('t1', { title: '更新後' })}>inline-update</button>
      <button onClick={() => props.onInlineUpdate('r1', { title: '更新後' })}>inline-update-r1-title</button>
      <button onClick={() => props.onInlineUpdate('r1', { predecessors: ['t1'] })}>inline-update-r1-preds</button>
      <button onClick={() => props.onQuickAdd('新規タスク')}>quick-add</button>
      <button onClick={() => props.onCopyInsert(
        { ...PARENT_TASK }, null, 'parent', null,
      )}>copy-insert</button>
      <button onClick={() => props.onReorder([{ id: 't1', order: 2, parentId: null }])}>reorder</button>
    </div>
  ),
}));

function makeProject(id: string, name: string): Project {
  return { id, name, color: null, capacityMinutesPerDay: null, workingDays: null, createdAt: '2026-01-01' };
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 't1', projectId: 'p1', parentId: null,
    title: 'タスク1', summary: '', description: '',
    status: 'todo', priority: 'medium', progress: 0, assignee: '',
    startDate: null, endDate: null, isMilestone: false,
    predecessors: [], seq: 1, order: 1,
    createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    titleColor: null, titleBgColor: null, estimateMinutes: null,
    ...overrides,
  };
}

// コピーの子孫・依存関係検証用の親子タスク（内部依存: child -> parent）
const PARENT_TASK: Task = makeTask({ id: 'parent', title: '親タスク', parentId: null, order: 1 });
const CHILD_TASK: Task = makeTask({ id: 'child', title: '子タスク', parentId: 'parent', order: 1, predecessors: ['parent'] });

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 400): Response {
  return { ok, status, json: async () => body } as Response;
}

interface RouterState {
  projects: Project[];
  tasksByProject: Record<string, Task[]>;
  failPatch?: boolean;
  failReorder?: boolean;
  failHealth?: boolean;
  failSettings?: boolean;
  requests: { url: string; method: string; body?: unknown }[];
  refsResponse?: { refs: unknown[]; tasks: Task[]; projects: unknown[] };
}

function makeFetchMock(state: RouterState) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    state.requests.push({ url, method, body });

    if (url.endsWith('/health')) {
      if (state.failHealth) return jsonResponse({ error: 'health boom' }, false, 500);
      return jsonResponse({ status: 'ok', version: '9.9.9' });
    }
    if (url.includes('/api/v1/settings')) {
      if (state.failSettings) return jsonResponse({ error: 'settings boom' }, false, 500);
      return jsonResponse({ capacityMinutesPerDay: 480, workingDays: [1, 2, 3, 4, 5] });
    }

    if (url.match(/\/projects\/[^/?]+\/refs$/) && method === 'GET') {
      return jsonResponse(state.refsResponse ?? { refs: [], tasks: [], projects: [] });
    }

    const taskListMatch = url.match(/\/projects\/([^/?]+)\/tasks\?/);
    if (taskListMatch && method === 'GET') {
      const pid = decodeURIComponent(taskListMatch[1]);
      const tasks = state.tasksByProject[pid] ?? [];
      return jsonResponse({ tasks, total: tasks.length });
    }

    if (url.match(/\/projects\/[^/?]+$/) && method === 'GET') {
      return jsonResponse({ projects: state.projects });
    }
    if (url.endsWith('/api/v1/projects') && method === 'GET') {
      return jsonResponse({ projects: state.projects });
    }

    if (url.includes('/tasks/batch') && method === 'POST') {
      const newTasks = (body.tasks as Record<string, unknown>[]).map((t, i) =>
        makeTask({ id: `new-${i}`, title: t.title as string, parentId: null }));
      return jsonResponse({ tasks: newTasks });
    }

    if (url.includes('/tasks/reorder') && method === 'PATCH') {
      if (state.failReorder) return jsonResponse({ error: 'reorder failed' }, false, 500);
      return jsonResponse({});
    }

    if (url.match(/\/tasks\/[^/?]+\/?$/) && method === 'PATCH') {
      if (state.failPatch) return jsonResponse({ error: 'update failed' }, false, 500);
      const idMatch = url.match(/\/tasks\/([^/?]+)/)!;
      return jsonResponse({ task: makeTask({ id: idMatch[1], ...body }) });
    }

    if (url.match(/\/tasks\/[^/?]+/) && method === 'DELETE') {
      return jsonResponse(null, true, 204);
    }

    if (url.match(/\/projects\/[^/?]+\/tasks$/) && method === 'POST') {
      return jsonResponse({ task: makeTask({ id: 'created-1', title: (body as { title: string }).title }) });
    }

    return jsonResponse({});
  });
}

let routerState: RouterState;

beforeEach(() => {
  localStorage.clear();
  window.history.pushState({}, '', '/');
  useTaskStore.setState({ tasks: [], needsReload: false, locale: 'ja' });
  useToastStore.setState({ toasts: [] });
  vi.stubGlobal('WebSocket', MockWebSocket);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false, media: '(prefers-color-scheme: dark)',
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(), onchange: null,
  }) as unknown as typeof window.matchMedia;

  routerState = {
    projects: [makeProject('p1', 'プロジェクト1')],
    tasksByProject: { p1: [makeTask({ id: 't1', title: 'タスク1' })] },
    requests: [],
  };
  vi.stubGlobal('fetch', makeFetchMock(routerState));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('App — 初回ロード', () => {
  it('プロジェクトとタスクを取得して表示する', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByTestId('gantt-chart-stub')).toBeTruthy());
    expect(screen.getByText('プロジェクト1')).toBeTruthy();
    await waitFor(() => expect(useTaskStore.getState().tasks).toHaveLength(1));
    expect(useTaskStore.getState().tasks[0].title).toBe('タスク1');
  });

  it('プロジェクト一覧の取得に失敗すると再試行UIが表示され、retryで復帰する', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/api/v1/projects')) return jsonResponse({ error: 'boom' }, false, 500);
      return jsonResponse({});
    }));

    render(<App />);
    await waitFor(() => expect(screen.getByText('再試行')).toBeTruthy());
    expect(screen.queryByTestId('gantt-chart-stub')).toBeNull();

    // 以後は成功するようにしてから再試行
    vi.stubGlobal('fetch', makeFetchMock(routerState));
    fireEvent.click(screen.getByText('再試行'));

    await waitFor(() => expect(screen.getByTestId('gantt-chart-stub')).toBeTruthy());
  });
});

describe('App — handleCopyInsert（サブツリー複製）', () => {
  it('親子タスクをコピーすると batch API に parentRef 構造で渡され、内部依存が付け替えられ、reorder される', async () => {
    routerState.tasksByProject.p1 = [PARENT_TASK, CHILD_TASK];
    render(<App />);
    await waitFor(() => expect(screen.getByTestId('gantt-chart-stub')).toBeTruthy());

    await act(async () => {
      fireEvent.click(screen.getByText('copy-insert'));
    });

    await waitFor(() => {
      const batchReq = routerState.requests.find(r => r.url.includes('/tasks/batch'));
      expect(batchReq).toBeTruthy();
    });

    const batchReq = routerState.requests.find(r => r.url.includes('/tasks/batch'))!;
    const batchBody = batchReq.body as { tasks: { parentRef: number | null; title: string }[] };
    expect(batchBody.tasks).toHaveLength(2);
    expect(batchBody.tasks[0].parentRef).toBeNull();
    expect(batchBody.tasks[1].parentRef).toBe(0); // 子は親(index 0)を参照

    // 内部依存（child -> parent）が新IDへ付け替えられて PATCH される
    await waitFor(() => {
      const patchReq = routerState.requests.find(r =>
        r.method === 'PATCH' && r.url.includes('/tasks/new-1') && !!(r.body as { predecessors?: string[] })?.predecessors);
      expect(patchReq).toBeTruthy();
    });
    const patchReq = routerState.requests.find(r =>
      r.method === 'PATCH' && r.url.includes('/tasks/new-1'))!;
    expect((patchReq.body as { predecessors: string[] }).predecessors).toEqual(['new-0']);

    // reorder が呼ばれる
    await waitFor(() => {
      const reorderReq = routerState.requests.find(r => r.url.includes('/tasks/reorder'));
      expect(reorderReq).toBeTruthy();
    });
  });
});

describe('App — 削除フロー', () => {
  it('confirm 承諾で削除APIが呼ばれ、タスクがストアから消える', async () => {
    render(<App />);
    await waitFor(() => expect(useTaskStore.getState().tasks).toHaveLength(1));

    fireEvent.click(screen.getByText('delete-t1'));

    await waitFor(() => expect(useTaskStore.getState().tasks).toHaveLength(0));
    expect(window.confirm).toHaveBeenCalled();
    expect(routerState.requests.some(r => r.method === 'DELETE' && r.url.includes('/tasks/t1'))).toBe(true);
  });

  it('confirm 拒否なら削除APIは呼ばれない', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<App />);
    await waitFor(() => expect(useTaskStore.getState().tasks).toHaveLength(1));

    fireEvent.click(screen.getByText('delete-t1'));

    expect(routerState.requests.some(r => r.method === 'DELETE')).toBe(false);
    expect(useTaskStore.getState().tasks).toHaveLength(1);
  });
});

describe('App — エラー経路（D1: トースト表示）', () => {
  it('インライン更新が失敗するとロールバックしてエラートーストを表示する', async () => {
    routerState.failPatch = true;
    render(<App />);
    await waitFor(() => expect(useTaskStore.getState().tasks).toHaveLength(1));
    const originalTitle = useTaskStore.getState().tasks[0].title;

    await act(async () => {
      fireEvent.click(screen.getByText('inline-update'));
    });

    await waitFor(() => {
      const toasts = useToastStore.getState().toasts;
      expect(toasts.some(t => t.type === 'error' && t.message.includes('更新に失敗しました'))).toBe(true);
    });
    // 楽観的更新がロールバックされ、元のタイトルに戻る
    expect(useTaskStore.getState().tasks[0].title).toBe(originalTitle);
  });

  it('行D&Dの並び替えが失敗するとロールバックしてエラートーストを表示する', async () => {
    routerState.failReorder = true;
    render(<App />);
    await waitFor(() => expect(useTaskStore.getState().tasks).toHaveLength(1));
    const originalOrder = useTaskStore.getState().tasks[0].order;

    await act(async () => {
      fireEvent.click(screen.getByText('reorder'));
    });

    await waitFor(() => {
      const toasts = useToastStore.getState().toasts;
      expect(toasts.some(t => t.type === 'error' && t.message.includes('並び替えに失敗しました'))).toBe(true);
    });
    // 楽観的並び替えがロールバックされ、元の order に戻る
    expect(useTaskStore.getState().tasks[0].order).toBe(originalOrder);
  });
});

// ─── クロスプロジェクト参照: 多層防御（単位5, §5.8）─────────────────────────
describe('App — 参照タスクの多層防御（handleInlineUpdate/handleDeleteTask）', () => {
  beforeEach(() => {
    routerState.refsResponse = {
      refs: [{ projectId: 'p1', refTaskId: 'r1', createdAt: '2026-01-01' }],
      tasks: [makeTask({ id: 'r1', projectId: 'p2', title: '外部タスク' })],
      projects: [{ id: 'p2', name: 'プロジェクト2', color: null }],
    };
  });

  it('参照タスクの title 更新は拒否されトーストが出る（PATCHは送られない）', async () => {
    render(<App />);
    await waitFor(() => expect(useTaskStore.getState().refTasks).toHaveLength(1));

    await act(async () => {
      fireEvent.click(screen.getByText('inline-update-r1-title'));
    });

    await waitFor(() => {
      const toasts = useToastStore.getState().toasts;
      expect(toasts.some(t => t.type === 'error' && t.message.includes('読み取り専用'))).toBe(true);
    });
    expect(routerState.requests.some(r => r.method === 'PATCH' && r.url.includes('/tasks/r1'))).toBe(false);
  });

  it('参照タスクの predecessors 単独更新は許可され、refTasksへ反映されtasksは汚染されない', async () => {
    render(<App />);
    await waitFor(() => expect(useTaskStore.getState().refTasks).toHaveLength(1));

    await act(async () => {
      fireEvent.click(screen.getByText('inline-update-r1-preds'));
    });

    await waitFor(() => {
      expect(routerState.requests.some(r => r.method === 'PATCH' && r.url.includes('/tasks/r1'))).toBe(true);
    });
    await waitFor(() => {
      const r1 = useTaskStore.getState().refTasks.find(t => t.id === 'r1');
      expect(r1?.predecessors).toEqual(['t1']);
    });
    // tasks スロット（現プロジェクトの一覧）に r1 が紛れ込んでいない
    expect(useTaskStore.getState().tasks.some(t => t.id === 'r1')).toBe(false);
  });

  it('参照タスクの削除は拒否されトーストが出る（DELETEは送られない）', async () => {
    render(<App />);
    await waitFor(() => expect(useTaskStore.getState().refTasks).toHaveLength(1));

    fireEvent.click(screen.getByText('delete-r1'));

    await waitFor(() => {
      const toasts = useToastStore.getState().toasts;
      expect(toasts.some(t => t.type === 'error' && t.message.includes('参照'))).toBe(true);
    });
    expect(routerState.requests.some(r => r.method === 'DELETE' && r.url.includes('/tasks/r1'))).toBe(false);
  });
});

// ─── 言語切替UI（i18n ツールバー/App.tsx フェーズ）─────────────────────
describe('App — 言語切替ボタン', () => {
  it('「日本語」「English」がフルテキストで常に（locale に関わらず）表示される', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByTestId('gantt-chart-stub')).toBeTruthy());
    expect(screen.getByText('日本語')).toBeTruthy();
    expect(screen.getByText('English')).toBeTruthy();

    fireEvent.click(screen.getByText('English'));
    expect(useTaskStore.getState().locale).toBe('en');
    expect(screen.getByText('日本語')).toBeTruthy();
    expect(screen.getByText('English')).toBeTruthy();
  });

  it('既定は ja。English ボタンをクリックすると setLocale("en") が呼ばれる', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByTestId('gantt-chart-stub')).toBeTruthy());
    expect(useTaskStore.getState().locale).toBe('ja');

    fireEvent.click(screen.getByText('English'));
    expect(useTaskStore.getState().locale).toBe('en');

    fireEvent.click(screen.getByText('日本語'));
    expect(useTaskStore.getState().locale).toBe('ja');
  });
});

// ─── テーマ切替ボタンの title（i18n ツールバー/App.tsx フェーズ）───────
describe('App — テーマ切替ボタンの title', () => {
  it('既定(ja)ではテーマボタンの title が日本語で表示される', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByTestId('gantt-chart-stub')).toBeTruthy());
    expect(screen.getByTitle('ライトモード')).toBeTruthy();
    expect(screen.getByTitle('ダークモード')).toBeTruthy();
    expect(screen.getByTitle('システム設定に従う')).toBeTruthy();
  });

  it('locale="en" のときテーマボタンの title が英語で表示される', async () => {
    useTaskStore.setState({ locale: 'en' });
    render(<App />);
    await waitFor(() => expect(screen.getByTestId('gantt-chart-stub')).toBeTruthy());
    expect(screen.getByTitle('Light mode')).toBeTruthy();
    expect(screen.getByTitle('Dark mode')).toBeTruthy();
    expect(screen.getByTitle('Follow system setting')).toBeTruthy();
  });
});

// ─── 言語切替中に mount-effect の fetch が失敗した場合のトースト言語 ──────
describe('App — 言語切替中に保留中の fetch が失敗した場合のトースト言語', () => {
  it('バージョン取得が失敗する前にlocaleをenへ切り替えると、トーストは英語で表示される', async () => {
    routerState.failHealth = true;
    render(<App />);
    // fetch はまだ解決していない（マイクロタスク未消化）うちに同期的に locale を切り替える
    useTaskStore.setState({ locale: 'en' });

    await waitFor(() => {
      const toasts = useToastStore.getState().toasts;
      expect(toasts.some(t => t.type === 'error' && t.message.includes('Failed to fetch version info'))).toBe(true);
    });
  });

  it('リソース設定取得が失敗する前にlocaleをenへ切り替えると、トーストは英語で表示される', async () => {
    routerState.failSettings = true;
    render(<App />);
    useTaskStore.setState({ locale: 'en' });

    await waitFor(() => {
      const toasts = useToastStore.getState().toasts;
      expect(toasts.some(t => t.type === 'error' && t.message.includes('Failed to fetch resource settings'))).toBe(true);
    });
  });
});

// ─── App.tsx 本体の残り文言（i18n ツールバー/App.tsx フェーズ）────────
describe('App — 本体文言の i18n（locale="en"）', () => {
  it('「+ プロジェクト」ボタンが英語表示される', async () => {
    useTaskStore.setState({ locale: 'en' });
    render(<App />);
    await waitFor(() => expect(screen.getByTestId('gantt-chart-stub')).toBeTruthy());
    expect(screen.getByText('+ Project')).toBeTruthy();
  });

  it('プロジェクト削除確認ダイアログがプロジェクト名を埋め込んだ英語文言になる', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    useTaskStore.setState({ locale: 'en' });
    render(<App />);
    await waitFor(() => expect(screen.getByTestId('gantt-chart-stub')).toBeTruthy());

    const tab = screen.getByText('プロジェクト1');
    fireEvent.contextMenu(tab);
    fireEvent.click(screen.getByText('削除'));

    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('Delete project "プロジェクト1"?'));
  });
});
