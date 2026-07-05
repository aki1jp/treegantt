import { dirname, join } from 'path';

/** REST API がリッスンするポートを返す（デフォルト 4000）
 *  PORT が未設定または空文字のときはデフォルトを使う */
export function resolveApiPort(): number {
  return parseInt(process.env.PORT || '4000', 10);
}

/** WebSocket サーバーがリッスンするポートを返す（デフォルト 4001）
 *  WS_PORT が未設定または空文字のときはデフォルトを使う */
export function resolveWsPort(): number {
  return parseInt(process.env.WS_PORT || '4001', 10);
}

/** バックアップの保存先ディレクトリを返す。
 *  BACKUP_DIR が未設定または空文字のときは、DB ファイルと同じディレクトリ配下の `backups/` を使う。 */
export function resolveBackupDir(dbPath: string): string {
  const override = process.env.BACKUP_DIR;
  if (override && override.trim() !== '') return override;
  return join(dirname(dbPath), 'backups');
}

/** バックアップの実行間隔（時間）を返す（デフォルト 24）。
 *  `0` は明示的な無効化として扱う。未設定・空文字・数値以外のときはデフォルトにフォールバックする。 */
export function resolveBackupIntervalHours(): number {
  const raw = process.env.BACKUP_INTERVAL_HOURS;
  if (raw === undefined || raw.trim() === '') return 24;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 24;
}

/** 保持するバックアップ世代数を返す（デフォルト 7）。
 *  未設定・空文字・0以下・数値以外のときはデフォルトにフォールバックする。 */
export function resolveBackupRetention(): number {
  const raw = process.env.BACKUP_RETENTION;
  if (raw === undefined || raw.trim() === '') return 7;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 7;
}
