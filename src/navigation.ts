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
