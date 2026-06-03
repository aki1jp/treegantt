import { jsx as _jsx } from "react/jsx-runtime";
// @vitest-environment jsdom
/**
 * TaskModal — Markdown プレビュータブ / 日付バリデーション / backdrop 閉じる挙動
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent, screen, act } from '@testing-library/react';
import { TaskModal } from '../components/TaskModal/TaskModal';
afterEach(() => { cleanup(); });
function makeTask(overrides = {}) {
    return {
        id: 't1', projectId: 'p1', parentId: null,
        title: 'テストタスク', summary: '', description: '',
        status: 'todo', priority: 'medium', progress: 0,
        assignee: '', startDate: null, endDate: null,
        isMilestone: false, predecessors: [], seq: 1, order: 1,
        createdAt: '', updatedAt: '',
        ...overrides,
    };
}
const NOOP = vi.fn();
function renderModal(task = null, description = '') {
    const t = task ?? (description ? makeTask({ description }) : null);
    return render(_jsx(TaskModal, { task: t, allTasks: [], onSave: NOOP, onClose: NOOP }));
}
describe('TaskModal — 説明フィールドのタブ切り替え', () => {
    it('デフォルトでは「編集」タブがアクティブで textarea が表示される', () => {
        renderModal(makeTask({ description: '## 見出し' }));
        expect(screen.getByRole('tab', { name: '編集' })).toBeTruthy();
        expect(screen.getByRole('tab', { name: 'プレビュー' })).toBeTruthy();
        // textarea が表示されている
        expect(screen.getByRole('textbox', { name: /説明/ })).toBeTruthy();
    });
    it('「プレビュー」タブをクリックすると textarea が消え Markdown がレンダリングされる', () => {
        renderModal(makeTask({ description: '## 見出し\n\nテスト本文' }));
        fireEvent.click(screen.getByRole('tab', { name: 'プレビュー' }));
        // textarea は非表示
        expect(screen.queryByRole('textbox', { name: /説明/ })).toBeNull();
        // Markdown がレンダリングされた h2（"見出し"テキスト）が存在する
        expect(screen.getByText('見出し', { selector: 'h2' })).toBeTruthy();
    });
    it('「プレビュー」→「編集」に戻ると textarea が再表示される', () => {
        renderModal(makeTask({ description: '本文' }));
        fireEvent.click(screen.getByRole('tab', { name: 'プレビュー' }));
        fireEvent.click(screen.getByRole('tab', { name: '編集' }));
        expect(screen.getByRole('textbox', { name: /説明/ })).toBeTruthy();
    });
    it('description が空のときプレビューにプレースホルダーが表示される', () => {
        renderModal(makeTask({ description: '' }));
        fireEvent.click(screen.getByRole('tab', { name: 'プレビュー' }));
        expect(screen.getByText('説明がありません')).toBeTruthy();
    });
    it('プレビューで箇条書きがレンダリングされる', () => {
        renderModal(makeTask({ description: '- 項目A\n- 項目B' }));
        fireEvent.click(screen.getByRole('tab', { name: 'プレビュー' }));
        expect(screen.getByRole('list')).toBeTruthy();
        expect(screen.getByText('項目A')).toBeTruthy();
    });
});
describe('TaskModal — 開始日・終了日バリデーション', () => {
    it('終了日 < 開始日のとき保存すると日付が自動スワップされる', () => {
        const onSave = vi.fn();
        render(_jsx(TaskModal, { task: makeTask({ startDate: '2026-06-10', endDate: '2026-06-01' }), allTasks: [], onSave: onSave, onClose: NOOP }));
        fireEvent.click(screen.getByRole('button', { name: /保存/ }));
        expect(onSave).toHaveBeenCalledOnce();
        const saved = onSave.mock.calls[0][0];
        expect(saved.startDate).toBe('2026-06-01');
        expect(saved.endDate).toBe('2026-06-10');
    });
    it('終了日 >= 開始日のとき日付はそのまま保存される', () => {
        const onSave = vi.fn();
        render(_jsx(TaskModal, { task: makeTask({ startDate: '2026-06-01', endDate: '2026-06-10' }), allTasks: [], onSave: onSave, onClose: NOOP }));
        fireEvent.click(screen.getByRole('button', { name: /保存/ }));
        const saved = onSave.mock.calls[0][0];
        expect(saved.startDate).toBe('2026-06-01');
        expect(saved.endDate).toBe('2026-06-10');
    });
    it('開始日のみ設定のとき終了日は null のまま', () => {
        const onSave = vi.fn();
        render(_jsx(TaskModal, { task: makeTask({ startDate: '2026-06-01', endDate: null }), allTasks: [], onSave: onSave, onClose: NOOP }));
        fireEvent.click(screen.getByRole('button', { name: /保存/ }));
        const saved = onSave.mock.calls[0][0];
        expect(saved.startDate).toBe('2026-06-01');
        expect(saved.endDate).toBeNull();
    });
});
describe('TaskModal — backdrop クリックの閉じる/閉じない挙動', () => {
    it('既存タスク・変更なし: backdrop クリックで onClose が呼ばれる', () => {
        const onClose = vi.fn();
        const { container } = render(_jsx(TaskModal, { task: makeTask(), allTasks: [], onSave: NOOP, onClose: onClose }));
        fireEvent.click(container.firstChild);
        expect(onClose).toHaveBeenCalledOnce();
    });
    it('新規タスク・変更なし: backdrop クリックで onClose が呼ばれる', () => {
        const onClose = vi.fn();
        const { container } = render(_jsx(TaskModal, { task: null, allTasks: [], onSave: NOOP, onClose: onClose }));
        fireEvent.click(container.firstChild);
        expect(onClose).toHaveBeenCalledOnce();
    });
    it('タイトル変更後: backdrop クリックで onClose が呼ばれない', () => {
        const onClose = vi.fn();
        const { container } = render(_jsx(TaskModal, { task: makeTask({ title: '元タイトル' }), allTasks: [], onSave: NOOP, onClose: onClose }));
        fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: '変更後タイトル' } });
        fireEvent.click(container.firstChild);
        expect(onClose).not.toHaveBeenCalled();
    });
    it('新規タスク: タイトル入力後 backdrop クリックで onClose が呼ばれない', () => {
        const onClose = vi.fn();
        const { container } = render(_jsx(TaskModal, { task: null, allTasks: [], onSave: NOOP, onClose: onClose }));
        fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: '新しいタスク' } });
        fireEvent.click(container.firstChild);
        expect(onClose).not.toHaveBeenCalled();
    });
    it('進捗変更後: backdrop クリックで onClose が呼ばれない', () => {
        const onClose = vi.fn();
        const { container } = render(_jsx(TaskModal, { task: makeTask({ progress: 0 }), allTasks: [], onSave: NOOP, onClose: onClose }));
        fireEvent.change(screen.getByRole('slider'), { target: { value: '50' } });
        fireEvent.click(container.firstChild);
        expect(onClose).not.toHaveBeenCalled();
    });
});
describe('TaskModal — 先行タスク・親タスクの # 番号は seq (不変) で表示・解決される', () => {
    function makeTaskWithSeq(id, title, seq, order) {
        return {
            id, projectId: 'p1', parentId: null,
            title, summary: '', description: '',
            status: 'todo', priority: 'medium', progress: 0,
            assignee: '', startDate: null, endDate: null,
            isMilestone: false, predecessors: [], seq, order,
            createdAt: '', updatedAt: '',
        };
    }
    it('先行タスク一覧で表示される # は seq であり order ではない', () => {
        // seq=3, order=1 のタスク（並び替え後に order が変わった状態）
        const taskA = makeTaskWithSeq('tA', 'タスクA', 3, 1);
        const editTarget = makeTaskWithSeq('tEdit', '編集対象', 5, 2);
        const { container } = render(_jsx(TaskModal, { task: editTarget, allTasks: [taskA, editTarget], onSave: NOOP, onClose: NOOP }));
        // チェックボックスリストのラベル内 span に "#3"（seq=3）が表示される
        const seqSpans = container.querySelectorAll('span[style*="monospace"]');
        const texts = Array.from(seqSpans).map(s => s.textContent);
        expect(texts).toContain('#3');
        expect(texts).not.toContain('#1');
    });
    it('テキスト入力で seq 番号を入力すると正しい先行タスクが選択される', () => {
        const onSave = vi.fn();
        // taskA: seq=3, order=1（並び替え後）
        const taskA = makeTaskWithSeq('tA', 'タスクA', 3, 1);
        const editTarget = makeTaskWithSeq('tEdit', '編集対象', 5, 2);
        render(_jsx(TaskModal, { task: editTarget, allTasks: [taskA, editTarget], onSave: onSave, onClose: NOOP }));
        // seq=3 の番号「3」を入力 → taskA が先行タスクに選択される
        const input = screen.getByPlaceholderText(/# で指定/);
        fireEvent.change(input, { target: { value: '3' } });
        fireEvent.click(screen.getByRole('button', { name: /保存/ }));
        const saved = onSave.mock.calls[0][0];
        expect(saved.predecessors).toContain('tA');
    });
    it('既存の先行タスクを開いたとき predecessorText は seq で初期化される', () => {
        // taskA: seq=3, order=1
        const taskA = makeTaskWithSeq('tA', 'タスクA', 3, 1);
        const editTarget = makeTaskWithSeq('tEdit', '編集対象', 5, 2);
        const taskWithPred = { ...editTarget, predecessors: ['tA'] };
        render(_jsx(TaskModal, { task: taskWithPred, allTasks: [taskA, editTarget], onSave: NOOP, onClose: NOOP }));
        // 入力欄に "3"（seq=3）が表示されるべき。"1"（order=1）ではない
        const input = screen.getByPlaceholderText(/# で指定/);
        expect(input.value).toBe('3');
    });
    it('親タスク select で表示される # は seq であり order ではない', () => {
        // taskA: seq=3, order=1
        const taskA = makeTaskWithSeq('tA', 'タスクA', 3, 1);
        const editTarget = makeTaskWithSeq('tEdit', '編集対象', 5, 2);
        render(_jsx(TaskModal, { task: editTarget, allTasks: [taskA, editTarget], onSave: NOOP, onClose: NOOP }));
        const option = screen.getByRole('option', { name: /タスクA/ });
        // option のラベルが "#3 タスクA"（seq=3）であること
        expect(option.textContent).toContain('#3');
        expect(option.textContent).not.toContain('#1');
    });
});
describe('TaskModal — backdrop クリック時の shake アニメーション', () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); });
    it('変更なしで backdrop クリック → shake なし・onClose が呼ばれる', () => {
        const onClose = vi.fn();
        const { container } = render(_jsx(TaskModal, { task: makeTask(), allTasks: [], onSave: NOOP, onClose: onClose }));
        fireEvent.click(container.firstChild);
        expect(onClose).toHaveBeenCalledOnce();
        expect(container.querySelector('[data-field="title"][data-shaking]')).toBeNull();
    });
    it('タイトル変更後 backdrop クリック → タイトルフィールドが shake する', () => {
        const onClose = vi.fn();
        const { container } = render(_jsx(TaskModal, { task: makeTask(), allTasks: [], onSave: NOOP, onClose: onClose }));
        fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: '変更後' } });
        fireEvent.click(container.firstChild);
        expect(onClose).not.toHaveBeenCalled();
        expect(container.querySelector('[data-field="title"][data-shaking]')).toBeTruthy();
    });
    it('タイトルのみ変更 → 未変更フィールド（サマリ）は shake しない', () => {
        const { container } = render(_jsx(TaskModal, { task: makeTask(), allTasks: [], onSave: NOOP, onClose: vi.fn() }));
        fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: '変更後' } });
        fireEvent.click(container.firstChild);
        expect(container.querySelector('[data-field="summary"][data-shaking]')).toBeNull();
    });
    it('shake は 500ms 後にリセットされる', () => {
        const { container } = render(_jsx(TaskModal, { task: makeTask(), allTasks: [], onSave: NOOP, onClose: vi.fn() }));
        fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: '変更後' } });
        fireEvent.click(container.firstChild);
        expect(container.querySelector('[data-field="title"][data-shaking]')).toBeTruthy();
        act(() => { vi.advanceTimersByTime(500); });
        expect(container.querySelector('[data-field="title"][data-shaking]')).toBeNull();
    });
    it('複数フィールド変更後 backdrop クリック → 変更した全フィールドが shake する', () => {
        const { container } = render(_jsx(TaskModal, { task: makeTask(), allTasks: [], onSave: NOOP, onClose: vi.fn() }));
        fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: '変更タイトル' } });
        fireEvent.change(screen.getAllByRole('textbox')[1], { target: { value: '変更サマリ' } });
        fireEvent.click(container.firstChild);
        expect(container.querySelector('[data-field="title"][data-shaking]')).toBeTruthy();
        expect(container.querySelector('[data-field="summary"][data-shaking]')).toBeTruthy();
        expect(container.querySelector('[data-field="status"][data-shaking]')).toBeNull();
    });
});
