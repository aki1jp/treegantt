import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createTestDb } from './helpers.js';

afterEach(() => vi.unstubAllEnvs());

// api/src/config.ts に resolveBackupDir/resolveBackupIntervalHours/resolveBackupRetention が
// 存在しないと失敗する（TDD: red フェーズ）
const { resolveBackupDir, resolveBackupIntervalHours, resolveBackupRetention } =
  await import('../config.js');

// api/src/db/backup.ts が存在しないと失敗する（TDD: red フェーズ）
const { runBackup, pruneOldBackups, scheduleBackups, formatBackupFilename } =
  await import('../db/backup.js');

describe('resolveBackupDir', () => {
  it('BACKUP_DIR 未設定のとき DB と同じディレクトリ配下の backups/ を返す', () => {
    vi.stubEnv('BACKUP_DIR', '');
    expect(resolveBackupDir('/app/data/treegantt.db')).toBe(join('/app/data', 'backups'));
  });

  it('BACKUP_DIR 設定時はその値を返す', () => {
    vi.stubEnv('BACKUP_DIR', '/custom/backups');
    expect(resolveBackupDir('/app/data/treegantt.db')).toBe('/custom/backups');
  });
});

describe('resolveBackupIntervalHours', () => {
  it('未設定のときデフォルト 24 を返す', () => {
    vi.stubEnv('BACKUP_INTERVAL_HOURS', '');
    expect(resolveBackupIntervalHours()).toBe(24);
  });

  it('BACKUP_INTERVAL_HOURS=0 のとき 0 を返す（明示的な無効化）', () => {
    vi.stubEnv('BACKUP_INTERVAL_HOURS', '0');
    expect(resolveBackupIntervalHours()).toBe(0);
  });

  it('BACKUP_INTERVAL_HOURS=6 のとき 6 を返す', () => {
    vi.stubEnv('BACKUP_INTERVAL_HOURS', '6');
    expect(resolveBackupIntervalHours()).toBe(6);
  });

  it('数値以外のときデフォルト 24 にフォールバックする', () => {
    vi.stubEnv('BACKUP_INTERVAL_HOURS', 'invalid');
    expect(resolveBackupIntervalHours()).toBe(24);
  });
});

describe('resolveBackupRetention', () => {
  it('未設定のときデフォルト 7 を返す', () => {
    vi.stubEnv('BACKUP_RETENTION', '');
    expect(resolveBackupRetention()).toBe(7);
  });

  it('BACKUP_RETENTION=3 のとき 3 を返す', () => {
    vi.stubEnv('BACKUP_RETENTION', '3');
    expect(resolveBackupRetention()).toBe(3);
  });

  it('0 以下のときデフォルト 7 にフォールバックする', () => {
    vi.stubEnv('BACKUP_RETENTION', '0');
    expect(resolveBackupRetention()).toBe(7);
  });
});

describe('formatBackupFilename', () => {
  it('treegantt-YYYYMMDDTHHMMSS.db 形式のファイル名を生成する', () => {
    const date = new Date(2026, 6, 4, 12, 34, 56); // 2026/07/04 12:34:56（ローカル時刻）
    expect(formatBackupFilename(date)).toBe('treegantt-20260704T123456.db');
  });
});

