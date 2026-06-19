import { db } from '../db/client.js';

/** リソース設定（アプリ既定）。リソースビューの稼働率算出に使う。 */
export interface AppSettings {
  /** 1 稼働日あたりのキャパシティ（分）。既定 480 = 8:00 */
  capacityMinutesPerDay: number;
  /** 稼働日とみなす曜日（0=日…6=土）。既定 月〜金 */
  workingDays: number[];
}

export const DEFAULT_SETTINGS: AppSettings = {
  capacityMinutesPerDay: 480,
  workingDays: [1, 2, 3, 4, 5],
};

/** workingDays を 0–6 の範囲・重複除去・昇順に正規化する */
function normalizeWorkingDays(days: number[]): number[] {
  return [...new Set(days.filter(d => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b);
}

function readKey(key: string): unknown {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as { value: string } | undefined;
  if (!row) return undefined;
  try { return JSON.parse(row.value); } catch { return undefined; }
}

export function getSettings(): AppSettings {
  const capacity = readKey('capacityMinutesPerDay');
  const workingDays = readKey('workingDays');
  return {
    capacityMinutesPerDay:
      typeof capacity === 'number' ? capacity : DEFAULT_SETTINGS.capacityMinutesPerDay,
    workingDays:
      Array.isArray(workingDays) ? normalizeWorkingDays(workingDays as number[]) : DEFAULT_SETTINGS.workingDays,
  };
}

export interface UpdateSettingsInput {
  capacityMinutesPerDay?: number;
  workingDays?: number[];
}

export function updateSettings(patch: UpdateSettingsInput): AppSettings {
  const upsert = db.prepare(
    `INSERT INTO app_settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  );
  db.transaction(() => {
    if (patch.capacityMinutesPerDay !== undefined) {
      upsert.run('capacityMinutesPerDay', JSON.stringify(patch.capacityMinutesPerDay));
    }
    if (patch.workingDays !== undefined) {
      upsert.run('workingDays', JSON.stringify(normalizeWorkingDays(patch.workingDays)));
    }
  })();
  return getSettings();
}
