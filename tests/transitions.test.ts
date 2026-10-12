import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { installPageTransitions } from '../src/transitions.js';

beforeEach(() => { document.head.innerHTML = '<base href="/repo/">'; });
afterEach(() => { vi.unstubAllGlobals(); });
const root = `${location.origin}/repo/`;
function activate(from: string | null, to: string | null) {
  return { from: from === null ? null : { url: from }, entry: { url: to } };
}
function swap(activation: ReturnType<typeof activate> | null, types: Set<string> | undefined = new Set<string>()) {
  const transition = { types };
  window.dispatchEvent(Object.assign(new Event('pageswap'), { viewTransition: transition, activation }));
  return types;
}
it('slides into discussions and reverses when returning to the document', () => {
  installPageTransitions();
  expect(swap(activate(root, `${root}passage/revision/u-3/`))).toEqual(new Set(['discussion']));
  expect(swap(activate(`${root}passage/revision/u-3/`, root))).toEqual(new Set(['document']));
  vi.stubGlobal('navigation', { activation: activate(`${root}passage/revision/u-3/`, root) });
  const types = new Set<string>();
  window.dispatchEvent(Object.assign(new Event('pagereveal'), { viewTransition: { types } }));
  expect(types).toEqual(new Set(['document']));
});
it('leaves help, unrelated and inaccessible navigation without directional animation', () => {
  installPageTransitions(document);
  for (const activation of [null, activate(null, root), activate(root, null), activate('https://elsewhere.example/', root), activate(root, 'https://elsewhere.example/'), activate(root, `${root}comment-ca-marche/`), activate(`${root}comment-ca-marche/`, root), activate(`${root}passage/r/u-1/`, `${root}passage/r/u-2/`)]) {
    expect(swap(activation)).toEqual(new Set());
  }
  window.dispatchEvent(Object.assign(new Event('pageswap'), { viewTransition: null, activation: activate(root, `${root}passage/r/u-1/`) }));
  window.dispatchEvent(Object.assign(new Event('pagereveal'), { viewTransition: { types: new Set() } }));
  vi.stubGlobal('navigation', { activation: null });
  window.dispatchEvent(Object.assign(new Event('pagereveal'), { viewTransition: { types: new Set() } }));
  window.dispatchEvent(Object.assign(new Event('pageswap'), { viewTransition: { types: new Set() }, activation: { from: { url: null }, entry: { url: root } } }));
  window.dispatchEvent(Object.assign(new Event('pageswap'), { viewTransition: { types: new Set() }, activation: { from: { url: root }, entry: null } }));
  installPageTransitions(document.implementation.createHTMLDocument());
});
