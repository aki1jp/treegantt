// タスクコピー時のWindows風タイトル採番
// 末尾の「 (コピー)」「 (コピーN)」を除去したベース名に対して空き番号を探す
const COPY_SUFFIX_RE = /\s*\(コピー\d*\)$/;

export function makeCopyTitle(sourceTitle: string, siblingTitles: ReadonlySet<string>): string {
  // コピー先に同名がなければ改名しない（別階層へのコピー）
  if (!siblingTitles.has(sourceTitle)) return sourceTitle;

  const base = sourceTitle.replace(COPY_SUFFIX_RE, '');
  const first = `${base} (コピー)`;
  if (!siblingTitles.has(first)) return first;

  for (let n = 2; ; n++) {
    const candidate = `${base} (コピー${n})`;
    if (!siblingTitles.has(candidate)) return candidate;
  }
}
