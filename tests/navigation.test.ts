import { afterEach, expect, it, vi } from 'vitest';
import { preserveDocumentScroll, restoreDocumentScroll } from '../src/navigation.js';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); history.replaceState(null, '', '/'); document.body.replaceChildren(); });
function setup(referrer: string, length = 2) {
  vi.spyOn(document, 'referrer', 'get').mockReturnValue(referrer);
  vi.spyOn(history, 'length', 'get').mockReturnValue(length);
  const back = vi.spyOn(history, 'back').mockImplementation(() => undefined);
  const link = document.createElement('a'); link.href = '#fallback';
  preserveDocumentScroll(document, link);
  return { link, back };
}
it('returns through history when the document was the previous page', () => {
  const { link, back } = setup(`${location.origin}/#u-4`);
  expect(link.dispatchEvent(new MouseEvent('click', { cancelable: true }))).toBe(false);
  expect(back).toHaveBeenCalledOnce();
});
it.each([
  { button: 2 }, { ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true },
])('keeps modified clicks as normal links: %j', (options) => {
  const { link, back } = setup(`${location.origin}/`);
  expect(link.dispatchEvent(new MouseEvent('click', { cancelable: true, ...options }))).toBe(true);
  expect(back).not.toHaveBeenCalled();
});
it.each([
  { referrer: '', length: 2 },
  { referrer: 'https://elsewhere.example/', length: 2 },
  { referrer: `${location.origin}/other-page/`, length: 2 },
  { referrer: `${location.origin}/`, length: 1 },
])('keeps the document anchor for a directly opened page: %j', ({ referrer, length }) => {
  const { link, back } = setup(referrer, length);
  expect(link.dispatchEvent(new MouseEvent('click', { cancelable: true }))).toBe(true);
  expect(back).not.toHaveBeenCalled();
});
it('supports rendering into a detached document', () => {
  const root = document.implementation.createHTMLDocument();
  const link = root.createElement('a');
  preserveDocumentScroll(root, link);
  expect(link.dispatchEvent(new MouseEvent('click', { cancelable: true }))).toBe(true);
});

function resizeObserver() {
  let callback: ResizeObserverCallback = () => undefined;
  const observer = { observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn() };
  vi.stubGlobal('ResizeObserver', class {
    constructor(onResize: ResizeObserverCallback) { callback = onResize; }
    observe = observer.observe;
    unobserve = observer.unobserve;
    disconnect = observer.disconnect;
  });
  return { observer, resize: () => { callback([], observer); } };
}
it('restores a saved position after rendering and records the next position when leaving', () => {
  const { observer } = resizeObserver();
  vi.stubGlobal('scrollY', 700);
  const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  history.replaceState({ documentScroll: { left: 12, top: 700 } }, '');
  restoreDocumentScroll(document);
  expect(scroll).toHaveBeenCalledWith({ left: 12, top: 700, behavior: 'instant' });
  expect(observer.disconnect).toHaveBeenCalledOnce();
  vi.stubGlobal('scrollX', 10); vi.stubGlobal('scrollY', 600);
  window.dispatchEvent(new Event('pagehide'));
  expect(history.state).toEqual({ documentScroll: { left: 10, top: 600 } });
});
it('leaves fresh links at their normal anchor and records their position when leaving', () => {
  const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  history.replaceState({ documentScroll: 'invalid' }, '');
  restoreDocumentScroll(document);
  expect(scroll).not.toHaveBeenCalled();
  expect(history.scrollRestoration).toBe('manual');
  restoreDocumentScroll(document.implementation.createHTMLDocument());
});

it('retries a clamped scroll position when asynchronous content expands the page', () => {
  const { observer, resize } = resizeObserver();
  let maximum = 300;
  vi.spyOn(window, 'scrollTo').mockImplementation((options: ScrollToOptions | number) => {
    if (typeof options === 'object') vi.stubGlobal('scrollY', Math.min(options.top ?? 0, maximum));
  });
  history.replaceState({ documentScroll: { left: 0, top: 700 } }, '');
  restoreDocumentScroll(document);
  expect(window.scrollY).toBe(300);
  expect(observer.disconnect).not.toHaveBeenCalled();
  maximum = 900;
  resize();
  expect(window.scrollY).toBe(700);
  expect(observer.disconnect).toHaveBeenCalledOnce();
});

it('uses the paragraph anchor when a shared discussion page has no previous reader position', () => {
  history.replaceState(null, '', '/#u-2');
  const paragraph = document.createElement('section'); paragraph.id = 'u-2';
  const scroll = vi.fn(); paragraph.scrollIntoView = scroll; document.body.append(paragraph);
  restoreDocumentScroll(document);
  expect(scroll).toHaveBeenCalledWith({ behavior: 'instant' });
});

it('restores the current history position when Safari revives a cached document', () => {
  resizeObserver();
  const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  restoreDocumentScroll(document);
  history.replaceState({ documentScroll: { left: 0, top: 450 } }, '');
  window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: false }));
  expect(scroll).not.toHaveBeenCalled();
  window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));
  expect(scroll).toHaveBeenCalledWith({ left: 0, top: 450, behavior: 'instant' });
});
