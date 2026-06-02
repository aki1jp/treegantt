// @vitest-environment jsdom
/**
 * ProjectTabs — プロジェクトタブのバツボタン廃止・右クリックメニュー削除
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, screen } from '@testing-library/react';
import { ProjectTabs } from '../components/ProjectTabs/ProjectTabs';
import type { Project } from '../types/task';

afterEach(() => { cleanup(); });

function makeProject(id: string, name: string): Project {
  return { id, name, createdAt: '2026-01-01' };
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
