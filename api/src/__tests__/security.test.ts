import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

// api/package.json を読む（このテストは src/__tests__/ にある）
const pkg = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf-8'),
) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };

const allDeps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };

describe('依存パッケージのセキュリティガード', () => {
  // fast-jwt@<=6.2.3 は CRITICAL（空HMACシークレットによる JWT 認証バイパス
  // GHSA-gmvf-9v4p-v8jc 他）。未使用のため削除済み。再混入を防ぐ。
  it('既知脆弱な fast-jwt を依存に含めない', () => {
    expect(allDeps).not.toHaveProperty('fast-jwt');
  });
});
