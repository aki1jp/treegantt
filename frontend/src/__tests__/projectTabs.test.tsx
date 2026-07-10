// @vitest-environment jsdom
/**
 * ProjectTabs — プロジェクトタブのバツボタン廃止・右クリックメニュー削除
 */
import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { render, cleanup, fireEvent, screen } from '@testing-library/react';
import { ProjectTabs } from '../components/ProjectTabs/ProjectTabs';
import { useTaskStore } from '../store/taskStore';
import type { Project } from '../types/task';

afterEach(() => { cleanup(); });

function makeProject(id: string, name: string, color?: string | null): Project {
  return { id, name, createdAt: '2026-01-01', color: color ?? null, capacityMinutesPerDay: null, workingDays: null };
}

const NOOP = vi.fn();

describe('ProjectTabs — バツボタンが表示されない', () => {
  it('✕ ボタンが DOM に存在しない', () => {
    const projects = [makeProject('p1', 'Alpha'), makeProject('p2', 'Beta')];
    render(
      <ProjectTabs
        projects={projects}
        currentProject={projects[0]}
        onSelect={NOOP}
        onDelete={NOOP}
        onRename={NOOP}
      />
    );
    // ✕ / × の文字を持つボタンがない
    expect(screen.queryByText('✕')).toBeNull();
    expect(screen.queryByText('×')).toBeNull();
    expect(screen.queryByTitle('プロジェクトを削除')).toBeNull();
  });
});

describe('ProjectTabs — 右クリックでコンテキストメニューが表示される', () => {
  it('タブを右クリックするとコンテキストメニューが現れる', () => {
    const projects = [makeProject('p1', 'Alpha')];
    render(
      <ProjectTabs
        projects={projects}
        currentProject={projects[0]}
        onSelect={NOOP}
        onDelete={NOOP}
        onRename={NOOP}
      />
    );
    const tab = screen.getByText('Alpha');
    fireEvent.contextMenu(tab);
    expect(screen.getByText('削除')).toBeTruthy();
  });

  it('コンテキストメニューの削除をクリックすると onDelete が該当プロジェクトで呼ばれる', () => {
    const onDelete = vi.fn();
    const projects = [makeProject('p1', 'Alpha'), makeProject('p2', 'Beta')];
    render(
      <ProjectTabs
        projects={projects}
        currentProject={projects[0]}
        onSelect={NOOP}
        onDelete={onDelete}
        onRename={NOOP}
      />
    );
    fireEvent.contextMenu(screen.getByText('Beta'));
    fireEvent.click(screen.getByText('削除'));
    expect(onDelete).toHaveBeenCalledWith(projects[1]);
  });

  it('右クリック前はコンテキストメニューが表示されない', () => {
    const projects = [makeProject('p1', 'Alpha')];
    render(
      <ProjectTabs
        projects={projects}
        currentProject={projects[0]}
        onSelect={NOOP}
        onDelete={NOOP}
        onRename={NOOP}
      />
    );
    expect(screen.queryByText('削除')).toBeNull();
  });

  it('コンテキストメニューに「名前を変更」が表示される', () => {
    const projects = [makeProject('p1', 'Alpha')];
    render(
      <ProjectTabs
        projects={projects}
        currentProject={projects[0]}
        onSelect={NOOP}
        onDelete={NOOP}
        onRename={NOOP}
      />
    );
    fireEvent.contextMenu(screen.getByText('Alpha'));
    expect(screen.getByText('名前を変更')).toBeTruthy();
  });

  it('「名前を変更」をクリックすると onRename が呼ばれる', () => {
    const onRename = vi.fn();
    const projects = [makeProject('p1', 'Alpha')];
    render(
      <ProjectTabs
        projects={projects}
        currentProject={projects[0]}
        onSelect={NOOP}
        onDelete={NOOP}
        onRename={onRename}
      />
    );
    fireEvent.contextMenu(screen.getByText('Alpha'));
    fireEvent.click(screen.getByText('名前を変更'));
    expect(onRename).toHaveBeenCalledWith(projects[0]);
  });

  it('mousedown でコンテキストメニューが閉じる', () => {
    const projects = [makeProject('p1', 'Alpha')];
    const { container } = render(
      <ProjectTabs
        projects={projects}
        currentProject={projects[0]}
        onSelect={NOOP}
        onDelete={NOOP}
        onRename={NOOP}
      />
    );
    fireEvent.contextMenu(screen.getByText('Alpha'));
    expect(screen.getByText('削除')).toBeTruthy();
    fireEvent.mouseDown(container);
    expect(screen.queryByText('削除')).toBeNull();
  });
});

