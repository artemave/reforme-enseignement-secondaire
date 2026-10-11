import { readFileSync } from 'node:fs';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, load } from '../src/ui.js';
import { unit, item, index, fetchQueue } from './fixtures.js';
const html = readFileSync('index.html', 'utf8');
beforeEach(() => {
  history.replaceState(null, '', '/');
  document.documentElement.innerHTML = html;
});
function button(id: string) {
  const found = document.querySelector<HTMLAnchorElement>(`${id} .annotation-button`);
  if (found === null) throw new Error('Expected annotation control');
  return found;
}
describe('static reader', () => {
  it('renders safe Markdown and contents with accessible annotation controls', () => {
    render({ ...index, units: [unit, { ...unit, id: 'u-2', kind: 'section', label: 'Section', html: '<h2>Section</h2>' }, { ...unit, id: 'u-3', kind: 'paragraph', html: '<p id="spoof">Hello<script>alert(1)</script><img src="x" onerror="alert(1)"><a href="javascript:alert(1)">bad</a><style>body{display:none}</style></p>' }], annotations: [{ number: 1, kind: 'discussion', title: item.title, url: item.url, targetId: unit.id }, { number: 2, kind: 'pr', title: 'Proposal', url: 'https://github.com/a/b/pull/2', targetId: unit.id }] }, document);
    expect(document.querySelector('#contents')?.textContent).toBe('Section');
    expect(document.querySelector<HTMLAnchorElement>('#u-2 h2 a')?.href).toBe('http://localhost:3000/#u-2');
    expect(document.querySelector('#units script')).toBeNull();
    expect(document.querySelector('#units style')).toBeNull();
    expect(document.querySelector('#units [onerror]')).toBeNull();
    expect(document.querySelector('#spoof')).toBeNull();
    expect(document.querySelector('#u-3 .passage a')?.hasAttribute('href')).toBe(false);
    expect(button('#u-1').textContent).toBe('1');
    expect(document.querySelector<HTMLElement>('.document-meta')?.hidden).toBe(false);
    expect(button('#u-3').textContent).toBe('+');
    expect(button('#u-1').href).toBe('http://localhost:3000/#annotations');
    expect(button('#u-3').href).toBe('http://localhost:3000/passage/hash/u-3/');
    expect(button('#u-1').getAttribute('aria-haspopup')).toBeNull();
    expect(document.querySelector<HTMLElement>('#items')?.hidden).toBe(true);
    expect(document.querySelector('#panel-title')?.textContent).toBe('Title');
    expect(document.querySelector('#new-discussion')).toBeNull();
    expect(document.querySelector('#new-pr')).toBeNull();

  });
  it('quotes the selected passage once, with selectable embedded discussions', () => {
    const paragraph = { ...unit, id: 'u-2', kind: 'paragraph' as const };
    const configured = { ...index, units: [unit, paragraph], giscus: { repositoryId: 'repo', categoryId: 'cat', category: 'General', categorySlug: 'general', clientUrl: 'https://giscus.app/client.js' }, annotations: [3, 4].map((number) => ({ number, kind: 'discussion' as const, title: `Question ${String(number)}`, url: `https://github.com/a/b/discussions/${String(number)}`, targetId: paragraph.id })) };
    render(configured, document, paragraph);
    expect(document.querySelectorAll('.unit')).toHaveLength(1);
    expect(document.querySelector<HTMLElement>('.document-meta')?.hidden).toBe(true);
    expect(document.querySelector('#units blockquote')?.innerHTML).toBe(paragraph.html);
    expect(document.querySelectorAll('blockquote')).toHaveLength(1);
    expect(document.querySelector('#units')?.previousElementSibling?.id).toBe('panel-title');
    expect(document.querySelector('.back-chevron')?.textContent).toBe('‹');
    expect(document.querySelector('.back-chevron')?.getAttribute('aria-hidden')).toBe('true');
    expect(document.querySelector('#annotations')?.textContent).not.toContain(paragraph.context);
    expect(document.querySelector('#annotations')?.tagName).toBe('SECTION');
    expect(document.querySelector('dialog')).toBeNull();
    expect(document.querySelector('.contribute')).toBeNull();
    expect(document.querySelector('#thread script')?.getAttribute('data-term')).toBe('3');
    expect(document.querySelector('#items h3')?.textContent).toBe('Autres discussions');
    expect(document.querySelector('#items ul')?.textContent).toBe('Question 4');
    document.querySelector<HTMLAnchorElement>('#items a')?.click();
    expect(document.querySelector('#thread script')?.getAttribute('data-term')).toBe('4');
    expect(document.querySelector('#items ul')?.textContent).toBe('Question 3');
  });
  it('offers a new discussion on an empty passage page and handles an empty document', () => {
    const paragraph = { ...unit, id: 'u-2', kind: 'paragraph' as const };
    render({ ...index, units: [unit, paragraph] }, document, paragraph);
    expect(document.querySelector('#panel-title')?.textContent).toBe('Discussion du passage');
    expect(document.querySelector('#items')?.textContent).toBe('');
    expect(document.querySelector('#new-discussion')).toBeNull();
    render({ ...index, units: [] }, document);
    expect(document.querySelector<HTMLElement>('#annotations')?.hidden).toBe(true);
  });
  it('resolves direct pages and redirects stale links with a notice', async () => {
    const paragraph = { ...unit, id: 'u-2', kind: 'paragraph' as const };
    const current = { ...index, units: [unit, paragraph] };
    document.head.insertAdjacentHTML('afterbegin', '<base href="/">');
    history.replaceState(null, '', '/passage/hash/u-2/');
    await load(document, fetchQueue(current));
    expect(document.querySelector('#annotations')?.tagName).toBe('SECTION');
    document.documentElement.innerHTML = html;
    document.head.insertAdjacentHTML('afterbegin', '<base href="/">');
    history.replaceState(null, '', '/passage/old/u-2/');
    await load(document, fetchQueue(current));
    expect(location.pathname).toBe('/');
    expect(document.querySelector('.flash')?.textContent).toContain('ancienne version');
    const detached = document.implementation.createHTMLDocument();
    detached.documentElement.innerHTML = html;
    detached.head.insertAdjacentHTML('afterbegin', '<base href="http://localhost/">');
    await load(detached, fetchQueue(index));
    expect(detached.querySelector('#u-1')).not.toBeNull();
  });
  it('replaces rendered targets instead of duplicating them', () => {
    render(index, document); render(index, document);
    expect(document.querySelectorAll('.unit')).toHaveLength(1);
  });
  it('reports missing page structure', () => {
    document.querySelector('#units')?.remove();
    expect(() => { render(index, document); }).toThrow('Missing element: #units');
  });
  it('loads and validates the generated index', async () => {
    await load(document, fetchQueue(index));
    expect(document.querySelector('#u-1')).not.toBeNull();
  });
  it('handles HTTP, invalid index, invalid JSON and network errors visibly', async () => {
    for (const fetcher of [
      vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 404 })),
      fetchQueue({}),
      vi.fn<typeof fetch>().mockResolvedValue(new Response('bad json')),
      vi.fn<typeof fetch>().mockRejectedValue(new Error('offline')),
    ]) {
      await load(document, fetcher);
      expect(document.querySelector('#units')?.getAttribute('role')).toBe('alert');
      expect(document.querySelector('#units')?.textContent).toContain('momentanément indisponible');
    }
  });
  it('uses default browser fetch', async () => {
    vi.stubGlobal('fetch', fetchQueue(index));
    await load(document);
    expect(document.querySelector('#u-1')).not.toBeNull();
    vi.unstubAllGlobals();
  });
});
