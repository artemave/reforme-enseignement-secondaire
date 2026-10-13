import { afterEach, expect, it, vi } from 'vitest';
import { installTheme } from '../src/theme.js';

function environment(saved: string | null = null, dark = false) {
  const preference = Object.assign(new EventTarget(), { matches: dark }) as MediaQueryList;
  const browser = { localStorage: { getItem: vi.fn(() => saved), setItem: vi.fn(), length: 0, clear: vi.fn(), removeItem: vi.fn(), key: vi.fn(() => null) }, matchMedia: vi.fn(() => preference) };
  return { browser, preference };
}
function setup(): HTMLButtonElement {
  const button = document.createElement('button');
  button.id = 'theme-toggle';
  document.body.replaceChildren(button);
  return button;
}
function change(preference: MediaQueryList, matches: boolean): void {
  preference.dispatchEvent(Object.assign(new Event('change'), { matches }));
}
afterEach(() => { document.body.replaceChildren(); delete document.documentElement.dataset['theme']; vi.unstubAllGlobals(); });

it('follows the system until a reader selects a mode, then persists that choice', () => {
  const button = setup();
  const { browser, preference } = environment();
  installTheme(document, browser);
  expect(button.getAttribute('aria-label')).toBe('Activer le mode sombre');
  change(preference, true);
  expect(document.documentElement.dataset['theme']).toBe('dark');
  button.click();
  expect(browser.localStorage.setItem).toHaveBeenCalledWith('theme', 'light');
  change(preference, true);
  expect(document.documentElement.dataset['theme']).toBe('light');
  button.click();
  expect(browser.localStorage.setItem).toHaveBeenLastCalledWith('theme', 'dark');
});
it.each(['dark', 'light'])('restores saved %s mode regardless of the system preference', (mode) => {
  setup();
  const { browser, preference } = environment(mode, mode === 'light');
  installTheme(document, browser);
  change(preference, mode === 'light');
  expect(document.documentElement.style.colorScheme).toBe(mode);
});
it('uses the system when a stored preference is unrecognised', () => {
  setup();
  installTheme(document, environment('invalid', true).browser);
  expect(document.documentElement.dataset['theme']).toBe('dark');
});
it('still switches when browser storage is blocked', () => {
  const button = setup();
  const { browser } = environment();
  vi.mocked(browser.localStorage.getItem).mockImplementation(() => { throw new Error('blocked'); });
  vi.mocked(browser.localStorage.setItem).mockImplementation(() => { throw new Error('blocked'); });
  installTheme(document, browser);
  button.click();
  expect(document.documentElement.dataset['theme']).toBe('dark');
});
it('updates an embedded discussion alongside the reader', () => {
  const button = setup();
  const frame = document.createElement('iframe');
  frame.src = 'https://giscus.app/widget';
  document.body.append(frame);
  const post = vi.fn();
  Object.defineProperty(frame, 'contentWindow', { configurable: true, value: { postMessage: post } });
  installTheme(document, environment().browser);
  button.click();
  expect(post).toHaveBeenLastCalledWith({ giscus: { setConfig: { theme: 'dark' } } }, 'https://giscus.app');
  Object.defineProperty(frame, 'contentWindow', { value: null });
  expect(() => { button.click(); }).not.toThrow();
});
it('uses the browser by default and permits pages without a switch', () => {
  const { browser } = environment();
  vi.stubGlobal('matchMedia', browser.matchMedia);
  setup();
  installTheme(document);
  expect(document.documentElement.dataset['theme']).toBe('light');
  document.body.replaceChildren();
  installTheme(document);
});
