// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { GanttChart } from '../components/Gantt/GanttChart';
import { useTaskStore } from '../store/taskStore';

const NOOP = vi.fn();
afterEach(() => { cleanup(); });
beforeEach(() => {
  localStorage.clear();
  useTaskStore.setState({ tasks: [], wbsColWidths: { title: 180, assignee: 76 } });
});

function mount() {
  return render(
    <GanttChart projectId="p1" onEditTask={NOOP} onDeleteTask={NOOP} onInlineUpdate={NOOP}
      onQuickAdd={NOOP} onAddSubTask={NOOP} onReorder={NOOP} onCopyInsert={NOOP} />
  );
}

describe('WBS 列幅はプロジェクト切替（GanttChart の再マウント）をまたいで維持される', () => {
  it('列幅をドラッグで変更→アンマウント→再マウントしても維持', () => {
    const first = mount();
    const handle = first.container.querySelector('[style*="col-resize"]') as HTMLElement;
    expect(handle).toBeTruthy();
    fireEvent.mouseDown(handle, { clientX: 100 });
    fireEvent.mouseMove(window, { clientX: 150 });
    fireEvent.mouseUp(window);
    const widened = useTaskStore.getState().wbsColWidths.title;
    expect(widened).toBe(230);
    first.unmount();
    mount();
    expect(useTaskStore.getState().wbsColWidths.title).toBe(230);
  });

  it('非永続（localStorage に保存しない）', () => {
    useTaskStore.setState({ wbsColWidths: { title: 300, assignee: 76 } });
    expect(localStorage.getItem('treegantt-ui') ?? '').not.toContain('wbsColWidths');
    expect(JSON.stringify(Object.entries(localStorage))).not.toContain('wbsColWidths');
  });
});
