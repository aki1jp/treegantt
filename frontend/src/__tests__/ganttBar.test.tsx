// @vitest-environment jsdom
/**
 * GanttBar — 親タスク非インタラクティブデザインテスト / タイトル表示位置切り替えテスト
 *
 * 親タスク（isParent=true）のバーにはリサイズハンドルを表示しない。
 * 非親タスクには左右2つのハンドルを表示する。
 *
 * タイトル表示位置（v2.26）:
 *  - バー幅が広い場合  → バー内表示（clip-path あり）
 *  - バー幅が不足する場合 → バー右外表示（clip-path なし、text 要素あり）
 *  - バー幅が極端に短い（<12px）→ テキスト非表示
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { GanttBar } from '../components/Gantt/GanttBar';
import type { Task } from '../types/task';

const BASE_TASK: Task = {
  id: 't1', projectId: 'p1', parentId: null,
  title: 'テストタスク', summary: '', description: '',
  status: 'todo', priority: 'medium', progress: 0, assignee: '',
  startDate: '2026-05-01', endDate: '2026-05-31',
  isMilestone: false, predecessors: [], seq: 1, order: 1,
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  titleColor: null, titleBgColor: null,
};
const MIN = new Date('2026-05-01');
const NOOP = vi.fn();

function makeTask(endDate: string): Task {
  return { ...BASE_TASK, endDate };
}

function renderBar(isParent: boolean, endDate = '2026-05-31') {
  return render(
    <svg>
      <GanttBar
        task={makeTask(endDate)} minDate={MIN} zoom="month" rowIndex={0}
        isParent={isParent}
        onMoveStart={NOOP} onResizeLeftStart={NOOP} onResizeRightStart={NOOP} onClick={NOOP}
      />
    </svg>
  );
}

describe('GanttBar 非親タスク', () => {
  it('リサイズハンドル（ew-resize）が2つ描画される', () => {
    const { container } = renderBar(false);
    const handles = Array.from(container.querySelectorAll('rect')).filter(
      r => (r as unknown as HTMLElement).style.cursor === 'ew-resize'
    );
    expect(handles.length).toBe(2);
  });

  it('移動ゾーンの cursor は "move"', () => {
    const { container } = renderBar(false);
    const moveZone = Array.from(container.querySelectorAll('rect')).find(
      r => (r as unknown as HTMLElement).style.cursor === 'move'
    );
    expect(moveZone).toBeTruthy();
  });
});

describe('GanttBar 親タスク（isParent=true）— サマリーバーデザイン', () => {
  it('リサイズハンドルが描画されない', () => {
    const { container } = renderBar(true);
    const handles = Array.from(container.querySelectorAll('rect')).filter(
      r => (r as unknown as HTMLElement).style.cursor === 'ew-resize'
    );
    expect(handles.length).toBe(0);
  });

  it('下向き三角（突起）が左右に2つ描画される', () => {
    const { container } = renderBar(true);
    const polygons = container.querySelectorAll('polygon');
    expect(polygons.length).toBe(2);
  });

  it('サマリーバーの g 要素に cursor: pointer が設定される', () => {
    const { container } = renderBar(true);
    const g = container.querySelector('[data-task-id]') as SVGGElement;
    expect(g?.style.cursor).toBe('pointer');
  });
});

// ── v2.26: タイトル表示位置切り替え ──────────────────────────────────────
// zoom="month" で dayWidth=3。MIN=2026-05-01
//  - 30日タスク (〜05-31): width≈93px → バー内表示（clip-path あり）
//  - 5日タスク  (〜05-05): width≈15px → バー右外表示（clip-path なし、text あり）
//  - 2日タスク  (〜05-02): width≈6px  → テキスト非表示

describe('GanttBar タイトル表示位置切り替え（非親タスク）', () => {
  it('バーが広い場合はタイトルをバー内に表示（clip-path あり）', () => {
    const { container } = renderBar(false, '2026-05-31');
    const texts = container.querySelectorAll('text');
    const titleText = Array.from(texts).find(t => t.textContent === 'テストタスク');
    expect(titleText).toBeTruthy();
    expect(titleText!.getAttribute('clip-path')).toBeTruthy();
  });

  it('バーが狭い場合はタイトルをバー右外に表示（clip-path なし、text あり）', () => {
    const { container } = renderBar(false, '2026-05-05');
    const texts = container.querySelectorAll('text');
    const titleText = Array.from(texts).find(t => t.textContent === 'テストタスク');
    expect(titleText).toBeTruthy();
    expect(titleText!.getAttribute('clip-path')).toBeFalsy();
  });

  it('バーが極端に短い場合はタイトルを非表示', () => {
    const { container } = renderBar(false, '2026-05-02');
    const texts = container.querySelectorAll('text');
    const titleText = Array.from(texts).find(t => t.textContent === 'テストタスク');
    expect(titleText).toBeFalsy();
  });
});

describe('GanttBar タイトル表示位置切り替え（親タスク）', () => {
  it('バーが広い場合はタイトルをバー内に表示（clip-path あり）', () => {
    const { container } = renderBar(true, '2026-05-31');
    const texts = container.querySelectorAll('text');
    const titleText = Array.from(texts).find(t => t.textContent === 'テストタスク');
    expect(titleText).toBeTruthy();
    expect(titleText!.getAttribute('clip-path')).toBeTruthy();
  });

  it('バーが狭い場合はタイトルをバー右外に表示（clip-path なし、text あり）', () => {
    const { container } = renderBar(true, '2026-05-10');
    const texts = container.querySelectorAll('text');
    const titleText = Array.from(texts).find(t => t.textContent === 'テストタスク');
    expect(titleText).toBeTruthy();
    expect(titleText!.getAttribute('clip-path')).toBeFalsy();
  });

  it('バーが極端に短い場合はタイトルを非表示', () => {
    const { container } = renderBar(true, '2026-05-02');
    const texts = container.querySelectorAll('text');
    const titleText = Array.from(texts).find(t => t.textContent === 'テストタスク');
    expect(titleText).toBeFalsy();
  });
});

// ── v2.29: テキスト自動コントラスト反転 ──────────────────────────────────
// zoom="month" で dayWidth=3。width≈90px（30日タスク）
// todo カラー = '#6b7280'
// progressWidth = width * progress / 100

function renderBarProgress(isParent: boolean, endDate: string, progress: number, effectiveProgress?: number) {
  const task = { ...BASE_TASK, endDate, progress };
  return render(
    <svg>
      <GanttBar
        task={task} minDate={MIN} zoom="month" rowIndex={0}
        isParent={isParent}
        effectiveProgress={effectiveProgress}
        onMoveStart={NOOP} onResizeLeftStart={NOOP} onResizeRightStart={NOOP} onClick={NOOP}
      />
    </svg>
  );
}

describe('GanttBar テキスト自動コントラスト反転（非親タスク）', () => {
  it('progress=0 のとき inside テキストの fill はステータスカラー（白でない）', () => {
    const { container } = renderBarProgress(false, '2026-05-31', 0);
    const texts = container.querySelectorAll('text');
    const insideText = Array.from(texts).find(t =>
      t.textContent === 'テストタスク' && t.getAttribute('clip-path')
    );
    expect(insideText).toBeTruthy();
    expect(insideText!.getAttribute('fill')).not.toBe('#fff');
  });

  it('progress=50 かつ progressWidth > HANDLE_W+2 のとき inside テキストの fill は #fff', () => {
    const { container } = renderBarProgress(false, '2026-05-31', 50);
    const texts = container.querySelectorAll('text');
    const insideText = Array.from(texts).find(t =>
      t.textContent === 'テストタスク' && t.getAttribute('clip-path')
    );
    expect(insideText).toBeTruthy();
    expect(insideText!.getAttribute('fill')).toBe('#fff');
  });

  it('outside テキストは progress=100 でも fill はステータスカラー', () => {
    const { container } = renderBarProgress(false, '2026-05-05', 100);
    const texts = container.querySelectorAll('text');
    const outsideText = Array.from(texts).find(t =>
      t.textContent === 'テストタスク' && !t.getAttribute('clip-path')
    );
    expect(outsideText).toBeTruthy();
    expect(outsideText!.getAttribute('fill')).not.toBe('#fff');
  });
});

describe('GanttBar テキスト自動コントラスト反転（親タスク）', () => {
  it('progress=0 のとき inside テキストの fill はステータスカラー（白でない）', () => {
    const { container } = renderBarProgress(true, '2026-05-31', 0);
    const texts = container.querySelectorAll('text');
    const insideText = Array.from(texts).find(t =>
      t.textContent === 'テストタスク' && t.getAttribute('clip-path')
    );
    expect(insideText).toBeTruthy();
    expect(insideText!.getAttribute('fill')).not.toBe('#fff');
  });

  it('progress=50 かつ progressWidth > legW+2 のとき inside テキストの fill は #fff', () => {
    const { container } = renderBarProgress(true, '2026-05-31', 50);
    const texts = container.querySelectorAll('text');
    const insideText = Array.from(texts).find(t =>
      t.textContent === 'テストタスク' && t.getAttribute('clip-path')
    );
    expect(insideText).toBeTruthy();
    expect(insideText!.getAttribute('fill')).toBe('#fff');
  });
});

// ── v2.30: 親タスクの進捗バーを effectiveProgress で描画 ────────────────────
// task.progress=0 でも effectiveProgress が大きければ進捗バーが描画され、
// テキスト反転も effectiveProgress に基づいて動く

describe('GanttBar 親タスク effectiveProgress（v2.30）', () => {
  it('task.progress=0 でも effectiveProgress=80 なら進捗バー rect が描画される', () => {
    const { container } = renderBarProgress(true, '2026-05-31', 0, 80);
    const rects = Array.from(container.querySelectorAll('rect'));
    // 進捗オーバーレイ（barColor 100% 不透明、pointerEvents:none）が存在する
    const progressRect = rects.find(r => (r as HTMLElement).style.pointerEvents === 'none');
    expect(progressRect).toBeTruthy();
  });

  it('task.progress=0 でも effectiveProgress=80 のとき inside テキストの fill は #fff', () => {
    const { container } = renderBarProgress(true, '2026-05-31', 0, 80);
    const texts = container.querySelectorAll('text');
    const insideText = Array.from(texts).find(t =>
      t.textContent === 'テストタスク' && t.getAttribute('clip-path')
    );
    expect(insideText).toBeTruthy();
    expect(insideText!.getAttribute('fill')).toBe('#fff');
  });

  it('effectiveProgress が未指定のとき task.progress にフォールバックする（progress=0→バーなし）', () => {
    const { container } = renderBarProgress(true, '2026-05-31', 0);
    const rects = Array.from(container.querySelectorAll('rect'));
    const progressRect = rects.find(r => (r as HTMLElement).style.pointerEvents === 'none');
    expect(progressRect).toBeFalsy();
  });
});