// ── Plan A: スタイル強化 ──────────────────────────────────────
describe('ProjectTabs — 長いプロジェクト名の truncate', () => {
  it('title 属性にプロジェクト名が設定される', () => {
    const name = 'とても長いプロジェクト名前です';
    const projects = [makeProject('p1', name)];
    render(
      <ProjectTabs
        projects={projects}
        currentProject={projects[0]}
        onSelect={NOOP}
        onDelete={NOOP}
        onRename={NOOP}
      />
    );
    const btn = screen.getByTitle(name);
    expect(btn).toBeTruthy();
  });
});

// ── Plan B: タスク件数バッジ ──────────────────────────────────
describe('ProjectTabs — タスク件数バッジ', () => {
  it('taskCounts が渡されると件数が表示される', () => {
    const projects = [makeProject('p1', 'Alpha'), makeProject('p2', 'Beta')];
    render(
      <ProjectTabs
        projects={projects}
        currentProject={projects[0]}
        onSelect={NOOP}
        onDelete={NOOP}
        onRename={NOOP}
        taskCounts={{ p1: 5, p2: 0 }}
      />
    );
    expect(screen.getByText('5')).toBeTruthy();
    expect(screen.getByText('0')).toBeTruthy();
  });

  it('taskCounts が未指定のときはバッジが表示されない', () => {
    const projects = [makeProject('p1', 'Alpha')];
    render(
      <ProjectTabs
        projects={projects}
        currentProject={projects[0]}
        onSelect={NOOP}
        onDelete={NOOP}
        onRename={NOOP}
      />
    );
    // 数字だけのテキストノードがないことを確認
    expect(screen.queryByText('0')).toBeNull();
  });
});

// ── Plan C: プロジェクトカラー ────────────────────────────────
describe('ProjectTabs — プロジェクトカラー', () => {
  it('color があるとき非アクティブタブ背景にカラーが設定される', () => {
    const projects = [makeProject('p1', 'Active'), makeProject('p2', 'Red', '#ef4444')];
    const { container } = render(
      <ProjectTabs
        projects={projects}
        currentProject={projects[0]}
        onSelect={NOOP}
        onDelete={NOOP}
        onRename={NOOP}
      />
    );
    // 2番目のタブ（非アクティブ、color=#ef4444）
    const tabWrapper = container.firstElementChild?.children[1] as HTMLElement | null;
    // JSDOM は #ef4444 → rgb(239, 68, 68) に正規化する
    expect(tabWrapper?.style.background).toMatch(/ef4444|rgb\(239,\s*68,\s*68\)/);
  });

  it('color がないとき非アクティブタブ背景にカラーが含まれない', () => {
    const projects = [makeProject('p1', 'Active'), makeProject('p2', 'NoColor', null)];
    const { container } = render(
      <ProjectTabs
        projects={projects}
        currentProject={projects[0]}
        onSelect={NOOP}
        onDelete={NOOP}
        onRename={NOOP}
      />
    );
    const tabWrapper = container.firstElementChild?.children[1] as HTMLElement | null;
    expect(tabWrapper?.style.background ?? '').not.toContain('#');
  });

  it('右クリックメニューに「色を変更」が表示される', () => {
    const projects = [makeProject('p1', 'Alpha')];
    render(
      <ProjectTabs
        projects={projects}
        currentProject={projects[0]}
        onSelect={NOOP}
        onDelete={NOOP}
        onRename={NOOP}
        onUpdateColor={NOOP}
      />
    );
    fireEvent.contextMenu(screen.getByText('Alpha'));
    expect(screen.getByText('色を変更')).toBeTruthy();
  });

  it('色スウォッチをクリックすると onUpdateColor が呼ばれる', () => {
    const onUpdateColor = vi.fn();
    const projects = [makeProject('p1', 'Alpha')];
    render(
      <ProjectTabs
        projects={projects}
        currentProject={projects[0]}
        onSelect={NOOP}
        onDelete={NOOP}
        onRename={NOOP}
        onUpdateColor={onUpdateColor}
      />
    );
    fireEvent.contextMenu(screen.getByText('Alpha'));
    // 「色を変更」セクションのスウォッチ（title="#ef4444"）をクリック
    const swatch = screen.getByTitle('#ef4444');
    fireEvent.click(swatch);
    expect(onUpdateColor).toHaveBeenCalledWith(projects[0], '#ef4444');
  });
});

