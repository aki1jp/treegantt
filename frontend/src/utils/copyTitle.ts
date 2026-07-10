// タスクコピー時のWindows風タイトル採番
// 末尾の「 (コピー)」「 (コピーN)」（en: 「 (Copy)」「 (CopyN)」）を除去したベース名に対して空き番号を探す
type Locale = 'ja' | 'en';

const COPY_SUFFIX_RE: Record<Locale, RegExp> = {
  ja: /\s*\(コピー\d*\)$/,
  en: /\s*\(Copy\d*\)$/,
};
const COPY_WORD: Record<Locale, string> = { ja: 'コピー', en: 'Copy' };

// locale 省略時は既定で日本語（既存呼び出し元との後方互換）
export function makeCopyTitle(sourceTitle: string, siblingTitles: ReadonlySet<string>, locale: Locale = 'ja'): string {
  // コピー先に同名がなければ改名しない（別階層へのコピー）
  if (!siblingTitles.has(sourceTitle)) return sourceTitle;

  const word = COPY_WORD[locale];
  const base = sourceTitle.replace(COPY_SUFFIX_RE[locale], '');
  const first = `${base} (${word})`;
  if (!siblingTitles.has(first)) return first;

  for (let n = 2; ; n++) {
    const candidate = `${base} (${word}${n})`;
    if (!siblingTitles.has(candidate)) return candidate;
  }
}
