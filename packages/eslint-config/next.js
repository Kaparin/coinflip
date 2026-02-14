import baseConfig from './base.js';

/** @type {import('eslint').Linter.Config[]} */
export default [
  ...baseConfig,
  {
    rules: {
      // Next.js specific relaxations
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
];
