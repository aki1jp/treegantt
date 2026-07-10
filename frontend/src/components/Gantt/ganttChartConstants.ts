import type { TranslationKey } from '../../i18n/useTranslation';

// GanttChart 本体と WbsPanel の双方で使う共通定数（D4: 責務分割時に切り出し）。
export const HEADER_ROW_H = 26;

// WBS/ガント列見出しの辞書キー一本化（§9.11）。列ラベルの文字列リテラルを
// コンポーネントへ直書きせず辞書（ja.ts/en.ts）へ集約する実装上の重複解消であり、
// 表示文言自体をヘッダーとポップアップで統一する意図ではない。
// GanttChart.tsx の LEFT_COLS（見出し・スペース制約ありのため短縮形）はこちらを参照する。
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

// WbsPanel.tsx の列表示設定ポップアップ（スペースに余裕がありユーザーへの分かりやすさの
// ため完全形）専用のキー。ヘッダーの WBS_COL_LABEL_KEYS とは値が異なる（意図的な差異）。
export const WBS_COL_TOGGLE_LABEL_KEYS: Record<string, TranslationKey> = {
  status:    'wbs.colToggle.status',
  priority:  'wbs.colToggle.priority',
  progress:  'wbs.colToggle.progress',
  assignee:  'wbs.colToggle.assignee',
  startDate: 'wbs.colToggle.startDate',
  endDate:   'wbs.colToggle.endDate',
  duration:  'wbs.colToggle.duration',
};
