import { z } from 'zod';

const scrollState = z.object({ documentScroll: z.object({ left: z.number(), top: z.number() }) });

/** Returning through history lets the browser restore the document's scroll position. */
export function preserveDocumentScroll(root: Document, link: HTMLAnchorElement): void {
  const browser = root.defaultView;
  if (browser === null || root.referrer === '' || browser.history.length < 2) return;
  const previous = new URL(root.referrer);
  const documentUrl = new URL('.', root.baseURI);
  if (previous.origin !== documentUrl.origin || previous.pathname !== documentUrl.pathname) return;
  link.addEventListener('click', (event) => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    browser.history.back();
  });
}

/** The document renders after its JSON arrives, so native restoration can run too early. */
export function restoreDocumentScroll(root: Document): void {
  const browser = root.defaultView;
  if (browser === null) return;
  browser.history.scrollRestoration = 'manual';
  browser.addEventListener('pagehide', () => {
    browser.history.replaceState({ documentScroll: { left: browser.scrollX, top: browser.scrollY } }, '');
  });
  const saved = scrollState.safeParse(browser.history.state as unknown);
  if (!saved.success) {
    root.getElementById(new URL(root.URL).hash.slice(1))?.scrollIntoView({ behavior: 'instant' });
    return;
  }
  const restore = (): void => {
    browser.scrollTo({ ...saved.data.documentScroll, behavior: 'instant' });
    if (Math.abs(browser.scrollY - saved.data.documentScroll.top) < 1) observer.disconnect();
  };
  // The comment widget can increase page height after load; retry a clamped position.
  const observer = new browser.ResizeObserver(restore);
  observer.observe(root.body);
  restore();
}
