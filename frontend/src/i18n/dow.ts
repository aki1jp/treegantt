import { useTaskStore } from '../store/taskStore';

// 曜日ラベルは7要素のインデックスアクセス（DOW_LABELS[dow]）が必要なため、
// フラットな Record を返す t() ではなく専用の配列で管理する。
export const DOW_LABELS_JA = ['日', '月', '火', '水', '木', '金', '土'] as const;
export const DOW_LABELS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** 現在の locale に応じた曜日ラベル配列を返すフック。 */
export function useDowLabels(): readonly string[] {
  const locale = useTaskStore(s => s.locale);
  return locale === 'en' ? DOW_LABELS_EN : DOW_LABELS_JA;
}
