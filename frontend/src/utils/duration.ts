// 予定工数の「人間向け入力/表示 ⇄ 分」変換と、実効リソース設定の解決。
// DB・計算は分（整数）を単一の真実とし、境界でここを通す。

export const HARDCODED_CAPACITY_MINUTES = 480;       // 8:00
export const HARDCODED_WORKING_DAYS = [1, 2, 3, 4, 5]; // 月〜金（0=日…6=土）

export interface DurationOpts {
  /** 1 稼働日あたりのキャパシティ（分）。1d の換算基準 */
  capacityMinutes: number;
  /** 1 週あたりの稼働日数。1w の換算基準 */
  workingDaysPerWeek: number;
}

const HHMM_RE  = /^(\d+):([0-5]?\d)$/;
const TOKEN_RE = /^(\d+(?:\.\d+)?)([dhmw])$/i;

/**
 * 入力文字列を分へ正規化する。受理する書式:
 *  - `HH:MM`（例 `7:45`）
 *  - 単位トークン `Nd`/`Nh`/`Nm`/`Nw`（空白区切りの複合 `1d 4h` 可、小数可）
 * `1d` は capacityMinutes、`1w` は workingDaysPerWeek × capacityMinutes で換算（入力時点で確定）。
 * 空文字・解釈不能は null。
 */
export function parseDuration(input: string, opts: DurationOpts): number | null {
  const s = input.trim();
  if (s === '') return null;

  const hhmm = HHMM_RE.exec(s);
  if (hhmm) {
    return parseInt(hhmm[1], 10) * 60 + parseInt(hhmm[2], 10);
  }

  const tokens = s.split(/\s+/);
  let total = 0;
  for (const tok of tokens) {
    const m = TOKEN_RE.exec(tok);
    if (!m) return null;
    const n = parseFloat(m[1]);
    switch (m[2].toLowerCase()) {
      case 'm': total += n; break;
      case 'h': total += n * 60; break;
      case 'd': total += n * opts.capacityMinutes; break;
      case 'w': total += n * opts.workingDaysPerWeek * opts.capacityMinutes; break;
      default: return null;
    }
  }
  return Math.round(total);
}

/** 分を `HH:MM` 表示へ。null は空文字。 */
export function formatMinutes(minutes: number | null): string {
  if (minutes == null) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

/** 実効キャパシティ（分）= プロジェクト値 ?? アプリ既定 ?? ハードコード既定 */
export function resolveCapacityMinutes(
  projectVal: number | null | undefined,
  appVal: number | null | undefined,
): number {
  return projectVal ?? appVal ?? HARDCODED_CAPACITY_MINUTES;
}

/** 実効稼働日 = プロジェクト値 ?? アプリ既定 ?? ハードコード既定 */
export function resolveWorkingDays(
  projectVal: number[] | null | undefined,
  appVal: number[] | null | undefined,
): number[] {
  return projectVal ?? appVal ?? HARDCODED_WORKING_DAYS;
}
