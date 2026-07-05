import { mkdirSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import type Database from 'better-sqlite3';

const FILE_PREFIX = 'treegantt-';
const FILE_SUFFIX = '.db';

/** バックアップ処理からの失敗記録先。fastify.log 等を注入する想定。 */
export interface BackupLogger {
  error: (msg: string, err?: unknown) => void;
}

export interface BackupDeps {
  db: Database.Database;
  backupDir: string;
  retention: number;
  logger: BackupLogger;
  /** テスト用の時刻注入。省略時は `new Date()`。 */
  now?: () => Date;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** タイムスタンプ付きバックアップファイル名を生成する（例: treegantt-20260704T123456.db） */
export function formatBackupFilename(date: Date): string {
  const y = date.getFullYear();
  const mo = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const h = pad(date.getHours());
  const mi = pad(date.getMinutes());
  const s = pad(date.getSeconds());
  return `${FILE_PREFIX}${y}${mo}${d}T${h}${mi}${s}${FILE_SUFFIX}`;
}

/** backupDir 内のバックアップファイルのうち、retention 世代を超える古いものを削除する。
 *  ファイル名がタイムスタンプ形式のため、文字列昇順ソート＝時系列昇順になる。 */
export function pruneOldBackups(backupDir: string, retention: number): void {
  const files = readdirSync(backupDir)
    .filter((f) => f.startsWith(FILE_PREFIX) && f.endsWith(FILE_SUFFIX))
    .sort();
  const excess = files.length - retention;
  for (let i = 0; i < excess; i++) {
    unlinkSync(join(backupDir, files[i]));
  }
}

/** DB のオンラインバックアップ（better-sqlite3 の `db.backup()`）を1回実行する。
 *  失敗しても例外を投げず null を返し、logger にエラーを記録する（プロセスを落とさない）。 */
export async function runBackup(deps: BackupDeps): Promise<string | null> {
  try {
    mkdirSync(deps.backupDir, { recursive: true });
    const filename = formatBackupFilename((deps.now ?? (() => new Date()))());
    const dest = join(deps.backupDir, filename);
    await deps.db.backup(dest);
    pruneOldBackups(deps.backupDir, deps.retention);
    return dest;
  } catch (e) {
    deps.logger.error('バックアップに失敗しました', e);
    return null;
  }
}

export interface ScheduleHandle {
  stop: () => void;
}

/** 起動時に1回＋intervalHours ごとにバックアップを実行するスケジューラを開始する。
 *  intervalHours が 0 以下のときは起動時の1回のみでそれ以降はスケジュールしない。
 *  `runBackupFn` はテスト注入用（省略時は実際の `runBackup`）。 */
export function scheduleBackups(
  deps: BackupDeps & { intervalHours: number },
  runBackupFn: (d: BackupDeps) => Promise<string | null> = runBackup,
): ScheduleHandle {
  void runBackupFn(deps);

  if (!(deps.intervalHours > 0)) {
    return { stop: () => {} };
  }

  const intervalMs = deps.intervalHours * 60 * 60 * 1000;
  const timer = setInterval(() => {
    void runBackupFn(deps);
  }, intervalMs);

  return { stop: () => clearInterval(timer) };
}
