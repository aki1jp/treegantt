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

// ── v2.31: クリティカルパス視覚強調 ──────────────────────────────────────────

// BASE_TASK は過去日付（endDate=2026-05-31）なので isOverdue=true になる。
// グローは非期限超過タスクに適用するため、テストは未来日付タスクを使う。
const FUTURE_TASK: Task = { ...BASE_TASK, startDate: '2026-07-01', endDate: '2026-07-31' };

describe('GanttBar クリティカルパス グロー（v2.31）', () => {
  it('isCritical=true のとき背景 rect に filter 属性が付く', () => {
    const { container } = render(
      <svg>
        <GanttBar
          task={FUTURE_TASK} minDate={new Date('2026-07-01')} zoom="month" rowIndex={0}
          isParent={false} isCritical={true}
          onMoveStart={NOOP} onResizeLeftStart={NOOP} onResizeRightStart={NOOP} onClick={NOOP}
        />
      </svg>
    );
    const rects = Array.from(container.querySelectorAll('rect'));
    const bgRect = rects.find(r => r.getAttribute('filter'));
    expect(bgRect).toBeTruthy();
    expect(bgRect!.getAttribute('filter')).toContain('critical-glow');
  });

  it('isCritical=false のとき背景 rect に filter 属性がない', () => {
    const { container } = render(
      <svg>
        <GanttBar
          task={FUTURE_TASK} minDate={new Date('2026-07-01')} zoom="month" rowIndex={0}
          isParent={false} isCritical={false}
          onMoveStart={NOOP} onResizeLeftStart={NOOP} onResizeRightStart={NOOP} onClick={NOOP}
        />
      </svg>
    );
    const rects = Array.from(container.querySelectorAll('rect'));
    const filteredRect = rects.find(r => r.getAttribute('filter'));
    expect(filteredRect).toBeFalsy();
  });

  it('isParent=true かつ isCritical=true のとき背景 rect に filter 属性が付く', () => {
    const { container } = renderBar(true, '2026-05-31');
    // isCritical=false (default) のときはフィルターなし
    const rects = Array.from(container.querySelectorAll('rect'));
    const filteredRect = rects.find(r => r.getAttribute('filter'));
    expect(filteredRect).toBeFalsy();
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

// ── v2.37: 親タスク displayStart/displayEnd ──────────────────────────────────
import { ZOOM_CONFIG, dateToX, calcNowX, calcVertexX, addDays, todayStr } from '../utils/ganttCalc';

describe('GanttBar 親タスク displayStart/displayEnd（v2.37）', () => {
  const DAY_WIDTH = ZOOM_CONFIG['month'].dayWidth;

  function renderParentBar(displayStart?: string | null, displayEnd?: string | null) {
    const task: Task = {
      ...BASE_TASK,
      id: 'parent-bar', startDate: '2026-05-01', endDate: '2026-05-31',
    };
    return render(
      <svg>
        <GanttBar
          task={task} minDate={MIN} zoom="month" rowIndex={0}
          isParent={true}
          displayStart={displayStart}
          displayEnd={displayEnd}
          onMoveStart={NOOP} onResizeLeftStart={NOOP} onResizeRightStart={NOOP} onClick={NOOP}
        />
      </svg>
    );
  }

  it('displayStart が指定されればそれでバーの x が決まる', () => {
    const { container } = renderParentBar('2026-06-01', '2026-06-30');
    const expectedX = dateToX('2026-06-01', MIN, 'month');
    const topBar = Array.from(container.querySelectorAll('rect')).find(r => {
      const x = parseFloat(r.getAttribute('x') ?? '0');
      return Math.abs(x - expectedX) < 1;
    });
    expect(topBar).toBeTruthy();
  });

  it('displayStart=null のとき task.startDate にフォールバックする', () => {
    const { container } = renderParentBar(null, null);
    const expectedX = dateToX('2026-05-01', MIN, 'month');
    const topBar = Array.from(container.querySelectorAll('rect')).find(r => {
      const x = parseFloat(r.getAttribute('x') ?? '0');
      return Math.abs(x - expectedX) < 1;
    });
    expect(topBar).toBeTruthy();
  });

  it('displayStart/End が未指定のとき task の日付にフォールバックする', () => {
    const { container } = renderParentBar();
    const expectedX = dateToX('2026-05-01', MIN, 'month');
    const topBar = Array.from(container.querySelectorAll('rect')).find(r => {
      const x = parseFloat(r.getAttribute('x') ?? '0');
      return Math.abs(x - expectedX) < 1;
    });
    expect(topBar).toBeTruthy();
  });
});

// ── 進捗遅延の赤帯（イナズマ線頂点が今より左） ──────────────────────────────
// 今(実時刻)を基準にするため、日付は todayStr() からの相対で組む。
describe('GanttBar 進捗遅延の赤帯', () => {
  const BMIN = new Date(addDays(todayStr(), -15));
  const ZOOM = 'day';
  const dayWidth = ZOOM_CONFIG[ZOOM].dayWidth;
  const START = addDays(todayStr(), -10);
  const END   = addDays(todayStr(), 10); // 今をまたぐ20日スパン

  function renderBand(opts: { status: Task['status']; progress: number; start?: string; end?: string; isParent?: boolean; isCollapsed?: boolean }) {
    const task: Task = {
      ...BASE_TASK, status: opts.status, progress: opts.progress,
      startDate: opts.start ?? START, endDate: opts.end ?? END,
    };
    return render(
      <svg>
        <GanttBar
          task={task} minDate={BMIN} zoom={ZOOM} rowIndex={0}
          isParent={opts.isParent ?? false} isCollapsed={opts.isCollapsed}
          onMoveStart={NOOP} onResizeLeftStart={NOOP} onResizeRightStart={NOOP} onClick={NOOP}
        />
      </svg>
    );
  }
  const band = (c: HTMLElement) =>
    Array.from(c.querySelectorAll('rect')).find(r => r.getAttribute('data-delay-band') === 'true');

  it('遅れている wip（進捗小）は赤帯を描き、x≈頂点・右端≈min(now,終了)', () => {
    const { container } = renderBand({ status: 'wip', progress: 10 });
    const b = band(container);
    expect(b).toBeTruthy();
    const nowX = calcNowX(BMIN, ZOOM);
    const vertexX = calcVertexX({ status: 'wip', isMilestone: false }, START, END, 10, BMIN, ZOOM, nowX)!;
    const endX = dateToX(END, BMIN, ZOOM) + dayWidth;
    const x = parseFloat(b!.getAttribute('x')!);
    const w = parseFloat(b!.getAttribute('width')!);
    expect(Math.abs(x - vertexX)).toBeLessThan(1.5);
    expect(Math.abs((x + w) - Math.min(nowX, endX))).toBeLessThan(1.5);
  });

  it('前倒し/オントラックの wip（進捗大）は赤帯なし', () => {
    const { container } = renderBand({ status: 'wip', progress: 95 });
    expect(band(container)).toBeFalsy();
  });

  it('開始日が過去の未着手 todo（0%）は赤帯を描く（開始→今）', () => {
    const { container } = renderBand({ status: 'todo', progress: 0 });
    expect(band(container)).toBeTruthy();
  });

  it('done / wait は赤帯なし', () => {
    expect(band(renderBand({ status: 'done', progress: 100 }).container)).toBeFalsy();
    expect(band(renderBand({ status: 'wait', progress: 0 }).container)).toBeFalsy();
  });

  it('展開中の親（isParent かつ非collapsed）は赤帯なし', () => {
    const { container } = renderBand({ status: 'wip', progress: 10, isParent: true, isCollapsed: false });
    expect(band(container)).toBeFalsy();
  });

  // 日付がスラッシュ区切り（非ISO）でも赤が出ること（文字列比較の取りこぼし防止）
  it('スラッシュ区切りの締切超過タスクも overdue 赤（#fca5a5）になる', () => {
    const slashPast = addDays(todayStr(), -5).replace(/-/g, '/'); // 例 2026/06/11
    const { container } = renderBand({ status: 'todo', progress: 0, start: addDays(todayStr(), -20).replace(/-/g, '/'), end: slashPast });
    const bg = Array.from(container.querySelectorAll('rect')).find(r => r.getAttribute('fill') === '#fca5a5');
    expect(bg).toBeTruthy();
  });

  it('スラッシュ区切りの過去開始 todo（0%）も赤帯を描く', () => {
    const { container } = renderBand({
      status: 'todo', progress: 0,
      start: addDays(todayStr(), -10).replace(/-/g, '/'),
      end:   addDays(todayStr(), 10).replace(/-/g, '/'),
    });
    expect(band(container)).toBeTruthy();
  });
});