// ── v2.55: localStorage 順序管理 ────────────────────────────────
describe('ProjectTabs — localStorage 順序管理', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => { cleanup(); localStorage.clear(); });

  it('localStorage に保存された順序でタブが描画される', () => {
    localStorage.setItem('treegantt-project-order', JSON.stringify(['p2', 'p1']));
    const projects = [makeProject('p1', 'Alpha'), makeProject('p2', 'Beta')];
    render(
      <ProjectTabs projects={projects} currentProject={projects[0]}
        onSelect={NOOP} onDelete={NOOP} onRename={NOOP} />
    );
    // tab buttons have title={p.name}
    const tabBtns = Array.from(document.querySelectorAll('button[title]'))
      .filter(b => ['Alpha', 'Beta'].includes(b.getAttribute('title') ?? ''));
    expect(tabBtns[0].getAttribute('title')).toBe('Beta');
    expect(tabBtns[1].getAttribute('title')).toBe('Alpha');
  });

  it('ドラッグ後に localStorage が新しい順序で更新される', () => {
    const projects = [makeProject('p1', 'Alpha'), makeProject('p2', 'Beta')];
    render(
      <ProjectTabs projects={projects} currentProject={projects[0]}
        onSelect={NOOP} onDelete={NOOP} onRename={NOOP} />
    );
    const draggables = document.querySelectorAll('[draggable="true"]');
    expect(draggables.length).toBeGreaterThan(0);
    fireEvent.dragStart(draggables[0]);
    fireEvent.dragOver(draggables[1]);
    fireEvent.drop(draggables[1]);
    const stored = localStorage.getItem('treegantt-project-order');
    expect(stored).not.toBeNull();
    const order = JSON.parse(stored!);
    expect(order).toContain('p1');
    expect(order).toContain('p2');
  });
});

