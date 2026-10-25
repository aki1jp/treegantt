import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

// リポジトリ直下の Docker Compose 構成（§2.2・§13.2）を静的に検査する。
// この環境には Docker が無いため、起動ではなくファイル構成とコマンド文字列で確かめる。
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../../..');
const read = (name: string) => readFileSync(join(ROOT, name), 'utf8');

describe('docker compose up は本番構成のみで起動する（§2.2）', () => {
  it('Compose が自動で重ねる docker-compose.override.yml を置かない', () => {
    expect(existsSync(join(ROOT, 'docker-compose.override.yml'))).toBe(false);
  });

  it('docker-compose.yml は開発ステージ（target: dev）を参照しない', () => {
    expect(read('docker-compose.yml')).not.toMatch(/target:\s*dev/);
  });

  it('開発構成は docker-compose.dev.yml として明示的に重ねる', () => {
    expect(existsSync(join(ROOT, 'docker-compose.dev.yml'))).toBe(true);
  });
});

describe('開発構成の起動コマンド（§2.2）', () => {
  const devCommands = () => {
    const path = join(ROOT, 'docker-compose.dev.yml');
    const src = existsSync(path) ? readFileSync(path, 'utf8') : '';
    return src.split('\n').filter(l => /^\s*command:/.test(l) && l.includes('npm run dev'));
  };

  it('api と frontend の 2 サービスに npm run dev の起動コマンドがある', () => {
    expect(devCommands()).toHaveLength(2);
  });

  it('npm ci が失敗したら npm run dev へ進まない（; で連結しない）', () => {
    const cmds = devCommands();
    expect(cmds.length).toBeGreaterThan(0);
    for (const cmd of cmds) {
      expect(cmd).not.toMatch(/;\s*npm run dev/);
      expect(cmd).toMatch(/&&\s*npm run dev/);
    }
  });
});
