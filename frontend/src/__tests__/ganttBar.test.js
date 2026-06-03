import { jsx as _jsx } from "react/jsx-runtime";
// @vitest-environment jsdom
/**
 * GanttBar — 親タスク非インタラクティブデザインテスト
 *
 * 親タスク（isParent=true）のバーにはリサイズハンドルを表示しない。
 * 非親タスクには左右2つのハンドルを表示する。
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { GanttBar } from '../components/Gantt/GanttBar';
const BASE_TASK = {
    id: 't1', projectId: 'p1', parentId: null,
    title: 'テストタスク', summary: '', description: '',
    status: 'todo', priority: 'medium', progress: 0, assignee: '',
    startDate: '2026-05-01', endDate: '2026-05-31',
    isMilestone: false, predecessors: [], seq: 1, order: 1,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
};
const MIN = new Date('2026-05-01');
const NOOP = vi.fn();
function renderBar(isParent) {
    return render(_jsx("svg", { children: _jsx(GanttBar, { task: BASE_TASK, minDate: MIN, zoom: "month", rowIndex: 0, isParent: isParent, onMoveStart: NOOP, onResizeLeftStart: NOOP, onResizeRightStart: NOOP, onClick: NOOP }) }));
}
describe('GanttBar 非親タスク', () => {
    it('リサイズハンドル（ew-resize）が2つ描画される', () => {
        const { container } = renderBar(false);
        const handles = Array.from(container.querySelectorAll('rect')).filter(r => r.style.cursor === 'ew-resize');
        expect(handles.length).toBe(2);
    });
    it('移動ゾーンの cursor は "move"', () => {
        const { container } = renderBar(false);
        const moveZone = Array.from(container.querySelectorAll('rect')).find(r => r.style.cursor === 'move');
        expect(moveZone).toBeTruthy();
    });
});
describe('GanttBar 親タスク（isParent=true）— サマリーバーデザイン', () => {
    it('リサイズハンドルが描画されない', () => {
        const { container } = renderBar(true);
        const handles = Array.from(container.querySelectorAll('rect')).filter(r => r.style.cursor === 'ew-resize');
        expect(handles.length).toBe(0);
    });
    it('下向き三角（突起）が左右に2つ描画される', () => {
        const { container } = renderBar(true);
        const polygons = container.querySelectorAll('polygon');
        expect(polygons.length).toBe(2);
    });
    it('サマリーバーの g 要素に cursor: pointer が設定される', () => {
        const { container } = renderBar(true);
        const g = container.querySelector('[data-task-id]');
        expect(g?.style.cursor).toBe('pointer');
    });
});
