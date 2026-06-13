import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

// api/package.json を読む（このテストは src/__tests__/ にある）
const pkg = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf-8'),
) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };

const allDeps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };

// "^5.8.5" / "5.8.5" / ">=5" などから major 番号を取り出す
function major(range: string | undefined): number {
  const m = (range ?? '').match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

describe('依存パッケージのセキュリティガード', () => {
  // fast-jwt@<=6.2.3 は CRITICAL（空HMACシークレットによる JWT 認証バイパス
  // GHSA-gmvf-9v4p-v8jc 他）。未使用のため削除済み。再混入を防ぐ。
  it('既知脆弱な fast-jwt を依存に含めない', () => {
    expect(allDeps).not.toHaveProperty('fast-jwt');
  });

  // fastify <=5.8.2 は HIGH（sendWebStream DoS・body検証バイパス・proto/host偽装ほか）。
  // 5.8.3+ で解消。v4 系へ巻き戻ると HIGH が再発するため major>=5 を強制する。
  it('fastify は major 5 以上（HIGH 脆弱性の修正版）', () => {
    expect(major(allDeps['fastify'])).toBeGreaterThanOrEqual(5);
  });

  // fastify5 互換ライン（巻き戻り防止）
  it('@fastify/cors は major 10 以上（fastify5 対応）', () => {
    expect(major(allDeps['@fastify/cors'])).toBeGreaterThanOrEqual(10);
  });
  it('@fastify/compress は major 8 以上（fastify5 対応）', () => {
    expect(major(allDeps['@fastify/compress'])).toBeGreaterThanOrEqual(8);
  });

  // uuid <11.1.1 は MODERATE（buf 提供時のバッファ境界チェック欠如 GHSA-w5hq-g745-h8pq）。
  it('uuid は major 11 以上（脆弱性修正版）', () => {
    expect(major(allDeps['uuid'])).toBeGreaterThanOrEqual(11);
  });
});
