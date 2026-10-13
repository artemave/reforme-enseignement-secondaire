import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
export default tseslint.config(
  { ignores: ['dist/**', 'coverage/**', 'node_modules/**', 'playwright-report/**', 'test-results/**', '.playwright-mcp/**'] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  { files: ['**/*.ts'], languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname }, globals: { ...globals.node, ...globals.browser } }, rules: {
    '@typescript-eslint/consistent-type-imports': 'error',
    '@typescript-eslint/no-non-null-assertion': 'error',
    '@typescript-eslint/strict-boolean-expressions': 'error',
    '@typescript-eslint/switch-exhaustiveness-check': 'error'
  } },
  { files: ['**/*.js'], ...tseslint.configs.disableTypeChecked, languageOptions: { globals: globals.node } }
);
