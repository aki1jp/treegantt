// @ts-check
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'coverage/**', 'node_modules/**', 'src/node_modules/**'],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      // 未使用引数はプレフィックス `_` で意図明示できるようにする（Fastify ハンドラの (req, reply) 等）
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // 未処理の Promise（await / `.catch()` / `void` のいずれも無い fire-and-forget）を検出する。
    // 型情報が必要なため、tsconfig の対象範囲（src/**）に絞って type-aware linting を有効化する
    // （eslint.config.js / vitest.config.ts 等の tsconfig 対象外ファイルを含めると型情報エラーになるため）。
    files: ['src/**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
    },
  },
);
