// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { TaskTooltip } from '../components/Gantt/TaskTooltip';
import type { Task } from '../types/task';

afterEach(() => { cleanup(); });

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 't1', projectId: 'p1', parentId: null,
    title: 'テストタスク', summary: '', description: '',
    status: 'todo', priority: 'medium', progress: 0,
    assignee: '', startDate: null, endDate: null,
    isMilestone: false, predecessors: [], seq: 1, order: 1,
    createdAt: '', updatedAt: '',
    titleColor: null, titleBgColor: null, estimateMinutes: null,
    ...overrides,
  };
}

const POS = { x: 100, y: 100 };

describe('TaskTooltip 表示制御', () => {
  it('visible=false なら何もレンダリングしない', () => {
    render(<TaskTooltip task={makeTask({ summary: 'hello' })} pos={POS} visible={false} />);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('summary も description も空なら visible=true でも何もレンダリングしない', () => {
    render(<TaskTooltip task={makeTask()} pos={POS} visible={true} />);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('summary があれば表示される', () => {
    render(<TaskTooltip task={makeTask({ summary: 'テストサマリ' })} pos={POS} visible={true} />);
    expect(screen.getByRole('tooltip')).toBeTruthy();
    expect(screen.getByText('テストサマリ')).toBeTruthy();
  });

  it('description があれば表示される', () => {
    render(<TaskTooltip task={makeTask({ description: 'テスト説明文' })} pos={POS} visible={true} />);
    expect(screen.getByRole('tooltip')).toBeTruthy();
    expect(screen.getByText('テスト説明文')).toBeTruthy();
  });

  it('summary と description の両方を表示する', () => {
    render(<TaskTooltip task={makeTask({ summary: 'サマリ', description: '説明' })} pos={POS} visible={true} />);
    expect(screen.getByText('サマリ')).toBeTruthy();
    expect(screen.getByText('説明')).toBeTruthy();
  });
});

describe('TaskTooltip Markdown レンダリング', () => {
  it('**bold** が <strong> に変換される', () => {
    render(<TaskTooltip task={makeTask({ summary: '**太字テスト**' })} pos={POS} visible={true} />);
    const strong = document.querySelector('strong');
    expect(strong).toBeTruthy();
    expect(strong?.textContent).toBe('太字テスト');
  });

  it('*italic* が <em> に変換される', () => {
    render(<TaskTooltip task={makeTask({ summary: '*イタリック*' })} pos={POS} visible={true} />);
    expect(document.querySelector('em')).toBeTruthy();
  });

  it('description の markdown もレンダリングされる', () => {
    render(<TaskTooltip task={makeTask({ description: '## 見出し' })} pos={POS} visible={true} />);
    expect(document.querySelector('h2')).toBeTruthy();
  });

  it('タスクタイトルがツールチップヘッダーとして表示される', () => {
    render(<TaskTooltip task={makeTask({ summary: 'サマリ' })} pos={POS} visible={true} />);
    expect(screen.getByText('テストタスク')).toBeTruthy();
  });
});
