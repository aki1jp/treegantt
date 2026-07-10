import { useTaskStore } from '../store/taskStore';
import { ja } from './ja';
import { en } from './en';

export type TranslationKey = keyof typeof ja;

const dictionaries = { ja, en } as const;

/**
 * taskStore の locale を読み、辞書引きした文字列を返す t() を提供するフック。
 * vars は `{name}` 形式のプレースホルダを単純な文字列置換で埋める。
 */
export function useTranslation() {
  const locale = useTaskStore(s => s.locale);
  const dict = dictionaries[locale];

  function t(key: TranslationKey, vars?: Record<string, string | number>): string {
    const raw = dict[key];
    if (!vars) return raw;
    return Object.entries(vars).reduce(
      (acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)),
      raw,
    );
  }

  return { t, locale };
}
