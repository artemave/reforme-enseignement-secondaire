import { readFileSync } from 'node:fs';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, load } from '../src/ui.js';
import { unit, item, index, fetchQueue } from './fixtures.js';
const showModal = vi.fn();
const close = vi.fn();
const html = readFileSync('index.html', 'utf8');
beforeEach(() => {
  document.documentElement.innerHTML = html;
  showModal.mockClear();
  HTMLDialogElement.prototype.showModal = showModal;
  close.mockClear();
  HTMLDialogElement.prototype.close = close;
});
function button(id: string) {
  const found = document.querySelector<HTMLButtonElement>(`${id} .annotation-button`);
  if (found === null) throw new Error('Expected annotation control');
  return found;
}
describe('static reader', () => {
  it('renders safe Markdown and contents with accessible annotation controls', () => {
    render({ ...index, units: [unit, { ...unit, id: 'u-2', kind: 'section', label: 'Section' }, { ...unit, id: 'u-3', kind: 'paragraph', html: '<p id="spoof">Hello<script>alert(1)</script><img src="x" onerror="alert(1)"><a href="javascript:alert(1)">bad</a><style>body{display:none}</style></p>' }], annotations: [{ number: 1, kind: 'issue', title: item.title, url: item.url, targetId: unit.id }, { number: 2, kind: 'pr', title: 'Proposal', url: 'https://github.com/a/b/pull/2', targetId: unit.id }] }, document);
    expect(document.querySelector('#contents')?.textContent).toBe('Section');
    expect(document.querySelector('#units script')).toBeNull();
    expect(document.querySelector('#units style')).toBeNull();
    expect(document.querySelector('#units [onerror]')).toBeNull();
    expect(document.querySelector('#spoof')).toBeNull();
    expect(document.querySelector('#units a')?.hasAttribute('href')).toBe(false);
    expect(button('#u-1').textContent).toBe('2');
    expect(button('#u-3').textContent).toBe('+');
    expect(button('#u-1').getAttribute('aria-haspopup')).toBe('dialog');
    button('#u-1').click();
    expect(showModal).toHaveBeenCalledOnce();
    expect(document.querySelector('#items')?.textContent).toContain('Discussion #1');
    expect(document.querySelector('#items')?.textContent).toContain('Proposition #2');
    expect(document.querySelector('#items .discussion-icon')?.textContent).toBe('?');
    expect(document.querySelector('#items .proposal-icon')?.textContent).toBe('↗');
    expect(document.querySelector('#items .item-kind-icon')?.getAttribute('aria-hidden')).toBe('true');
    expect(document.querySelector('#panel-title')?.textContent).toBe('Title');
    expect(document.querySelector<HTMLAnchorElement>('#new-pr')?.href).toContain('quick_pull=1');
    button('#u-3').click();
    expect(document.querySelector('#panel-title')?.textContent).toBe('Discussion du passage');
    expect(document.querySelector('#items')?.textContent).toContain('Aucun échange');
    expect(document.querySelector('#passage')?.textContent).toBe('# Title');
    document.querySelector<HTMLButtonElement>('#close-panel')?.click();
    expect(close).toHaveBeenCalledOnce();
    document.querySelector<HTMLElement>('#passage')?.click();
    expect(close).toHaveBeenCalledOnce();
    document.querySelector<HTMLDialogElement>('#annotations')?.click();
    expect(close).toHaveBeenCalledTimes(2);
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
