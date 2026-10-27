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

describe('プロキシ下のビルドは .env の記述だけで切り替える（§2.2）', () => {
  const PROXY_ARGS = ['HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'http_proxy', 'https_proxy', 'no_proxy'];

  // services 直下（インデント2）のサービス名ごとにブロックを切り出す
  const serviceBlock = (src: string, name: string) => {
    const lines = src.split('\n');
    const start = lines.findIndex(l => l === `  ${name}:`);
    if (start < 0) return '';
    const rest = lines.slice(start + 1);
    const end = rest.findIndex(l => /^ {0,2}\S/.test(l));
    return rest.slice(0, end < 0 ? undefined : end).join('\n');
  };

  for (const service of ['api', 'frontend']) {
    it(`docker-compose.yml の ${service} の build.args にプロキシ変数を値なしで列挙する`, () => {
      const block = serviceBlock(read('docker-compose.yml'), service);
      for (const arg of PROXY_ARGS) {
        expect(block).toMatch(new RegExp(`^\\s+- ${arg}\\s*(#.*)?$`, 'm'));
      }
    });
  }

  it('compose ファイルにプロキシの具体値を書かない', () => {
    for (const file of ['docker-compose.yml', 'docker-compose.dev.yml']) {
      expect(read(file)).not.toMatch(/_proxy\s*[:=]/i);
    }
  });

  it('.env.example にプロキシ設定のコメントアウト例がある', () => {
    for (const arg of ['HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY']) {
      expect(read('.env.example')).toMatch(new RegExp(`^# ${arg}=`, 'm'));
    }
  });
});
