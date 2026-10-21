// WBS 左パネルの列幅・インデント・左オフセットは、この列定義（WBS_COL_DEFS）を
// 単一の真実源として導出する（相対座標化, 設計書 §9.2「列レイアウトの導出」）。
// ヘッダー・タスク行・クイック追加行・LEFT_TOTAL・行 D&D の位置計算はすべて
// ここの関数を経由し、固定 px の直書きで二重管理しない。

export const TITLE_PAD  = 6;
export const INDENT     = 16;
export const TOGGLE_W   = 16;
export const TOGGLE_GAP = 3;

/** title 列の paddingLeft（depth に応じたインデント量を含む） */
export function titlePaddingLeft(depth: number): number {
  return TITLE_PAD + depth * INDENT;
}

export type WbsColSizes = {
  colWidths: { title: number; assignee: number };
  dateColWidth: number;
};

/** WBS 左パネルの列定義（キーと既定幅）。GanttChart.tsx の LEFT_COL_DEFS から移設した単一の真実源。
 *  「行」(rowNumber) 列の追加で他の固定 px 直書き箇所がズレた不具合の反省から、
 *  幅を必要とする箇所は必ずこの配列 + wbsColWidth/leadingWidth 経由で導出する。 */
export const WBS_COL_DEFS = [
  { key: 'rowNumber', width: 36  }, { key: 'order',     width: 36  },
  { key: 'title',     width: 180 }, { key: 'status',    width: 66  },
  { key: 'priority',  width: 56  }, { key: 'progress',  width: 76  },
  { key: 'assignee',  width: 76  }, { key: 'startDate', width: 88  },
  { key: 'endDate',   width: 88  }, { key: 'duration',  width: 50  },
] as const;

/** 列 1 つの実効幅: title/assignee はリサイズ値、startDate/endDate は dateColWidth、他は既定幅。
 *  リサイズ値・フォント連動幅を持つ列とそうでない列を1関数に集約し、呼び出し側の分岐をなくす。 */
export function wbsColWidth(key: string, sizes: WbsColSizes): number {
  if (key === 'title') return sizes.colWidths.title;
  if (key === 'assignee') return sizes.colWidths.assignee;
  if (key === 'startDate' || key === 'endDate') return sizes.dateColWidth;
  return WBS_COL_DEFS.find(c => c.key === key)?.width ?? 0;
}

/** title 列より左にある「表示中の」列幅の合計（既定 = rowNumber 36 + order 36 = 72）。
 *  visibleCols に title が無い場合は全列ぶんの合計を返す。
 *  列の表示 ON/OFF に応じてヘッダー・本体・クイック追加行・パネル閉時の幅を揃えるための
 *  唯一の算出箇所（呼び出し元ごとに再実装しない）。 */
export function leadingWidth(visibleCols: readonly { key: string }[], sizes: WbsColSizes): number {
  const titleIdx = visibleCols.findIndex(c => c.key === 'title');
  const cols = titleIdx === -1 ? visibleCols : visibleCols.slice(0, titleIdx);
  return cols.reduce((s, c) => s + wbsColWidth(c.key, sizes), 0);
}

/** WBS パネル左端からのテキスト開始 X 座標。
 *  = leading + TITLE_PAD + TOGGLE_W + TOGGLE_GAP + depth * INDENT （既定 leading=72 → depth0 で 97）
 *  leading は呼び出し側が leadingWidth() で算出して渡す（列の表示 ON/OFF・リサイズに追従させるため）。 */
export function textStartX(depth: number, leading: number): number {
  return leading + TITLE_PAD + TOGGLE_W + TOGGLE_GAP + depth * INDENT;
}

/** WBS の title/assignee 列の既定幅（store 初期値・リセット・復元時検証の既定値で共有） */
export const DEFAULT_WBS_COL_WIDTHS = { title: 180, assignee: 76 } as const;

/** WBS の title/assignee 列のリサイズ下限（GanttChart のドラッグ下限・復元時検証で共有） */
export const COL_MIN_WIDTHS: Record<string, number> = { title: 80, assignee: 50 };

/** localStorage から復元した列幅を検証する。有限 number でない／下限未満の列だけ既定値にする。 */
export function sanitizeWbsColWidths(raw: unknown): { title: number; assignee: number } {
  const src = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const pick = (key: 'title' | 'assignee'): number => {
    const v = src[key];
    return typeof v === 'number' && Number.isFinite(v) && v >= COL_MIN_WIDTHS[key]
      ? v : DEFAULT_WBS_COL_WIDTHS[key];
  };
  return { title: pick('title'), assignee: pick('assignee') };
}
