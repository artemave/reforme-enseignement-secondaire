import { JSDOM } from 'jsdom';
import type { AnnotationIndex } from './model.js';
import { render } from './ui.js';
import { renderHelp } from './help.js';
import { resolvePassage } from './routes.js';

/** Publish the complete layout; the browser only activates its interactive controls. */
export function renderStaticHtml(html: string, index: AnnotationIndex, url: string, decorate?: (root: Document) => void): string {
  const dom = new JSDOM(html, { url });
  const root = dom.window.document;
  const base = new URL('.', root.baseURI).pathname;
  if (new URL(url).pathname === `${base}comment-ca-marche/`) renderHelp(index, root);
  else render(index, root, resolvePassage(index, new URL(url).pathname, base).target);
  // Keep site navigation on the host serving this HTML, including fixture test ports.
  for (const anchor of root.querySelectorAll<HTMLAnchorElement>('a[href]')) {
    const href = new URL(anchor.href);
    if (href.origin === new URL(url).origin) anchor.setAttribute('href', `${href.pathname}${href.search}${href.hash}`);
  }
  decorate?.(root);
  // Giscus starts after hydration, rather than racing the page's theme setup.
  root.querySelectorAll('#thread').forEach((thread) => { thread.replaceChildren(); });
  const data = root.createElement('script');
  data.id = 'annotation-index'; data.type = 'application/json';
  data.textContent = JSON.stringify(index).replaceAll('<', '\\u003c');
  root.body.append(data);
  const result = dom.serialize();
  dom.window.close();
  return result;
}
