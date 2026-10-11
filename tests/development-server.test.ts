// @vitest-environment node
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { FixtureWorkspace } from '../dev/workspace.js';
import { fixtureRepository } from '../dev/scenario.js';
import { middleware, route } from '../dev/server.js';
import { dashboard, createPage, errorPage, escapeHtml, itemPage, linkedText } from '../dev/pages.js';
import { createLogger, createServer as createViteServer } from 'vite';
import viteConfig from '../vite.config.js';
const markdown = await readFile('dev/fixtures/document.md', 'utf8');
const url = (path: string) => new URL(path, 'http://localhost');

describe('development-only pages and routes', () => {
  it('escapes all user text and renders different states, forms and comments', () => {
    expect(linkedText('Before [PR](https://github.com/development/document-annotations/pull/4) http://localhost:4173/#u-2 https://example.com/?a=1&b=2 <script>')).toBe('Before <a href="/__dev/github/development/document-annotations/pull/4">PR</a> <a href="/#u-2">http://localhost:4173/#u-2</a> <a href="https://example.com/?a=1&#38;b=2">https://example.com/?a=1&#38;b=2</a> &#60;script&#62;');
    expect(escapeHtml('<script>&"\'')).toBe('&#60;script&#62;&#38;&#34;&#39;');
    const workspace = new FixtureWorkspace(markdown);
    const item = workspace.backend.item(1);
    expect(itemPage(item)).toContain('Fermer');
    expect(itemPage({ ...item, open: false })).toContain('Rouvrir');
    expect(itemPage({ ...item, kind: 'pr', open: false, merged: true })).toContain('Fusionnée');
    expect(itemPage(workspace.backend.item(4))).toContain('Fusionner la proposition');
    item.comments = [{ id: 1, body: '<b>reader</b>', login: 'reader' }, { id: 2, body: 'bot', login: 'github-actions[bot]' }];
    expect(itemPage(item)).toContain('data-reader-comment'); expect(itemPage(item)).toContain('data-bot-comment');
    expect(dashboard(workspace)).toContain('Fusionnée');
    expect(createPage('issue', new URLSearchParams())).toContain('Créer la discussion');
    expect(createPage('pr', new URLSearchParams({ title: 'Title', body: 'Quote' }))).toContain('Créer la proposition');
    expect(errorPage('<error>')).toContain('&#60;error&#62;');
  });
  it('serves snapshots, simulator, existing items, new-item forms and fallback GitHub links', async () => {
    const workspace = new FixtureWorkspace(markdown); await workspace.dispatch({ type: 'rebuild' });
    const onPublished = vi.fn();
    const prefix = `/__dev/github/${fixtureRepository}`;
    for (const path of ['/annotations.json', '/__dev/state', '/__dev/', `${prefix}/issues/new`, `${prefix}/compare/main`, `${prefix}/issues/3`, `${prefix}/pull/4`, `${prefix}/blob/main/content/document.md`, prefix]) {
      expect((await route(workspace, 'GET', url(path), {}))?.status).toBe(200);
    }
    expect(await route(workspace, 'GET', url('/other'), {})).toBeNull();
    expect(await route(workspace, 'PUT', url('/__dev/action'), {})).toBeNull();
    const created = await route(workspace, 'POST', url('/__dev/action'), { type: 'create', kind: 'issue', title: 'Created', body: 'body' }, onPublished);
    expect(onPublished).toHaveBeenCalledOnce();
    await expect(route(workspace, 'POST', url('/__dev/action'), { type: 'matching', available: 'no' }, onPublished)).rejects.toThrow('503');
    expect(onPublished).toHaveBeenCalledOnce();
    await workspace.dispatch({ type: 'matching', available: 'yes' });
    expect(created?.headers['Location']).toContain('/issues/9');
    expect((await route(workspace, 'POST', url('/__dev/action'), { type: 'edit', number: 9, title: 'Edited', body: 'body' }))?.headers['Location']).toContain('/issues/9');
    expect((await route(workspace, 'POST', url('/__dev/action'), { type: 'rebuild' }))?.headers['Location']).toBe('/__dev/');
  });
  it('handles real HTTP form/JSON requests, pass-through, invalid JSON/actions and matching failures', async () => {
    const workspace = new FixtureWorkspace(markdown);
    const handle = middleware(workspace);
    const server = createServer((request, response) => { handle(request, response, () => { response.writeHead(404); response.end('pass through'); }); });
    await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve); });
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('Expected bound server');
    const base = `http://127.0.0.1:${String(address.port)}`;
    try {
      expect((await fetch(`${base}/__dev/`)).status).toBe(200);
      expect((await fetch(`${base}/other`)).status).toBe(404);
      const json = (data: unknown) => fetch(`${base}/__dev/action`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data), redirect: 'manual' });
      expect((await json({ type: 'reset' })).status).toBe(303);
      const form = await fetch(`${base}/__dev/action`, { method: 'POST', body: new URLSearchParams({ type: 'state', number: '3', state: 'closed' }), redirect: 'manual' });
      expect(form.status).toBe(303);
      expect((await json({ type: 'unknown' })).status).toBe(400);
      expect((await fetch(`${base}/__dev/action`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'invalid' })).status).toBe(400);
      const failure = await json({ type: 'matching', available: 'no' });
      expect(await failure.text()).toContain('503');
      vi.spyOn(workspace, 'dispatch').mockRejectedValueOnce('non-Error failure');
      expect(await (await json({ type: 'reset' })).text()).toContain('Unknown fixture error');
    } finally { await new Promise<void>((resolve, reject) => { server.close((error) => { if (error !== undefined) reject(error); else resolve(); }); }); }
  });
  it('installs fixtures only for explicit development mode, never build mode', async () => {
    expect(viteConfig({ command: 'build', mode: 'fixtures' }).plugins).toEqual([]);
    expect(viteConfig({ command: 'serve', mode: 'development' }).plugins).toEqual([]);
    expect(viteConfig({ command: 'serve', mode: 'fixtures' }).optimizeDeps).toEqual({ entries: ['index.html'] });
    const cacheDir = await mkdtemp(join(tmpdir(), 'document-fixture-test-'));
    const logger = createLogger();
    const errors = vi.spyOn(logger, 'error');
    // This test requests HTML/JSON only; the browser suite exercises JS optimisation.
    const server = await createViteServer({ ...viteConfig({ command: 'serve', mode: 'fixtures' }), configFile: false, cacheDir, customLogger: logger, optimizeDeps: { noDiscovery: true, include: [] }, server: { host: '127.0.0.1', port: 0 } });
    try {
      await server.listen();
      const address = server.httpServer?.address();
      if (address === undefined || address === null || typeof address === 'string') throw new Error('Expected Vite address');
      const base = `http://127.0.0.1:${String(address.port)}`;
      expect(await (await fetch(base)).text()).toContain('/dev/client.ts');
      const index = await (await fetch(`${base}/annotations.json`)).json() as { repository: string };
      expect(index.repository).toBe(fixtureRepository);
      const send = vi.spyOn(server.ws, 'send');
      await fetch(`${base}/__dev/action`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'state', number: 3, state: 'closed' }) });
      expect(send).toHaveBeenCalledWith({ type: 'full-reload', path: '*' });
    } finally { await server.close(); await rm(cacheDir, { recursive: true, force: true }); }
    expect(errors).not.toHaveBeenCalled();
  });
});