describe('runBackup', () => {
  let backupDir: string;

  beforeEach(() => {
    backupDir = mkdtempSync(join(tmpdir(), 'tg-backup-test-'));
  });

  afterEach(() => {
    rmSync(backupDir, { recursive: true, force: true });
  });

  it('有効な SQLite ファイルを生成し、開いて SELECT できる', async () => {
    const db = createTestDb();
    const logger = { error: vi.fn() };

    const dest = await runBackup({ db, backupDir, retention: 7, logger });

    expect(dest).toBeTruthy();
    expect(existsSync(dest as string)).toBe(true);

    const restored = new Database(dest as string, { readonly: true });
    const tables = restored.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    expect(Array.isArray(tables)).toBe(true);
    expect((tables as { name: string }[]).some((t) => t.name === 'tasks')).toBe(true);
    restored.close();
  });

  it('backupDir が存在しない場合は作成する', async () => {
    const nested = join(backupDir, 'nested', 'dir');
    const db = createTestDb();
    const logger = { error: vi.fn() };

    const dest = await runBackup({ db, backupDir: nested, retention: 7, logger });

    expect(dest).toBeTruthy();
    expect(existsSync(nested)).toBe(true);
  });

  it('失敗時は例外を投げず null を返し、logger にエラーを記録する', async () => {
    const failingDb = {
      backup: () => Promise.reject(new Error('backup failed')),
    } as unknown as Database.Database;
    const logger = { error: vi.fn() };

    const result = await runBackup({ db: failingDb, backupDir, retention: 7, logger });

    expect(result).toBeNull();
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it('世代数(retention)を超えた古いバックアップは削除する', async () => {
    const db = createTestDb();
    const logger = { error: vi.fn() };

    await runBackup({ db, backupDir, retention: 2, now: () => new Date(2026, 0, 1, 0, 0, 0), logger });
    await runBackup({ db, backupDir, retention: 2, now: () => new Date(2026, 0, 2, 0, 0, 0), logger });
    await runBackup({ db, backupDir, retention: 2, now: () => new Date(2026, 0, 3, 0, 0, 0), logger });

    const files = readdirSync(backupDir).filter((f) => f.endsWith('.db')).sort();
    expect(files).toHaveLength(2);
    expect(files).toEqual(['treegantt-20260102T000000.db', 'treegantt-20260103T000000.db']);
  });
});

describe('pruneOldBackups', () => {
  let backupDir: string;

  beforeEach(() => {
    backupDir = mkdtempSync(join(tmpdir(), 'tg-prune-test-'));
  });

  afterEach(() => {
    rmSync(backupDir, { recursive: true, force: true });
  });

  it('retention 世代を超える古いファイルだけを削除する', () => {
    const names = [
      'treegantt-20260101T000000.db',
      'treegantt-20260102T000000.db',
      'treegantt-20260103T000000.db',
      'treegantt-20260104T000000.db',
    ];
    for (const n of names) writeFileSync(join(backupDir, n), 'dummy');

    pruneOldBackups(backupDir, 2);

    const remaining = readdirSync(backupDir).sort();
    expect(remaining).toEqual(['treegantt-20260103T000000.db', 'treegantt-20260104T000000.db']);
  });

  it('ファイル数が retention 以下なら何も削除しない', () => {
    const names = ['treegantt-20260101T000000.db', 'treegantt-20260102T000000.db'];
    for (const n of names) writeFileSync(join(backupDir, n), 'dummy');

    pruneOldBackups(backupDir, 5);

    expect(readdirSync(backupDir).sort()).toEqual(names);
  });

  it('バックアップ以外の無関係なファイルは無視する', () => {
    writeFileSync(join(backupDir, 'treegantt-20260101T000000.db'), 'dummy');
    writeFileSync(join(backupDir, 'README.txt'), 'dummy');

    pruneOldBackups(backupDir, 0);

    expect(readdirSync(backupDir).sort()).toEqual(['README.txt']);
  });
});

describe('scheduleBackups', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('起動時に1回、実行する', () => {
    const runBackupFn = vi.fn().mockResolvedValue('dest.db');
    const logger = { error: vi.fn() };

    scheduleBackups(
      { db: {} as Database.Database, backupDir: '/tmp/x', retention: 7, intervalHours: 24, logger },
      runBackupFn,
    );

    expect(runBackupFn).toHaveBeenCalledTimes(1);
  });

  it('intervalHours=0 のとき、以後スケジュールしない（起動時の1回のみ）', async () => {
    const runBackupFn = vi.fn().mockResolvedValue('dest.db');
    const logger = { error: vi.fn() };

    scheduleBackups(
      { db: {} as Database.Database, backupDir: '/tmp/x', retention: 7, intervalHours: 0, logger },
      runBackupFn,
    );

    await vi.advanceTimersByTimeAsync(1000 * 60 * 60 * 24 * 10); // 10日分進めても増えない

    expect(runBackupFn).toHaveBeenCalledTimes(1);
  });

  it('intervalHours ごとに繰り返し実行し、stop() で止まる', async () => {
    const runBackupFn = vi.fn().mockResolvedValue('dest.db');
    const logger = { error: vi.fn() };

    const handle = scheduleBackups(
      { db: {} as Database.Database, backupDir: '/tmp/x', retention: 7, intervalHours: 1, logger },
      runBackupFn,
    );

    await vi.advanceTimersByTimeAsync(1000 * 60 * 60 * 2); // 2時間進める

    // 起動時1回 + 1時間後 + 2時間後 = 3回
    expect(runBackupFn).toHaveBeenCalledTimes(3);

    handle.stop();
    await vi.advanceTimersByTimeAsync(1000 * 60 * 60 * 5);

    // stop 後は増えない
    expect(runBackupFn).toHaveBeenCalledTimes(3);
  });
});
