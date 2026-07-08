// @ts-check
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  {
    ignores: ['dist/**', 'coverage/**', 'node_modules/**'],
  },
  ...tseslint.configs.recommended,
  {
    plugins: { 'react-hooks': reactHooks },
    rules: {
      // stale closure（依存配列の抜け）検出。React Compiler 前提の追加ルール群は
      // 既存コードベースがその前提で書かれていないため今回は導入しない。
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // 未処理の Promise（await / `.catch()` / `void` のいずれも無い fire-and-forget）を検出する。
    // 型情報が必要なため、tsconfig の対象範囲（src）に絞って type-aware linting を有効化する
    // （eslint.config.js / vite.config.ts 等の tsconfig 対象外ファイルを含めると型情報エラーになるため）。
    files: ['src/**/*.{ts,tsx}'],
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
