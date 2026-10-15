import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { expect, it, vi } from 'vitest';
import { renderStaticHtml } from '../src/prerender.js';
import { load } from '../src/ui.js';
import { index, unit, fetchQueue } from './fixtures.js';

const template = readFileSync('index.html', 'utf8').replace('<head>', '<head><base href="/repo/">');
const paragraph = { ...unit, id: 'u-2', kind: 'paragraph' as const, html: '<p>A complete paragraph.</p>' };
const configured = { ...index, units: [unit, paragraph] };

it.each(['', 'passage/hash/u-2/', 'comment-ca-marche/'])('publishes %s before JavaScript, then activates without replacing its content', async (path) => {
  const url = `http://localhost:3000/repo/${path}`;
  const dom = new JSDOM(renderStaticHtml(template, configured, url), { url });
  const root = dom.window.document;
  const main = root.querySelector('main');
  const content = main?.textContent;
  const first = main?.firstElementChild;
  expect(content).not.toContain('Chargement');
  expect(root.querySelector<HTMLElement>('.site-header')?.hidden).toBe(path !== '');
  expect(root.querySelector('.invitation:not([hidden])') !== null).toBe(path === '');
  const fetcher = fetchQueue(configured);
  await load(root, fetcher);
  expect(fetcher).toHaveBeenCalledWith('./annotations.json', { cache: 'no-store' });
  expect(root.querySelector('main')).toBe(main);
  expect(main?.firstElementChild).toBe(first);
  expect(main?.textContent).toBe(content);
  dom.window.close();
});

it('escapes script delimiters in the inline index and sanitizes the published quotation', () => {
  const unsafe = { ...paragraph, markdown: '</script><script>alert(1)</script>', html: '<p>Safe<script>alert(1)</script></p>' };
  const html = renderStaticHtml(template, { ...index, units: [unit, unsafe] }, 'http://localhost:3000/repo/passage/hash/u-2/');
  const dom = new JSDOM(html);
  expect(dom.window.document.querySelector('blockquote')?.textContent).toBe('Safe');
  expect(dom.window.document.querySelector('#annotation-index')?.textContent).toContain('\\u003c/script>');
  expect(JSON.parse(dom.window.document.querySelector('#annotation-index')?.textContent ?? '') as unknown).toEqual({ ...index, units: [unit, unsafe] });
  dom.window.close();
});

it('activates a prerendered document without a discussion target', async () => {
  const dom = new JSDOM(renderStaticHtml(template, { ...index, units: [] }, 'http://localhost:3000/repo/'), { url: 'http://localhost:3000/repo/' });
  await load(dom.window.document, fetchQueue({ ...index, units: [] }));
  expect(dom.window.document.querySelector<HTMLElement>('#annotations')?.hidden).toBe(true);
  dom.window.close();
});

it('refreshes stale published annotations without relying on a cached HTML index', async () => {
  const dom = new JSDOM(renderStaticHtml(template, configured, 'http://localhost:3000/repo/'), { url: 'http://localhost:3000/repo/' });
  const current = { ...configured, annotations: [{ number: 7, kind: 'discussion' as const, title: 'New discussion', url: 'https://github.com/a/b/discussions/7', targetId: paragraph.id, comments: 1 }] };
  await load(dom.window.document, fetchQueue(current));
  expect(dom.window.document.querySelector('#u-2 .annotation-label')?.textContent).toBe('1');
  dom.window.close();
});

it('keeps the published content readable when the freshness request fails', async () => {
  const dom = new JSDOM(renderStaticHtml(template, configured, 'http://localhost:3000/repo/'), { url: 'http://localhost:3000/repo/' });
  await load(dom.window.document, vi.fn<typeof fetch>().mockRejectedValue(new Error('offline')));
  expect(dom.window.document.querySelector('h1')?.textContent).toBe('Title');
  dom.window.close();
});

it('refreshes a cached paragraph page without duplicating its return link', async () => {
  const url = 'http://localhost:3000/repo/passage/hash/u-2/';
  const dom = new JSDOM(renderStaticHtml(template, configured, url), { url });
  await load(dom.window.document, fetchQueue({ ...configured, generatedAt: '2026-10-12T00:00:00.000Z' }));
  expect(dom.window.document.querySelectorAll('[data-document-back]')).toHaveLength(1);
  expect(dom.window.document.querySelector('blockquote')?.textContent).toBe('A complete paragraph.');
  dom.window.close();
});
