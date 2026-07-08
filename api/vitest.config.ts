import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    // テストごとにDBをリセットするためシリアル実行
    singleFork: true,
    coverage: {
      // 導入時の実測値（statements 96.93 / branches 92.8 / functions 96.99 / lines 98.53）から
      // 数ポイントの余裕を持たせた下限。黙って下がるのを防ぐためのゲートであり、
      // 現状の到達水準そのものを保証する値ではない（§16.5）。
      thresholds: {
        statements: 95,
        branches: 88,
        functions: 95,
        lines: 97,
      },
    },
  },
});
