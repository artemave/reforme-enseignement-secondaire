import { afterEach, expect, it, vi } from 'vitest';
import { navigateBack } from '../src/navigation.js';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); history.replaceState(null, '', '/'); document.body.replaceChildren(); });
function setup(referrer: string, length = 2) {
  vi.spyOn(document, 'referrer', 'get').mockReturnValue(referrer);
  vi.spyOn(history, 'length', 'get').mockReturnValue(length);
  const back = vi.spyOn(history, 'back').mockImplementation(() => undefined);
  const link = document.createElement('a'); link.href = '#fallback';
  navigateBack(document, link);
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
  navigateBack(root, link);
  expect(link.dispatchEvent(new MouseEvent('click', { cancelable: true }))).toBe(true);
});
