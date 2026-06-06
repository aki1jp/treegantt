// @vitest-environment jsdom
/**
 * ProjectTabs — プロジェクトタブのバツボタン廃止・右クリックメニュー削除
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, screen } from '@testing-library/react';
import { ProjectTabs } from '../components/ProjectTabs/ProjectTabs';
import type { Project } from '../types/task';

afterEach(() => { cleanup(); });

function makeProject(id: string, name: string, color?: string | null): Project {
  return { id, name, createdAt: '2026-01-01', color: color ?? null };
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
  it('color があるとき色バーが data-color-bar 属性付きで描画される', () => {
    const projects = [makeProject('p1', 'Red', '#ef4444')];
    const { container } = render(
      <ProjectTabs
        projects={projects}
        currentProject={projects[0]}
        onSelect={NOOP}
        onDelete={NOOP}
        onRename={NOOP}
      />
    );
    const bar = container.querySelector('[data-color-bar]');
    expect(bar).not.toBeNull();
  });

  it('color がないとき色バーが表示されない', () => {
    const projects = [makeProject('p1', 'NoColor', null)];
    const { container } = render(
      <ProjectTabs
        projects={projects}
        currentProject={projects[0]}
        onSelect={NOOP}
        onDelete={NOOP}
        onRename={NOOP}
      />
    );
    expect(container.querySelector('[data-color-bar]')).toBeNull();
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
