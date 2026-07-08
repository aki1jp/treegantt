import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolveFrontendPort } from './src/utils/portConfig';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: resolveFrontendPort(),
    proxy: {
      '/api': { target: process.env.API_PROXY_TARGET ?? 'http://localhost:4000', changeOrigin: true },
    },
  },
  test: {
    coverage: {
      // istanbul を使う: vitest(内部 vite8/oxc) と dev/build(vite5/babel) の混在下で
      // v8 provider が一部ファイルを計上漏れするため。istanbul は計測をコードへ埋め込み正確。
      provider: 'istanbul',
      // アプリ全体（components/App/version 含む）を計測対象にし、数値を実態化する。
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/__tests__/**', 'src/**/*.test.{ts,tsx}', 'src/types/**', 'src/main.tsx'],
      // text は多数ファイル時に一部行を省くため、完全な per-file は html/json-summary で確認する
      reporter: ['text', 'json-summary', 'html'],
      skipFull: false,
      // 導入時の実測値（statements 86.6 / branches 85.38 / functions 78.53 / lines 89.06）から
      // 数ポイントの余裕を持たせた下限。黙って下がるのを防ぐためのゲートであり、
      // 現状の到達水準そのものを保証する値ではない（§16.5）。
      thresholds: {
        statements: 84,
        branches: 80,
        functions: 75,
        lines: 86,
      },
    },
  },
} as Parameters<typeof defineConfig>[0]);
