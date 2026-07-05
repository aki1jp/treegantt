import { defineConfig, devices } from '@playwright/test';
import { join } from 'path';

// リポジトリルート（e2e/ の一つ上）。チェックアウト先の絶対パスは環境（ローカル /workspace・
// GitHub Actions の /home/runner/work/... 等）で異なるため、ハードコードせずここから解決する。
// e2e/ には "type": "module" が無く CommonJS として読み込まれるため、素の __dirname を使える
// （import.meta.url は playwright の設定ローダーと衝突するため使わない）。
const REPO_ROOT = join(__dirname, '..');

const FRONTEND_PORT = process.env.FRONTEND_PORT ?? '3001';
const BASE_URL = `http://127.0.0.1:${FRONTEND_PORT}`;
const API_PORT = process.env.PORT ?? '4000';

// root なしのコンテナ環境用: e2e/libs/ に apt-get download + dpkg-deb --extract した .so を配置。
// Playwright の webServer 起動コマンドで同じ LD_LIBRARY_PATH を使う。
const LIBS_DIR = `${process.cwd()}/libs`;
const LD_LIBRARY_PATH = [LIBS_DIR, process.env.LD_LIBRARY_PATH].filter(Boolean).join(':');

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    launchOptions: {
      // process.env をマージして HOME 等を保持する（落とすと fontconfig が
      // ~/.local/share/fonts の Noto CJK を見つけられず日本語が豆腐化する）。
      env: { ...process.env, LD_LIBRARY_PATH },
    },
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: [
    {
      command: `cd ${join(REPO_ROOT, 'api')} && PORT=${API_PORT} npm run dev`,
      port: Number(API_PORT),
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: `cd ${join(REPO_ROOT, 'frontend')} && FRONTEND_PORT=${FRONTEND_PORT} npm run dev`,
      url: BASE_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
