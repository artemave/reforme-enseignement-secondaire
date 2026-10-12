import { fixtureHref } from './links.js';

/** Keep GitHub simulation outside the published frontend. Only fixture mode installs this. */
export function installFixtureNavigation(root: Document, repository: string): void {
  renderFixtureNotice(root);
  const rewrite = (): void => {
    for (const anchor of root.querySelectorAll<HTMLAnchorElement>('a[href]')) {
      const href = fixtureHref(anchor.href, repository);
      if (href !== anchor.getAttribute('href')) anchor.setAttribute('href', href);
    }
  };
  rewrite();
  const observer = new MutationObserver(rewrite);
  observer.observe(root.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['href'] });
  root.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const anchor = event.target.closest('a');
    if (anchor === null) return;
    anchor.href = fixtureHref(anchor.href, repository);
  }, { capture: true });
}

/** Include the development banner before the first paint. */
export function renderFixtureNotice(root: Document): void {
  if (root.getElementById('fixture-mode') !== null) return;
  const notice = root.createElement('div');
  notice.id = 'fixture-mode'; notice.style.cssText = 'padding:10px 20px;background:#e3eff7;color:#243c48;font:14px/1.6 system-ui,sans-serif;text-align:center';
  notice.textContent = 'Mode développement : données fictives (discussions). ';
  const simulator = root.createElement('a'); simulator.href = '/__dev/'; simulator.textContent = 'Simuler GitHub';
  notice.append(simulator); root.body.prepend(notice);
}
