import { describe, expect, it, vi } from 'vitest';
import { installFixtureNavigation } from '../dev/navigation.js';
import { fixtureRepository } from '../dev/scenario.js';

describe('local-only GitHub navigation', () => {
  it('redirects only fixture-repository links, including dynamic discussion links', async () => {
    document.body.innerHTML = `<a id="item" href="https://github.com/${fixtureRepository}/issues/3?body=quote#context"><span>Item</span></a><a id="repo" href="https://github.com/${fixtureRepository}">Repo</a><a id="other" href="https://github.com/other/repo">Other</a><a id="local" href="/local">Local</a><a id="prefix" href="https://github.com/${fixtureRepository}-other">Different repo</a><p id="text">Plain text</p>`;
    const root = document.implementation.createHTMLDocument(); root.body.innerHTML = document.body.innerHTML;
    installFixtureNavigation(root, fixtureRepository);
    expect(root.querySelector('a#item')?.getAttribute('href')).toContain('/__dev/github/');
    const dynamic = root.createElement('a'); dynamic.href = `https://github.com/${fixtureRepository}/pull/4`; root.body.append(dynamic);
    await new Promise<void>((resolve) => { setTimeout(resolve, 0); });
    expect(dynamic.getAttribute('href')).toBe(`/__dev/github/${fixtureRepository}/pull/4`);
    dynamic.href = 'http://127.0.0.1:4173/#u-3';
    await new Promise<void>((resolve) => { setTimeout(resolve, 0); });
    expect(dynamic.getAttribute('href')).toBe('/#u-3');
    root.addEventListener('click', (event) => { event.preventDefault(); });
    root.querySelector('#item span')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(root.querySelector('a#item')?.getAttribute('href')).toBe(`/__dev/github/${fixtureRepository}/issues/3?body=quote#context`);
    root.querySelector('#repo')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(root.querySelector('a#repo')?.getAttribute('href')).toBe(`/__dev/github/${fixtureRepository}`);
    for (const id of ['other', 'local', 'prefix', 'text']) root.querySelector(`#${id}`)?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    root.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(root.querySelector('a#other')?.getAttribute('href')).toBe('https://github.com/other/repo');
    expect(root.querySelector('a#local')?.getAttribute('href')).toBe('/local');
    expect(root.querySelector('a#prefix')?.getAttribute('href')).toContain('-other');
    expect(root.querySelector('#fixture-mode')?.textContent).toContain('données fictives');
  });
  it('mounts the fixture-mode browser entrypoint', async () => {
    vi.resetModules();
    await import('../dev/client.js');
    expect(document.querySelector('#fixture-mode')).not.toBeNull();
  });
});
