import { readFile } from 'node:fs/promises';
import type { Plugin } from 'vite';
import { FixtureWorkspace } from './workspace.js';
import { middleware } from './server.js';
import { renderFixtureNotice } from './navigation.js';
import { renderStaticHtml } from '../src/prerender.js';

export function fixturePlugin(): Plugin {
  let workspace: FixtureWorkspace;
  return {
    name: 'development-github-fixtures', apply: 'serve',
    async configureServer(server) {
      workspace = new FixtureWorkspace(await readFile('dev/fixtures/document.md', 'utf8'), `http://localhost:${String(server.config.server.port)}/`);
      await workspace.dispatch({ type: 'rebuild' });
      server.middlewares.use(middleware(workspace, () => { server.ws.send({ type: 'full-reload', path: '*' }); }));
    },
    transformIndexHtml: (html, context) => ({ html: renderStaticHtml(html.replace('<head>', '<head><base href="/">'), workspace.index, new URL(context.originalUrl ?? context.path, workspace.siteUrl).href, renderFixtureNotice), tags: [{ tag: 'script', attrs: { type: 'module', src: '/dev/client.ts' }, injectTo: 'body' }] }),
  };
}
