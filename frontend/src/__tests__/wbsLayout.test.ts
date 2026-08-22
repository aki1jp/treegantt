import { describe, it, expect } from 'vitest';
import {
  TITLE_PAD, INDENT, TOGGLE_W, TOGGLE_GAP,
  titlePaddingLeft, textStartX, wbsColWidth, leadingWidth, WBS_COL_DEFS,
  type WbsColSizes,
} from '../utils/wbsLayout';

describe('wbsLayout — 定数', () => {
  it('TITLE_PAD=6 / INDENT=16 / TOGGLE_W=16 / TOGGLE_GAP=3', () => {
    expect(TITLE_PAD).toBe(6);
    expect(INDENT).toBe(16);
    expect(TOGGLE_W).toBe(16);
    expect(TOGGLE_GAP).toBe(3);
  });
});

describe('titlePaddingLeft(depth)', () => {
  it('depth=0 → 6', () => expect(titlePaddingLeft(0)).toBe(6));
  it('depth=1 → 22', () => expect(titlePaddingLeft(1)).toBe(22));
  it('depth=2 → 38', () => expect(titlePaddingLeft(2)).toBe(38));
});

describe('textStartX(depth, leading)', () => {
  // leading(72) + TITLE_PAD(6) + TOGGLE_W(16) + TOGGLE_GAP(3) = 97
  it('depth=0, leading=72 → 97', () => expect(textStartX(0, 72)).toBe(97));
  it('depth=1, leading=72 → 113', () => expect(textStartX(1, 72)).toBe(113));
  it('depth=2, leading=72 → 129', () => expect(textStartX(2, 72)).toBe(129));
});

describe('WBS_COL_DEFS', () => {
  it('rowNumber/order が先頭2列で各36px', () => {
    expect(WBS_COL_DEFS[0]).toEqual({ key: 'rowNumber', width: 36 });
    expect(WBS_COL_DEFS[1]).toEqual({ key: 'order', width: 36 });
  });

  it('全10列のキーと既定幅が仕様どおり', () => {
    expect(WBS_COL_DEFS.map(c => c.key)).toEqual([
      'rowNumber', 'order', 'title', 'status', 'priority',
      'progress', 'assignee', 'startDate', 'endDate', 'duration',
    ]);
    expect(WBS_COL_DEFS.map(c => c.width)).toEqual([36, 36, 180, 66, 56, 76, 76, 88, 88, 50]);
  });
});

describe('wbsColWidth(key, sizes)', () => {
  const defaultSizes: WbsColSizes = { colWidths: { title: 180, assignee: 76 }, dateColWidth: 90 };

  it('title はリサイズ値(colWidths.title)を優先する', () => {
    expect(wbsColWidth('title', { colWidths: { title: 240, assignee: 76 }, dateColWidth: 90 })).toBe(240);
  });

  it('assignee はリサイズ値(colWidths.assignee)を優先する', () => {
    expect(wbsColWidth('assignee', { colWidths: { title: 180, assignee: 120 }, dateColWidth: 90 })).toBe(120);
  });

  it('startDate/endDate は dateColWidth を返す', () => {
    expect(wbsColWidth('startDate', defaultSizes)).toBe(90);
    expect(wbsColWidth('endDate', defaultSizes)).toBe(90);
  });

  it('その他の列は WBS_COL_DEFS の既定幅を返す（rowNumber=36, duration=50）', () => {
    expect(wbsColWidth('rowNumber', defaultSizes)).toBe(36);
    expect(wbsColWidth('order', defaultSizes)).toBe(36);
    expect(wbsColWidth('status', defaultSizes)).toBe(66);
    expect(wbsColWidth('priority', defaultSizes)).toBe(56);
    expect(wbsColWidth('progress', defaultSizes)).toBe(76);
    expect(wbsColWidth('duration', defaultSizes)).toBe(50);
  });
});

describe('leadingWidth(visibleCols, sizes)', () => {
  // visibleCols には title 列を含む「表示中の全列」を渡す想定（呼び出し元の
  // visibleLeftCols とそのまま対応）。関数側で title の位置を見つけ、それより
  // 左にある列の幅だけを合計する。
  const defaultSizes: WbsColSizes = { colWidths: { title: 180, assignee: 76 }, dateColWidth: 90 };

  it('既定（rowNumber+order が両方 title より左）で 72 を返す', () => {
    expect(leadingWidth(WBS_COL_DEFS, defaultSizes)).toBe(72);
  });

  it('order を隠した場合（rowNumber のみが title より左）は 36 を返す', () => {
    expect(leadingWidth(
      [{ key: 'rowNumber' }, { key: 'title' }, { key: 'status' }],
      defaultSizes,
    )).toBe(36);
  });

  it('title が先頭列なら 0 を返す', () => {
    expect(leadingWidth([{ key: 'title' }, { key: 'status' }], defaultSizes)).toBe(0);
  });
});
