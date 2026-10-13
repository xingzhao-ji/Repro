import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', '.repro-runs/**', '.repro-cache/**', 'assets/**', 'fixtures/**'] },
  { files: ['src/**/*.ts', 'web/**/*.tsx', 'tests/**/*.ts', 'scripts/**/*.ts'], extends: [js.configs.recommended, ...tseslint.configs.recommended], rules: { '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }], '@typescript-eslint/no-explicit-any': 'error' } }
);
