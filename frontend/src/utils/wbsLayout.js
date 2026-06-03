export const SEQ_W = 36;
export const TITLE_PAD = 6;
export const INDENT = 16;
export const TOGGLE_W = 16;
export const TOGGLE_GAP = 3;
/** title 列の paddingLeft（depth に応じたインデント量を含む） */
export function titlePaddingLeft(depth) {
    return TITLE_PAD + depth * INDENT;
}
/** WBS パネル左端からのテキスト開始 X 座標 */
export function textStartX(depth) {
    return SEQ_W + TITLE_PAD + TOGGLE_W + TOGGLE_GAP + depth * INDENT;
}
