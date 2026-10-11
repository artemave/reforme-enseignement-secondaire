import { readFile } from 'node:fs/promises';
import type { Plugin } from 'vite';
import { FixtureWorkspace } from './workspace.js';
import { middleware } from './server.js';

export function fixturePlugin(): Plugin {
  return {
    name: 'development-github-fixtures', apply: 'serve',
    async configureServer(server) {
      const workspace = new FixtureWorkspace(await readFile('dev/fixtures/document.md', 'utf8'), `http://localhost:${String(server.config.server.port)}/`);
      await workspace.dispatch({ type: 'rebuild' });
      server.middlewares.use(middleware(workspace, () => { server.ws.send({ type: 'full-reload', path: '*' }); }));
    },
    transformIndexHtml: () => [{ tag: 'base', attrs: { href: '/' }, injectTo: 'head-prepend' }, { tag: 'script', attrs: { type: 'module', src: '/dev/client.ts' }, injectTo: 'body' }],
  };
}
