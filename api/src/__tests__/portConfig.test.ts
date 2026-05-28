import { describe, it, expect, afterEach, vi } from 'vitest';

afterEach(() => vi.unstubAllEnvs());

// api/src/config.ts が存在しないと失敗する（TDD: red フェーズ）
const { resolveApiPort, resolveWsPort } = await import('../config.js');

describe('resolveApiPort', () => {
  it('PORT 未設定のときデフォルト 4000 を返す', () => {
    vi.stubEnv('PORT', '');
    expect(resolveApiPort()).toBe(4000);
  });

  it('PORT=5000 のとき 5000 を返す', () => {
    vi.stubEnv('PORT', '5000');
    expect(resolveApiPort()).toBe(5000);
  });

  it('PORT=0 のとき 0 を返す（明示ゼロは有効）', () => {
    vi.stubEnv('PORT', '0');
    expect(resolveApiPort()).toBe(0);
  });

  it('PORT が空文字のときデフォルト 4000 を返す（.env に PORT= と書いた場合）', () => {
    vi.stubEnv('PORT', '');
    expect(resolveApiPort()).toBe(4000);
  });

  it('PORT が数値以外のとき NaN になる（呼び出し側が検知できる）', () => {
    vi.stubEnv('PORT', 'invalid');
    expect(isNaN(resolveApiPort())).toBe(true);
  });
});

describe('resolveWsPort', () => {
  it('WS_PORT 未設定のときデフォルト 4001 を返す', () => {
    vi.stubEnv('WS_PORT', '');
    expect(resolveWsPort()).toBe(4001);
  });

  it('WS_PORT=5001 のとき 5001 を返す', () => {
    vi.stubEnv('WS_PORT', '5001');
    expect(resolveWsPort()).toBe(5001);
  });

  it('PORT と WS_PORT は独立して設定できる', () => {
    vi.stubEnv('PORT',    '6000');
    vi.stubEnv('WS_PORT', '6001');
    expect(resolveApiPort()).toBe(6000);
    expect(resolveWsPort()).toBe(6001);
  });
});
