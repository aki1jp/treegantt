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
);
