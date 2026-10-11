import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { environment: 'jsdom', include: ['tests/**/*.test.ts'], coverage: { provider: 'v8', include: ['src/**/*.ts', 'scripts/**/*.ts', 'dev/**/*.ts', 'vite.config.ts'], thresholds: { perFile: true, statements: 100, branches: 100, functions: 100, lines: 100 }, reporter: ['text', 'html', 'json-summary'] } } });
