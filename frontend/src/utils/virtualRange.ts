// 行仮想化の可視範囲計算（v2.64）。
// スクロール位置とビューポート高さから描画すべき行範囲 [start, end) を返す。
// overscan はスクロール中の白抜けを防ぐための上下の余裕行数。
export function calcVisibleRange(
  scrollTop: number,
  viewportH: number,
  rowHeight: number,
  rowCount: number,
  overscan = 10,
): { start: number; end: number } {
  if (rowCount <= 0 || rowHeight <= 0) return { start: 0, end: 0 };
  const firstVisible = Math.floor(Math.max(0, scrollTop) / rowHeight);
  const visibleCount = Math.ceil(viewportH / rowHeight) + 1; // 端数行ぶん +1
  const start = Math.max(0, firstVisible - overscan);
  const end = Math.min(rowCount, firstVisible + visibleCount + overscan);
  return { start, end };
}
