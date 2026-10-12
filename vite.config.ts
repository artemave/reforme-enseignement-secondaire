import { defineConfig } from 'vite';
import { fixturePlugin } from './dev/vite.js';
export default defineConfig(({ mode, command }) => ({ base: './', optimizeDeps: { entries: ['index.html'], include: ['marked'] }, build: { target: 'es2023' }, plugins: mode === 'fixtures' && command === 'serve' ? [fixturePlugin()] : [] }));
