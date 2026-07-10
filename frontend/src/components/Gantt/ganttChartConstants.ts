import type { TranslationKey } from '../../i18n/useTranslation';

// GanttChart 本体と WbsPanel の双方で使う共通定数（D4: 責務分割時に切り出し）。
export const HEADER_ROW_H = 26;

// WBS/ガント列見出しの辞書キー一本化（§9.11）。GanttChart.tsx の LEFT_COLS と
// WbsPanel.tsx の列表示設定ポップアップ（旧 HIDEABLE_COLS）が同じキーを参照し、
// 列ラベル文字列リテラルの重複定義を解消する。
export const WBS_COL_LABEL_KEYS: Record<string, TranslationKey> = {
  rowNumber: 'wbs.col.rowNumber',
  order:     'wbs.col.seq',
  title:     'wbs.col.title',
  status:    'wbs.col.status',
  priority:  'wbs.col.priority',
  progress:  'wbs.col.progress',
  assignee:  'wbs.col.assignee',
  startDate: 'wbs.col.startDate',
  endDate:   'wbs.col.endDate',
  duration:  'wbs.col.duration',
};
