// @vitest-environment node
/**
 * ポート設定ユーティリティのテスト。
 * vite.config.ts から呼ばれる resolveFrontendPort が
 * FRONTEND_PORT 環境変数を正しく反映することを確認する。
 */
import { describe, it, expect, afterEach, vi } from 'vitest';

afterEach(() => vi.unstubAllEnvs());

// frontend/src/utils/portConfig.ts が存在しないと失敗する（TDD: red フェーズ）
const { resolveFrontendPort } = await import('../utils/portConfig');

describe('resolveFrontendPort', () => {
  it('FRONTEND_PORT 未設定のときデフォルト 3000 を返す', () => {
    vi.stubEnv('FRONTEND_PORT', '');
    expect(resolveFrontendPort()).toBe(3000);
  });

  it('FRONTEND_PORT=8080 のとき 8080 を返す', () => {
    vi.stubEnv('FRONTEND_PORT', '8080');
    expect(resolveFrontendPort()).toBe(8080);
  });

  it('FRONTEND_PORT=443 のとき 443 を返す', () => {
    vi.stubEnv('FRONTEND_PORT', '443');
    expect(resolveFrontendPort()).toBe(443);
  });

  it('FRONTEND_PORT が空文字のときデフォルト 3000 を返す（.env に FRONTEND_PORT= と書いた場合）', () => {
    vi.stubEnv('FRONTEND_PORT', '');
    expect(resolveFrontendPort()).toBe(3000);
  });

  it('FRONTEND_PORT が数値以外のとき NaN を返す', () => {
    vi.stubEnv('FRONTEND_PORT', 'abc');
    expect(isNaN(resolveFrontendPort())).toBe(true);
  });
});

describe('vite.config と FRONTEND_PORT の統合', () => {
  it('FRONTEND_PORT=7777 のとき vite.config の server.port が 7777 になる', async () => {
    vi.stubEnv('FRONTEND_PORT', '7777');
    vi.resetModules();
    // vite.config.ts は resolveFrontendPort() を呼ぶため、env stub 後に再 import する
    const { default: config } = await import('../../vite.config');
    expect((config as { server?: { port?: number } }).server?.port).toBe(7777);
  });

  it('FRONTEND_PORT 未設定のとき vite.config の server.port が 3000 になる', async () => {
    vi.stubEnv('FRONTEND_PORT', '');
    vi.resetModules();
    const { default: config } = await import('../../vite.config');
    expect((config as { server?: { port?: number } }).server?.port).toBe(3000);
  });
});