// ── v2.55: ドロップダウン収納 ────────────────────────────────────
describe('ProjectTabs — ドロップダウン収納', () => {
  let savedRO: typeof globalThis.ResizeObserver;
  beforeEach(() => { savedRO = globalThis.ResizeObserver; localStorage.clear(); });
  afterEach(() => { globalThis.ResizeObserver = savedRO; cleanup(); localStorage.clear(); });

  // containerWidth=200: Alpha(88px) は収まるが Beta+Gamma はドロップダウンへ
  function setupRO(width: number) {
    globalThis.ResizeObserver = class {
      private cb: ResizeObserverCallback;
      constructor(cb: ResizeObserverCallback) { this.cb = cb; }
      observe(_el: Element) {
        this.cb([{ contentRect: { width } } as ResizeObserverEntry], this as unknown as ResizeObserver);
      }
      disconnect() {}
      unobserve() {}
    } as unknown as typeof ResizeObserver;
  }

  it('コンテナ幅が小さいときオーバーフロータブがドロップダウンに収納される', () => {
    setupRO(200);
    const projects = [
      makeProject('p1', 'Alpha'), makeProject('p2', 'Beta'), makeProject('p3', 'Gamma'),
    ];
    render(
      <ProjectTabs projects={projects} currentProject={projects[0]}
        onSelect={NOOP} onDelete={NOOP} onRename={NOOP} />
    );
    expect(screen.getByTestId('overflow-btn')).toBeTruthy();
  });

  it('アクティブプロジェクトがオーバーフローするとき、ボタンラベルにプロジェクト名が表示される', () => {
    setupRO(200);
    const projects = [
      makeProject('p1', 'Alpha'), makeProject('p2', 'Beta'), makeProject('p3', 'Gamma'),
    ];
    render(
      <ProjectTabs projects={projects} currentProject={projects[2]}
        onSelect={NOOP} onDelete={NOOP} onRename={NOOP} />
    );
    const btn = screen.getByTestId('overflow-btn');
    expect(btn.textContent).toContain('Gamma');
  });

  it('ドロップダウンを開くとオーバーフロータブ一覧が表示される', () => {
    setupRO(200);
    const projects = [
      makeProject('p1', 'Alpha'), makeProject('p2', 'Beta'), makeProject('p3', 'Gamma'),
    ];
    render(
      <ProjectTabs projects={projects} currentProject={projects[0]}
        onSelect={NOOP} onDelete={NOOP} onRename={NOOP} />
    );
    fireEvent.click(screen.getByTestId('overflow-btn'));
    expect(screen.getByTestId('overflow-dropdown')).toBeTruthy();
  });

  it('ドロップダウン内タブをクリックすると onSelect が呼ばれる', () => {
    setupRO(200);
    const onSelect = vi.fn();
    const projects = [
      makeProject('p1', 'Alpha'), makeProject('p2', 'Beta'), makeProject('p3', 'Gamma'),
    ];
    render(
      <ProjectTabs projects={projects} currentProject={projects[0]}
        onSelect={onSelect} onDelete={NOOP} onRename={NOOP} />
    );
    fireEvent.click(screen.getByTestId('overflow-btn'));
    const items = screen.getByTestId('overflow-dropdown').querySelectorAll('button');
    fireEvent.click(items[0]);
    expect(onSelect).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 多言語対応（i18n）: locale: 'en' でのスモークテスト（既存の ja テストは変更しない）
describe('ProjectTabs の多言語対応（locale: en）', () => {
  afterEach(() => {
    useTaskStore.setState({ locale: 'ja' });
    cleanup();
  });

  it('右クリックメニュー項目が英語表示になる（名前を変更/色を変更/削除）', () => {
    useTaskStore.setState({ locale: 'en' });
    const projects = [makeProject('p1', 'Alpha')];
    render(
      <ProjectTabs
        projects={projects}
        currentProject={projects[0]}
        onSelect={NOOP}
        onDelete={NOOP}
        onRename={NOOP}
        onUpdateColor={NOOP}
        onProjectSettings={NOOP}
      />
    );
    fireEvent.contextMenu(screen.getByText('Alpha'));
    expect(screen.getByText('Rename')).toBeTruthy();
    expect(screen.getByText('Change Color')).toBeTruthy();
    expect(screen.getByText('Resource Settings')).toBeTruthy();
    expect(screen.getByText('Delete')).toBeTruthy();
  });

  it('色スウォッチの「なし」が英語表示になる', () => {
    useTaskStore.setState({ locale: 'en' });
    const projects = [makeProject('p1', 'Alpha')];
    render(
      <ProjectTabs
        projects={projects}
        currentProject={projects[0]}
        onSelect={NOOP}
        onDelete={NOOP}
        onRename={NOOP}
        onUpdateColor={NOOP}
      />
    );
    fireEvent.contextMenu(screen.getByText('Alpha'));
    expect(screen.getByTitle('None')).toBeTruthy();
  });

  it('オーバーフロードロップダウンボタンの件数表示が英語表示になる', () => {
    useTaskStore.setState({ locale: 'en' });
    const savedRO = globalThis.ResizeObserver;
    globalThis.ResizeObserver = class {
      private cb: ResizeObserverCallback;
      constructor(cb: ResizeObserverCallback) { this.cb = cb; }
      observe(_el: Element) {
        this.cb([{ contentRect: { width: 200 } } as ResizeObserverEntry], this as unknown as ResizeObserver);
      }
      disconnect() {}
      unobserve() {}
    } as unknown as typeof ResizeObserver;
    localStorage.clear();
    const projects = [
      makeProject('p1', 'Alpha'), makeProject('p2', 'Beta'), makeProject('p3', 'Gamma'),
    ];
    render(
      <ProjectTabs projects={projects} currentProject={projects[0]}
        onSelect={NOOP} onDelete={NOOP} onRename={NOOP} />
    );
    const btn = screen.getByTestId('overflow-btn');
    expect(btn.textContent).toContain('more');
    globalThis.ResizeObserver = savedRO;
    localStorage.clear();
  });
});
